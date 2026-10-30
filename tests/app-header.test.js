import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("main app header renders the church branding and search, without the hamburger menu", async () => {
  const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");
  assert.match(appSource, /function renderHeader\(\)/);
  assert.match(appSource, /class="brand-lockup"/);
  assert.match(appSource, /C&S Bible Church/);
  assert.match(appSource, /data-testid="button-header-search"/);
  assert.doesNotMatch(appSource, /toggle-menu|button-header-menu|header-nav|menuOpen/);
  assert.match(css, /backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\.hymnal-hero/);
  assert.match(css, /\.home-library-layout/);
  assert.match(css, /\.reading-card/);
  assert.match(css, /font-family:\s*var\(--font-reading\)/);
  assert.match(css, /#f4f7ff/);
  assert.match(css, /#dbeafe/);
});
