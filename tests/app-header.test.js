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
  assert.doesNotMatch(appSource, /toggle-menu|button-header-menu|header-nav|menuOpen/);
  const navSource = appSource.match(/function renderNav\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(navSource, "public navigation renderer should be present");
  for (const removedEntry of ["Support", "Community", "Stream", "Listen", "Read"]) {
    assert.ok(!new RegExp("\\b" + removedEntry + "\\b", "i").test(navSource), `public navigation should not expose ${removedEntry}`);
  }
  assert.match(appSource, /data-testid="button-browse-hymns"/);
  assert.match(appSource, /languageToggle\(\)/);
  assert.match(appSource, /renderHomeSearch\(\)/);
  assert.doesNotMatch(appSource.match(/const hero = ([\s\S]*?);\n  const sidebar/)?.[1] || "", /Listen live|data-view="listen"/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\.hymnal-hero/);
  assert.match(css, /\.home-library-layout/);
  assert.match(css, /\.reading-card/);
  assert.match(css, /font-family:\s*var\(--font-reading\)/);
  assert.match(css, /#f4f7ff/);
  assert.match(css, /#dbeafe/);
});
