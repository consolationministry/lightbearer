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
  assert.ok(home.includes('<main class="card">'));
  assert.ok(home.includes('src="./assets/lightbearer-icon-512.png"'));
  assert.ok(home.includes('alt="C&S Bible Church logo placeholder"'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes("English and Yorùbá Hymnal"));
  assert.ok(home.includes('<nav class="actions" aria-label="App links">'));
  assert.ok(home.includes('href="./hymnal.html">Open hymnal</a>'));
  assert.ok(home.includes('href="./admin/">Admin</a>'));
});
test("the compact homepage keeps its accessible church welcome free of stale carousel controls", async () => {
  const home = await read("index.html");
  assert.ok(home.includes('<main class="card">'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes('aria-label="App links"'));
  assert.ok(home.includes('href="./hymnal.html"'));
  assert.ok(home.includes('href="./admin/"'));
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

test("the hymn reader remains the web, PWA, and native Android launch page", async () => {
  const [reader, manifestText, capacitorText] = await Promise.all([
    read("hymnal.html"),
    read("manifest.webmanifest"),
    read("capacitor.config.json")
  ]);
  const manifest = JSON.parse(manifestText);
  const capacitor = JSON.parse(capacitorText);
  assert.ok(reader.includes("./js/app.js"));
  assert.equal(manifest.start_url, "./hymnal.html");
  assert.equal(capacitor.server.appStartPath, "/hymnal.html");
});

test("offline app worker caches the reader and the Vite build emits both pages", async () => {
  const [worker, viteConfig] = await Promise.all([read("service-worker.js"), read("vite.config.js")]);
  assert.ok(worker.includes('"./hymnal.html"'));
  assert.ok(viteConfig.includes("hymnal.html"));
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
    "assets/demo-church-mark.svg"
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
