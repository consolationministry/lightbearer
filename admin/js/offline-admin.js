// Offline support for the admin app: cached reads, a durable write queue and
// conflict surfacing. Never handles passwords. Live audio tables, RPCs, auth
// and admin_users are deliberately excluded.
const DB_NAME = "lightbearer-admin-offline";
const STORES = ["reads", "queue", "meta"];
export const OFFLINE_TABLES = ["hymns", "books", "book_pages", "book_page_likes", "book_page_comments", "forms", "form_fields", "form_responses", "service_plans", "programs", "admin_settings", "prayer_requests", "categories", "site_content", "daily_quote_settings"];
export const OFFLINE_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const TABLE_PATTERN = new RegExp("^rest/v1/([a-z_]+)(?:[?/]|$)");
const ID_PATTERN = new RegExp("[?&]id=eq\\.([^&]+)");

let backend = null;
const memory = { reads: new Map(), queue: new Map(), meta: new Map() };
function clone(value) { return JSON.parse(JSON.stringify(value)); }
const memoryBackend = {
  async get(s, k) { return memory[s].has(k) ? clone(memory[s].get(k)) : undefined; },
  async put(s, k, v) { memory[s].set(k, clone(v)); },
  async del(s, k) { memory[s].delete(k); },
  async all(s) { return Array.from(memory[s].entries()).map(function (e) { return { key: e[0], value: clone(e[1]) }; }); },
  async clear(s) { memory[s].clear(); }
};

function idbBackend() {
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { STORES.forEach(function (s) { req.result.createObjectStore(s); }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function run(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, mode);
        const req = fn(tx.objectStore(storeName));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  return {
    get: function (s, k) { return run(s, "readonly", function (o) { return o.get(k); }); },
    put: function (s, k, v) { return run(s, "readwrite", function (o) { return o.put(v, k); }); },
    del: function (s, k) { return run(s, "readwrite", function (o) { return o.delete(k); }); },
    clear: function (s) { return run(s, "readwrite", function (o) { return o.clear(); }); },
    all: function (s) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const out = [];
          const req = db.transaction(s, "readonly").objectStore(s).openCursor();
          req.onsuccess = function () { const c = req.result; if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } else resolve(out); };
          req.onerror = function () { reject(req.error); };
        });
      });
    }
  };
}

function store() {
  if (!backend) backend = (typeof indexedDB !== "undefined") ? idbBackend() : memoryBackend;
  return backend;
}
export function __useMemoryBackend() { backend = memoryBackend; STORES.forEach(function (s) { memory[s].clear(); }); }

export function tableOf(path) {
  const m = TABLE_PATTERN.exec(String(path || "").replace(/^\/+/, ""));
  return m && OFFLINE_TABLES.indexOf(m[1]) >= 0 ? m[1] : null;
}
export function isOfflineError(error) {
  return Boolean(error && (error.code === "NETWORK_ERROR" || error.code === "NETWORK_TIMEOUT"));
}

// ---- offline sign-in snapshot (no password ever stored) ----
export async function saveAdminSnapshot(admin, now) {
  await store().put("meta", "admin", { id: admin.id, email: admin.email || "", verifiedAt: now || Date.now() });
}
export async function loadAdminSnapshot(userId, now) {
  const s = await store().get("meta", "admin");
  if (!s || !s.id || (userId && s.id !== userId)) return null;
  if ((now || Date.now()) - s.verifiedAt > OFFLINE_SESSION_MAX_MS) return null;
  return { id: s.id, email: s.email, role: "admin", offline: true };
}
export async function clearAdminOffline(options) {
  await store().del("meta", "admin");
  await store().clear("reads");
  if (options && options.dropQueue) await store().clear("queue");
}

// ---- cached reads ----
export async function cacheRead(path, payload) {
  if (!tableOf(path) || !Array.isArray(payload)) return;
  await store().put("reads", path, { at: Date.now(), payload: payload });
}
export async function readCached(path) {
  const hit = await store().get("reads", path);
  return hit ? hit.payload : undefined;
}
async function baselineFor(path) {
  const m = ID_PATTERN.exec(path);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  const rows = await store().all("reads");
  for (const r of rows) {
    if (tableOf(r.key) !== tableOf(path)) continue;
    const row = (r.value.payload || []).find(function (x) { return x && String(x.id) === id && x.updated_at; });
    if (row) return row.updated_at;
  }
  return null;
}

// ---- durable write queue ----
export function isQueueable(path, options) {
  const method = String(options && options.method || "GET").toUpperCase();
  if (["POST", "PATCH", "DELETE", "PUT"].indexOf(method) < 0 || !tableOf(path)) return false;
  const b = options && options.body;
  return b === undefined || b === null || (typeof b === "object" && !(typeof Blob !== "undefined" && b instanceof Blob));
}
export async function enqueueWrite(path, options, userId) {
  const opts = options || {};
  const method = String(opts.method || "GET").toUpperCase();
  const entry = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(), path: path, method: method, body: opts.body === undefined ? null : opts.body,
    prefer: opts.prefer || "", userId: userId || "", attempts: 0, status: "pending", error: "", baseline: null
  };
  if (method === "PATCH" || method === "DELETE") entry.baseline = await baselineFor(path);
  await store().put("queue", entry.id, entry);
  return entry;
}
async function entries() {
  return (await store().all("queue")).map(function (e) { return e.value; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
}
export async function getQueue() { return entries(); }
export async function pendingCount() { return (await entries()).filter(function (e) { return e.status === "pending"; }).length; }
export async function getConflicts() { return (await entries()).filter(function (e) { return e.status === "conflict" || e.status === "failed"; }); }
export async function discardEntry(id) { await store().del("queue", id); }
export async function retryEntry(id) {
  const e = await store().get("queue", id);
  if (e) { e.status = "pending"; e.attempts = 0; e.baseline = null; await store().put("queue", id, e); }
}

let flushing = null;
// request(path, options) is the real network call. Order is preserved; a
// network failure stops the run and leaves everything queued.
export function flushQueue(request, userId) {
  if (flushing) return flushing;
  flushing = (async function () {
    const result = { synced: 0, conflicts: 0, failed: 0, remaining: 0, offline: false };
    for (const e of await entries()) {
      if (e.status !== "pending") continue;
      if (e.userId && userId && e.userId !== userId) {
        e.status = "conflict"; e.error = "Queued by a different admin account.";
        await store().put("queue", e.id, e); result.conflicts++; continue;
      }
      let path = e.path;
      let prefer = e.prefer;
      const guarded = Boolean(e.baseline) && e.method !== "POST";
      if (guarded) { path += "&updated_at=eq." + encodeURIComponent(e.baseline); prefer = "return=representation"; }
      try {
        const res = await request(path, { method: e.method, body: e.body === null ? undefined : e.body, prefer: prefer || undefined, noQueue: true });
        if (guarded && Array.isArray(res) && res.length === 0) {
          e.status = "conflict"; e.error = "This record changed on the server after you went offline.";
          await store().put("queue", e.id, e); result.conflicts++;
        } else { await store().del("queue", e.id); result.synced++; }
      } catch (error) {
        if (isOfflineError(error)) { result.offline = true; break; }
        e.attempts++; e.error = (error && error.message) || "Sync failed";
        const permanent = Boolean(error && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429);
        if (permanent || e.attempts >= MAX_ATTEMPTS) { e.status = "failed"; result.failed++; }
        await store().put("queue", e.id, e);
        if (!permanent && e.status === "pending") break;
      }
    }
    result.remaining = await pendingCount();
    return result;
  })().finally(function () { flushing = null; });
  return flushing;
}
