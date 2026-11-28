// Seraphmedia Audio Library client (read-only public API, no key needed).
// Used by audio.html. Server-side rate limit is ~60 requests/min, so every
// response is kept in a session-scoped in-memory cache and repeated views
// do not refetch. Playback uses the track embed_url iframe player because
// raw audio files are not part of the API.
const API_BASE = "https://www.seraphmedia.com.ng/api/v1";
// Seraph API live measurement (2026-11-28): server caps limit at 50 per page,
// cache-control max-age=3600 (Cloudflare s-maxage=21600). Total 3830 tracks
// (message 3511, music 319). Fetching all at once = ~77 requests, which would
// hammer the ~60 req/min visitor limit. So we keep a persistent local
// snapshot and stream remaining pages in the background, a few at a time,
// while the user sees and hears the first page immediately.
const PAGE_LIMIT = 50;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h hard expiry, matches API s-maxage window
const LOCAL_FRESH_MS = 1000 * 60 * 5; // local snapshot <5m old is served instantly, then revalidated
const BACKGROUND_PAGES_PER_TICK = 3; // ~180ms pacing, stays well under rate limit
const BACKGROUND_TICK_MS = 180;
const cache = new Map();
const inFlight = new Map();
const etagCache = new Map();
const hasDocument = typeof document !== "undefined";
const hasSessionStorage = typeof sessionStorage !== "undefined";

function cacheKey(url) { return url; }

function readCache(url) {
  const entry = cache.get(cacheKey(url));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { cache.delete(cacheKey(url)); return null; }
  return entry.data;
}

function writeCache(url, data) {
  cache.set(cacheKey(url), { at: Date.now(), data });
  if (hasSessionStorage) {
    try { sessionStorage.setItem("lightbearer-seraph:" + url, JSON.stringify(data)); } catch (_) {}
  }
}

function readStoredCache(url) {
  if (!hasSessionStorage) return null;
  try {
    const raw = sessionStorage.getItem("lightbearer-seraph:" + url);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") writeCache(url, parsed);
    return parsed;
  } catch (_) { return null; }
}

async function fetchJson(url) {
  const hit = readCache(url) || readStoredCache(url);
  if (hit) return hit;
  if (inFlight.has(url)) return inFlight.get(url);
  const headers = {};
  const etag = etagCache.get(url);
  if (etag) headers["If-None-Match"] = etag;
  const pending = fetch(url, { method: "GET", credentials: "omit", headers }).then(async (response) => {
    if (response.status === 304) return readCache(url) || readStoredCache(url);
    if (!response.ok) {
      if (response.status === 429) {
        const err = new Error("The audio library is busy right now. Please try again in a minute.");
        err.status = 429;
        err.retryAfterMs = 30000;
        throw err;
      }
      throw new Error("Audio library could not be loaded right now.");
    }
    const freshEtag = response.headers && response.headers.get && response.headers.get("etag");
    if (freshEtag) etagCache.set(url, freshEtag);
    const body = await response.json();
    const data = body && typeof body === "object" && "data" in body ? body.data : body;
    writeCache(url, data);
    return data;
  });
  inFlight.set(url, pending);
  try { return await pending; } finally { inFlight.delete(url); }
}

export function tracksUrl({ type = "", q = "", page = 1, limit = PAGE_LIMIT } = {}) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q.trim()) params.set("q", q.trim());
  params.set("page", String(Math.max(1, Number(page) || 1)));
  params.set("limit", String(Math.min(50, Math.max(1, Number(limit) || PAGE_LIMIT))));
  return API_BASE + "/tracks?" + params.toString();
}

export function fetchTracks(options) { return fetchJson(tracksUrl(options)); }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseTracksEnvelope(body) {
  if (Array.isArray(body)) return { tracks: body, total: body.length, page: 1, next: null };
  if (!body || typeof body !== "object") return { tracks: [], total: 0, page: 1, next: null };
  const tracks = Array.isArray(body.data) ? body.data : [];
  return { tracks, total: Number(body.total) || tracks.length, page: Number(body.page) || 1, next: body.next || null };
}

