import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../config.js?v=31";

const SESSION_KEY = "cns-lightbearer-admin-session-v1";
let activeSession = null;

export function setActiveSession(session) {
  if (!session || typeof session.access_token !== "string" || !session.access_token) {
    throw new Error("Supabase returned an invalid sign-in session.");
  }
  activeSession = session;
}

export function getActiveSession() {
  return activeSession;
}

export function clearActiveSession() {
  activeSession = null;
}

export class SupabaseRequestError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = code || "";
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    typeof SUPABASE_URL === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL) &&
    typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return session && typeof session.access_token === "string" ? session : null;
  } catch (error) {
    return null;
  }
}

export function saveSession(session) {
  if (!session || typeof session.access_token !== "string" || typeof session.refresh_token !== "string") {
    throw new Error("Supabase returned an invalid sign-in session.");
  }
  activeSession = session;
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  catch (error) { throw new Error("This browser cannot safely keep the admin session. Allow site storage, then sign in again."); }
}

export function clearSession() {
  clearActiveSession();
  try { window.localStorage.removeItem(SESSION_KEY); } catch (error) {}
}

function makeUrl(path) {
  return SUPABASE_URL.replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch (error) { return text; }
}

function requestError(payload, response) {
  const message = payload && (payload.message || payload.msg || payload.error_description || payload.error);
  const code = payload && (payload.code || payload.error_code);
  return new SupabaseRequestError(
    typeof message === "string" ? message : "Supabase request failed. Try again.",
    response.status,
    typeof code === "string" ? code : ""
  );
}

async function refreshSession(session) {
  if (!session || !session.refresh_token) {
    clearSession();
    return null;
  }
  let response;
  try {
    response = await fetch(makeUrl("auth/v1/token?grant_type=refresh_token"), {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
  } catch (error) {
    throw new SupabaseRequestError(error && error.message ? error.message : "The admin session could not be refreshed.", 0, "NETWORK_ERROR");
  }
  const refreshed = await parseResponse(response);
  if (!response.ok) {
    clearActiveSession();
    clearSession();
    return null;
  }
  setActiveSession(refreshed);
  return refreshed;
}

export async function supabaseRequest(path, options) {
  const opts = options || {};
  if (!isSupabaseConfigured()) throw new SupabaseRequestError("Admin backend configuration is missing.", 0, "NOT_CONFIGURED");
  const session = opts.session || (!opts.publicOnly ? (getActiveSession() || getStoredSession()) : null);
  const headers = new Headers(opts.headers || {});
  const blobBody = typeof Blob !== "undefined" && opts.body instanceof Blob;
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  if (!headers.has("content-type") && opts.body !== undefined && !blobBody) headers.set("content-type", "application/json");
  if (!headers.has("accept")) headers.set("accept", "application/json");
  headers.set("authorization", "Bearer " + (session && session.access_token ? session.access_token : SUPABASE_PUBLISHABLE_KEY));
  if (opts.prefer) headers.set("prefer", opts.prefer);

  const init = { method: opts.method || "GET", headers: headers };
  if (opts.body !== undefined) {
    init.body = blobBody ? opts.body : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  let response;
  try {
    response = await fetch(makeUrl(path), init);
  } catch (error) {
    if (error && error.name === "AbortError") throw new SupabaseRequestError("The request timed out. Check your connection and try again.", 0, "NETWORK_TIMEOUT");
    throw new SupabaseRequestError(error && error.message ? error.message : "Network request failed. Check your connection and try again.", 0, "NETWORK_ERROR");
  }
  const payload = await parseResponse(response);

  if (response.status === 401 && session && session.refresh_token && !opts.noRefresh) {
    const refreshed = await refreshSession(session);
    if (refreshed) return supabaseRequest(path, Object.assign({}, opts, { session: refreshed, noRefresh: true }));
  }
  if (!response.ok) throw requestError(payload, response);
  return payload;
}

export function getSupabaseUrl() {
  return SUPABASE_URL.replace(/\/+$/, "");
}
