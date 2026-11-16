import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_CONTROL_SPECS,
  nextAutoVoiceTrim,
  voiceBandRmsDb,
  AUTO_VOICE_LEVEL_MAX_TRIM_DB
} from "../js/live-audio-webrtc.js";

const keys = new Set(AUDIO_CONTROL_SPECS.map(s => s.key));

test("limiter and auto voice controls exist", () => {
  assert.ok(keys.has("limiterThreshold"));
  assert.ok(keys.has("limiterRelease"));
  assert.ok(keys.has("autoVoiceLevel"));
});

test("auto voice trim is inert when disabled or speech absent", () => {
  assert.equal(nextAutoVoiceTrim({ voiceRmsDb: -40, trimDb: 3, enabled: false }), 3);
  assert.equal(nextAutoVoiceTrim({ voiceRmsDb: null, trimDb: 3, enabled: true }), 3);
  assert.equal(nextAutoVoiceTrim({ voiceRmsDb: undefined, trimDb: 0, enabled: true }), 0);
});

test("auto voice trim lifts quiet speech and tames loud speech", () => {
  assert.ok(nextAutoVoiceTrim({ voiceRmsDb: -40, trimDb: 0, enabled: true }) > 0);
  assert.ok(nextAutoVoiceTrim({ voiceRmsDb: -2, trimDb: 0, enabled: true }) < 0);
  assert.equal(nextAutoVoiceTrim({ voiceRmsDb: -18, trimDb: 2, enabled: true }), 2);
});

test("auto voice trim is clamped to the maximum trim", () => {
  assert.ok(nextAutoVoiceTrim({ voiceRmsDb: -60, trimDb: 11.9, enabled: true }) <= AUTO_VOICE_LEVEL_MAX_TRIM_DB);
  assert.ok(nextAutoVoiceTrim({ voiceRmsDb: 0, trimDb: -11.9, enabled: true }) >= -AUTO_VOICE_LEVEL_MAX_TRIM_DB);
});

test("voice band rms detects speech energy and ignores silence", () => {
  assert.equal(voiceBandRmsDb(null), null);
  assert.equal(voiceBandRmsDb(new Float32Array(0)), null);
  const silent = new Float32Array(1024);
  assert.equal(voiceBandRmsDb(silent), null);
  const speech = new Float32Array(4096);
  for (let i = 0; i < speech.length; i += 1) speech[i] = Math.sin(i * 0.4) * 0.5;
  const db = voiceBandRmsDb(speech);
  assert.ok(Number.isFinite(db), "expected a finite rms for speech");
  assert.ok(db > -60 && db < 0, `unexpected voice rms ${db}`);
});
