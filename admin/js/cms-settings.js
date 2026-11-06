import { requireAdmin } from "./admin-auth.js?v=32";
import { normalizeSocialVideoList, SOCIAL_VIDEO_PLATFORMS } from "../../js/social-videos.js";
import { supabaseRequest, getSupabaseUrl } from "./supabase-client.js?v=32";
const SOCIAL = ["youtube", "facebook", "tiktok", "x", "twitter", "instagram", "telegram"];
const SECTION = ["about", "hero", "intro", "retreat"];
const BUCKET = "homepage-media";
const endpoint = "rest/v1/site_content";
const VIDEO_KEYS = { youtube: "youtube_videos", facebook: "facebook_videos" };
const defaultSocial = Object.fromEntries(SOCIAL.map((key) => [key, ""]));
const SOCIAL_HOSTS = { youtube: ["youtube.com", "youtu.be"], facebook: ["facebook.com", "fb.com"], tiktok: ["tiktok.com"], x: ["x.com", "twitter.com"], twitter: ["twitter.com", "x.com"], instagram: ["instagram.com"], telegram: ["t.me", "telegram.me", "telegram.org"] };

function validUrl(value, platform) {
  const text = String(value || "").trim();
  if (!text) return "";
  let parsed;
  try { parsed = new URL(text); } catch (_) { throw new Error("Enter a complete social URL beginning with https://"); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (parsed.protocol !== "https:" || !host || parsed.username || parsed.password || !SOCIAL_HOSTS[platform]?.includes(host)) {
    throw new Error("Enter a secure URL for the selected social platform.");
  }
  return parsed.href;
}

export async function getCmsContent() {
  try {
    const rows = await supabaseRequest(endpoint + "?select=key,value&key=in.(about,hero,intro,retreat,social_links,youtube_videos,facebook_videos)", { publicOnly: true });
    return Object.fromEntries((rows || []).map((row) => [row.key, row.value || {}]));
  } catch (error) {
    if (error.status === 404 || error.code === "PGRST205") return {};
    throw error;
  }
}

export async function getCmsSocialLinks() {
  const content = await getCmsContent();
  return Object.assign({}, defaultSocial, content.social_links || {});
}

async function getVideoLists() {
  const rows = await supabaseRequest(endpoint + "?select=key,value&key=in.(youtube_videos,facebook_videos)", { publicOnly: true });
  const byKey = Object.fromEntries((rows || []).map((row) => [row.key, row.value || {}]));
  return Object.fromEntries(SOCIAL_VIDEO_PLATFORMS.map((platform) => [platform, Array.isArray(byKey[VIDEO_KEYS[platform]]?.urls) ? byKey[VIDEO_KEYS[platform]].urls : []]));
}

export async function saveSocialVideoList(platform, urls, tracking = {}) {
  await requireAdmin();
  if (!SOCIAL_VIDEO_PLATFORMS.includes(platform)) throw new Error("Choose YouTube or Facebook.");
  const safeUrls = normalizeSocialVideoList(urls, platform);
  const value = { urls: safeUrls };
  const wasTrackingMetadataProvided = Number.isSafeInteger(tracking.deletionCount) && tracking.deletionCount >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(tracking.trackingStartedAt || "");
  if (wasTrackingMetadataProvided) {
    value.deletion_count = tracking.deletionCount;
    value.deletion_tracking_started_at = tracking.trackingStartedAt;
  } else if (Number.isSafeInteger(tracking.deletionCount) && tracking.deletionCount >= 0) value.deletion_count = tracking.deletionCount;
  await supabaseRequest(endpoint + "?on_conflict=key", { method: "POST", body: [{ key: VIDEO_KEYS[platform], value }], prefer: "resolution=merge-duplicates,return=representation" });
  return value;
}

export async function saveCmsContent(key, value) {
  await requireAdmin();
  if (!SECTION.includes(key)) throw new Error("Unsupported homepage section.");
  if (!value || !["text", "image"].includes(value.mode)) throw new Error("Choose Text or Image for this section.");
  if (value.mode === "text" && typeof value.text !== "string") throw new Error("Enter section text before saving.");
  if (value.mode === "image" && (typeof value.image_url !== "string" || !value.image_url.startsWith(getSupabaseUrl() + "/storage/v1/object/public/" + BUCKET + "/"))) throw new Error("Choose an image using the file picker.");
  await supabaseRequest(endpoint + "?on_conflict=key", { method: "POST", body: [{ key, value }], prefer: "resolution=merge-duplicates,return=representation" });
}

export async function saveCmsSocialLinks(input) {
  await requireAdmin();
  const value = {};
  for (const key of SOCIAL) value[key] = validUrl(input[key], key);
  await supabaseRequest(endpoint + "?on_conflict=key", { method: "POST", body: [{ key: "social_links", value }], prefer: "resolution=merge-duplicates,return=representation" });
}

export async function uploadCmsImage(file) {
  await requireAdmin();
  if (!file || typeof file !== "object" || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image file.");
  if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(String(file.name || ""))) throw new Error("Choose a supported image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose an image smaller than 8 MB.");
  const path = "homepage/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  await supabaseRequest("storage/v1/object/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/"), {
    method: "POST", body: file, headers: { "content-type": file.type, "x-upsert": "false" }, prefer: "return=minimal"
  });
  return getSupabaseUrl() + "/storage/v1/object/public/" + BUCKET + "/" + path;
}

