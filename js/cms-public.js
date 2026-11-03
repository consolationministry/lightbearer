import { supabaseRequest } from "../admin/js/supabase-client.js?v=33";
const SOCIAL = ["youtube", "facebook", "tiktok", "x", "twitter", "instagram", "telegram"];
const KEYS = ["about", "hero", "intro", "retreat", "social_links"];
const defaults = Object.fromEntries(SOCIAL.map((key) => [key, ""]));

export async function getCmsContent() {
  try {
    const rows = await supabaseRequest("rest/v1/site_content?select=key,value&key=in.(" + KEYS.join(",") + ")", { publicOnly: true });
    return Object.fromEntries((rows || []).map((row) => [row.key, row.value || {}]));
  } catch (error) {
    if (error.status === 404 || error.code === "PGRST205") return {};
    throw error;
  }
}
export async function getCmsSocialLinks() {
  const content = await getCmsContent();
  return Object.assign({}, defaults, content.social_links || {});
}
