// Seraphmedia Audio Library client (read-only public API, no key needed).
// Used by audio.html. Server-side rate limit is ~60 requests/min, so every
// response is kept in a session-scoped in-memory cache and repeated views
// do not refetch. Playback uses the track embed_url iframe player because
// raw audio files are not part of the API.
const API_BASE = "https://www.seraphmedia.com.ng/api/v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // six hours, in step with the API cache window
const PAGE_LIMIT = 20;
const cache = new Map();
const inFlight = new Map();
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
  const pending = fetch(url, { method: "GET", credentials: "omit" }).then(async (response) => {
    if (!response.ok) throw new Error(response.status === 429 ? "The audio library is busy right now. Please try again in a minute." : "Audio library could not be loaded right now.");
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
export function fetchTrack(slug) { return fetchJson(API_BASE + "/tracks/" + encodeURIComponent(slug)); }
export function fetchCategories() { return fetchJson(API_BASE + "/categories"); }
export function clearAudioLibraryCache() { cache.clear(); inFlight.clear(); }

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
    '<div class="audio-player-wrap" hidden><iframe title="' + escapeHtml(track.title) + '" src="' + escapeHtml(track.embed_url) + '" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>' +
    '<p class="audio-card-source">' + trackCredit(track) + '</p></div>' +
    '</div></article>';
}

export function renderAudioLibrary({ categories = [], tracks = [], activeCategory = "", query = "", loading = false, error = "", page = 1 } = {}) {
  const list = cleanTracks(tracks);
  const cards = list.map(renderTrackCard).join("");
  const body = loading
    ? '<p class="audio-status" role="status">Loading audio…</p>'
    : error
      ? '<p class="audio-status" role="alert">' + escapeHtml(error) + '</p>'
      : cards || '<p class="audio-status">No audio found for that search. Try another title or artist.</p>';
  return '<section class="audio-hero"><p class="eyebrow">C&S BIBLE CHURCH · FREE AUDIO</p><h1>Audio Library.</h1>' +
    '<p>Messages, music, chants and spoken word, free to listen. Audio courtesy of <a href="https://www.seraphmedia.com.ng/" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>.</p></section>' +
    '<section class="audio-controls" aria-label="Audio search and categories">' +
      '<form class="audio-search-form" role="search" data-audio-search><label class="sr-only" for="audio-search">Search by title or artist</label>' +
      '<input id="audio-search" type="search" inputmode="search" autocomplete="off" value="' + escapeHtml(query) + '" placeholder="Search title or artist…" data-testid="input-audio-search">' +
      '<button type="submit" data-testid="button-audio-search">Search</button></form>' +
      renderCategoryTabs(categories, activeCategory) +
    '</section>' +
    '<section class="audio-track-grid" aria-label="Audio tracks" data-page="' + page + '">' + body + '</section>' +
    '<p class="audio-credit-note">Audio courtesy of <a href="https://www.seraphmedia.com.ng/" target="_blank" rel="noopener noreferrer">Seraph Media - seraphmedia.com.ng</a>. Free to listen, no ads, no paid tier.</p>';
}

async function init() {
  const root = document.getElementById("audio-library-root");
  if (!root) return;
  const view = { categories: [], tracks: [], activeCategory: "", query: "", loading: true, error: "", page: 1 };
  async function load() {
    view.loading = true; view.error = "";
    root.innerHTML = renderAudioLibrary(view);
    try {
      const [categories, tracks] = await Promise.all([
        fetchCategories().catch(() => []),
        fetchTracks({ type: view.activeCategory, q: view.query, page: view.page })
      ]);
      view.categories = Array.isArray(categories) ? categories : (categories && categories.data) || [];
      view.tracks = Array.isArray(tracks) ? tracks : (tracks && tracks.data) || [];
    } catch (error) {
      view.error = error && error.message ? error.message : "Audio library could not be loaded right now.";
    } finally { view.loading = false; root.innerHTML = renderAudioLibrary(view); }
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
}
if (hasDocument) init();
