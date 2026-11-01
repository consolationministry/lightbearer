import { createHash } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_BOOK_BYTES = 20 * 1024 * 1024;
const PAGE_CHARS = 9000;

// Public-domain English full texts; every entry is verified against its Project Gutenberg record.
export const SOURCES = [{
  name: "Project Gutenberg",
  entries: [
    { title: "The Imitation of Christ", author: "Thomas à Kempis", id: 1653, category: "Christian Living" },
    { title: "Power Through Prayer", author: "Edward M. Bounds", id: 65115, category: "Prayer" },
    { title: "Practical Religion", author: "J. C. Ryle", id: 38162, category: "Christian Living" },
    { title: "Jesus Himself", author: "Andrew Murray", id: 26003, category: "Faith" },
    { title: "Gleanings among the Sheaves", author: "C. H. Spurgeon", id: 42657, category: "Christian Living" },
    { title: "Holy in Christ", author: "Andrew Murray", id: 26990, category: "Holy Spirit" },
    { title: "Humility: The Beauty of Holiness", author: "Andrew Murray", id: 57121, category: "Christian Living" },
    { title: "Lord, Teach Us To Pray", author: "Andrew Murray", id: 26709, category: "Prayer" },
    { title: "The Ministry of Intercession: A Plea for More Prayer", author: "Andrew Murray", id: 29296, category: "Prayer" },
    { title: "The Master's Indwelling", author: "Andrew Murray", id: 12854, category: "Holy Spirit" },
    { title: "Money: Thoughts for God's Stewards", author: "Andrew Murray", id: 41994, category: "Christian Living" },
    { title: "The Spirit-Filled Life", author: "John MacNeil", id: 33247, category: "Holy Spirit" },
    { title: "Around the Wicket Gate", author: "C. H. Spurgeon", id: 60669, category: "Salvation" },
    { title: "Talks to Farmers", author: "C. H. Spurgeon", id: 42518, category: "Christian Living" },
    { title: "The Art of Illustration", author: "C. H. Spurgeon", id: 42558, category: "Christian Living" },
    { title: "The Cross: A Tract for the Times", author: "J. C. Ryle", id: 62001, category: "Salvation" },
    { title: "The Life of Trust: Being a Narrative of the Lord's Dealings With George Müller", author: "George Müller", id: 27288, category: "Faith" },
    { title: "Answers to Prayer, from George Müller's Narratives", author: "George Müller", id: 25891, category: "Prayer" },
    { title: "A Narrative of Some of the Lord's Dealings with George Müller, Part 1", author: "George Müller", id: 20379, category: "Faith" },
    { title: "A Narrative of Some of the Lord's Dealings with George Müller, Part 2", author: "George Müller", id: 22034, category: "Faith" },
    { title: "A Narrative of Some of the Lord's Dealings with George Müller, Part 3", author: "George Müller", id: 22148, category: "Faith" },
    { title: "A Narrative of Some of the Lord's Dealings with George Müller, Part 4", author: "George Müller", id: 20245, category: "Faith" },
    { title: "The Preaching Tours and Missionary Labours of George Müller", author: "George Müller", id: 34377, category: "Evangelism" },
    { title: "The Pilgrim's Progress from this world to that which is to come", author: "John Bunyan", id: 131, category: "Salvation" },
    { title: "The Pilgrim's Progress by John Bunyan Every Child Can Read", author: "John Bunyan", id: 39452, category: "Salvation" },
    { title: "Works of John Bunyan, Volume 03", author: "John Bunyan", id: 6048, category: "Salvation" },
    { title: "Prevailing Prayer: What Hinders It?", author: "Dwight Lyman Moody", id: 61883, category: "Prayer" },
    { title: "Evening Incense", author: "John R. Macduff", id: 50916, category: "Prayer" },
    { title: "My Daily Meditation for the Circling Year", author: "John Henry Jowett", id: 23241, category: "Christian Living" },
    { title: "Martin Luther's Large Catechism", author: "Martin Luther", id: 1722, category: "Faith" },
    { title: "The Confessions of St. Augustine", author: "Saint Augustine", id: 3296, category: "Salvation" },
    { title: "The Model Prayer: A Series of Expositions on the Lord's Prayer", author: "J. D. Jones", id: 70953, category: "Prayer" }
  ].map(book => ({ ...book, url: `https://www.gutenberg.org/ebooks/${book.id}`, textUrl: `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`, cover: `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.cover.medium.jpg`, rights: "public domain" }))
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
    id, title: book.title, author: book.author, page_count: 0,
    file_type: "epub", file_url: book.textUrl, description: "Public-domain full text offered by Project Gutenberg.",
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