export async function fetchAllTracks({ type = "", q = "", onPage, concurrency = BACKGROUND_PAGES_PER_TICK } = {}) {
  const first = parseTracksEnvelope(await fetchTracks({ type, q, page: 1, limit: PAGE_LIMIT }));
  const all = first.tracks.slice();
  if (onPage) onPage(first.tracks.slice(), all.length, first.total);
  const totalPages = Math.max(1, Math.ceil((first.total || first.tracks.length) / PAGE_LIMIT));
  if (totalPages <= 1 || !first.total) return all;
  const pages = [];
  for (let page = 2; page <= totalPages; page += 1) pages.push(page);
  let index = 0;
  async function worker() {
    while (index < pages.length) {
      const page = pages[index];
      index += 1;
      try {
        const body = parseTracksEnvelope(await fetchTracks({ type, q, page, limit: PAGE_LIMIT }));
        all.push(...body.tracks);
        if (onPage) onPage(body.tracks.slice(), all.length, first.total);
      } catch (_) { /* one failed page should not kill the whole catalog */ }
      if (index < pages.length) await sleep(BACKGROUND_TICK_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
  return all;
}

export function sortTracks(tracks) {
  return tracks.slice().sort((a, b) => {
    const da = Date.parse(a.published_at || a.release_year || "") || 0;
    const db = Date.parse(b.published_at || b.release_year || "") || 0;
    if (db !== da) return db - da;
    return String(b.title || "").localeCompare(String(a.title || ""));
  });
}
export function fetchTrack(slug) { return fetchJson(API_BASE + "/tracks/" + encodeURIComponent(slug)); }
export function fetchCategories() { return fetchJson(API_BASE + "/categories"); }
export function clearAudioLibraryCache() { cache.clear(); inFlight.clear(); etagCache.clear(); }

export const AUDIO_LIBRARY_REFRESH_MS = LOCAL_FRESH_MS;

export function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}

export function cleanTracks(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((track) => track && track.slug && track.title && track.embed_url && String(track.embed_url).startsWith("https://www.seraphmedia.com.ng/embed/"));
}

export function trackCredit(track) {
  const url = track && track.url ? String(track.url) : "https://www.seraphmedia.com.ng/";
  return 'Audio courtesy of <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>';
}

export function renderCategoryTabs(categories, activeSlug) {
  const rows = categories.map((category) => {
    const slug = String(category.slug || "");
    const label = String(category.name || slug);
    const active = slug === activeSlug;
    return '<button class="audio-cat-tab' + (active ? " is-active" : "") + '" type="button" role="tab" aria-selected="' + active + '" data-audio-category="' + escapeHtml(slug) + '">' + escapeHtml(label) + '</button>';
  }).join("");
  return '<div class="audio-cat-tabs" role="tablist" aria-label="Audio categories">' +
    '<button class="audio-cat-tab' + (!activeSlug ? " is-active" : "") + '" type="button" role="tab" aria-selected="' + (!activeSlug) + '" data-audio-category="">All</button>' + rows + '</div>';
}

export function trackMatchesQuery(track, query) {
  const q = String(query || "").trim().toLocaleLowerCase();
  if (!q) return true;
  const haystack = [track.title, track.artist, track.type, track.duration, track.category, track.category_name, track.genre, track.description]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  return haystack.includes(q);
}

export function renderTrackCard(track) {
  const artwork = track.image_url
    ? '<img src="' + escapeHtml(track.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
    : '<span class="audio-card-art-fallback" aria-hidden="true">&#9654;</span>';
  const meta = [track.artist, track.type, track.duration].filter(Boolean).map(escapeHtml).join(" &middot; ");
  return '<article class="audio-track-card">' +
    '<div class="audio-card-art">' + artwork + '</div>' +
    '<div class="audio-card-body">' +
      '<h3 class="audio-card-title">' + escapeHtml(track.title) + '</h3>' +
    (meta ? '<p class="audio-card-meta">' + meta + '</p>' : "") +
    '<p class="audio-card-source">' + trackCredit(track) + '</p>' +
    '<button class="audio-play-btn" type="button" data-audio-play="' + escapeHtml(track.slug) + '" aria-expanded="false">Play</button>' +
    '<div class="audio-player-wrap" hidden><iframe title="' + escapeHtml(track.title) + '" data-src="' + escapeHtml(track.embed_url) + '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>' +
    '<p class="audio-card-source">' + trackCredit(track) + '</p></div>' +
    '</div></article>';
}

// Same row treatment as the church programme rows (live-audio-views), so the
// Listen page reads as one list: church recordings first, Seraph tracks
// continuing after them in the same rows. Playback stays embed-only.
export function renderTrackRow(track) {
  const art = track.image_url
    ? '<div class="audio-library-row-art"><img src="' + escapeHtml(track.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></div>'
    : '<div class="audio-library-row-art audio-library-art-placeholder"><span class="audio-library-art-glow"></span><img src="./assets/church-logo-placeholder.png" alt="" loading="lazy"></div>';
  const meta = [track.artist, track.type, track.duration].filter(Boolean);
  const source = '<p class="audio-library-row-meta"><a href="' + escapeHtml(track.url ? String(track.url) : "https://www.seraphmedia.com.ng/") + '" target="_blank" rel="noopener noreferrer">Seraph Media</a>' +
    (meta.length ? ' <span aria-hidden="true">·</span> ' + meta.map(escapeHtml).join(' <span aria-hidden="true">·</span> ') : "") + '</p>';
  return '<article class="audio-library-row audio-library-row-seraph" data-testid="audio-seraph-' + escapeHtml(track.slug) + '">' +
    art +
    '<div class="audio-library-row-copy"><div class="audio-library-row-kicker"><span>Seraph Media</span><span class="audio-library-recorded-label">Audio</span></div>' +
    '<h3>' + escapeHtml(track.title) + '</h3>' + source + '</div>' +
    '<button class="audio-library-row-play" type="button" data-audio-play="' + escapeHtml(track.slug) + '" aria-expanded="false" aria-label="Play ' + escapeHtml(track.title) + ' on Seraph Media">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 9 6-9 6z"/></svg></button>' +
    '<div class="audio-player-wrap audio-library-row-player" hidden><iframe title="' + escapeHtml(track.title) + '" data-src="' + escapeHtml(track.embed_url) + '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>' +
    '<p class="audio-card-source">' + trackCredit(track) + '</p></div></article>';
}

export function renderEmbeddedTracks({ tracks = [], query = "", loading = false, error = "", loaded = 0, total = 0 } = {}) {
  const list = cleanTracks(tracks).filter((track) => trackMatchesQuery(track, query));
  const streamingNote = !loading && total > loaded && loaded > 0
    ? '<p class="audio-library-streaming" role="status">Showing ' + loaded + ' of ' + total + ' Seraph tracks, the rest are still loading.</p>'
    : "";
  const body = loading
    ? '<p class="audio-library-streaming" role="status">Loading Seraph audio…</p>'
    : error
      ? '<p class="audio-library-streaming" role="alert">' + escapeHtml(error) + '</p>'
      : list.length
        ? '<div class="audio-library-list" aria-live="polite">' + list.map(renderTrackRow).join("") + '</div>'
        : String(query || "").trim()
          ? '<p class="audio-library-streaming">No Seraph audio matches that search.</p>'
          : '<p class="audio-library-streaming">No Seraph audio shows here yet. New audio will appear here once it is published.</p>';
  return '<section class="audio-library-seraph" aria-label="Seraph Media audio">' + body + streamingNote +
    '<p class="audio-card-source audio-library-credit">Audio courtesy of <a href="https://www.seraphmedia.com.ng/" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>. Free to listen, no ads, no paid tier.</p></section>';
}

export function renderAudioLibrary({ categories = [], tracks = [], activeCategory = "", query = "", loading = false, error = "", page = 1, loaded = 0, total = 0, catalogReady = false } = {}) {
  const list = cleanTracks(tracks);
  const streamingNote = !loading && total > list.length && loaded > 0
    ? '<p class="audio-status" role="status">Showing ' + list.length + ' of ' + total + ' tracks — the rest are still loading.</p>'
    : "";
  const cards = list.map(renderTrackCard).join("");
  const body = loading
    ? '<p class="audio-status" role="status">Loading audio…</p>'
    : error
      ? '<p class="audio-status" role="alert">' + escapeHtml(error) + '</p>'
      : cards || (query || activeCategory ? '<p class="audio-status">No audio found for that search. Try another title or artist.</p>' : '<p class="audio-status">No audio shows here yet. New audio will appear here once it is published.</p>');
  return '<section class="audio-hero"><p class="eyebrow">C&S BIBLE CHURCH · FREE AUDIO</p><h1>Audio Library.</h1>' +
    '<p>Messages, music, chants and spoken word, free to listen. Audio courtesy of <a href="https://www.seraphmedia.com.ng/" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>.</p></section>' +
    '<section class="audio-controls" aria-label="Audio search and categories">' +
      '<form class="audio-search-form" role="search" data-audio-search><label class="sr-only" for="audio-search">Search by title or artist</label>' +
      '<input id="audio-search" type="search" inputmode="search" autocomplete="off" value="' + escapeHtml(query) + '" placeholder="Search title or artist…" data-testid="input-audio-search">' +
      '<button type="submit" data-testid="button-audio-search">Search</button></form>' +
      renderCategoryTabs(categories, activeCategory) +
    '</section>' +
    '<section class="audio-track-grid" aria-label="Audio tracks" data-page="' + page + '">' + body + '</section>' +
    streamingNote +
    '<p class="audio-credit-note">Audio courtesy of <a href="https://www.seraphmedia.com.ng/" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>. Free to listen, no ads, no paid tier.</p>';
}

export async function initAudioLibrary(root) {
  if (!root) return;
  const view = { categories: [], tracks: [], activeCategory: "", query: "", loading: true, error: "", page: 1, loaded: 0, total: 0, catalogReady: false };
  const CATALOG_KEY = "lightbearer-seraph-catalog-v1";

  function render() { root.innerHTML = renderAudioLibrary(view); }
  function loadCatalogSnapshot() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && Array.isArray(parsed.tracks) && parsed.tracks.length ? parsed : null;
    } catch (_) { return null; }
  }
  function saveCatalogSnapshot() {
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), tracks: view.tracks })); } catch (_) {}
  }

  let loadToken = 0;
  async function load() {
    const token = ++loadToken;
    view.loading = true; view.error = ""; view.catalogReady = false; view.loaded = 0;
    render();
    try {
      const [categories, first] = await Promise.all([
        fetchCategories().catch(() => []),
        fetchTracks({ type: view.activeCategory, q: view.query, page: 1, limit: PAGE_LIMIT }).catch(() => null)
      ]);
      view.categories = Array.isArray(categories) ? categories : (categories && categories.data) || [];
      if (token !== loadToken) return;
      if (!first) { view.error = "Audio library could not be loaded right now."; return; }
      const envelope = parseTracksEnvelope(first);
      view.tracks = envelope.tracks;
      view.total = envelope.total;
      view.loaded = envelope.tracks.length;
      view.loading = false;
      render();
      const totalPages = Math.max(1, Math.ceil(envelope.total / PAGE_LIMIT));
      if (totalPages > 1) {
        const pages = [];
        for (let page = 2; page <= totalPages; page += 1) pages.push(page);
        let index = 0;
        async function worker() {
          while (index < pages.length) {
            const page = pages[index];
            index += 1;
            try {
              const body = parseTracksEnvelope(await fetchTracks({ type: view.activeCategory, q: view.query, page, limit: PAGE_LIMIT }));
              if (token !== loadToken) return;
              view.tracks = view.tracks.concat(body.tracks);
              view.loaded = view.tracks.length;
              render();
            } catch (error) {
              if (error && error.status === 429) { await sleep(error.retryAfterMs || 30000); continue; }
              break;
            }
            if (index < pages.length) await sleep(BACKGROUND_TICK_MS);
          }
        }
        await Promise.all(Array.from({ length: Math.min(BACKGROUND_PAGES_PER_TICK, pages.length) }, () => worker()));
      }
      if (token !== loadToken) return;
      view.catalogReady = true;
      saveCatalogSnapshot();
      render();
    } catch (error) {
      if (token !== loadToken) return;
      const snapshot = loadCatalogSnapshot();
      if (snapshot) {
        view.tracks = snapshot.tracks;
        view.total = snapshot.tracks.length;
        view.loaded = snapshot.tracks.length;
        view.error = "";
        view.catalogReady = true;
      } else {
        view.error = error && error.message ? error.message : "Audio library could not be loaded right now.";
      }
    } finally {
      if (token === loadToken) { view.loading = false; render(); }
    }
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!document.hidden && navigator.onLine !== false) void load(); }, LOCAL_FRESH_MS);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && navigator.onLine !== false) void load();
    });
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-audio-category]");
    if (tab) { view.activeCategory = tab.dataset.audioCategory || ""; view.page = 1; void load(); return; }
    const play = event.target.closest("[data-audio-play]");
    if (!play) return;
    const wrap = play.parentElement.querySelector(".audio-player-wrap");
    const iframe = wrap && wrap.querySelector("iframe");
    const open = wrap.hidden;
    wrap.hidden = !open;
    play.setAttribute("aria-expanded", String(open));
    play.textContent = open ? "Close player" : "Play";
    if (open && iframe && !iframe.src) iframe.src = iframe.dataset.src || iframe.getAttribute("src");
  });
  root.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-audio-search]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("#audio-search");
    view.query = input ? input.value : "";
    view.page = 1;
    void load();
  });
  await load();
  scheduleRefresh();
}
export function renderAudioLibrarySection(query) {
  return '<section id="audio-library-root" data-seraph-query="' + escapeHtml(query || "") + '" aria-label="Seraph Media audio"></section>';
}

