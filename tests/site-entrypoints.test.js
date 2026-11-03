import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");
const run = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("the public homepage presents Lightbearer and C&S Bible Church branding with direct app navigation", async () => {
  const home = await read("index.html");
  assert.ok(home.includes('<main id="top">'));
  assert.ok(home.includes('theme-color" content="#21103c"'));
  assert.ok(home.includes("Playfair+Display"));
  assert.ok(home.includes("DM+Sans"));
  assert.ok(home.includes('src="./assets/lightbearer-icon-512.png"'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes("Continue to web app"));
  assert.ok(home.includes('href="./hymnal.html"'));
  assert.ok(home.includes('href="./download.html"'));
  assert.ok(!home.includes('href="./admin/"'));
  assert.ok(!home.includes('href="./forms.html"'));
  for (const removedEntry of ["Support", "Listen", "Sign in", "Sign up", "Register"]) {
    assert.ok(!new RegExp("\\b" + removedEntry + "\\b", "i").test(home), `public homepage should not expose ${removedEntry}`);
  }
});
test("the compact homepage keeps its accessible church welcome free of stale carousel controls", async () => {
  const home = await read("index.html");
  assert.ok(home.includes('<main id="top">'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes('aria-label="Social media"'));
  assert.ok(home.includes('href="./hymnal.html"'));
  assert.ok(home.includes('href="./download.html"'));
  assert.ok(home.includes('id="worship"'));
  assert.ok(!home.includes('href="./admin/"'));
  assert.ok(!home.includes('href="./forms.html"'));
  for (const staleCarouselMarkup of [
    'aria-roledescription="carousel"',
    'id="hero-carousel-prev"',
    'id="hero-carousel-next"',
    'id="hero-carousel-toggle"',
    'id="hero-carousel-announcement"'
  ]) {
    assert.ok(!home.includes(staleCarouselMarkup), `homepage should not contain removed carousel markup: ${staleCarouselMarkup}`);
  }
});

test("the public root starts at the church homepage and provides a button to the existing hymn app", async () => {
  const [home, reader] = await Promise.all([read("index.html"), read("hymnal.html")]);
  assert.ok(home.includes('<main id="top">'));
  assert.match(home, /<a class="button button-glass" href="\.\/hymnal\.html">Continue to web app/);
  assert.ok(reader.includes("./js/app.js"));
});

test("the church homepage is the default web, PWA, and native Android launch page", async () => {
  const [reader, manifestText, capacitorText] = await Promise.all([
    read("hymnal.html"),
    read("manifest.webmanifest"),
    read("capacitor.config.json")
  ]);
  const manifest = JSON.parse(manifestText);
  const PACKAGE_VERSION = JSON.parse(await readFile("package.json", "utf8")).version;
  const capacitor = JSON.parse(capacitorText);
  assert.ok(reader.includes("./js/app.js"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.version, PACKAGE_VERSION);
  assert.equal(manifest.theme_color, "#f4f7ff");
  assert.equal(capacitor.server.appStartPath, "/");
  const home = await read("index.html");
  assert.ok(home.includes('<main id="top">'));
  assert.match(home, /href="\.\/hymnal\.html"[^>]*>Continue to web app/);
  assert.ok(reader.includes("./js/app.js"));
});

test("admin entry opens login first and keeps the Homepage Design editor after authentication", async () => {
  const [entry, admin, settings] = await Promise.all([
    read("admin/index.html"),
    read("admin/js/admin-app.js"),
    read("admin/js/cms-settings.js")
  ]);
  assert.ok(entry.includes('<div id="admin-root">'));
  assert.ok(entry.includes('src="./js/admin-app.js'));
  assert.ok(admin.indexOf("renderLogin();") < admin.indexOf("initializeAdminAuth().then"));
  assert.ok(admin.includes('id: "settings", label: "Settings"'));
  assert.ok(admin.includes("renderCmsSettingsPanel"));
  assert.ok(admin.includes("renderSettingsWorkspace"));
  assert.ok(settings.includes("Homepage Content"));
  assert.ok(settings.includes("data-cms-section"));
  assert.ok(settings.includes("data-cms-save"));
  assert.ok(settings.includes("saveCmsContent(key, value)"));
});

test("offline app worker caches the reader and the Vite build emits both pages", async () => {
  const [worker, viteConfig] = await Promise.all([read("service-worker.js"), read("vite.config.js")]);
  assert.ok(worker.includes('"./hymnal.html"'));
  assert.ok(viteConfig.includes("hymnal.html"));
});

test("public forms show church branding and bottom navigation, and gate form access on a verified account", async () => {
  const [page, script, css] = await Promise.all([read("forms.html"), read("js/forms-public.js"), read("css/forms.css")]);
  assert.ok(page.includes("C&amp;S Bible Church"));
  const navStart = page.indexOf('<nav class="forms-bottom-nav"');
  const navEnd = page.indexOf("</nav>", navStart) + "</nav>".length;
  const nav = page.slice(navStart, navEnd);
  const links = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 8, "all eight destinations should be in the bottom nav");
  assert.equal((nav.match(/aria-label="(?!Main navigation)[^"]+"/g) || []).length, 8, "each destination should have an accessible name");
  for (const [, item] of links) {
    assert.match(item, /<svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>/, "each destination should have a decorative SVG icon");
    assert.match(item, /<span>[^<]+<\/span>/, "each destination should show a label");
  }
  const formsNav = links.find(([, item]) => item.includes(">Forms</span>"))?.[0] || "";
  assert.ok(formsNav.includes('aria-current="page"') && /<svg\b/.test(formsNav), "Forms should remain active and have its own icon");
  assert.ok(css.includes("grid-template-columns:repeat(8,minmax(0,1fr))"));
  assert.ok(css.includes("font-size:clamp(.48rem,2.1vw,.7rem)"));
  assert.ok(css.includes("flex-direction:column"));
  assert.ok(css.includes(".forms-bottom-nav a>svg"));
  assert.ok(script.includes("Verified account required"));
  assert.ok(script.includes("lightbearer-user-email"));
  assert.ok(script.includes("if(!emailGate())return"));
  assert.ok(script.includes("data-query-for"));
  assert.ok(script.includes("suggestion-option"));
  assert.ok(css.includes(".forms-bottom-nav"));
});

test("admin response cards preserve historical answers and render answer values safely", async () => {
  const [script, helper] = await Promise.all([read("admin/js/forms-admin.js"), read("admin/js/response-data.js")]);
  assert.ok(script.includes("getResponseAnswers(fields,r.data)"));
  assert.ok(helper.includes("Previous answer (field changed)"));
  assert.ok(helper.includes("consumedKeys"));
});

test("admin response cards provide prominent registration IDs, copy actions, labeled answers, and narrow-screen styles", async () => {
  const [script, css] = await Promise.all([read("admin/js/forms-admin.js"), read("admin/css/forms-admin.css")]);
  assert.ok(script.includes("response-registration"));
  assert.ok(script.includes("data-copy"));
  assert.ok(script.includes("response-answer"));
  assert.ok(script.includes("response-summary-date"));
  assert.ok(css.includes(".response-registration"));
  assert.ok(css.includes("@media(max-width:560px)"));
});

test("Pages build includes the admin workspace and its runtime dependencies", async () => {
  await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { cwd: repositoryRoot });
  await run(process.execPath, ["scripts/build-web.mjs"], { cwd: repositoryRoot });

  const files = [
    "admin/index.html",
    "admin/css/admin.css",
    "admin/css/live-audio-admin.css",
    "admin/js/admin-app.js",
    "admin/js/cloudinary-settings.js",
    "js/hymnal-selection.js",
    "js/programme-interactions.js",
    "js/programme-feed-utils.js",
    "js/local-store.js",
    "js/cloudinary-live-audio.js",
    "js/live-audio-recording.js",
    "js/live-audio-realtime.js",
    "js/live-audio-webrtc.js",
    "data/uploaded-hymns.js",
    "data/uploaded-yoruba-hymns.js",
    "assets/demo-church-mark.png"
  ];
  await Promise.all(files.map(file => access(new URL("../dist/" + file, import.meta.url))));

  const worker = await read("dist/service-worker.js");
  for (const file of files) assert.ok(worker.includes("./" + file), file + " should be precached");
});

test("Android debug and Pages deployment workflow assertions match their current workflow names", async () => {
  const [androidWorkflow, pagesWorkflow] = await Promise.all([
    read(".github/workflows/android-debug.yml"),
    read(".github/workflows/deploy-pages.yml")
  ]);
  assert.match(androidWorkflow, /^name: Android debug build/m);
  assert.match(androidWorkflow, /- name: Install, test, and build shared web app/);
  assert.match(pagesWorkflow, /^name: Deploy C&S Lightbearer to GitHub Pages/m);
  assert.ok(pagesWorkflow.includes("workflow_dispatch:"));
  assert.ok(pagesWorkflow.includes("actions/configure-pages@v5"));
  assert.ok(pagesWorkflow.includes("actions/upload-pages-artifact@v3"));
  assert.ok(pagesWorkflow.includes("actions/deploy-pages@v4"));
});
