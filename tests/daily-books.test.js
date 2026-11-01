import test from "node:test";
import assert from "node:assert/strict";
import { categoryFor, coverFor, ingest, SOURCES } from "../scripts/scrape-free-books.mjs";

test("free-catalogue allowlist stores metadata and URLs only", async () => {
  assert.equal(SOURCES.length, 1);
  assert.equal(SOURCES[0].entries.length, 3);
  const writes = [];
  const client = { url: "https://example.supabase.co", headers: {}, fetch: async (url, options) => {
    if (options.method === "GET") return { ok: true, json: async () => [] };
    writes.push(JSON.parse(options.body));
    return { ok: true, text: async () => "" };
  } };
  assert.equal(await ingest(client), 3);
  assert.ok(writes.every((book) => book.is_public && book.published === false && book.source_url && !("content" in book)));
});

test("categorizes supported themes and creates a blue-white fallback cover", () => {
  assert.equal(categoryFor("Prayer for Faith"), "Faith");
  assert.equal(categoryFor("The Imitation of Christ"), "Christian Living");
  const svg = decodeURIComponent(coverFor({ title: "Test", author: "Author" }).split(",")[1]);
  assert.match(svg, /#f4f7ff/); assert.match(svg, /#1d4ed8/); assert.match(svg, /Test/);
});
