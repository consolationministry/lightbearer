import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AUDIO_CONTROL_SPECS, DEFAULT_AUDIO_SETTINGS, nextAutoVoiceTrim, nextNoiseGateState, voiceBandRmsDb } from "../js/live-audio-webrtc.js";

test("voice rms reads real float amplitude (0.1 sine is about -23 dBFS)", () => {
  const s = new Float32Array(2048);
  for (let i = 0; i < s.length; i += 1) s[i] = Math.sin(i * 0.3) * 0.1;
  const db = voiceBandRmsDb(s);
  assert.ok(db > -26 && db < -20, "got " + db);
});

test("auto level lifts quiet real speech and tames loud speech", () => {
  const s = new Float32Array(2048);
  for (let i = 0; i < s.length; i += 1) s[i] = Math.sin(i * 0.3) * 0.1;
  const db = voiceBandRmsDb(s);
  let trim = 0;
  for (let i = 0; i < 40; i += 1) trim = nextAutoVoiceTrim({ voiceRmsDb: db, trimDb: trim, enabled: true });
  assert.ok(trim > 0, "trim " + trim);
  const loud = new Float32Array(2048);
  for (let i = 0; i < loud.length; i += 1) loud[i] = Math.sin(i * 0.3) * 0.7;
  assert.ok(nextAutoVoiceTrim({ voiceRmsDb: voiceBandRmsDb(loud), trimDb: 0, enabled: true }) < 0);
});

test("noise gate closes on steady low noise and opens on speech", () => {
  let st = { floorDb: -45, open: true };
  for (let i = 0; i < 30; i += 1) st = nextNoiseGateState({ levelDb: -55, floorDb: st.floorDb, open: st.open, enabled: true });
  assert.equal(st.open, false);
  st = nextNoiseGateState({ levelDb: -25, floorDb: st.floorDb, open: st.open, enabled: true });
  assert.equal(st.open, true);
  assert.equal(nextNoiseGateState({ levelDb: -80, floorDb: -50, open: false, enabled: false }).open, true);
});

test("noise gate control exists and defaults off for live", () => {
  assert.ok(AUDIO_CONTROL_SPECS.some(s => s.key === "noiseGate"));
  assert.equal(DEFAULT_AUDIO_SETTINGS.noiseGate, 0);
});

test("offline path records the shared mic engine stream and UI is compact and honest", async () => {
  const admin = await readFile(new URL("../admin/js/live-audio-admin.js", import.meta.url), "utf8");
  assert.match(admin, /startLiveAudioRecording\(engine\.stream/);
  assert.match(admin, /autoVoiceLevel: 1, noiseGate: 1/);
  assert.match(admin, /cannot remove all noise/);
  assert.match(admin, /audio-offline-setup-button/);
  const css = await readFile(new URL("../admin/css/live-audio-admin.css", import.meta.url), "utf8");
  assert.match(css, /\.audio-offline-actions \.button \{ width: auto; min-height: 38px/);
});

test("offline-only quality: 128 kbps, hq capture and final limiter; live stays unchanged", async () => {
  const admin = await readFile(new URL("../admin/js/live-audio-admin.js", import.meta.url), "utf8");
  assert.match(admin, /startLiveAudioRecording\(engine\.stream, undefined, \{ audioBitsPerSecond: 128000 \}\)/);
  assert.match(admin, /forceEchoCancellation: offlinePath, highQualityCapture: offlinePath/);
  // live publisher recording call must not pass a bitrate or the hq flag
  assert.match(admin, /startLiveAudioRecording\(mic\.stream, undefined, \{\n\s+onSegment/);
  assert.doesNotMatch(admin, /createLiveAudioMicEngine\(\{[^}]*highQualityCapture: true/);
  const web = await readFile(new URL("../js/live-audio-webrtc.js", import.meta.url), "utf8");
  assert.match(web, /opts\.highQualityCapture === true/);
  assert.match(web, /if \(finalLimiter\)/);
});

test("recorder bitrate defaults to 64 kbps and honours offline 128 kbps", async () => {
  const { startLiveAudioRecording } = await import("../js/live-audio-recording.js");
  const seen = [];
  class R { constructor(s, o) { seen.push(o.audioBitsPerSecond); this.state = "inactive"; } addEventListener() {} start() {} static isTypeSupported() { return true; } }
  const stream = { getAudioTracks: () => [{}] };
  startLiveAudioRecording(stream, R, {});
  startLiveAudioRecording(stream, R, { audioBitsPerSecond: 128000 });
  startLiveAudioRecording(stream, R, { audioBitsPerSecond: 99999999 });
  assert.deepEqual(seen, [64000, 128000, 64000]);
});
