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
  assert.match(editor, /textarea\.value = .*content\[platform \+ "_videos"\]/s);
  assert.match(editor, /saveSocialVideoList\(platform, urls\)/);
  assert.match(editor, /up to 80/i);
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
