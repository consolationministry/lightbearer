import { supabaseRequest } from "./supabase-client.js?v=33";
import { initializeAdminAuth } from "./admin-auth.js?v=33";
import { prayerRequestDeletePath, prayerRequestDetail, prayerRequestListEntry } from "./prayer-inbox-view.js?v=1";

export async function renderPrayerRequests() {
  const content = document.getElementById("admin-content");
  if (!content) return;
  content.innerHTML = '<div class="page-heading"><div><h1>Prayer Requests</h1><p>Private requests submitted to the church. Only approved administrators can view them.</p></div><button class="button button-secondary" type="button" data-prayer-reload>Refresh</button></div><section class="panel panel-body"><p id="prayer-status" role="status" aria-live="polite">Checking administrator access…</p><div class="prayer-inbox-layout"><div class="prayer-request-list" id="prayer-list" aria-label="Prayer request inbox"></div><section class="prayer-request-detail panel" id="prayer-detail" aria-live="polite"><p>Select a request to view its details.</p></section></div></section>';
  const status = content.querySelector("#prayer-status");
  const auth = await initializeAdminAuth();
  if (!auth.authenticated) {
    status.textContent = auth.configured ? "Sign in with an approved administrator account to view prayer requests." : "Configure Supabase in admin/config.js before opening requests.";
    return;
  }
  const list = content.querySelector("#prayer-list");
  const detail = content.querySelector("#prayer-detail");
  const reload = content.querySelector("[data-prayer-reload]");
  let rows = [];
  let selectedId = "";

  function showDetail(row) {
    if (!row) return;
    const item = prayerRequestDetail(row);
    selectedId = item.id;
    detail.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "prayer-detail-heading";
    const title = document.createElement("h2");
    title.textContent = "Request details";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-secondary";
    remove.dataset.prayerDelete = item.id;
    remove.textContent = "Delete request";
    heading.append(title, remove);
    const contact = document.createElement("p");
    contact.className = "prayer-detail-contact";
    contact.textContent = "Contact: " + item.contact;
    const received = document.createElement("p");
    received.className = "prayer-detail-date";
    received.textContent = "Received: " + item.received;
    const request = document.createElement("p");
    request.className = "prayer-detail-request";
    request.textContent = item.request;
    detail.append(heading, contact, received, request);
    list.querySelectorAll("[data-prayer-select]").forEach(button => {
      button.setAttribute("aria-current", button.dataset.prayerSelect === selectedId ? "true" : "false");
    });
  }

  function renderList() {
    list.replaceChildren();
    if (!rows.length) {
      list.textContent = "No prayer requests yet.";
      detail.replaceChildren();
      const empty = document.createElement("p");
      empty.textContent = "No request is selected.";
      detail.append(empty);
      return;
    }
    rows.forEach(row => {
      const item = prayerRequestListEntry(row);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prayer-request-item";
      button.dataset.prayerSelect = item.id;
      button.setAttribute("aria-current", item.id === selectedId ? "true" : "false");
      const contact = document.createElement("strong");
      contact.textContent = item.contact;
      const received = document.createElement("time");
      received.textContent = item.received;
      const preview = document.createElement("span");
      preview.className = "prayer-request-preview";
      preview.textContent = item.preview;
      button.append(contact, received, preview);
      button.addEventListener("click", () => showDetail(row));
      list.append(button);
    });
    const selected = rows.find(row => String(row.id) === selectedId);
    if (selected) {
      showDetail(selected);
    } else {
      detail.replaceChildren();
      const prompt = document.createElement("p");
      prompt.textContent = "Select a request to view its details.";
      detail.append(prompt);
    }
  }

  async function load() {
    status.textContent = "Loading requests…";
    reload.disabled = true;
    try {
      const result = await supabaseRequest("rest/v1/prayer_requests?select=id,contact,created_at,request&order=created_at.desc&limit=100");
      if (!Array.isArray(result)) throw new Error("Prayer requests could not be loaded.");
      rows = result;
      if (!rows.some(row => String(row.id) === selectedId)) selectedId = "";
      renderList();
      status.textContent = rows.length + (rows.length === 1 ? " request" : " requests");
    } catch (error) {
      status.textContent = error?.code === "NOT_CONFIGURED" ? "Configure Supabase in admin/config.js before opening requests." : "Prayer requests could not be loaded. Confirm an administrator is signed in and the prayer requests migration is applied.";
      list.replaceChildren();
      detail.replaceChildren();
    } finally {
      reload.disabled = false;
    }
  }

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-prayer-select]");
    if (button) showDetail(rows.find(row => String(row.id) === button.dataset.prayerSelect));
  });
  detail.addEventListener("click", async event => {
    const button = event.target.closest("[data-prayer-delete]");
    if (!button || !selectedId || button.dataset.prayerDelete !== selectedId) return;
    if (!window.confirm("Delete this prayer request? This cannot be undone.")) return;
    button.disabled = true;
    status.textContent = "Deleting request…";
    try {
      const deleted = await supabaseRequest(prayerRequestDeletePath(selectedId), { method: "DELETE", prefer: "return=representation" });
      if (!Array.isArray(deleted) || !deleted.some(row => String(row.id) === selectedId)) {
        throw new Error("The selected prayer request was not deleted.");
      }
      rows = rows.filter(row => String(row.id) !== selectedId);
      selectedId = "";
      renderList();
      status.textContent = "Prayer request deleted.";
    } catch (error) {
      status.textContent = "Prayer request could not be deleted. Confirm administrator access and try again.";
      button.disabled = false;
    }
  });
  reload.addEventListener("click", load);
  await load();
}
