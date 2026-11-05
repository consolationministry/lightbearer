import { getCmsContent, saveSocialVideoList } from "./cms-settings.js?v=1";
import { normalizeSocialVideoList } from "../../js/social-videos.js";
const names = { youtube: "YouTube", facebook: "Facebook" };
export async function renderSocialVideosAdmin(root, platform) {
  if (!root || !names[platform]) return;
  root.replaceChildren();
  const heading = document.createElement("header"); heading.className = "page-heading";
  heading.innerHTML = "<div><h1>" + names[platform] + " Videos</h1><p>Add up to 80 video links. One link per line. Public visitors can play the saved videos.</p></div>";
  const panel = document.createElement("section"); panel.className = "panel";
  panel.innerHTML = '<form class="panel-body" id="social-video-form"><label class="admin-field">Video links<textarea name="video-links" rows="14" maxlength="20000" placeholder="https://..."></textarea></label><p class="field-hint">Use direct video, live, Shorts or shared-video links from ' + names[platform] + '. Profile/channel links are not accepted.</p><div class="form-actions"><span role="status" aria-live="polite"></span><button class="button button-primary" type="submit">Save ' + names[platform] + ' Videos</button></div></form>';
  root.append(heading, panel);
  const form = panel.querySelector("form"), textarea = form.elements["video-links"], status = form.querySelector('[role="status"]');
  try { const content = await getCmsContent(); textarea.value = (Array.isArray(content[platform + "_videos"]?.urls) ? content[platform + "_videos"].urls : []).join("\n"); }
  catch (_) { status.textContent = "Saved links could not be loaded. Check the database migration and connection."; }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
    try { const urls = normalizeSocialVideoList(textarea.value.split(/\r?\n/), platform); await saveSocialVideoList(platform, urls); textarea.value = urls.join("\n"); status.textContent = "Saved " + urls.length + " video link" + (urls.length === 1 ? "." : "s."); }
    catch (error) { status.textContent = error.message || "Could not save videos."; }
    finally { button.disabled = false; }
  });
}
