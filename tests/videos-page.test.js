import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../videos.html', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const buildScript = await readFile(new URL('../scripts/build-web.mjs', import.meta.url), 'utf8');
const renderer = await readFile(new URL('../js/videos-page.js', import.meta.url), 'utf8');

test('video page uses the multi-link renderer rather than stale hard-coded cards', () => {
  assert.match(page, /id="video-lists"/);
  assert.match(page, /<script[^>]+src="\.\/js\/videos-page\.js"/);
  assert.doesNotMatch(page, /youtube-nocookie\.com\/embed\/9DDk90eKN1U/);
  assert.doesNotMatch(page, /facebook\.com\/plugins\/video\.php\?href=/);
});

test('video page is linked from home and included as a Vite entry point', () => {
  assert.match(home, /href="\.\/videos\.html"/);
  assert.match(vite, /videos: path\.resolve\(root, "videos\.html"\)/);
});

test('web build stages the public renderer and its static dependency modules', () => {
  assert.match(buildScript, /\["admin\/js",\s*\["cms-settings\.js",\s*"social-videos-admin\.js"\]\]/);
  assert.match(buildScript, /"social-videos\.js",\s*"videos-page\.js"/);
  assert.match(page, /id="video-lists"/);
  assert.match(page, /<script[^>]+src="\.\/js\/videos-page\.js"/);
});

test('build output contains public watch page and renderer at the paths referenced by HTML', async () => {
  const distPage = await readFile(new URL('../dist/videos.html', import.meta.url), 'utf8');
  const distRenderer = await readFile(new URL('../dist/js/videos-page.js', import.meta.url), 'utf8');
  const distSocial = await readFile(new URL('../dist/js/social-videos.js', import.meta.url), 'utf8');
  assert.match(distPage, /id="video-lists"/);
  assert.match(distPage, /assets\/videos-[^"]+\.js/);
  assert.match(distPage, /assets\/cms-settings-[^"]+\.js/);
  assert.match(distRenderer, /cms-settings/);
  assert.match(distRenderer, /social-videos\.js/);
  assert.match(distSocial, /facebookEmbedUrl/);
});

test('video page renders its CMS-backed YouTube and Facebook lists', () => {
  assert.match(renderer, /section\("youtube", content\.youtube_videos \|\| \{\}/);
  assert.match(renderer, /section\("facebook", content\.facebook_videos \|\| \{\}/);
  assert.match(renderer, /escapeHtml\(title\)/);
  assert.match(renderer, /video-description/);
  assert.match(renderer, /youtubeEmbedUrl/);
  assert.match(renderer, /facebookEmbedUrl/);
});