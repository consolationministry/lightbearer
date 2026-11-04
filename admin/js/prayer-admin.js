import { supabaseRequest } from "./supabase-client.js?v=33";
import { initializeAdminAuth } from "./admin-auth.js?v=33";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

export async function renderPrayerRequests() {
  const content = document.getElementById("admin-content");
  if (!content) return;
  content.innerHTML = '<div class="page-heading"><div><h1>Prayer Requests</h1><p>Private requests submitted to the church. Only approved administrators can view them.</p></div><button class="button button-secondary" type="button" data-prayer-reload>Refresh</button></div><section class="panel panel-body"><p id="prayer-status" role="status" aria-live="polite">Checking administrator access…</p><div class="table-wrap" id="prayer-list"></div></section>';
  const status = content.querySelector("#prayer-status");
  const auth = await initializeAdminAuth();
  if (!auth.authenticated) {
    status.textContent = auth.configured ? "Sign in with an approved administrator account to view prayer requests." : "Configure Supabase in admin/config.js before opening requests.";
    return;
  }
  const list = content.querySelector("#prayer-list");
  const reload = content.querySelector("[data-prayer-reload]");
  async function load() {
    status.textContent = "Loading requests…";
    reload.disabled = true;
    try {
      const rows = await supabaseRequest("rest/v1/prayer_requests?select=id,request,contact,created_at&order=created_at.desc&limit=100");
      if (!Array.isArray(rows)) throw new Error("Prayer requests could not be loaded.");
      list.innerHTML = rows.length ? '<table><thead><tr><th scope="col">Request</th><th scope="col">Contact</th><th scope="col">Received</th></tr></thead><tbody>' + rows.map(row => '<tr><td>' + escapeHtml(row.request) + '</td><td>' + escapeHtml(row.contact) + '</td><td>' + escapeHtml(row.created_at ? new Date(row.created_at).toLocaleString() : "") + '</td></tr>').join("") + '</tbody></table>' : '<p>No prayer requests yet.</p>';
      status.textContent = rows.length + (rows.length === 1 ? " request" : " requests");
    } catch (error) {
      status.textContent = error?.code === "NOT_CONFIGURED" ? "Configure Supabase in admin/config.js before opening requests." : "Prayer requests could not be loaded. Confirm an administrator is signed in and the prayer requests migration is applied.";
      list.replaceChildren();
    } finally {
      reload.disabled = false;
    }
  }
  reload.addEventListener("click", load);
  await load();
}
