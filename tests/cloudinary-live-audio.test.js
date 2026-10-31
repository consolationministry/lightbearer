import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  parseCloudinaryLiveAudioReference
} from "../js/cloudinary-live-audio.js";
import {
  renderCloudinarySettingsPanel,
  saveCloudinarySettings
} from "../admin/js/cloudinary-settings.js";

const PROGRAM_ID = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body === null ? "" : JSON.stringify(body); }
  };
}

test("Cloudinary audio references validate recording and segment identifiers", () => {
  const recording = parseCloudinaryLiveAudioReference(
    "cloudinary:video:authenticated:live-audio/" + PROGRAM_ID + "/" + SESSION_ID + "/recording:webm"
  );
  assert.deepEqual(recording, {
    publicId: "live-audio/" + PROGRAM_ID + "/" + SESSION_ID + "/recording",
    programId: PROGRAM_ID,
    sessionId: SESSION_ID,
    kind: "recording",
    segmentIndex: null,
    format: "webm"
  });

  const segment = parseCloudinaryLiveAudioReference(
    "cloudinary:video:authenticated:live-audio/" + PROGRAM_ID + "/" + SESSION_ID + "/segments/000012:ogg"
  );
  assert.equal(segment.kind, "segment");
  assert.equal(segment.segmentIndex, 12);
  assert.equal(segment.format, "ogg");
  assert.equal(parseCloudinaryLiveAudioReference("https://evil.example/audio.webm"), null);
  assert.equal(parseCloudinaryLiveAudioReference(
    "cloudinary:video:authenticated:live-audio/not-a-uuid/" + SESSION_ID + "/recording:webm"
  ), null);
});

test("Cloudinary admin settings never prefill or render saved API secrets", () => {
  const html = renderCloudinarySettingsPanel({
    available: true,
    configured: true,
    cloudName: "test-cloud"
  });
  assert.match(html, /Cloudinary audio storage/);
  assert.match(html, /Connected to Cloudinary · test-cloud/);
  assert.match(html, /id="cloudinary-api-key"[^>]*type="password"/);
  assert.match(html, /id="cloudinary-api-secret"[^>]*type="password"/);
  assert.match(html, /Leave both credential fields blank to keep the saved credentials/);
  assert.doesNotMatch(html, /id="cloudinary-api-secret"[^>]*value=/);
});

test("Cloudinary settings reject partial replacement credentials before making a request", async () => {
  await assert.rejects(
    saveCloudinarySettings({ cloudName: "test-cloud", apiKey: "123456", apiSecret: "" }),
    /Enter both the Cloudinary API key and API secret/
  );
});

test("Cloudinary settings save only succeeds after Supabase confirms the saved account", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests = [];
  globalThis.window = {
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };
  globalThis.fetch = async function (url, init) {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), method: init.method, body });
    if (init.method === "GET") return response([{ cloudinary_cloud_name: "", cloudinary_api_key: "", cloudinary_api_secret: "" }]);
    return response([{ cloudinary_cloud_name: "test-cloud", cloudinary_api_key: "test-api-key", cloudinary_api_secret: "test-api-secret" }]);
  };

  try {
    const result = await saveCloudinarySettings({
      cloudName: "test-cloud",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret"
    });
    assert.deepEqual(result, { available: true, configured: true, cloudName: "test-cloud" });
    assert.match(requests[0].url, /\/rest\/v1\/admin_settings\?/);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[1].method, "PATCH");
    assert.deepEqual(requests[1].body, { cloudinary_cloud_name: "test-cloud", cloudinary_api_key: "test-api-key", cloudinary_api_secret: "test-api-secret", updated_at: requests[1].body.updated_at });
    assert.doesNotMatch(JSON.stringify(requests[0]), /test-api-secret/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Cloudinary settings reject a response that does not confirm persistence", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };
  globalThis.fetch = async function (url, init) {
    if (init.method === "GET") return response([{ cloudinary_cloud_name: "", cloudinary_api_key: "", cloudinary_api_secret: "" }]);
    return response([]);
  };

  try {
    await assert.rejects(
      saveCloudinarySettings({ cloudName: "test-cloud", apiKey: "test-api-key", apiSecret: "test-api-secret" }),
      /Supabase did not confirm that the Cloudinary settings were stored/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Cloudinary API secret is used only on admin upload paths; members accept saved public URLs", async () => {
  const adminData = await readFile(new URL("../admin/js/live-audio-admin-data.js", import.meta.url), "utf8");
  const settings = await readFile(new URL("../admin/js/cloudinary-settings.js", import.meta.url), "utf8");
  const publicClient = await readFile(new URL("../js/cloudinary-live-audio.js", import.meta.url), "utf8");
  assert.match(settings, /cloudinary_api_secret/);
  assert.match(adminData, /cloudinary_api_secret/);
  assert.match(adminData, /subtle\.digest\("SHA-1"/);
  assert.doesNotMatch(publicClient, /api_secret|apiSecret/);
  assert.match(publicClient, /isCloudinaryPublicUrl/);
});
