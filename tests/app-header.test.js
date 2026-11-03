import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("main app header keeps the hymnal controls without public duplicate-section links", async () => {
  const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");
  assert.match(appSource, /function renderHeader\(\)/);
  assert.match(appSource, /class="brand-lockup"/);
  assert.match(appSource, /C&S Bible Church/);
  assert.match(appSource, /data-testid="button-header-search"/);
  assert.match(appSource, /\["listen-live", "Live", "radio"\]/);
  assert.match(appSource, /\["listen-recorded", "Listen", "radio"\]/);
  assert.match(appSource, /data-testid="nav-' \+ item\[0\] \+ '"/);
  assert.match(appSource, /data-category="' \+ category \+ '"/);
  assert.match(appSource, /state\.liveAudioCategory \|\| ""/);
  assert.match(css, /grid-template-columns:\s*repeat\(9, minmax\(0, 1fr\)\)/);
  assert.match(appSource, /data-testid="button-favorite-/);
  const readerSource = appSource.match(/function renderReader\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(readerSource, /data-action="copy-lyrics"/);
  assert.match(readerSource, /favoriteButton\(hymn\)/);
  assert.doesNotMatch(appSource, /data-section="public"|Public Books/);
  assert.match(appSource, /Church Library/);
  assert.doesNotMatch(appSource, /seraph-media-embed|Listen on Seraphmedia|data-action="embed-hymn"/);
  assert.doesNotMatch(appSource, /toggle-menu|button-header-menu|header-nav|menuOpen/);
  const navSource = appSource.match(/function renderNav\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(navSource, "public navigation renderer should be present");
  for (const removedEntry of ["Support", "Community", "Stream", "Read", "Favorites", "Service"]) {
    assert.ok(!new RegExp("\\b" + removedEntry + "\\b", "i").test(navSource), `public navigation should not expose ${removedEntry}`);
  }
  assert.match(appSource, /languageToggle\(\)/);
  assert.match(appSource, /renderHomeSearch\(\)/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\.home-library-layout/);
  assert.match(css, /\.reading-card/);
  assert.match(css, /font-family:\s*var\(--font-reading\)/);
  assert.match(css, /#f4f7ff/);
  assert.match(css, /#dbeafe/);
});
