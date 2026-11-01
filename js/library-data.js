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
  try {
    const result = await rest("rest/v1/book_pages?select=id,page_number,text_content,image_url,background_color&book_id=eq." + encodeURIComponent(bookId) + "&order=page_number.asc&limit=2000");
    return (result || []).map(function (row) { return { id: row.id, page_number: row.page_number, content: row.text_content || "", page_title: "Page " + row.page_number, is_colored: false, image_url: row.image_url, background_color: row.background_color }; });
  } catch (error) { return []; }
}

export async function fetchPageSocial(bookId, pageNumber) {
  const pageResult = await rest("rest/v1/book_pages?select=id&book_id=eq." + encodeURIComponent(bookId) + "&page_number=eq." + pageNumber).catch(function () { return []; });
  const pageId = pageResult && pageResult[0] && pageResult[0].id;
  if (!pageId) return { likeCount: 0, comments: [] };
  const [likes, comments] = await Promise.all([
    rest("rest/v1/book_page_likes?select=id&page_id=eq." + encodeURIComponent(pageId)).catch(function () { return []; }),
    rest("rest/v1/book_page_comments?select=id,author,content,created_at&page_id=eq." + encodeURIComponent(pageId) + "&order=created_at.asc&limit=200").catch(function () { return []; })
  ]);
  return { likeCount: (likes || []).length, comments: (comments || []).map(function (row) { return { author_name: row.author, comment: row.content }; }) };
}

export async function likeBookPage(bookId, pageNumber) {
  const pages = await rest("rest/v1/book_pages?select=id&book_id=eq." + encodeURIComponent(bookId) + "&page_number=eq." + pageNumber);
  if (!pages || !pages[0]) throw new Error("Book page is unavailable.");
  await rest("rest/v1/book_page_likes", { method: "POST", body: JSON.stringify({ page_id: pages[0].id, device_id: libraryDeviceId() }) });
}

export async function commentOnBookPage(bookId, pageNumber, comment, authorName) {
  const pages = await rest("rest/v1/book_pages?select=id&book_id=eq." + encodeURIComponent(bookId) + "&page_number=eq." + pageNumber);
  if (!pages || !pages[0]) throw new Error("Book page is unavailable.");
  await rest("rest/v1/book_page_comments", { method: "POST", body: JSON.stringify({ page_id: pages[0].id, author: authorName || "Reader", content: comment, device_id: libraryDeviceId() }) });
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
