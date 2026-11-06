import { setTimeout as delay } from "node:timers/promises";
import { loginAdmin, requireAdmin } from "../admin/js/admin-auth.js";

const PUBLIC_KEY = "sb_publishable_Yu8zP8uGooNm1egNwwnWtg_qYqdE7d5";
const PROJECT_URL = "https://onxqehhfzkuuyarxhcsz.supabase.co";
let session = null;
let adminOk = false;
let paths = new Set();
const sessionStore = { getItem() { return session ? JSON.stringify(session) : null; }, setItem(_key, value) { session = JSON.parse(value); }, removeItem() { session = null; } };
const originalWindow = globalThis.window, originalFetch = globalThis.fetch, originalHeaders = globalThis.Headers, originalFile = globalThis.File;
globalThis.window = { localStorage: sessionStore };
globalThis.Headers = Headers;
globalThis.File = Blob;
const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({ url: String(url), init });
  if (String(url).includes("auth/v1/user")) return new Response(JSON.stringify({ id: "admin-user", email: "admin@example.test" }), { status: 200 });
  if (String(url).includes("auth/v1/token?grant_type=password")) return new Response(JSON.stringify({ access_token: "test-access", refresh_token: "test-refresh", user: { id: "admin-user" } }), { status: 200 });
  if (String(url).includes("admin_users?")) return new Response(adminOk ? JSON.stringify([{ user_id: "admin-user" }]) : JSON.stringify([]), { status: 200 });
  if (String(url).includes("site_content") && (!init || init.method === "GET")) return new Response(JSON.stringify([
    { key: "social_links", value: { youtube: "https://youtube.com/@cns", facebook: "", tiktok: "", x: "", twitter: "", instagram: "", telegram: "" } },
    { key: "about", value: { mode: "text", text: "About text" } },
    { key: "youtube_videos", value: { urls: [] } },
    { key: "facebook_videos", value: { urls: [] } }
  ]), { status: 200 });

  return new Response(JSON.stringify([{ ok: true }]), { status: 200 });
};
const { supabaseRequest, setPublicRequestPaths, requireAdminAuthorization } = await import("../admin/js/supabase-client.js");
  const { saveCmsContent, saveCmsSocialLinks, uploadCmsImage, getCmsContent, saveSocialVideoList } = await import("../admin/js/cms-settings.js");
setPublicRequestPaths(["auth/v1/token?grant_type=password"]);
requireAdminAuthorization();
adminOk = false;
await assertRejects(() => loginAdmin("admin@example.test", "password"), /approved administrator list/i);
adminOk = true;
await loginAdmin("admin@example.test", "password");
await requireAdmin();

