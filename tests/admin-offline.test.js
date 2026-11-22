import assert from "node:assert/strict";
import test from "node:test";
import * as off from "../admin/js/offline-admin.js";
import { clearSession, supabaseRequest, syncOfflineQueue, setOfflineUserId } from "../admin/js/supabase-client.js?v=33";
import { initializeAdminAuth, loginAdmin } from "../admin/js/admin-auth.js?v=33";

function install() {
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem(k) { return values.has(k) ? values.get(k) : null; },
    setItem(k, v) { values.set(k, String(v)); }, removeItem(k) { values.delete(k); } } };
  off.__useMemoryBackend();
  clearSession();
}
const res = (body, status = 200) => ({ ok: status < 300, status, async text() { return body === null ? "" : JSON.stringify(body); } });
let online = true;
function net(handler) {
  globalThis.fetch = async (url, init) => {
    if (!online) throw new Error("Failed to fetch");
    return handler(String(url), init || {});
  };
}
const happy = (extra) => (url, init) => {
  if (url.includes("grant_type=password")) return res({ access_token: "a", refresh_token: "r", user: { id: "u1" } });
  if (url.endsWith("/auth/v1/user")) return res({ id: "u1", email: "a@b.c" });
  if (url.includes("admin_users")) return res([{ user_id: "u1" }]);
  return extra ? extra(url, init) : res([]);
};

test("offline reopen works only after a prior verified login, and never stores a password", async () => {
  install(); online = true; net(happy());
  await loginAdmin("a@b.c", "secret-pass");
  const snap = JSON.stringify(await off.loadAdminSnapshot("u1"));
  assert.ok(!snap.includes("secret-pass"));
  online = false;
  const r = await initializeAdminAuth();
  assert.equal(r.authenticated, true);
  assert.equal(r.offline, true);
});

test("offline reopen is refused with no prior login, wrong user, or expired snapshot", async () => {
  install(); online = false; net(happy());
  assert.equal((await initializeAdminAuth()).authenticated, false);
  await off.saveAdminSnapshot({ id: "u1" }, Date.now() - off.OFFLINE_SESSION_MAX_MS - 1000);
  assert.equal(await off.loadAdminSnapshot(), null);
  await off.saveAdminSnapshot({ id: "u1" });
  assert.equal(await off.loadAdminSnapshot("someone-else"), null);
});

test("offline login with a password is not possible", async () => {
  install(); online = false; net(happy());
  await assert.rejects(loginAdmin("a@b.c", "x"));
  assert.equal((await initializeAdminAuth()).authenticated, false);
});

test("a revoked admin is signed out on reconnect and offline data is cleared", async () => {
  install(); online = true; net(happy());
  await loginAdmin("a@b.c", "p");
  net(happy((u) => res([])));
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/v1/user")) return res({ id: "u1" });
    if (url.includes("admin_users")) return res([]);
    return res([]);
  };
  const r = await initializeAdminAuth();
  assert.equal(r.authenticated, false);
  assert.equal(await off.loadAdminSnapshot(), null);
});

test("reads are cached online and served offline; uncached reads fail", async () => {
  install(); online = true; net(happy((u) => res([{ id: "1", title_en: "A", updated_at: "t1" }])));
  await loginAdmin("a@b.c", "p");
  const p = "rest/v1/hymns?select=*&order=hymn_number";
  await supabaseRequest(p);
  await new Promise((r) => setTimeout(r, 5));
  online = false;
  assert.equal((await supabaseRequest(p))[0].title_en, "A");
  await assert.rejects(supabaseRequest("rest/v1/hymns?select=other"));
});

test("offline writes queue durably, keep order, and sync on reconnect", async () => {
  install(); online = true; net(happy());
  await loginAdmin("a@b.c", "p");
  online = false;
  await supabaseRequest("rest/v1/hymns", { method: "POST", body: { title_en: "N" } });
  await supabaseRequest("rest/v1/programs?id=eq.5", { method: "PATCH", body: { name: "x" } });
  assert.equal(await off.pendingCount(), 2);
  const sent = [];
  online = true;
  net(happy((u, i) => { sent.push(i.method + " " + u.split("/v1/")[1]); return res(null, 204); }));
  const out = await syncOfflineQueue();
  assert.equal(out.synced, 2);
  assert.deepEqual(sent, ["POST hymns", "PATCH programs?id=eq.5"]);
  assert.equal(await off.pendingCount(), 0);
});

test("network drop during sync keeps everything queued; non-queueable writes are not queued", async () => {
  install(); online = true; net(happy());
  await loginAdmin("a@b.c", "p");
  online = false;
  await supabaseRequest("rest/v1/forms", { method: "POST", body: { n: 1 } });
  await assert.rejects(supabaseRequest("rest/v1/live_audio_programs", { method: "POST", body: { n: 1 } }));
  await assert.rejects(supabaseRequest("rest/v1/rpc/anything", { method: "POST", body: {} }));
  assert.equal(await off.pendingCount(), 1);
  const out = await syncOfflineQueue();
  assert.equal(out.offline, true);
  assert.equal(await off.pendingCount(), 1);
});

test("stale updates become conflicts instead of overwriting; permanent errors are surfaced", async () => {
  install(); online = true; net(happy((u) => res([{ id: "9", updated_at: "t1" }])));
  await loginAdmin("a@b.c", "p");
  await supabaseRequest("rest/v1/hymns?select=*");
  await new Promise((r) => setTimeout(r, 5));
  online = false;
  await supabaseRequest("rest/v1/hymns?id=eq.9", { method: "PATCH", body: { title_en: "mine" } });
  await supabaseRequest("rest/v1/forms", { method: "POST", body: { bad: 1 } });
  online = true;
  const urls = [];
  net(happy((u) => { urls.push(u); return u.includes("rest/v1/forms") ? res({ message: "bad" }, 400) : res([]); }));
  const out = await syncOfflineQueue();
  assert.ok(urls[0].includes("updated_at=eq.t1"));
  assert.equal(out.conflicts, 1);
  assert.equal(out.failed, 1);
  const c = await off.getConflicts();
  assert.deepEqual(c.map((e) => e.status).sort(), ["conflict", "failed"]);
  assert.equal(await off.pendingCount(), 0);
});

test("online behavior is unchanged: writes go straight through and errors propagate", async () => {
  install(); online = true; net(happy((u, i) => i.method === "POST" ? res({ message: "denied" }, 403) : res([])));
  await loginAdmin("a@b.c", "p");
  await assert.rejects(supabaseRequest("rest/v1/hymns", { method: "POST", body: {} }), /denied/);
  assert.equal(await off.pendingCount(), 0);
});
