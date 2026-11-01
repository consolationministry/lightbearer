import assert from "node:assert/strict";
import test from "node:test";
import { buildBookPageRows, buildBookPublishPatch, replaceBookPages, saveBookPublishState } from "../admin/js/library-admin.js?v=32";

test("book publish writes the published flag used by the member catalog and requires a matching server receipt", async () => {
  const publicBook = { id: "book-1", is_public: true };
  assert.deepEqual(buildBookPublishPatch(publicBook, true), { published: true });
  const calls = [];
  const receipt = await saveBookPublishState(publicBook, true, async (path, options) => {
    calls.push({ path, options });
    if (path.includes("rpc/set_public_book_published")) return null;
    return [{ id: "book-1", published: true }];
  });
  assert.deepEqual(receipt, { id: "book-1", published: true });
  assert.match(calls[0].path, /rpc\/set_public_book_published/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { book_id: "book-1", make_published: true });
  assert.match(calls[1].path, /select=id,published/);
  await assert.rejects(saveBookPublishState(publicBook, true, async (path) => path.includes("rpc/") ? null : []), /not confirmed by the server/);
  assert.throws(() => buildBookPublishPatch({ id: "private-1", is_public: false }, true), /Only public books/);
});
test("library page payload uses the exact fields consumed by the member app", () => {
  const rows = buildBookPageRows("book-1", [
    { title: "Ignored title", content: "reader text", image_url: "https://example.org/page.png", background_color: "#eef" },
    { content: "plain page" }
  ]);
  assert.deepEqual(rows, [
    { book_id: "book-1", page_number: 1, text_content: "reader text", image_url: "https://example.org/page.png", background_color: "#eef" },
    { book_id: "book-1", page_number: 2, text_content: "plain page", image_url: null, background_color: null }
  ]);
  assert.equal("content" in rows[0], false);
  assert.equal("page_title" in rows[0], false);
  assert.equal("is_colored" in rows[0], false);
});

test("page replacement restores the prior pages after an insert failure", async () => {
  const calls = [];
  const oldRows = [{ page_number: 1, text_content: "old text", image_url: null, background_color: "white" }];
  let failedNewInsert = false;
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    if (!options.method && path.includes("select=page_number")) return oldRows;
    if (options.method === "POST" && !failedNewInsert) {
      failedNewInsert = true;
      throw new Error("insert rejected: schema cache");
    }
    return null;
  };
  await assert.rejects(replaceBookPages("book-1", [{ content: "new text" }], request), /insert rejected: schema cache/);
  assert.equal(calls[1].options.method, "DELETE");
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[4].options.body), [{ book_id: "book-1", ...oldRows[0] }]);
});

test("failed restoration reports both the save error and cleanup failure", async () => {
  let postCount = 0;
  const request = async (path, options = {}) => {
    if (!options.method && path.includes("select=page_number")) return [{ page_number: 1, text_content: "old", image_url: null, background_color: null }];
    if (options.method === "POST") {
      postCount += 1;
      throw new Error(postCount === 1 ? "new pages rejected" : "restore rejected");
    }
    return null;
  };
  await assert.rejects(replaceBookPages("book-1", [{ content: "new" }], request), /new pages rejected.*restore rejected/);
});

test("page replacement refuses an empty upload before deleting saved pages", async () => {
  const calls = [];
  await assert.rejects(replaceBookPages("book-1", [], async (...args) => { calls.push(args); return []; }), /no readable pages/);
  assert.equal(calls.length, 1);
});
