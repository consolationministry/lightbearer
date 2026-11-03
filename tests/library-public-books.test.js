import assert from "node:assert/strict";
import test from "node:test";
import { fetchLibraryBooks } from "../js/library-data.js";

test("removed public-book catalog returns no books without requesting the backend", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function () {
    throw new Error("book endpoint should not be called");
  };
  try {
    assert.deepEqual(await fetchLibraryBooks(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
