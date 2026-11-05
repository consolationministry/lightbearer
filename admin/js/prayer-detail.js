import { supabaseRequest } from "./supabase-client.js?v=33";
import { initializeAdminAuth } from "./admin-auth.js?v=33";
import { prayerRequestDetail, prayerRequestDeletePath } from "./prayer-inbox-view.js?v=2";

export async function renderPrayerDetail() {
  const content = document.getElementById("prayer-detail-content");
  if (!content) return;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const status = content.querySelector("#prayer-detail-status");
  const detail = content.querySelector("#prayer-detail");
  const auth = await initializeAdminAuth();
  if (!auth.authenticated) {
    status.textContent = auth.configured ? "Sign in with an approved administrator account to view this request." : "Configure Supabase in admin/config.js before opening requests.";
    return;
  }
  if (!id || !id.trim()) {
    status.textContent = "This prayer request link is missing its request ID.";
    return;
  }

  const backLink = content.querySelector("[data-prayer-back]");
  const deleteButton = content.querySelector("[data-prayer-delete]");
  deleteButton.dataset.prayerDelete = id;
  backLink.href = "./index.html";
  backLink.addEventListener("click", event => {
    if (document.referrer && new URL(document.referrer).origin === window.location.origin && new URL(document.referrer).pathname.endsWith("/admin/index.html")) {
      event.preventDefault();
      window.history.back();
    }
  });

  async function load() {
    status.textContent = "Loading prayer request…";
    detail.hidden = true;
    deleteButton.disabled = true;
    try {
      const rows = await supabaseRequest("rest/v1/prayer_requests?select=id,request,contact,created_at&id=eq." + encodeURIComponent(id) + "&limit=1");
      if (!Array.isArray(rows) || !rows.length) throw new Error("This prayer request could not be found.");
      const prayer = prayerRequestDetail(rows[0]);
      content.querySelector("#prayer-contact").textContent = prayer.contact;
      content.querySelector("#prayer-date").textContent = prayer.received;
      content.querySelector("#prayer-request-text").textContent = prayer.request;
      detail.hidden = false;
      deleteButton.disabled = false;
      status.textContent = "";
    } catch (error) {
      status.textContent = error?.code === "NOT_CONFIGURED" ? "Configure Supabase in admin/config.js before opening requests." : error.message || "Prayer request could not be loaded. Confirm an administrator is signed in.";
    }
  }

  deleteButton.addEventListener("click", async () => {
    if (deleteButton.disabled || deleteButton.dataset.prayerDelete !== id) return;
    if (!window.confirm("Delete this prayer request? This cannot be undone.")) return;
    deleteButton.disabled = true;
    status.textContent = "Deleting prayer request…";
    try {
      const deleted = await supabaseRequest(prayerRequestDeletePath(id), { method: "DELETE", prefer: "return=representation" });
      if (!Array.isArray(deleted) || !deleted.some(row => String(row.id) === id)) {
        throw new Error("The prayer request was not deleted. Refresh and try again.");
      }
      window.location.href = "./index.html";
    } catch (error) {
      status.textContent = error.message || "Prayer request could not be deleted.";
      deleteButton.disabled = false;
    }
  });
  await load();
}
