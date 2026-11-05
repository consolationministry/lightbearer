import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('every homepage image section has a prominent link to the gallery', () => {
  const sections = [...homepage.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)].map(match => match[0]);
  const imageSections = sections.filter(section => /<img\b|class="worship-quote-gallery"/.test(section));
  assert.equal(imageSections.length, 10, 'hero, gallery strip, about, sent, praise, prayer images, worship, pastor, word, and retreat');
  for (const [index, section] of imageSections.entries()) {
    assert.ok(section.includes('class="button') && section.includes('href="./gallery.html"') && /Explore (?:our|the full) gallery/.test(section), `image section ${index + 1} has a gallery CTA`);
  }
});