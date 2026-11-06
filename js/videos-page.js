import { getCmsContent } from "../admin/js/cms-settings.js?v=1";
import { facebookEmbedUrl, normalizeSocialVideoList, youtubeEmbedUrl } from "./social-videos.js";

const settings = {
  youtube: { name: "YouTube", embed: youtubeEmbedUrl },
  facebook: { name: "Facebook", embed: facebookEmbedUrl }
};
const hasDocument = typeof document !== "undefined";

function escapeHtml(value) { return String(value).replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])); }
function section(platform, saved = {}) {
  const config = settings[platform];
  const urls = normalizeSocialVideoList(Array.isArray(saved) ? saved : saved.urls, platform);
  const titles = !Array.isArray(saved) && Array.isArray(saved.titles) ? saved.titles : [];
  const descriptions = !Array.isArray(saved) && Array.isArray(saved.descriptions) ? saved.descriptions : [];
  const cards = urls.map((url, index) => {
    const title = String(titles[index] || "").trim() || config.name + " video " + (index + 1);
    const description = String(descriptions[index] || "").trim();
    return '<article class="video-card"><div class="video-card-heading"><p class="eyebrow">' + config.name.toUpperCase() + '</p><h3>' + escapeHtml(title) + '</h3>' + (description ? '<p class="video-description">' + escapeHtml(description) + '</p>' : '') + '</div><div class="video-frame"><iframe src="' + escapeHtml(config.embed(url)) + '" title="' + escapeHtml(title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div><p class="video-fallback">If the player does not load, <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">open the video on ' + config.name + '</a>.</p></article>';
  }).join("");
  return '<section class="video-platform" aria-labelledby="' + platform + '-heading"><header class="video-platform-heading"><p class="eyebrow">' + config.name.toUpperCase() + '</p><h2 id="' + platform + '-heading">' + config.name + ' Videos</h2></header><div class="video-library">' + (cards || '<p class="video-empty">No ' + config.name + ' videos have been added yet.</p>') + '</div></section>';
}
export function renderSocialVideoLists(content) {
  return section("youtube", content.youtube_videos || {}) + section("facebook", content.facebook_videos || {});
}
export function renderSocialVideoPage(platform, content) {
  if (!Object.hasOwn(settings, platform)) throw new Error("Choose YouTube or Facebook.");
  const listKey = platform + "_videos";
  return section(platform, content[listKey] || {});
}
async function init() {
  const root = document.getElementById("video-lists");
  if (!root) return;
  try {
    const content = await getCmsContent();
    const platform = document.body.dataset.videoPlatform;
    root.innerHTML = platform ? renderSocialVideoPage(platform, content) : renderSocialVideoLists(content);
  } catch (_) { root.textContent = "Videos could not be loaded right now. Please try again later."; }
}
if (hasDocument) init();
