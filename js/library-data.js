import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../admin/config.js";
import { readLocal, writeLocal } from "./local-store.js";

const DEVICE_ID_KEY = "cns-library-device-id";

export function libraryDeviceId() {
  let id = readLocal(DEVICE_ID_KEY, "");
  if (!id) {
    id = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    writeLocal(DEVICE_ID_KEY, id);
  }
  return id;
}

async function rest(path, options) {
  const response = await fetch(SUPABASE_URL + "/" + path, Object.assign({
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }
  }, options || {}));
  if (!response.ok) throw new Error("Library request failed (" + response.status + ").");
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchLibraryBooks() {
  const result = await rest("rest/v1/books?select=*&status=eq.published&order=created_at.asc&limit=200");
  return (result || []).filter(function (book) { return !book.is_public || book.published === true; });
}

export async function fetchBookPages(bookId) {
  try { return await rest("rest/v1/book_pages?select=id,page_number,page_title,content,is_colored&book_id=eq." + encodeURIComponent(bookId) + "&order=page_number.asc&limit=2000"); }
  catch (error) { return []; }
}

export async function fetchPageSocial(bookId, pageNumber) {
  const likes = await rest("rest/v1/book_page_likes?select=id&book_id=eq." + encodeURIComponent(bookId) + "&page_number=eq." + pageNumber).catch(function () { return []; });
  const comments = await rest("rest/v1/book_page_comments?select=id,author_name,comment,created_at&book_id=eq." + encodeURIComponent(bookId) + "&page_number=eq." + pageNumber + "&order=created_at.asc&limit=200").catch(function () { return []; });
  return { likeCount: (likes || []).length, comments: comments || [] };
}

export async function likeBookPage(bookId, pageNumber) {
  await rest("rest/v1/book_page_likes", { method: "POST", body: JSON.stringify({ book_id: bookId, page_number: pageNumber, device_id: libraryDeviceId() }) });
}

export async function commentOnBookPage(bookId, pageNumber, comment, authorName) {
  await rest("rest/v1/book_page_comments", { method: "POST", body: JSON.stringify({ book_id: bookId, page_number: pageNumber, comment: comment, author_name: authorName || "Reader", device_id: libraryDeviceId() }) });
}

// Split a page's text into page-sized chunks so very long source pages render as two book pages.
export function splitLongPage(text, maxChars) {
  const limit = maxChars || 2200;
  const value = String(text || "").trim();
  if (value.length <= limit) return [value];
  const paragraphs = value.split(/\n\s*\n/);
  const chunks = []; let current = "";
  for (const paragraph of paragraphs) {
    if (current && (current.length + paragraph.length + 2) > limit) { chunks.push(current.trim()); current = paragraph; }
    else current = current ? current + "\n\n" + paragraph : paragraph;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
