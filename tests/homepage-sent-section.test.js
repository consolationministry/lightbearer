import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/homepage.css', import.meta.url), 'utf8');
const sectionStart = html.indexOf('id="sent-word"');
const aboutEnd = html.indexOf('</section>', html.indexOf('id="about"'));
const sectionEnd = html.indexOf('</section>', sectionStart) + 10;
const section = html.slice(sectionStart, sectionEnd);

test('SENT message follows Who We Are and includes all nine supplied photos', () => {
  assert.ok(sectionStart > aboutEnd);
  assert.match(section, /A Word from the SENT/);
  assert.match(section, /Pastor Makin Olaosebikan/);
  const images = [...section.matchAll(/src="\.\/assets\/homepage-sections\/sent\/([^"]+\.jpg)"/g)].map(m => m[1]);
  assert.equal(images.length, 9);
  assert.equal(new Set(images).size, 9);
  for (const image of images) assert.ok(existsSync(new URL(`../assets/homepage-sections/sent/${image}`, import.meta.url)));
});

test('SENT message carries the requested encouragement and accurate KJV citation', () => {
  assert.match(section, /faith/);
  assert.match(section, /truth of God/);
  assert.match(section, /shine with God’s light/);
  assert.match(section, /“Behold, his soul which is lifted up is not upright in him: but the just shall live by his faith\.”/);
  assert.match(section, /HABAKKUK 2:4 · KING JAMES VERSION/);
  assert.match(section, /hope, love and transformation/);
});

test('image and text remain side by side at narrow widths', () => {
  assert.match(css, /\.sent-ministry-section \.ministry-inner\{grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.match(css, /@media\(max-width:680px\)\{[\s\S]*?\.sent-ministry-section \.ministry-inner\{grid-template-columns:minmax\(0,\.78fr\) minmax\(0,1\.22fr\)/);
});
