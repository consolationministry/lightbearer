import { createHash } from "node:crypto";

// Entries here were individually checked on their free public catalogue pages.
// This ingest stores metadata and the original source links, never book text.
export const SOURCES = [
  {
    name: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks/",
    entries: [
      { title: "The Imitation of Christ", author: "Thomas à Kempis", url: "https://www.gutenberg.org/ebooks/1653", cover: "https://www.gutenberg.org/cache/epub/1653/pg1653.cover.medium.jpg", category: "Christian Living", rights: "public domain in the USA" },
      { title: "Power Through Prayer", author: "Edward M. Bounds", url: "https://www.gutenberg.org/ebooks/65115", cover: "https://www.gutenberg.org/cache/epub/65115/pg65115.cover.medium.jpg", category: "Prayer", rights: "public domain in the USA" },
      { title: "Practical Religion", author: "J. C. Ryle", url: "https://www.gutenberg.org/ebooks/38162", cover: "https://www.gutenberg.org/cache/epub/38162/pg38162.cover.medium.jpg", category: "Christian Living", rights: "public domain in the USA" }
    ]
  }
];

export function categoryFor(title, fallback) {
  const text = String(title || "").toLowerCase();
  const rules = [
    ["Holy Spirit", /holy spirit|spirit.?filled|spiritual gifts/], ["Faith", /faith|believ|trust/],
    ["Prayer", /prayer|pray/], ["Salvation", /salvation|saved|redeem|gospel/],
    ["Healing", /healing|heal|miracle/], ["Evangelism", /evangel|mission|soul.?winning/],
    ["Christian Living", /christ|imitation|discipl|living|devotion|religion/]
  ];
  for (const [category, regex] of rules) if (regex.test(text)) return category;
  return fallback || "Christian Living";
}

export function coverFor(entry) {
  if (entry.cover) return entry.cover;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080"><rect width="100%" height="100%" fill="#f4f7ff"/><path d="M0 0h720v320H0z" fill="#1d4ed8"/><text x="56" y="410" font-size="46" font-family="sans-serif" fill="#1d4ed8">${entry.title}</text><text x="56" y="1000" font-size="30" font-family="sans-serif" fill="#334155">${entry.author || ""}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

export async function ingest(client, sources = SOURCES) {
  let inserted = 0;
  for (const source of sources) {
    for (const entry of source.entries) {
      if (!/public domain|free/i.test(entry.rights || "")) continue;
      const id = createHash("sha256").update(entry.url).digest("hex").slice(0, 32);
      const row = {
        id, title: entry.title, author: entry.author || "", status: "published", is_public: true,
        category: categoryFor(entry.title, entry.category), source_name: source.name, source_url: entry.url,
        cover_url: coverFor(entry), published: false, scraped_at: new Date().toISOString()
      };
      const response = await client.fetch(client.url + "/rest/v1/books?id=eq." + id, {
        method: "GET", headers: client.headers
      });
      if (!response.ok) throw new Error("Could not check existing public book: " + response.status);
      const existing = await response.json();
      if (existing.length) continue;
      const insertedResponse = await client.fetch(client.url + "/rest/v1/books", {
        method: "POST", headers: { ...client.headers, Prefer: "return=minimal" }, body: JSON.stringify(row)
      });
      if (!insertedResponse.ok) throw new Error("Could not save public book: " + insertedResponse.status + " " + (await insertedResponse.text()));
      inserted += 1;
    }
  }
  return inserted;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in GitHub Actions secrets.");
  const inserted = await ingest({ url: url.replace(/\/$/, ""), headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, fetch });
  console.log(`Added ${inserted} verified free public book listings.`);
}