function esc(value) { return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export async function renderCmsSettingsPanel() {
  const [content, socials] = await Promise.all([getCmsContent(), getCmsSocialLinks()]);
  const sectionNames = { about: "About Us", hero: "Homepage hero", intro: "Homepage introduction", retreat: "Homepage retreat" };
  const sectionMarkup = SECTION.map((key) => {
    const data = content[key] || {};
    const mode = data.mode === "image" ? "image" : "text";
    const preview = data.image_url ? '<img class="cms-image-preview" src="' + esc(data.image_url) + '" alt="Current ' + esc(sectionNames[key]) + ' image">' : "";
    return '<section class="panel cms-section" data-cms-section="' + key + '"><header class="panel-header"><div><h2>' + sectionNames[key] + '</h2><p>Choose text or a file-uploaded image for this section.</p></div></header><div class="panel-body"><fieldset class="cms-mode"><legend>Content type</legend><label><input type="radio" name="cms-mode-' + key + '" value="text"' + (mode === "text" ? " checked" : "") + '> Text</label><label><input type="radio" name="cms-mode-' + key + '" value="image"' + (mode === "image" ? " checked" : "") + '> Image</label></fieldset><label class="admin-field cms-text-field">Text<textarea name="cms-text-' + key + '" rows="5">' + esc(data.text) + '</textarea></label><div class="admin-field cms-image-field"><label>Upload image<input type="file" name="cms-file-' + key + '" accept="image/*"></label><p class="field-hint">Select an image file. Image URLs cannot be entered here.</p><div class="cms-preview">' + preview + '</div></div><div class="form-actions"><span class="cms-status" role="status"></span><button type="button" class="button button-primary" data-cms-save="' + key + '">Save ' + sectionNames[key] + '</button></div></div></section>';
  }).join("");
  const socialFields = SOCIAL.map((key) => '<label class="admin-field"><span>' + key[0].toUpperCase() + key.slice(1) + '</span><input type="url" name="social-' + key + '" value="' + esc(socials[key]) + '" placeholder="" inputmode="url"></label>').join("");
  return '<div class="cms-settings"><header class="page-heading"><div><h1>Homepage Content</h1><p>Update the public About Us and homepage sections. Changes require the CMS migration.</p></div></header><section class="panel"><header class="panel-header"><div><h2>Social media links</h2><p>Leave a platform blank to hide its link on the public site.</p></div></header><form class="panel-body" id="cms-social-form"><div class="cms-social-grid">' + socialFields + '</div><div class="form-actions"><span id="cms-social-status" role="status"></span><button class="button button-primary" type="submit">Save Social Links</button></div></form></section>' + sectionMarkup + '</div>';
}

export function wireCmsSettings(root, onSaved) {
  root.addEventListener("change", async (event) => {
    const section = event.target.closest("[data-cms-section]");
    if (!section) return;
    if (event.target.matches('input[type="radio"]')) section.querySelectorAll(".cms-text-field,.cms-image-field").forEach((el) => { el.hidden = (el.classList.contains("cms-text-field")) !== (event.target.value === "text"); });
    if (event.target.type === "file" && event.target.files[0]) {
      const status = section.querySelector(".cms-status"); status.textContent = "Uploading image…";
      try { section.dataset.imageUrl = await uploadCmsImage(event.target.files[0]); section.querySelector(".cms-preview").innerHTML = '<img class="cms-image-preview" alt="Selected image preview" src="' + esc(section.dataset.imageUrl) + '">'; status.textContent = "Image uploaded. Save the section to publish it."; }
      catch (error) { status.textContent = error.message || "Image upload failed."; }
    }
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cms-save]"); if (!button) return;
    const section = button.closest("[data-cms-section]"), key = button.dataset.cmsSave;
    const mode = section.querySelector('input[type="radio"]:checked').value;
    const value = mode === "text" ? { mode, text: section.querySelector("textarea").value } : { mode, image_url: section.dataset.imageUrl || (section.querySelector(".cms-image-preview") || {}).src };
    const status = section.querySelector(".cms-status"); button.disabled = true;
    try { await saveCmsContent(key, value); status.textContent = "Saved. The public page will load the updated content."; onSaved?.(); }
    catch (error) { status.textContent = error.message || "Could not save section."; }
    finally { button.disabled = false; }
  });
  root.addEventListener("submit", async (event) => {
    if (event.target.id !== "cms-social-form") return;
    event.preventDefault(); const form = event.target, status = form.querySelector("#cms-social-status"), values = {};
    for (const key of SOCIAL) values[key] = form.elements["social-" + key].value;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try { await saveCmsSocialLinks(values); status.textContent = "Social links saved."; onSaved?.(); }
    catch (error) { status.textContent = error.message || "Could not save social links."; }
    finally { button.disabled = false; }
  });
}
