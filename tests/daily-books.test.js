import test from "node:test";
import assert from "node:assert/strict";
import { pageChunks, SOURCES } from "../scripts/scrape-free-books.mjs";

test("daily importer allowlists complete free Project Gutenberg texts with attribution", () => {
  assert.equal(SOURCES.length, 1);
  assert.equal(SOURCES[0].name, "Project Gutenberg");
  const titles = SOURCES[0].entries.map((book) => book.title);
  for (const title of ["The Imitation of Christ", "Power Through Prayer", "Practical Religion"]) assert.ok(titles.includes(title));
  assert.ok(SOURCES[0].entries.every((book) => book.url.startsWith("https://www.gutenberg.org/") && book.textUrl.startsWith("https://www.gutenberg.org/") && book.rights === "public domain"));
});

test("full text pagination preserves paragraphs and splits long paragraphs", () => {
  assert.deepEqual(pageChunks("first paragraph\n\nsecond paragraph", 30), ["first paragraph", "second paragraph"]);
  assert.deepEqual(pageChunks("abcdefghij", 4), ["abcd", "efgh", "ij"]);
});
