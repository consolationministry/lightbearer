import { supabaseRequest, requireAdminAuthorization } from "./supabase-client.js?v=33";
import { prayerRequestListEntry } from "./prayer-inbox-view.js?v=2";

requireAdminAuthorization();

const root = document.querySelector("#prayer-inbox");
const status = document.querySelector("#prayer-admin-status");
const reload = document.querySelector("#prayer-reload");

function render(rows) {
  root.replaceChildren();
  if (!rows.length) {
    root.textContent = "No prayer requests yet.";
    return;
  }
  rows.forEach(row => {
    const item = prayerRequestListEntry(row);
    const link = document.createElement("a");
    link.className = "prayer-request-item";
    link.href = "./prayer-detail.html?id=" + encodeURIComponent(item.id);
    const contact = document.createElement("strong");
    contact.textContent = item.contact;
    const date = document.createElement("time");
    date.textContent = item.received;
    link.append(contact, date);
    root.append(link);
  });
}

async function load() {
  status.textContent = "Loading requests…";
  reload.disabled = true;
  try {
    const rows = await supabaseRequest("rest/v1/prayer_requests?select=id,contact,created_at&order=created_at.desc&limit=100");
    if (!Array.isArray(rows)) throw new Error("Prayer requests could not be loaded.");
    render(rows);
    status.textContent = rows.length + (rows.length === 1 ? " request" : " requests");
  } catch (error) {
    status.textContent = error?.code === "NOT_CONFIGURED" ? "Configure Supabase in admin/config.js before opening the inbox." : "Admin sign-in is required, or the requests migration has not been applied.";
    root.replaceChildren();
  } finally {
    reload.disabled = false;
  }
}

reload.addEventListener("click", load);
load();
