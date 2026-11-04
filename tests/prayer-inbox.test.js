import assert from "node:assert/strict";
import test from "node:test";
import { prayerRequestDeletePath, prayerRequestDetail, prayerRequestListEntry, prayerRequestPreview } from "../admin/js/prayer-inbox-view.js?v=1";

const synthetic = {
  id: "synthetic-42",
  contact: "sample@example.test",
  request: "SYNTHETIC REQUEST BODY: preserve <tag> & line\nbreaks",
  created_at: "2026-01-02T03:04:05.000Z"
};

test("inbox list entry contains identity and date but never the prayer text", () => {
  const list = prayerRequestListEntry(synthetic);
  assert.deepEqual(Object.keys(list), ["id", "contact", "received", "preview"]);
  assert.notEqual(list.preview, synthetic.request);
  assert.equal(list.preview.length, synthetic.request.length);
});

test("preview normalizes whitespace, truncates long text and handles empty input", () => {
  assert.equal(prayerRequestPreview("  one\n two   three "), "one two three");
  assert.equal(prayerRequestPreview("abcdefghij", 6), "abcde…");
  assert.equal(prayerRequestPreview("  "), "No request text");
});

test("selected detail contains contact and complete request as plain text data", () => {
  const detail = prayerRequestDetail(synthetic);
  assert.equal(detail.contact, synthetic.contact);
  assert.equal(detail.request, synthetic.request);
  assert.equal(detail.id, synthetic.id);
});

test("delete targets exactly the selected request and encodes the identifier", () => {
  assert.equal(prayerRequestDeletePath("uuid/with space"), "rest/v1/prayer_requests?id=eq.uuid%2Fwith%20space");
  assert.throws(() => prayerRequestDeletePath("  "), /id is required/);
});

test("delete request UI requires an individual request confirmation and targets only that id", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../admin/js/prayer-admin.js", import.meta.url), "utf8"));
  assert.match(source, /button\.dataset\.prayerDelete !== selectedId/);
  assert.match(source, /window\.confirm\("Delete this prayer request\? This cannot be undone\."\)/);
  assert.match(source, /prayerRequestDeletePath\(selectedId\)/);
  assert.match(source, /method: "DELETE", prefer: "return=representation"/);
  assert.match(source, /deleted\.some\(row => String\(row\.id\) === selectedId\)/);
  assert.match(source, /rows = rows\.filter\(row => String\(row\.id\) !== selectedId\)/);
});

test("missing or invalid dates are handled without throwing", () => {
  assert.equal(prayerRequestListEntry({ id: "x" }).received, "Date unavailable");
  assert.equal(prayerRequestDetail({ created_at: "invalid" }).received, "Date unavailable");
});
