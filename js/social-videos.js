export const SOCIAL_VIDEO_PLATFORMS = Object.freeze(["youtube", "facebook"]);
export const MAX_SOCIAL_VIDEOS = 10000;

function getHost(url) {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeSocialVideoUrl(input, platform) {
  if (!SOCIAL_VIDEO_PLATFORMS.includes(platform)) throw new Error("Choose YouTube or Facebook.");
  const text = String(input || "").trim();
  let url;
  try { url = new URL(text); } catch (_) { throw new Error("Enter a complete video URL beginning with https://"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Video links must be secure https URLs without embedded credentials.");
  const host = getHost(url);
  if (platform === "youtube") {
    if (!["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) throw new Error("Enter a YouTube video link.");
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : (url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|live|shorts)\/([^/?]+)/)?.[1]);
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error("Enter a YouTube video, live, or Shorts URL, not a channel link.");
    return { url: url.href, id };
  }
  if (!["facebook.com", "m.facebook.com", "fb.watch"].includes(host)) throw new Error("Enter a Facebook video link.");
  const path = url.pathname.split("/").filter(Boolean);
  const hasVideoId = url.searchParams.has("v") || /^(?:watch|videos|reel|reels|share)$/.test(path[0] || "") || path.some((part) => /^(?:videos|reel|reels)$/.test(part)) || (host === "fb.watch" && path.length > 0);
  if (!hasVideoId) throw new Error("Enter a Facebook video, reel, or shared video link, not a Page profile.");
  return { url: url.href };
}

export function normalizeSocialVideoList(input, platform) {
  if (!Array.isArray(input)) throw new Error("Video links must be a list.");
  const values = input.map((value) => String(value || "").trim()).filter(Boolean);
  if (values.length > MAX_SOCIAL_VIDEOS) throw new Error("Add no more than " + MAX_SOCIAL_VIDEOS + " video links per platform.");
  const normalized = values.map((value) => normalizeSocialVideoUrl(value, platform));
  const unique = new Set(normalized.map((item) => platform === "youtube" ? item.id : item.url));
  if (unique.size !== normalized.length) throw new Error("Remove duplicate video links before saving.");
  return normalized.map((item) => item.url);
}

export function youtubeEmbedUrl(videoUrl) {
  const parsed = normalizeSocialVideoUrl(videoUrl, "youtube");
  return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(parsed.id);
}

export function facebookEmbedUrl(videoUrl) {
  const parsed = normalizeSocialVideoUrl(videoUrl, "facebook");
  return "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(parsed.url) + "&show_text=false&width=560";
}