try {
  await assertRejects(() => saveCmsContent("unknown", { mode: "text", text: "x" }), /Unsupported homepage section/);
  await assertRejects(() => saveCmsContent("about", { mode: "image", image_url: "https://example.com/not-uploaded.jpg" }), /Choose an image using the file picker/);
  await assertRejects(() => saveCmsSocialLinks({ youtube: "http://youtube.com", facebook: "", tiktok: "", x: "", twitter: "", instagram: "", telegram: "" }), /secure URL/);
  await assertRejects(() => saveCmsSocialLinks({ youtube: "https://facebook.com/pretend", facebook: "", tiktok: "", x: "", twitter: "", instagram: "", telegram: "" }), /selected social platform/);
  const social = { youtube: "https://youtube.com/@cns", facebook: "https://facebook.com/cns", tiktok: "", x: "https://x.com/cns", twitter: "https://twitter.com/cns", instagram: "", telegram: "https://t.me/cns" };
  await saveCmsSocialLinks(social);
  await saveCmsContent("about", { mode: "text", text: "Updated church text" });
  const file = new Blob(["image"], { type: "image/png" }); file.name = "church.png";
  const imageUrl = await uploadCmsImage(file);
  await assertRejects(() => uploadCmsImage(Object.assign(new Blob(["text"], { type: "text/plain" }), { name: "x.txt" })), /Choose an image file/);
  const authRequests = requests.filter(({ url }) => /storage\/v1\/object|rest\/v1\/site_content/.test(url) && !url.includes("select=key"));
  if (authRequests.some(({ init }) => !new Headers(init.headers).get("authorization")?.startsWith("Bearer test-access"))) throw new Error("CMS writes did not carry verified admin session");
  const puts = requests.filter(({ url, init }) => init.method === "POST" && /storage\/v1\/object/.test(url));
  if (puts.length !== 1 || !(puts[0].init.body instanceof Blob)) throw new Error("Image upload was not sent as a binary file body");
  const content = await getCmsContent();
  if (!content.youtube_videos || !content.facebook_videos) throw new Error("Public CMS read omitted the separately stored video lists");
  const publicRead = requests.filter(({ url }) => url.includes("site_content") && url.includes("key=in.(about,hero,intro,retreat,social_links,youtube_videos,facebook_videos)")).at(-1);
  if (!publicRead?.url || publicRead.init?.method !== "GET" || !publicRead.init.headers.get("authorization")?.includes("sb_publishable_")) throw new Error("Social videos were not fetched with public credentials");
  await saveSocialVideoList("youtube", ["https://youtu.be/AbCdEf12345"], ["Programme title"], ["Short description"], { deletionCount: 2, trackingStartedAt: "2026-11-06" });
  await saveSocialVideoList("youtube", ["https://youtu.be/AbCdEf12345"], { deletionCount: 2, trackingStartedAt: "2026-11-06" });
  const legacySave = requests.filter(({ url, init }) => url.includes("site_content") && init?.method === "POST" && JSON.parse(init.body)[0].key === "youtube_videos").at(-1);
  const legacyValue = legacySave && JSON.parse(legacySave.init.body)[0].value;
  if (!Array.isArray(legacyValue.titles) || !Array.isArray(legacyValue.descriptions) || legacyValue.titles[0] !== "" || legacyValue.descriptions[0] !== "") throw new Error("Legacy video save signature was not preserved");
  const videoKeys = requests.filter(({ url, init }) => url.includes("site_content") && init?.method === "POST").map(({ init }) => JSON.parse(init.body)[0].key);
  if (!videoKeys.includes("youtube_videos")) throw new Error("YouTube video list was not persisted");
  const youtubeWrites = requests.filter(({ url, init }) => url.includes("site_content") && init?.method === "POST" && JSON.parse(init.body)[0].key === "youtube_videos");
  const youtubeSave = youtubeWrites.find(({ init }) => JSON.parse(init.body)[0].value.titles?.[0] === "Programme title");
  const youtubeSavedValue = youtubeSave && JSON.parse(youtubeSave.init.body)[0].value;
  if (!youtubeSave || youtubeSavedValue.deletion_count !== 2 || youtubeSavedValue.deletion_tracking_started_at !== "2026-11-06" || youtubeSavedValue.descriptions[0] !== "Short description") throw new Error("Video title, description, or deletion tracking was not persisted");
  const compatibilitySave = youtubeWrites.find(({ init }) => JSON.parse(init.body)[0].value.deletion_count === 2 && JSON.parse(init.body)[0].value.titles?.[0] === "");
  if (!compatibilitySave) throw new Error("Legacy video save signature was not preserved");
  await saveSocialVideoList("facebook", ["https://facebook.com/watch/?v=123456789012345"], ["Facebook Programme"], ["Facebook description"]);
  const allVideoKeys = requests.filter(({ url, init }) => url.includes("site_content") && init?.method === "POST").map(({ init }) => JSON.parse(init.body)[0].key);
  if (!allVideoKeys.includes("facebook_videos")) throw new Error("Facebook video list was not persisted separately");
  const facebookSave = requests.filter(({ url, init }) => url.includes("site_content") && init?.method === "POST" && JSON.parse(init.body)[0].key === "facebook_videos").at(-1);
  const facebookValue = facebookSave && JSON.parse(facebookSave.init.body)[0].value;
  if (facebookValue.titles[0] !== "Facebook Programme" || facebookValue.descriptions[0] !== "Facebook description") throw new Error("Facebook video metadata was not persisted");
  await assertRejects(() => saveSocialVideoList("tiktok", []), /Choose YouTube or Facebook/);
  const videosModule = await import("../js/videos-page.js");
  const rendered = videosModule.renderSocialVideoLists({ youtube_videos: { urls: ["https://youtu.be/AbCdEf12345"], titles: ["Sunday Service"], descriptions: ["A message from the morning service"] }, facebook_videos: { urls: ["https://facebook.com/watch/?v=123456789012345"], titles: ["Youth Programme"], descriptions: ["Youth service highlights"] } });
  if (!rendered.includes("Sunday Service") || !rendered.includes("Youth Programme") || !rendered.includes("A message from the morning service") || !rendered.includes("Youth service highlights") || !rendered.includes("youtube-nocookie.com/embed/AbCdEf12345") || !rendered.includes("Facebook Videos") || !rendered.includes("facebook.com/plugins/video.php") || rendered.indexOf("YouTube Videos") > rendered.indexOf("Facebook Videos")) throw new Error("Public page did not render separately titled platform embeds");
  console.log(JSON.stringify({ social_write: true, text_write: true, upload_url_shape: imageUrl.startsWith(PROJECT_URL + "/storage/v1/object/public/homepage-media/homepage/"), writes_authenticated: true, invalid_inputs_rejected: true, public_video_lists_read: true, video_list_admin_write: true, public_video_embeds: true, request_count: requests.length }));

} finally {
  globalThis.window = originalWindow; globalThis.fetch = originalFetch; globalThis.Headers = originalHeaders; globalThis.File = originalFile;
}
async function assertRejects(fn, pattern) { try { await fn(); } catch (e) { if (!pattern.test(e.message)) throw e; return; } throw new Error("Expected rejection matching " + pattern); }
