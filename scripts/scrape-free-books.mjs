import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_BOOK_BYTES = 20 * 1024 * 1024;
const PAGE_CHARS = 9000;

// Public-domain titles with full text served by Project Gutenberg.
export const SOURCES = [{
  name: "Project Gutenberg",
  entries: [
    { title: "The Imitation of Christ", author: "Thomas à Kempis", url: "https://www.gutenberg.org/ebooks/1653", textUrl: "https://www.gutenberg.org/cache/epub/1653/pg1653.txt", cover: "https://www.gutenberg.org/cache/epub/1653/pg1653.cover.medium.jpg", category: "Christian Living", rights: "public domain" },
    { title: "Power Through Prayer", author: "Edward M. Bounds", url: "https://www.gutenberg.org/ebooks/65115", textUrl: "https://www.gutenberg.org/cache/epub/65115/pg65115.txt", cover: "https://www.gutenberg.org/cache/epub/65115/pg65115.cover.medium.jpg", category: "Prayer", rights: "public domain" },
    { title: "Practical Religion", author: "J. C. Ryle", url: "https://www.gutenberg.org/ebooks/38162", textUrl: "https://www.gutenberg.org/cache/epub/38162/pg38162.txt", cover: "https://www.gutenberg.org/cache/epub/38162/pg38162.cover.medium.jpg", category: "Christian Living", rights: "public domain" },
    { title: "The Christian's Secret of a Happy Life", author: "Hannah Whitall Smith", url: "https://www.gutenberg.org/ebooks/165", textUrl: "https://www.gutenberg.org/cache/epub/165/pg165.txt", cover: "https://www.gutenberg.org/cache/epub/165/pg165.cover.medium.jpg", category: "Christian Living", rights: "public domain" },
    { title: "Jesus Himself", author: "Andrew Murray", url: "https://www.gutenberg.org/ebooks/26003", textUrl: "https://www.gutenberg.org/cache/epub/26003/pg26003.txt", cover: "https://www.gutenberg.org/cache/epub/26003/pg26003.cover.medium.jpg", category: "Faith", rights: "public domain" },
    { title: "Gleanings among the Sheaves", author: "C. H. Spurgeon", url: "https://www.gutenberg.org/ebooks/42657", textUrl: "https://www.gutenberg.org/cache/epub/42657/pg42657.txt", cover: "https://www.gutenberg.org/cache/epub/42657/pg42657.cover.medium.jpg", category: "Christian Living", rights: "public domain" }
  ]
}];

const CATEGORY_HINTS = [
  ["Prayer", /prayer|intercession|supplication|praying/i],
  ["Holy Spirit", /holy spirit|pentecost|comforter|spirit of god/i],
  ["Faith", /faith|believ|trust in god/i],
  ["Salvation", /salvation|redeem|conversion|atonement/i],
  ["Healing", /healing|divine health|sickness/i],
  ["Evangelism", /evangel|mission|soul winning/i],
  ["Christian Living", /obedience|holiness|christian life|devotion/i]
];

