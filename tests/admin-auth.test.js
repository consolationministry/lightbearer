import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSession,
  getStoredSession,
  isSupabaseConfigured,
  supabaseRequest
} from "../admin/js/supabase-client.js?v=33";
import {
  initializeAdminAuth,
  isAdminAuthenticated,
  loginAdmin,
  logoutAdmin
} from "../admin/js/admin-auth.js?v=33";

function installStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    }
  };
  return values;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body === null ? "" : JSON.stringify(body); }
  };
}

test("configured admin sign-in stores a session only after server membership is confirmed", async () => {
  installStorage();
  clearSession();
  const seen = [];
  globalThis.fetch = async function (url, init) {
    seen.push({ url: String(url), init: init });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return response({
        access_token: "access-test",
        refresh_token: "refresh-test",
        user: { id: "admin-uuid", email: "admin@example.org" }
      });
    }
    if (String(url).endsWith("/auth/v1/user")) {
      return response({ id: "admin-uuid", email: "admin@example.org" });
    }
    if (String(url).includes("/rest/v1/categories")) return response([{ id: "category-1" }]);
    if (String(url).endsWith("/auth/v1/logout")) return response(null, 204);
    if (String(url).includes("/rest/v1/admin_users")) {
      return response([{ user_id: "admin-uuid" }]);
    }
    throw new Error("Unexpected request: " + url);
  };

  assert.equal(isSupabaseConfigured(), true);
  const admin = await loginAdmin(" admin@example.org ", "test-password");
  assert.deepEqual(admin, { id: "admin-uuid", email: "admin@example.org", role: "admin" });
  assert.equal(isAdminAuthenticated(), true);
  assert.equal(getStoredSession().refresh_token, "refresh-test");
  assert.equal(seen.length, 3);
  assert.equal(seen[0].init.headers.get("authorization").startsWith("Bearer sb_publishable_"), true);
  assert.equal(seen[1].init.headers.get("authorization"), "Bearer access-test");
  await supabaseRequest("rest/v1/categories?select=id");
  assert.equal(seen[3].init.headers.get("authorization"), "Bearer access-test");
  assert.equal(isAdminAuthenticated(), true);
  await logoutAdmin();
  assert.equal(getStoredSession(), null);
  assert.equal(seen[4].init.headers.get("authorization"), "Bearer access-test");
  const storedValues = installStorage();
  storedValues.set("cns-lightbearer-admin-session-v1", JSON.stringify({ access_token: "persisted-access", refresh_token: "persisted-refresh" }));
  const initialized = await initializeAdminAuth();
  assert.equal(initialized.authenticated, true);
  assert.equal(initialized.admin.id, "admin-uuid");
  assert.equal(getStoredSession().refresh_token, "persisted-refresh");
});

test("a signed-in non-admin is rejected and its session is removed", async () => {
  installStorage();
  clearSession();
  globalThis.fetch = async function (url) {
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return response({ access_token: "access-test", refresh_token: "refresh-test" });
    }
    if (String(url).endsWith("/auth/v1/user")) {
      return response({ id: "member-uuid", email: "member@example.org" });
    }
    if (String(url).includes("/rest/v1/admin_users")) return response([]);
    throw new Error("Unexpected request: " + url);
  };

  await assert.rejects(loginAdmin("member@example.org", "test-password"), /not on the approved administrator list/);
  assert.equal(getStoredSession(), null);
  assert.equal(isAdminAuthenticated(), false);
});

test("an existing authorized session is revalidated before admin access", async () => {
  installStorage();
  clearSession();
  globalThis.fetch = async function (url) {
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      return response({ access_token: "access-test", refresh_token: "refresh-test" });
    }
    if (String(url).endsWith("/auth/v1/user")) {
      return response({ id: "admin-uuid", email: "admin@example.org" });
    }
    if (String(url).includes("/rest/v1/admin_users")) return response([{ user_id: "admin-uuid" }]);
    if (String(url).endsWith("/auth/v1/logout")) return response(null, 204);
    throw new Error("Unexpected request: " + url);
  };
  await loginAdmin("admin@example.org", "test-password");
  const result = await initializeAdminAuth();
  assert.equal(result.authenticated, true);
  assert.equal(result.admin.id, "admin-uuid");
  assert.equal(getStoredSession().refresh_token, "refresh-test");
  await logoutAdmin();
  assert.equal(getStoredSession(), null);
});
