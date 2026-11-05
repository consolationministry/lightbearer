import assert from "node:assert/strict";
import test from "node:test";
import { prayerRequestDeletePath, prayerRequestDetail, prayerRequestListEntry } from "../admin/js/prayer-inbox-view.js?v=2";
import { readFile } from "node:fs/promises";

const synthetic = {
  id: "synthetic-42",
  contact: "sample@example.test",
  request: "SYNTHETIC REQUEST BODY: preserve <tag> & line\nbreaks",
  created_at: "2026-01-02T03:04:05.000Z"
};

 test("inbox list entry contains identity and date only, never prayer text", () => {
  const list = prayerRequestListEntry(synthetic);
  assert.deepEqual(Object.keys(list), ["id", "contact", "received"]);
  assert.equal(JSON.stringify(list).includes(synthetic.request), false);
});

test("detail keeps the complete request as plain text data", () => {
  const detail = prayerRequestDetail(synthetic);
  assert.equal(detail.contact, synthetic.contact);
  assert.equal(detail.request, synthetic.request);
  assert.equal(detail.id, synthetic.id);
});

test("inbox links to a distinct dedicated detail page and fetches no body for list", async () => {
  const source = await readFile(new URL("../admin/js/prayer-admin.js", import.meta.url), "utf8");
  assert.match(source, /prayer-detail\.html\?id=/);
  assert.match(source, /select=id,contact,created_at/);
  assert.doesNotMatch(source, /select=id,request,contact,created_at/);
  assert.doesNotMatch(source, /prayer-request-preview|\.request\b/);
});

test("dedicated detail page loads full text and preserves confirmed delete flow", async () => {
  const html = await readFile(new URL("../admin/prayer-detail.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../admin/js/prayer-detail.js", import.meta.url), "utf8");
  assert.match(html, /id="prayer-request-text"/);
  assert.match(source, /select=id,request,contact,created_at/);
  assert.match(source, /textContent = prayer\.request/);
  assert.match(source, /window\.confirm\("Delete this prayer request\? This cannot be undone\."\)/);
  assert.match(source, /prayerRequestDeletePath\(id\)/);
  assert.match(source, /method: "DELETE", prefer: "return=representation"/);
  assert.match(source, /deleted\.some\(row => String\(row\.id\) === id\)/);
});

test("delete targets exactly the selected request and encodes the identifier", () => {
  assert.equal(prayerRequestDeletePath("uuid/with space"), "rest/v1/prayer_requests?id=eq.uuid%2Fwith%20space");
  assert.throws(() => prayerRequestDeletePath("  "), /id is required/);
});

test("missing or invalid dates are handled without throwing", () => {
  assert.equal(prayerRequestListEntry({ id: "x" }).received, "Date unavailable");
  assert.equal(prayerRequestDetail({ created_at: "invalid" }).received, "Date unavailable");
});
