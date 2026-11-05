import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('../gallery.html', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

test('public gallery exposes prayer, praise, and hearing the Word sections', () => {
  for (const [id, title] of [['prayer', 'Prayer'], ['praise', 'Praise'], ['word', 'Hearing the Word']]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.ok(html.includes(title));
    assert.ok(html.includes(`href="#${id}"`));
  }
  assert.match(homepage, /href="\.\/gallery\.html">Gallery<\/a>/);
  assert.match(vite, /gallery:\s*path\.resolve\(root, "gallery\.html"\)/);
});

test('gallery includes every supplied categorized photo and its image exists', () => {
  for (const category of ['prayer', 'praise', 'word']) {
    const sectionStart = html.indexOf(`id="${category}"`);
    const sectionEnd = html.indexOf('</section>', sectionStart);
    const section = html.slice(sectionStart, sectionEnd);
    const images = [...section.matchAll(new RegExp(`src="\\.\\/assets\\/homepage-sections\\/${category}\\/([^\\"]+\\.jpg)"`, 'g'))].map(match => match[1]);
    assert.ok(images.length > 0, `${category} has supplied photos`);
    for (const image of images) assert.ok(existsSync(new URL(`../assets/homepage-sections/${category}/${image}`, import.meta.url)));
  }
});

test('gallery retains church identity and respects reduced-motion preferences', () => {
  assert.match(html, /Lightbearer C&amp;S Bible Church/);
  assert.match(html, /seraphmedia\.com\.ng/);
  assert.match(html, /darapet\.name\.ng/);
  const css = readFileSync(new URL('../css/gallery.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media\(max-width:600px\)/);
});