function categoryFor(book, content) {
  const sample = (book.title + " " + content.slice(0, 30000)).toLowerCase();
  for (const [category, regex] of CATEGORY_HINTS) if (regex.test(sample)) return category;
  return book.category || "Christian Living";
}
function normalizedText(text) {
  return text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
export function stableBookUuid(sourceUrl) {
  const hex = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return value.slice(0, 8) + "-" + value.slice(8, 12) + "-" + value.slice(12, 16) + "-" + value.slice(16, 20) + "-" + value.slice(20);
}

export function pageChunks(text, max = PAGE_CHARS) {
  const paragraphs = text.split(/\n\s*\n/);
  const pages = []; let current = "";
  for (const paragraph0 of paragraphs) {
    const paragraph = paragraph0.trim();
    if (!paragraph) continue;
    if (paragraph.length > max) {
      if (current) { pages.push(current.trim()); current = ""; }
      for (let offset = 0; offset < paragraph.length; offset += max) pages.push(paragraph.slice(offset, offset + max));
    } else if (current && current.length + paragraph.length + 2 > max) {
      pages.push(current.trim()); current = paragraph;
    } else current = current ? current + "\n\n" + paragraph : paragraph;
  }
  if (current.trim()) pages.push(current.trim());
  return pages;
}
async function fetchText(book) {
  const response = await fetch(book.textUrl, { headers: { "User-Agent": "Lightbearer Free Books importer; public-domain source retrieval" } });
  if (response.status === 403) throw Object.assign(new Error("403 blocked"), { status: 403 });
  if (!response.ok) throw Object.assign(new Error("HTTP " + response.status), { status: response.status });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BOOK_BYTES) throw new Error("book exceeds size limit");
  let text = buffer.toString("utf8");
  text = text.replace(/^.*?\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i, "").replace(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*$/i, "");
  return normalizedText(text);
}
async function rest(path, options = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: options.prefer || "return=representation", ...(options.headers || {}) }
  });
  const payload = await response.text();
  if (!response.ok) throw new Error("Supabase " + response.status + " " + payload.slice(0, 400));
  return payload ? JSON.parse(payload) : null;
}
async function retryFetch(book) {
  try { return await fetchText(book); }
  catch (first) {
    console.warn("retrying source", book.url, first.message);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return await fetchText(book);
  }
}
async function insertBook(book, fullText) {
  const id = stableBookUuid(book.url);
  const existing = await rest("books?id=eq." + id + "&select=id");
  const row = {
    id, title: book.title, author: book.author, description: "Full text offered as public domain by Project Gutenberg.", page_count: 0,
    file_type: "pdf", file_url: book.url,
    source_name: "Project Gutenberg", source_url: book.url, cover_url: book.cover || "", front_cover_url: book.cover || "",
    category: categoryFor(book, fullText), is_public: true, published: false, status: "published", scraped_at: new Date().toISOString()
  };
  if (row.source_url === "") throw new Error("Public books need source URLs.");
  if (!existing || !existing.length) await rest("books", { method: "POST", body: JSON.stringify([row]) });
  else await rest("books?id=eq." + id, { method: "PATCH", body: JSON.stringify(row), prefer: "return=minimal" });
  const bookPages = pageChunks(fullText);
  const pages = await rest("book_pages?book_id=eq." + id + "&select=page_number");
  if (pages && pages.length === bookPages.length) return { title: book.title, id, pageCount: bookPages.length };
  if (pages && pages.length) await rest("book_pages?book_id=eq." + id, { method: "DELETE", prefer: "return=minimal" });
  for (let offset = 0; offset < bookPages.length; offset += 100) {
    const rows = bookPages.slice(offset, offset + 100).map((content, index) => ({ book_id: id, page_number: offset + index + 1, text_content: content }));
    await rest("book_pages", { method: "POST", body: JSON.stringify(rows), prefer: "return=minimal" });
  }
  await rest("books?id=eq." + id, { method: "PATCH", body: JSON.stringify({ page_count: bookPages.length }), prefer: "return=minimal" });
  return { title: book.title, id, pageCount: bookPages.length };
}
export async function ingestAll() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const results = [];
  for (const source of SOURCES) for (const book of source.entries) {
    try {
      const text = await retryFetch(book);
      if (!text || text.length < 3000) throw new Error("full text missing or too short");
      results.push({ ok: true, ...(await insertBook(book, text)) });
    } catch (error) {
      console.warn("skipping book/source", book.url, error.status || "error", error.message);
      results.push({ ok: false, title: book.title, url: book.url, error: error.message });
    }
  }
  const ok = results.filter(item => item.ok);
  console.log(JSON.stringify({ attempted: results.length, fullTextBooks: ok.length, pages: ok.reduce((sum, item) => sum + item.pageCount, 0), failures: results.filter(item => !item.ok) }));
  if (!ok.length) process.exitCode = 1;
  return results;
}
if (import.meta.url === `file://${process.argv[1]}`) ingestAll().catch(error => { console.error(error); process.exitCode = 1; });
