import { supabaseRequest } from "./supabase-client.js?v=33";
import { initializeAdminAuth } from "./admin-auth.js?v=33";
import { prayerRequestListEntry } from "./prayer-inbox-view.js?v=2";

export async function renderPrayerRequests() {
  const content = document.getElementById("admin-content");
  if (!content) return;
  content.innerHTML = '<div class="page-heading"><div><h1>Prayer Requests</h1><p>Private requests submitted to the church. Only approved administrators can view them.</p></div><button class="button button-secondary" type="button" data-prayer-reload>Refresh</button></div><section class="panel panel-body"><p id="prayer-status" role="status" aria-live="polite">Checking administrator access…</p><div class="prayer-request-list" id="prayer-list" aria-label="Prayer request inbox"></div></section>';
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
      const rows = await supabaseRequest("rest/v1/prayer_requests?select=id,contact,created_at&order=created_at.desc&limit=100");
      if (!Array.isArray(rows)) throw new Error("Prayer requests could not be loaded.");
      renderList(rows);
      status.textContent = rows.length + (rows.length === 1 ? " request" : " requests");
    } catch (error) {
      status.textContent = error?.code === "NOT_CONFIGURED" ? "Configure Supabase in admin/config.js before opening requests." : "Prayer requests could not be loaded. Confirm an administrator is signed in and the prayer requests migration is applied.";
      list.replaceChildren();
    } finally {
      reload.disabled = false;
    }
  }
  function renderList(rows) {
    list.replaceChildren();
    if (!rows.length) {
      list.textContent = "No prayer requests yet.";
      return;
    }
    rows.forEach(row => {
      const item = prayerRequestListEntry(row);
      const link = document.createElement("a");
      link.className = "prayer-request-item";
      link.href = "./prayer-detail.html?id=" + encodeURIComponent(item.id);
      const contact = document.createElement("strong");
      contact.textContent = item.contact;
      const received = document.createElement("time");
      received.textContent = item.received;
      link.append(contact, received);
      list.append(link);
    });
  }
  reload.addEventListener("click", load);
  await load();
}
