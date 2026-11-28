import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLiveAudioListener, renderLiveAudioPage } from "../js/live-audio-views.js";

const emptyData = { programs: [], savedPrograms: [], comments: [], error: "" };

test("Listen library loading shows plain Loading text with no spinner ring", () => {
  const html = renderLiveAudioPage({ ...emptyData, loading: true }, "", "");
  assert.match(html, /audio-library-loading/);
  assert.match(html, /Loading…/);
  assert.doesNotMatch(html, /stream-loading-ring/);
  assert.doesNotMatch(html, /stream-loading-overlay/);
});

test("Listen library keeps empty state when not loading", () => {
  const html = renderLiveAudioPage({ ...emptyData, loading: false }, "", "");
  assert.match(html, /No recordings yet/);
  assert.doesNotMatch(html, /audio-library-loading/);
});

test("Listen library keeps error state when load fails", () => {
  const html = renderLiveAudioPage({ ...emptyData, loading: false, error: "Audio library could not be loaded right now." }, "", "");
  assert.match(html, /role="alert"/);
  assert.match(html, /could not be loaded/);
});

test("programme listener loading shows plain Loading text with no spinner ring", () => {
  const program = { id: "p1", status: "published", title: "Sunday Service", speaker: "Pastor A", onAir: false, liveSessionId: "" };
  const html = renderLiveAudioListener({ ...emptyData, programs: [program] }, "p1", { loading: true });
  assert.match(html, /audio-library-loading/);
  assert.match(html, /Loading…/);
  // live connection overlays (join/opening) are separate from library loading and keep their rings
  assert.ok(!html.includes("loading audio programmes"));
});
