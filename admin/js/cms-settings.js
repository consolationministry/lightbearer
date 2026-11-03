import { requireAdmin } from "./admin-auth.js?v=32";
import { supabaseRequest, getSupabaseUrl } from "./supabase-client.js?v=32";
const SOCIAL = ["youtube", "facebook", "tiktok", "x", "twitter", "instagram", "telegram"];
const SECTION = ["about", "hero", "intro", "retreat"];
const BUCKET = "homepage-media";
const endpoint = "rest/v1/site_content";
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
    const rows = await supabaseRequest(endpoint + "?select=key,value&key=in.(about,hero,intro,retreat,social_links)", { publicOnly: true });
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
  const socials = await getCmsSocialLinks();
  const socialFields = SOCIAL.map((key) => '<label class="admin-field"><span>' + key[0].toUpperCase() + key.slice(1) + '</span><input type="url" name="social-' + key + '" value="' + esc(socials[key]) + '" placeholder="" inputmode="url"></label>').join("");
  return '<section class="panel cms-settings"><header class="panel-header"><div><h2>Social media links</h2><p>Leave a platform blank to hide its link on the public site.</p></div></header><form class="panel-body" id="cms-social-form"><div class="cms-social-grid">' + socialFields + '</div><div class="form-actions"><span id="cms-social-status" role="status"></span><button class="button button-primary" type="submit">Save Social Links</button></div></form></section>';
}

export function wireCmsSettings(root, onSaved) {
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
