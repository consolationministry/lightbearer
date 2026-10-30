import assert from "node:assert/strict";
import test from "node:test";
import { ACCENT_THEMES, getSettings } from "../js/settings.js";

test("uses amber as the sole default accent and migrates legacy settings", () => {
  const records = new Map([
    ["cerc-hymnal-settings-v1", JSON.stringify({ accent: "ruby" })]
  ]);
  globalThis.window = {
    localStorage: {
      getItem(key) { return records.has(key) ? records.get(key) : null; },
      setItem(key, value) { records.set(key, value); }
    }
  };

  assert.deepEqual(ACCENT_THEMES, ["amber"]);
  assert.equal(getSettings().accent, "amber");
  assert.equal(getSettings().theme, "dark");
});
