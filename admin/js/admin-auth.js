import { clearSession, clearActiveSession, getActiveSession, getStoredSession, isSupabaseConfigured, requireAdminAuthorization, saveSession, setActiveSession, setOfflineUserId, setPublicRequestPaths, supabaseRequest, syncOfflineQueue } from "./supabase-client.js?v=33";

import { clearAdminOffline, isOfflineError, loadAdminSnapshot, saveAdminSnapshot } from "./offline-admin.js";

requireAdminAuthorization();
setPublicRequestPaths(["auth/v1/token?grant_type=password"]);

export const ADMIN_AUTH_CONFIGURED = isSupabaseConfigured();

export class AdminAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
  }
}

let currentAdmin = null;

function asAdminError(error) {
  if (error instanceof AdminAuthError) return error;
  if (error && error.code === "NOT_CONFIGURED") {
    return new AdminAuthError("AUTH_NOT_CONFIGURED", "Admin sign-in is not configured. Contact the site administrator.");
  }
  return new AdminAuthError("AUTH_FAILED", error && error.message ? error.message : "Admin sign-in could not be completed.");
}

async function getVerifiedAdmin(session) {
  const user = await supabaseRequest("auth/v1/user", { session: session });
  if (!user || !user.id) throw new AdminAuthError("INVALID_SESSION", "Your sign-in has expired. Please sign in again.");
  const membership = await supabaseRequest(
    "rest/v1/admin_users?select=user_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1",
    { session: session }
  );
  if (!Array.isArray(membership) || membership.length !== 1) {
    clearSession();
    throw new AdminAuthError("ADMIN_REQUIRED", "This account is not on the approved administrator list.");
  }
  return { id: user.id, email: user.email || "", role: "admin" };
}

export async function loginAdmin(email, password) {
  const address = typeof email === "string" ? email.trim() : "";
  if (!address || !password) {
    throw new AdminAuthError("VALIDATION", "Enter an email address and password.");
  }
  if (!ADMIN_AUTH_CONFIGURED) {
    throw new AdminAuthError("AUTH_NOT_CONFIGURED", "Admin sign-in is not configured. Contact the site administrator.");
  }

  try {
    const session = await supabaseRequest("auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: address, password: password },
      publicOnly: true
    });
    currentAdmin = await getVerifiedAdmin(session);
    setActiveSession(session);
    saveSession(session);
    setOfflineUserId(currentAdmin.id);
    await saveAdminSnapshot(currentAdmin).catch(function () {});
    return currentAdmin;
  } catch (error) {
    currentAdmin = null;
    clearActiveSession();
    clearSession();
    if (error instanceof AdminAuthError) throw error;
    if (error && error.status === 400 && /invalid login credentials/i.test(error.message || "")) {
      throw new AdminAuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    throw asAdminError(error);
  }
}

export async function logoutAdmin() {
  const session = getActiveSession();
  currentAdmin = null;
  try {
    if (session) {
      await supabaseRequest("auth/v1/logout", {
        method: "POST",
        session: session,
        noRefresh: true
      });
    }
  } catch (error) {
    // Always clear this device's session even if the network is unavailable.
  } finally {
    clearSession();
    await clearAdminOffline({ dropQueue: false }).catch(function () {});
  }
  return true;
}

export function getCurrentAdmin() {
  return currentAdmin;
}

export function isAdminAuthenticated() {
  return Boolean(currentAdmin && currentAdmin.id);
}

export async function requireAdmin() {
  if (currentAdmin && currentAdmin.id) return currentAdmin;
  const result = await initializeAdminAuth();
  if (!result.authenticated) {
    throw new AdminAuthError("ADMIN_REQUIRED", "A verified admin session is required.");
  }
  return result.admin;
}

export async function initializeAdminAuth() {
  if (!ADMIN_AUTH_CONFIGURED) {
    currentAdmin = null;
    return { configured: false, authenticated: false, admin: null };
  }
  const session = getStoredSession();
  if (!session) {
    currentAdmin = null;
    clearActiveSession();
    return { configured: true, authenticated: false, admin: null };
  }
  setActiveSession(session);
  try {
    currentAdmin = await getVerifiedAdmin(session);
    setOfflineUserId(currentAdmin.id);
    await saveAdminSnapshot(currentAdmin).catch(function () {});
    syncOfflineQueue().catch(function () {});
    return { configured: true, authenticated: true, admin: currentAdmin };
  } catch (error) {
    if (isOfflineError(error)) {
      // Offline: only a device that already signed in and was verified recently may reopen.
      const snapshot = await loadAdminSnapshot().catch(function () { return null; });
      if (snapshot) {
        currentAdmin = snapshot;
        setOfflineUserId(snapshot.id);
        return { configured: true, authenticated: true, admin: snapshot, offline: true };
      }
    }
    currentAdmin = null;
    clearActiveSession();
    if (error && error.code !== "ADMIN_REQUIRED") clearSession();
    if (error && (error.code === "ADMIN_REQUIRED" || error.code === "INVALID_SESSION")) await clearAdminOffline({ dropQueue: false }).catch(function () {});
    return { configured: true, authenticated: false, admin: null, error: asAdminError(error) };
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  // On reconnect, re-verify the admin server-side before any queued change is sent.
  window.addEventListener("online", function () {
    if (!currentAdmin || !currentAdmin.offline) { syncOfflineQueue().catch(function () {}); return; }
    initializeAdminAuth().then(function (result) {
      if (result && !result.authenticated && typeof window.location !== "undefined" && window.location.reload) window.location.reload();
    }).catch(function () {});
  });
}
