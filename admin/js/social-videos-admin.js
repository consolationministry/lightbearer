import { getCmsContent, saveSocialVideoList } from "./cms-settings.js?v=1";
import { normalizeSocialVideoList, normalizeSocialVideoUrl } from "../../js/social-videos.js";

const names = { youtube: "YouTube", facebook: "Facebook" };
const today = () => new Date().toISOString().slice(0, 10);
const displayDate = (value) => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(value + "T00:00:00") : new Date();
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export async function renderSocialVideosAdmin(root, platform) {
  if (!root || !names[platform]) return;
  root.replaceChildren();

  const heading = document.createElement("header");
  heading.className = "page-heading";
  const headingCopy = document.createElement("div");
  const title = document.createElement("h1"); title.textContent = names[platform] + " Videos";
  const intro = document.createElement("p"); intro.textContent = "Manage this platform's public video links. Add one link at a time; saved links remain in the same order.";
  headingCopy.append(title, intro); heading.append(headingCopy);

  const panel = document.createElement("section"); panel.className = "panel social-video-panel";
  const panelHeading = document.createElement("header"); panelHeading.className = "panel-header";
  const panelHeadingCopy = document.createElement("div");
  const listTitle = document.createElement("h2"); listTitle.textContent = names[platform] + " video links";
  const count = document.createElement("p"); count.className = "social-video-count"; count.setAttribute("aria-live", "polite");
  panelHeadingCopy.append(listTitle, count); panelHeading.append(panelHeadingCopy);

  const form = document.createElement("form"); form.className = "panel-body social-video-add";
  const label = document.createElement("label"); label.className = "admin-field"; label.textContent = "Add one video link";
  const input = document.createElement("input"); input.type = "url"; input.name = "video-link"; input.required = true; input.placeholder = "https://..."; input.autocomplete = "url"; input.inputMode = "url";
  label.append(input);
  const formActions = document.createElement("div"); formActions.className = "form-actions";
  const status = document.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const addButton = document.createElement("button"); addButton.type = "submit"; addButton.className = "button button-primary"; addButton.textContent = "Add link";
  formActions.append(status, addButton); form.append(label, formActions);

  const deletionInfo = document.createElement("p"); deletionInfo.className = "social-video-deletion-count";
  const list = document.createElement("ol"); list.className = "social-video-list"; list.setAttribute("aria-label", names[platform] + " video links");
  panel.append(panelHeading, form, deletionInfo, list); root.append(heading, panel);

  let urls = [];
  let deletedCount = 0;
  let trackingStartedAt = today();
  let saving = false;
  const updateSummary = () => {
    count.textContent = urls.length + " video " + (urls.length === 1 ? "link" : "links");
    deletionInfo.textContent = deletedCount + " deleted since " + displayDate(trackingStartedAt) + ". Deletion tracking starts from this date; earlier deletions are not available.";
  };
  const setBusy = (busy) => {
    saving = busy; addButton.disabled = busy;
    list.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  };
  const renderList = () => {
    list.replaceChildren();
    urls.forEach((url, index) => {
      const item = document.createElement("li"); item.className = "social-video-item";
      const number = document.createElement("span"); number.className = "social-video-number"; number.textContent = String(index + 1) + ".";
      const value = document.createElement("span"); value.className = "social-video-url"; value.textContent = url;
      const actions = document.createElement("div"); actions.className = "social-video-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button button-secondary"; edit.textContent = "Edit"; edit.dataset.action = "edit"; edit.dataset.index = String(index);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button-danger"; remove.textContent = "Delete"; remove.dataset.action = "delete"; remove.dataset.index = String(index); remove.setAttribute("aria-label", "Delete video link " + String(index + 1));
      actions.append(edit, remove); item.append(number, value, actions); list.append(item);
    });
    updateSummary();
    setBusy(saving);
  };
  const persist = async (nextUrls, nextDeletedCount = deletedCount) => {
    const normalized = normalizeSocialVideoList(nextUrls, platform);
    saving = true; setBusy(true); status.textContent = "Saving…";
    try {
      await saveSocialVideoList(platform, normalized, { deletionCount: nextDeletedCount, trackingStartedAt });
      urls = normalized; deletedCount = nextDeletedCount; status.textContent = "Saved."; renderList(); return true;
    } catch (error) {
      status.textContent = error.message || "Could not save video links."; return false;
    } finally { saving = false; setBusy(false); }
  };

  try {
    const content = await getCmsContent();
    const saved = content[platform + "_videos"] || {};
    urls = Array.isArray(saved.urls) ? saved.urls : [];
    deletedCount = Number.isSafeInteger(saved.deletion_count) && saved.deletion_count >= 0 ? saved.deletion_count : 0;
    trackingStartedAt = /^\d{4}-\d{2}-\d{2}$/.test(saved.deletion_tracking_started_at || "") ? saved.deletion_tracking_started_at : today();
    renderList();
  } catch (_) {
    status.textContent = "Saved links could not be loaded. Check the database migration and connection.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    let normalized;
    try { normalized = normalizeSocialVideoUrl(input.value, platform).url; }
    catch (error) { status.textContent = error.message; input.focus(); return; }
    const duplicate = urls.some((url) => {
      try {
        const existing = normalizeSocialVideoUrl(url, platform);
        const candidate = normalizeSocialVideoUrl(normalized, platform);
        return platform === "youtube" ? existing.id === candidate.id : existing.url === candidate.url;
      } catch (_) { return url === normalized; }
    });
    if (duplicate) { status.textContent = "That video link is already in the list."; return; }
    const success = await persist([...urls, normalized]);
    if (success) { input.value = ""; input.focus(); }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || saving) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= urls.length) return;
    if (button.dataset.action === "delete") {
      if (!window.confirm("Delete video link " + String(index + 1) + "? This removes it from the public list.")) return;
      const next = urls.slice(); next.splice(index, 1);
      await persist(next, deletedCount + 1);
      return;
    }
    if (button.dataset.action === "edit") {
      const replacement = window.prompt("Edit video link " + String(index + 1), urls[index]);
      if (replacement === null || saving) return;
      let normalized;
      try { normalized = normalizeSocialVideoUrl(replacement, platform).url; }
      catch (error) { status.textContent = error.message; return; }
      const next = urls.slice(); next[index] = normalized;
      await persist(next);
    }
  });
}
