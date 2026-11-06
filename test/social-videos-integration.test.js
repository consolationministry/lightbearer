import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8");

test("admin exposes distinct Facebook and YouTube video menus and editors", async () => {
  const admin = await load("admin/js/admin-app.js");
  const editor = await load("admin/js/social-videos-admin.js");
  assert.match(admin, /id: "youtube-videos", label: "YouTube Videos"/);
  assert.match(admin, /id: "facebook-videos", label: "Facebook Videos"/);
  assert.match(admin, /renderSocialVideosAdmin\(document\.getElementById\("admin-content"\)/);
  assert.match(editor, /const add = el\("button", "button button-primary", "Add video link"\)/);
  assert.match(editor, /titles = urls\.map/);
  assert.match(editor, /descriptions = urls\.map/);
  assert.match(editor, /const title = document\.createElement\("input"\)/);
  assert.match(editor, /description\.maxLength = 200/);
  assert.match(editor, /descriptionCounter\.textContent/);
  assert.match(editor, /description\.addEventListener\("input"/);
  assert.match(editor, /saveSocialVideoList\(platform, normalized, alignedTitles, alignedDescriptions, \{ deletionCount: nextDeletedCount, trackingStartedAt \}\)/);
  assert.match(editor, /edit\.dataset\.action = "edit"/);
  assert.match(editor, /remove\.dataset\.action = "delete"/);
  assert.match(editor, /deleted since/);
  assert.match(await load("js/social-videos.js"), /MAX_SOCIAL_VIDEOS = 10000/);
});

test("public page embeds YouTube and Facebook lists separately and schema permits both keys", async () => {
  const page = await load("js/videos-page.js");
  const migration = await load("supabase/migrations/202611030002_homepage_cms.sql");
  assert.match(page, /section\("youtube", content\.youtube_videos/);
  assert.match(page, /section\("facebook", content\.facebook_videos/);
  assert.match(page, /youtubeEmbedUrl/);
  assert.match(page, /facebookEmbedUrl/);
  assert.match(migration, /'youtube_videos','facebook_videos'/);
});
