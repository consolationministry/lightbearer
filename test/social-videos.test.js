import test from "node:test";
import assert from "node:assert/strict";
import {
  facebookEmbedUrl,
  MAX_SOCIAL_VIDEOS,
  normalizeSocialVideoList,
  normalizeSocialVideoUrl,
  youtubeEmbedUrl
} from "../js/social-videos.js";

const yt = "https://www.youtube.com/watch?v=AbCdEf12345";
const fb = "https://www.facebook.com/watch/?v=123456789012345";

test("accepts supported secure YouTube and Facebook video URL shapes", () => {
  assert.equal(normalizeSocialVideoUrl(" https://youtu.be/AbCdEf12345 ", "youtube").id, "AbCdEf12345");
  assert.equal(normalizeSocialVideoUrl("https://youtube.com/shorts/AbCdEf12345", "youtube").id, "AbCdEf12345");
  assert.equal(normalizeSocialVideoUrl("https://facebook.com/reel/123456789012345", "facebook").url, "https://facebook.com/reel/123456789012345");
  assert.equal(normalizeSocialVideoUrl("https://fb.watch/abc123/", "facebook").url, "https://fb.watch/abc123/");
});

test("rejects insecure, credentialed, wrong-host, malformed and profile URLs", () => {
  for (const [url, platform] of [
    ["http://youtube.com/watch?v=AbCdEf12345", "youtube"],
    ["https://youtube.com.evil.example/watch?v=AbCdEf12345", "youtube"],
    ["https://user:pass@youtube.com/watch?v=AbCdEf12345", "youtube"],
    ["https://youtube.com/@channel", "youtube"],
    ["https://facebook.com/church", "facebook"],
    ["https://example.com/videos/1", "facebook"],
    ["not a url", "facebook"]
  ]) assert.throws(() => normalizeSocialVideoUrl(url, platform));
  assert.throws(() => normalizeSocialVideoUrl(yt, "instagram"), /Choose YouTube or Facebook/);
});

test("rejects duplicates after trimming and canonical URL parsing", () => {
  assert.throws(() => normalizeSocialVideoList([yt, " " + yt + " "], "youtube"), /duplicate/i);
  assert.throws(() => normalizeSocialVideoList(["https://youtu.be/AbCdEf12345", yt], "youtube"), /duplicate/i);
});

test("allows more than 80 distinct links for numbered admin lists", () => {
  const links = Array.from({ length: 125 }, (_, i) => "https://youtu.be/" + String(i).padStart(11, "0"));
  assert.equal(normalizeSocialVideoList(links, "youtube").length, 125);
});

test("creates platform-specific embed URLs", () => {
  assert.equal(youtubeEmbedUrl(yt), "https://www.youtube-nocookie.com/embed/AbCdEf12345");
  assert.ok(facebookEmbedUrl(fb).startsWith("https://www.facebook.com/plugins/video.php?href="));
});
