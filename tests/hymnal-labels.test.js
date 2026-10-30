import assert from "node:assert/strict";
import test from "node:test";
import { displayHymnalName } from "../js/hymnal-labels.js";

test("uploaded hymns use the C&S Bible Church Hymnal name", () => {
  assert.equal(displayHymnalName({ source_hymnal: "Uploaded Hymn Collection" }), "C&S Bible Church Hymnal");
  assert.equal(displayHymnalName({ source_hymnal: "C&S Bible Church Hymnal" }), "C&S Bible Church Hymnal");
});

test("non-legacy source labels remain unchanged", () => {
  assert.equal(displayHymnalName({ source_hymnal: "Pentecostal Hymns No. 1" }), "Pentecostal Hymns No. 1");
});
