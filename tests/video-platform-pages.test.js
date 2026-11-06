import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSocialVideoLists, renderSocialVideoPage } from '../js/videos-page.js';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');

const content = {
  youtube_videos: { urls: ['https://youtu.be/AbCdEf12345'] },
  facebook_videos: { urls: ['https://www.facebook.com/watch/?v=1234567890'] }
};

test('existing combined videos page remains available and links both dedicated pages', async () => {
  const page = await read('videos.html');
  const home = await read('index.html');
  assert.match(page, /id="video-lists"/);
  assert.match(page, /src="\.\/js\/videos-page\.js"/);
  assert.match(page, /href="\.\/facebook-videos\.html"/);
  assert.match(page, /href="\.\/youtube-videos\.html"/);
  assert.match(home, /href="\.\/videos\.html"/);
  assert.doesNotMatch(page, /youtube-nocookie\.com\/embed\/9DDk90eKN1U/);
  assert.doesNotMatch(page, /facebook\.com\/plugins\/video\.php\?href=/);
});

test('each dedicated public video page is independently navigable and platform-scoped', async () => {
  for (const [platform, file] of [['facebook', 'facebook-videos.html'], ['youtube', 'youtube-videos.html']]) {
    const page = await read(file);
    assert.match(page, new RegExp(`data-video-platform="${platform}"`));
    assert.match(page, new RegExp(`<h1>${platform === 'facebook' ? 'Facebook' : 'YouTube'} Videos</h1>`));
    assert.match(page, /id="video-lists"/);
    assert.match(page, /src="\.\/js\/videos-page\.js"/);
    assert.match(page, /href="\.\/videos\.html"/);
    assert.match(page, platform === 'facebook' ? /href="\.\/youtube-videos\.html"/ : /href="\.\/facebook-videos\.html"/);
  }
});

test('dedicated renderer emits only the selected platform and preserves its embed links', () => {
  const facebook = renderSocialVideoPage('facebook', content);
  assert.match(facebook, /Facebook Videos/);
  assert.match(facebook, /facebook\.com\/plugins\/video\.php/);
  assert.doesNotMatch(facebook, /youtube-nocookie\.com/);

  const youtube = renderSocialVideoPage('youtube', content);
  assert.match(youtube, /YouTube Videos/);
  assert.match(youtube, /youtube-nocookie\.com\/embed\/AbCdEf12345/);
  assert.doesNotMatch(youtube, /facebook\.com\/plugins\/video\.php/);
  assert.throws(() => renderSocialVideoPage('instagram', content), /Choose YouTube or Facebook/);
});

test('combined renderer still displays both CMS-backed lists', () => {
  const html = renderSocialVideoLists(content);
  assert.match(html, /YouTube Videos/);
  assert.match(html, /Facebook Videos/);
  assert.match(html, /youtube-nocookie\.com\/embed\/AbCdEf12345/);
  assert.match(html, /facebook\.com\/plugins\/video\.php/);
});

test('both dedicated pages are Vite build entries and use the shared public renderer', async () => {
  const [vite, buildScript] = await Promise.all([read('vite.config.js'), read('scripts/build-web.mjs')]);
  assert.match(vite, /facebookVideos: path\.resolve\(root, "facebook-videos\.html"\)/);
  assert.match(vite, /youtubeVideos: path\.resolve\(root, "youtube-videos\.html"\)/);
  assert.match(buildScript, /"social-videos\.js",\s*"videos-page\.js"/);
});

test('dedicated public pages are emitted to the production build', async () => {
  for (const file of ['dist/facebook-videos.html', 'dist/youtube-videos.html']) {
    const page = await read(file);
    assert.match(page, /assets\/videos-[^"]+\.js/);
    assert.match(page, /assets\/cms-settings-[^"]+\.js/);
  }
  const worker = await read('dist/service-worker.js');
  assert.match(worker, /\.\/facebook-videos\.html/);
  assert.match(worker, /\.\/youtube-videos\.html/);
});
