import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  exportLiveAudioProgram,
  getExportFilename,
  getExportFormat,
  isExportableChurchRecording
} from "../admin/js/live-audio-export.js";

const PROGRAM_ID = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";

function publishedCloudinaryProgram(overrides) {
  return Object.assign({
    id: PROGRAM_ID,
    title: "Sunday Worship Service",
    speaker: "Pastor A",
    category: "Sunday Service",
    venue: "Main sanctuary",
    date: "2026-11-15",
    description: "Worship recording",
    status: "published",
    recordingDurationSeconds: 3600,
    recordingPath: `https://res.cloudinary.com/democloud/video/upload/live-audio/${PROGRAM_ID}/${SESSION_ID}/recording.webm`
  }, overrides || {});
}

function createFakeDocument() {
  const links = [];
  return {
    links,
    createElement(tag) {
      if (tag !== "a") throw new Error("unexpected element " + tag);
      const link = {
        href: "",
        download: "",
        target: "",
        rel: "",
        clicked: false,
        removed: false,
        click() { this.clicked = true; },
        remove() { this.removed = true; }
      };
      links.push(link);
      return link;
    },
    body: { appendChild() {} }
  };
}

test("only published church-owned Cloudinary records are eligible for export", () => {
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram()), true);
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram({ status: "draft" })), false);
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram({ status: "published", recordingPath: "" })), false);
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram({
    recordingPath: "https://seraphmedia.com.ng/embed/audio.webm"
  })), false);
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram({
    recordingPath: "https://www.youtube.com/watch?v=abc"
  })), false);
  assert.equal(isExportableChurchRecording(publishedCloudinaryProgram({
    recordingPath: `cloudinary:video:authenticated:live-audio/${PROGRAM_ID}/${SESSION_ID}/recording:webm`
  })), false);
  assert.equal(isExportableChurchRecording({
    id: PROGRAM_ID,
    title: "Embed only",
    status: "published",
    recordingPath: "https://example.com/audio.webm"
  }), false);
});

test("export filename keeps the title, date and original audio extension", () => {
  assert.equal(
    getExportFilename(publishedCloudinaryProgram()),
    "sunday-worship-service-2026-11-15.webm"
  );
  assert.equal(
    getExportFilename(publishedCloudinaryProgram({
      title: "  Worship / Praise: Live!  ",
      recordingPath: "https://res.cloudinary.com/demo/video/upload/live-audio/x/y/recording.m4a"
    })),
    "worship-praise-live-2026-11-15.m4a"
  );
  assert.equal(
    getExportFilename(publishedCloudinaryProgram({
      recordingPath: "https://res.cloudinary.com/demo/video/upload/asset.mp3?dl=1"
    })),
    "sunday-worship-service-2026-11-15.mp3"
  );
  assert.equal(getExportFormat("https://res.cloudinary.com/demo/video/upload/asset.webm"), "webm");
});

test("export returns only the audio file with no programme metadata or sidecar", async () => {
  const program = publishedCloudinaryProgram();
  const document = createFakeDocument();
  const blob = new Blob(["audio-data"], { type: "audio/webm" });
  const calls = [];
  const result = await exportLiveAudioProgram(program, {
    document,
    fetcher: async url => {
      calls.push(url);
      return { ok: true, blob: async () => blob };
    },
    createObjectURL: () => "blob:fake-export",
    revokeObjectURL: () => {}
  });
  assert.deepEqual(calls, [program.recordingPath]);
  assert.equal(document.links.length, 1);
  assert.equal(document.links[0].href, "blob:fake-export");
  assert.equal(document.links[0].download, "sunday-worship-service-2026-11-15.webm");
  assert.equal(document.links[0].clicked, true);
  // Exact keys: no metadata sidecar, only audio export result
  assert.deepEqual(Object.keys(result).sort(), ["fallback", "filename", "format", "size"]);
  assert.equal(result.filename, "sunday-worship-service-2026-11-15.webm");
  assert.equal(result.size, 10);
  assert.equal(result.fallback, false);
  assert.equal(result.format, "webm");
  assert.equal("metadata" in result, false);
});

test("export fallback is also audio-only with no metadata sidecar", async () => {
  const program = publishedCloudinaryProgram();
  const document = createFakeDocument();
  const result = await exportLiveAudioProgram(program, {
    document,
    fetcher: async () => { throw new TypeError("CORS blocked"); },
    createObjectURL: () => "blob:fake-export",
    revokeObjectURL: () => {}
  });
  assert.equal(document.links.length, 1);
  assert.equal(document.links[0].href, program.recordingPath);
  assert.equal(document.links[0].download, "sunday-worship-service-2026-11-15.webm");
  assert.equal(document.links[0].target, "_blank");
  assert.equal(result.fallback, true);
  assert.equal("metadata" in result, false);
});

test("export rejects embed-only Seraph Media and unpublished programmes", async () => {
  const document = createFakeDocument();
  await assert.rejects(
    () => exportLiveAudioProgram(publishedCloudinaryProgram({
      recordingPath: "https://seraphmedia.com.ng/embed/audio.webm"
    }), {
      document,
      fetcher: async () => ({ ok: true, blob: async () => new Blob(["x"]) }),
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {}
    }),
    /embed-only licensed recording|cannot be exported/
  );
  await assert.rejects(
    () => exportLiveAudioProgram(publishedCloudinaryProgram({ status: "draft" }), {
      document,
      fetcher: async () => ({ ok: true, blob: async () => new Blob(["x"]) }),
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {}
    }),
    /Only published programmes can be exported/
  );
  assert.equal(document.links.length, 0);
});

test("admin rows show Export beside Edit and Delete only for published eligible records", async () => {
  const source = await readFile(new URL("../admin/js/live-audio-admin.js", import.meta.url), "utf8");
  assert.match(source, /data-action="audio-admin-edit"/);
  assert.match(source, /data-action="audio-admin-delete"/);
  assert.match(source, /data-action="audio-admin-publish"/);
  assert.match(source, /data-action="audio-admin-export-programme"/);
  assert.match(source, /isExportableChurchRecording\(program\)/);
  assert.match(source, /button-secondary" type="button" data-action="audio-admin-export-programme"/);
  assert.doesNotMatch(source, /recording_path\? '<a class="button button-secondary" href=.*download audio/);
  // Export must not emit metadata sidecar in admin handler
  const exportHandlerStart = source.indexOf('data-action="audio-admin-export-programme"');
  assert.ok(exportHandlerStart >= 0);
  const handlerSnippet = source.slice(exportHandlerStart, exportHandlerStart + 800);
  assert.doesNotMatch(handlerSnippet, /metadata|buildExportMetadata|\.json|sidecar/);
});

test("export helper exposes no metadata sidecar builder", async () => {
  const source = await readFile(new URL("../admin/js/live-audio-export.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /buildExportMetadata/);
  assert.doesNotMatch(source, /metadata/);
  assert.doesNotMatch(source, /\.json/);
  assert.match(source, /export async function exportLiveAudioProgram/);
  assert.match(source, /createDownloadLink\(documentLike, objectUrl, filename\)/);
});
