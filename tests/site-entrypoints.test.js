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
  assert.ok(home.includes('theme-color" content="#f4f7ff"'));
  assert.ok(home.includes("Noto+Serif"));
  assert.ok(home.includes("DM+Sans"));
  assert.ok(home.includes('src="./assets/lightbearer-icon-512.png"'));
  assert.ok(home.includes('alt="C&S Bible Church logo placeholder"'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes("English and Yorùbá hymns for worship and reflection."));
  assert.ok(home.includes('<nav class="actions" aria-label="App links">'));
  assert.ok(home.includes('href="./hymnal.html">Open hymnal</a>'));
  assert.ok(!home.includes('href="./admin/"'));
  assert.ok(!home.includes('href="./forms.html"'));
  for (const removedEntry of ["Support", "Community", "Live", "Listen", "Read", "Sign in", "Sign up", "Register"]) {
    assert.ok(!new RegExp("\\b" + removedEntry + "\\b", "i").test(home), `public homepage should not expose ${removedEntry}`);
  }
});
test("the compact homepage keeps its accessible church welcome free of stale carousel controls", async () => {
  const home = await read("index.html");
  assert.ok(home.includes('<main class="card">'));
  assert.ok(home.includes("C&S Bible Church"));
  assert.ok(home.includes('aria-label="App links"'));
  assert.ok(home.includes('href="./hymnal.html"'));
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

test("the hymn reader remains the web, PWA, and native Android launch page", async () => {
  const [reader, manifestText, capacitorText] = await Promise.all([
    read("hymnal.html"),
    read("manifest.webmanifest"),
    read("capacitor.config.json")
  ]);
  const manifest = JSON.parse(manifestText);
  const PACKAGE_VERSION = JSON.parse(await readFile("package.json", "utf8")).version;
  const capacitor = JSON.parse(capacitorText);
  assert.ok(reader.includes("./js/app.js"));
  assert.equal(manifest.start_url, "./hymnal.html");
  assert.equal(manifest.version, PACKAGE_VERSION);
  assert.equal(manifest.theme_color, "#f4f7ff");
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
