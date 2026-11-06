import { getCmsContent, saveSocialVideoList } from "./cms-settings.js?v=1";
import { normalizeSocialVideoList, normalizeSocialVideoUrl } from "../../js/social-videos.js";

const names = { youtube: "YouTube", facebook: "Facebook" };
const today = () => new Date().toISOString().slice(0, 10);
const displayDate = (value) => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(value + "T00:00:00") : new Date();
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export async function renderSocialVideosAdmin(root, platform) {
  if (!root || !names[platform]) return;
  root.replaceChildren();
  let urls = [];
  let titles = [];
  let descriptions = [];
  let deletedCount = 0;
  let trackingStartedAt = today();
  let saving = false;

  const persist = async (nextUrls, nextTitles, nextDescriptions, nextDeletedCount = deletedCount) => {
    const normalized = normalizeSocialVideoList(nextUrls, platform);
    const alignedTitles = normalized.map((_, index) => String(nextTitles[index] || "").trim());
    const alignedDescriptions = normalized.map((_, index) => String(nextDescriptions[index] || "").trim());
    saving = true;
    try {
      await saveSocialVideoList(platform, normalized, alignedTitles, alignedDescriptions, { deletionCount: nextDeletedCount, trackingStartedAt });
      urls = normalized;
      titles = alignedTitles;
      descriptions = alignedDescriptions;
      deletedCount = nextDeletedCount;
      return true;
    } catch (error) {
      return error;
    } finally { saving = false; }
  };

  const renderList = (message = "") => {
    root.replaceChildren();
    const heading = el("header", "page-heading");
    const copy = el("div"); copy.append(el("h1", "", names[platform] + " Videos"), el("p", "", "Manage this platform's public video links. Add one link at a time; saved links remain in the same order."));
    const add = el("button", "button button-primary", "Add video link"); add.type = "button"; add.dataset.action = "add";
    heading.append(copy, add);
    const panel = el("section", "panel social-video-panel");
    const panelHeader = el("header", "panel-header");
    const headerCopy = el("div"); headerCopy.append(el("h2", "", names[platform] + " video links"), el("p", "social-video-count", urls.length + " video " + (urls.length === 1 ? "link" : "links")));
    panelHeader.append(headerCopy);
    const deletion = el("p", "social-video-deletion-count", deletedCount + " deleted since " + displayDate(trackingStartedAt) + ". Deletion tracking starts from this date; earlier deletions are not available.");
    const list = el("ol", "social-video-list"); list.setAttribute("aria-label", names[platform] + " video links");
    urls.forEach((url, index) => {
      const item = el("li", "social-video-item");
      item.append(el("span", "social-video-number", String(index + 1) + "."));
      const details = el("div", "social-video-details");
      details.append(el("strong", "social-video-title", titles[index] || "Untitled programme"));
      if (descriptions[index]) details.append(el("span", "social-video-description", descriptions[index]));
      details.append(el("span", "social-video-url", url));
      const actions = el("div", "social-video-actions");
      const edit = el("button", "button button-secondary", "Edit"); edit.type = "button"; edit.dataset.action = "edit"; edit.dataset.index = String(index);
      const remove = el("button", "button button-danger", "Delete"); remove.type = "button"; remove.dataset.action = "delete"; remove.dataset.index = String(index); remove.setAttribute("aria-label", "Delete video link " + String(index + 1));
      actions.append(edit, remove); item.append(details, actions); list.append(item);
    });
    if (!urls.length) list.append(el("li", "list-empty", "No video links have been added yet."));
    panel.append(panelHeader, deletion, list); root.append(heading, panel);
    if (message) {
      const status = el("p", "social-video-status", message); status.setAttribute("role", "status");
      root.append(status);
    }
  };

  const renderForm = (index = -1, errorMessage = "") => {
    root.replaceChildren();
    const editing = index >= 0;
    const heading = el("header", "page-heading");
    const copy = el("div"); copy.append(el("h1", "", editing ? "Edit video link" : "Add video link"), el("p", "", "Add the programme details shown with this video on the public page."));
    heading.append(copy); root.append(heading);
    const panel = el("section", "panel form-panel");
    const form = el("form", "panel-body social-video-form");
    const titleLabel = el("label", "admin-field", "Programme title");
    const title = document.createElement("input"); title.type = "text"; title.name = "title"; title.required = true; title.maxLength = 160; title.value = editing ? titles[index] || "" : ""; title.placeholder = "Enter the programme title";
    titleLabel.append(title);
    const descriptionLabel = el("label", "admin-field", "Description");
    const description = document.createElement("textarea"); description.name = "description"; description.rows = 4; description.maxLength = 200; description.value = editing ? descriptions[index] || "" : ""; description.placeholder = "Optional programme description";
    descriptionLabel.append(description);
    const descriptionCounter = el("span", "social-video-description-counter", description.value.length + "/200 characters");
    descriptionCounter.setAttribute("aria-live", "polite");
    descriptionCounter.setAttribute("aria-label", "Description character count");
    descriptionLabel.append(descriptionCounter);
    description.addEventListener("input", () => {
      descriptionCounter.textContent = description.value.length + "/200 characters";
    });
    const linkLabel = el("label", "admin-field", "Video link");
    const link = document.createElement("input"); link.type = "url"; link.name = "url"; link.required = true; link.placeholder = "https://..."; link.autocomplete = "url"; link.inputMode = "url"; link.value = editing ? urls[index] : "";
    linkLabel.append(link);
    const status = el("span", "social-video-status", errorMessage); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const actions = el("div", "form-actions");
    const cancel = el("button", "button button-secondary", "Cancel"); cancel.type = "button"; cancel.dataset.action = "cancel";
    const save = el("button", "button button-primary", "Save video"); save.type = "submit";
    actions.append(status, cancel, save); form.append(titleLabel, descriptionLabel, linkLabel, actions); panel.append(form); root.append(panel);
    title.focus({ preventScroll: true });
    let savingForm = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving || savingForm) return;
      let normalizedUrl;
      try { normalizedUrl = normalizeSocialVideoUrl(link.value, platform).url; }
      catch (error) { status.textContent = error.message; link.focus(); return; }
      const safeTitle = title.value.trim();
      if (!safeTitle) { status.textContent = "Enter the programme title."; title.focus(); return; }
      const duplicate = urls.some((url, itemIndex) => {
        if (editing && itemIndex === index) return false;
        try {
          const existing = normalizeSocialVideoUrl(url, platform);
          const candidate = normalizeSocialVideoUrl(normalizedUrl, platform);
          return platform === "youtube" ? existing.id === candidate.id : existing.url === candidate.url;
        } catch (_) { return url === normalizedUrl; }
      });
      if (duplicate) { status.textContent = "That video link is already in the list."; return; }
      const nextUrls = urls.slice(); const nextTitles = titles.slice(); const nextDescriptions = descriptions.slice();
      if (editing) { nextUrls[index] = normalizedUrl; nextTitles[index] = safeTitle; nextDescriptions[index] = description.value.trim(); }
      else { nextUrls.push(normalizedUrl); nextTitles.push(safeTitle); nextDescriptions.push(description.value.trim()); }
      savingForm = true; save.disabled = true; status.textContent = "Saving…";
      const result = await persist(nextUrls, nextTitles, nextDescriptions);
      if (result === true) renderList("Saved.");
      else { savingForm = false; save.disabled = false; status.textContent = result.message || "Could not save video details."; }
    });
    cancel.addEventListener("click", () => renderList());
  };

  try {
    const content = await getCmsContent();
    const saved = content[platform + "_videos"] || {};
    urls = Array.isArray(saved.urls) ? saved.urls : [];
    titles = urls.map((_, index) => String(Array.isArray(saved.titles) ? saved.titles[index] || "" : "").trim());
    descriptions = urls.map((_, index) => String(Array.isArray(saved.descriptions) ? saved.descriptions[index] || "" : "").trim());
    deletedCount = Number.isSafeInteger(saved.deletion_count) && saved.deletion_count >= 0 ? saved.deletion_count : 0;
    trackingStartedAt = /^\d{4}-\d{2}-\d{2}$/.test(saved.deletion_tracking_started_at || "") ? saved.deletion_tracking_started_at : today();
    renderList();
  } catch (_) {
    renderList("Saved links could not be loaded. Check the database migration and connection.");
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || saving) return;
    if (button.dataset.action === "add") { renderForm(); return; }
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= urls.length) return;
    if (button.dataset.action === "edit") { renderForm(index); return; }
    if (button.dataset.action === "delete") {
      if (!window.confirm("Delete video link " + String(index + 1) + "? This removes it from the public list.")) return;
      const nextUrls = urls.slice(); const nextTitles = titles.slice(); const nextDescriptions = descriptions.slice();
      nextUrls.splice(index, 1); nextTitles.splice(index, 1); nextDescriptions.splice(index, 1);
      const result = await persist(nextUrls, nextTitles, nextDescriptions, deletedCount + 1);
      renderList(result === true ? "Video link deleted." : result.message || "Could not delete video link.");
    }
  });
}
