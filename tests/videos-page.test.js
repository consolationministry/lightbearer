import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../videos.html', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

test('video page embeds the supplied YouTube live video with a direct fallback', () => {
  assert.match(page, /youtube-nocookie\.com\/embed\/9DDk90eKN1U/);
  assert.match(page, /https:\/\/www\.youtube\.com\/live\/9DDk90eKN1U\?si=DgLh_WqDqswQgl7L/);
});

test('video page attempts Facebook plugin embed and keeps the supplied share link', () => {
  assert.match(page, /facebook\.com\/plugins\/video\.php\?href=/);
  assert.match(page, /https:\/\/www\.facebook\.com\/share\/1G16sqApFC\//);
});

test('video page explains discovery limitation without claiming automatic feed access', () => {
  assert.match(page, /Automatic discovery of every Facebook video or YouTube live programme is not connected yet/);
  assert.match(page, /official Facebook Page and YouTube channel URLs/);
});

test('video page is linked from home and included as a Vite entry point', () => {
  assert.match(home, /href="\.\/videos\.html"/);
  assert.match(vite, /videos: path\.resolve\(root, "videos\.html"\)/);
});