// The listen page is a single list: church recordings first, Seraph tracks
// continuing after them. There is no second search, hero or category tabs
// here; the church search box is the only search and it filters both sides
// client-side against the cached catalog, with no extra fetch.
export async function initEmbeddedSeraphTracks(root, initialQuery = "") {
  if (!root) return null;
  const CATALOG_KEY = "lightbearer-seraph-catalog-v1";
  const view = { tracks: [], loading: false, error: "", loaded: 0, total: 0, query: String(initialQuery || "") };

  function loadCatalogSnapshot() {
    try {
      const raw = localStorage.getItem(CATALOG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && Array.isArray(parsed.tracks) && parsed.tracks.length ? parsed : null;
    } catch (_) { return null; }
  }
  function saveCatalogSnapshot() {
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), tracks: view.tracks })); } catch (_) {}
  }
  function render() { root.innerHTML = renderEmbeddedTracks(view); }
  function loadSnapshotIfAny() {
    const snapshot = loadCatalogSnapshot();
    if (snapshot) {
      view.tracks = snapshot.tracks;
      view.total = snapshot.tracks.length;
      view.loaded = snapshot.tracks.length;
      view.loading = false;
      render();
      return true;
    }
    return false;
  }

  root.addEventListener("click", (event) => {
    const play = event.target.closest("[data-audio-play]");
    if (!play) return;
    const row = play.closest("[data-testid^='audio-seraph-']") || play.parentElement;
    const wrap = row && row.querySelector(".audio-player-wrap");
    const iframe = wrap && wrap.querySelector("iframe");
    if (!wrap) return;
    const open = wrap.hidden;
    wrap.hidden = !open;
    play.setAttribute("aria-expanded", String(open));
    play.setAttribute("aria-label", (open ? "Pause " : "Play ") + (play.getAttribute("aria-label") || "").replace(/^(Play|Pause)\s/, ""));
    if (open && iframe && !iframe.src) { iframe.src = iframe.dataset.src || ""; }
    if (!open) { try { iframe && iframe.contentWindow && iframe.contentWindow.postMessage({ event: "pause" }, "*"); } catch (_) {} }
  });

  const api = {
    setQuery(query) {
      view.query = String(query || "");
      root.dataset.seraphQuery = view.query;
      render();
    },
    get query() { return view.query; }
  };

  if (!loadSnapshotIfAny()) {
    view.loading = true;
    render();
    try {
      const first = await fetchTracks({ page: 1, limit: PAGE_LIMIT }).catch(() => null);
      if (!first) { throw new Error("Audio library could not be loaded right now."); }
      const envelope = parseTracksEnvelope(first);
      view.tracks = envelope.tracks;
      view.total = envelope.total;
      view.loaded = envelope.tracks.length;
      view.loading = false;
      render();
      const totalPages = Math.max(1, Math.ceil(envelope.total / PAGE_LIMIT));
      if (totalPages > 1) {
        const pages = [];
        for (let page = 2; page <= totalPages; page += 1) pages.push(page);
        let index = 0;
        async function worker() {
          while (index < pages.length) {
            const page = pages[index];
            index += 1;
            try {
              const body = parseTracksEnvelope(await fetchTracks({ page, limit: PAGE_LIMIT }));
              view.tracks = view.tracks.concat(body.tracks);
              view.loaded = view.tracks.length;
              render();
            } catch (error) {
              if (error && error.status === 429) { await sleep(error.retryAfterMs || 30000); continue; }
              break;
            }
            if (index < pages.length) await sleep(BACKGROUND_TICK_MS);
          }
        }
        await Promise.all(Array.from({ length: Math.min(BACKGROUND_PAGES_PER_TICK, pages.length) }, () => worker()));
      }
      saveCatalogSnapshot();
      render();
    } catch (error) {
      if (!loadSnapshotIfAny()) {
        view.error = error && error.message ? error.message : "Audio library could not be loaded right now.";
        view.loading = false;
        render();
      }
    }
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.hidden || navigator.onLine === false || !document.contains(root)) return;
      void api.refresh();
    }, LOCAL_FRESH_MS);
  }
  api.refresh = async function () {
    try {
      const first = await fetchTracks({ page: 1, limit: PAGE_LIMIT }).catch(() => null);
      if (!first) return;
      const envelope = parseTracksEnvelope(first);
      const bySlug = new Map(view.tracks.map((t) => [t.slug, t]));
      for (const t of envelope.tracks) if (!bySlug.has(t.slug)) view.tracks.push(t);
      view.total = envelope.total;
      view.loaded = view.tracks.length;
      saveCatalogSnapshot();
      render();
    } catch (_) { /* keep showing what we already have */ }
  };
  scheduleRefresh();
  return api;
}

if (hasDocument) initAudioLibrary(document.getElementById("audio-library-root"));
