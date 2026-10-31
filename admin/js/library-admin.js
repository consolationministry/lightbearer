import { supabaseRequest } from "./supabase-client.js?v=33";
import { splitLongPage } from "../../js/library-data.js";

async function getLibraryCloudinaryCredentials() {
  const rows = await supabaseRequest("rest/v1/admin_settings?id=eq.global&select=cloudinary_cloud_name,cloudinary_api_key,cloudinary_api_secret") || [];
  const row = rows[0] || {};
  const credentials = { cloudName: String(row.cloudinary_cloud_name || "").trim(), apiKey: String(row.cloudinary_api_key || "").trim(), apiSecret: String(row.cloudinary_api_secret || "").trim() };
  if (!credentials.cloudName || !credentials.apiKey || !credentials.apiSecret) throw new Error("Cloudinary is not configured. Add the credentials in Admin Settings.");
  return credentials;
}

async function signLibraryParams(params, apiSecret) {
  const encoder = new TextEncoder();
  const data = new Uint8Array(encoder.encode(Object.keys(params).sort().map(function (key) { return key + "=" + params[key]; }).join("&") + apiSecret));
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(digest).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
}

let state = { books: [], loaded: false, mode: "list", editingId: null, busy: false, error: "", pages: [] };

async function loadBooks() {
  state.books = await supabaseRequest("rest/v1/books?select=*&order=created_at.asc&limit=200") || [];
  state.loaded = true;
}

async function loadLibraryStats() {
  const parts = await Promise.all([
    supabaseRequest("rest/v1/book_pages?select=book_id&page_number=gt.0&limit=1000") || [],
    supabaseRequest("rest/v1/book_page_likes?select=*&limit=1000") || [],
    supabaseRequest("rest/v1/book_page_comments?select=*&limit=1000") || []
  ]);
  const pages = parts[0] || [], likes = parts[1] || [], comments = parts[2] || [];
  const readers = new Set();
  (likes || []).forEach(function (row) { if (row.device_id) readers.add(row.device_id); });
  (comments || []).forEach(function (row) { if (row.device_id) readers.add(row.device_id); });
  return { pages: pages.length, likes: likes.length, comments: comments.length, readers: readers.size };
}

async function uploadLibraryImage(file, kind) {
  if (!file || !file.size) return "";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(String(file.type || ""))) throw new Error("Choose a JPG, PNG, WebP or GIF image for the " + kind + " cover.");
  const credentials = await getLibraryCloudinaryCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: "lightbearer/library", timestamp };
  const signature = await signLibraryParams(params, credentials.apiSecret);
  const form = new FormData();
  form.append("file", file, file.name); form.append("api_key", credentials.apiKey); form.append("timestamp", String(timestamp)); form.append("folder", params.folder); form.append("signature", signature);
  const endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(credentials.cloudName) + "/image/upload";
  const response = await fetch(endpoint, { method: "POST", body: form });
  const result = await response.json().catch(function () { return null; });
  if (!response.ok || !result || !result.secure_url) throw new Error("Cloudinary rejected the " + kind + " cover upload.");
  return result.secure_url;
}

async function parseBookFile(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".txt")) return [{ title: "", content: (await file.text()).trim() }];
  if (name.endsWith(".pdf")) {
    if (!globalThis.pdfjsLib) {
      await new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = resolve; script.onerror = function () { reject(new Error("PDF parser failed to load.")); };
        document.head.append(script);
      });
      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const pdf = await globalThis.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const source = await pdf.getPage(i);
      const textContent = await source.getTextContent();
      let text = textContent.items.map(function (item) { return item.str; }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (i === 1) {
        const lines = text.split("\n");
        text = lines.slice(1).join("\n").trim() || text;
        var firstTitle = (lines[0] || "").trim();
      }
      pages.push({ title: firstTitle || "", content: text });
    }
    return pages.filter(function (page) { return page.content; });
  }
  throw new Error("Choose a PDF or TXT book file.");
}

export function renderLibraryAdmin(root) {
  if (!state.loaded) { loadBooks().then(function () { renderLibraryAdmin(root); }); root.innerHTML = '<section class="panel"><p>Loading library…</p></section>'; return; }
  if (state.mode === "form") { renderLibraryForm(root); return; }
  const rows = state.books.map(function (book) {
    return '<div class="library-admin-row"><img class="library-admin-cover" src="' + escape(book.front_cover_url) + '" alt="" >' +
      '<div class="library-admin-meta"><strong>' + escape(book.title) + '</strong><span>' + escape(book.author || "") + '</span></div>' +
      '<div class="library-admin-actions"><button class="admin-button" type="button" data-library-action="edit" data-id="' + book.id + '">Edit</button>' +
      '<button class="admin-button danger" type="button" data-library-action="delete" data-id="' + book.id + '">Delete</button></div></div>';
  }).join("") || '<p>No books yet. Click “Add book” to upload the first one.</p>';
  const stats = state.stats || { pages: "…", likes: "…", comments: "…", readers: "…" };
  root.innerHTML = '<section class="panel library-admin-panel"><header class="panel-head"><div><h1>Library dashboard</h1><p>Church books at a glance. Members read them in the app.</p></div></header>' +
    '<div class="library-stats-grid">' +
    '<div class="library-stat-card"><span class="library-stat-value">' + escape(state.books.length) + '</span><span class="library-stat-label">Total books</span></div>' +
    '<div class="library-stat-card"><span class="library-stat-value">' + escape(stats.readers) + '</span><span class="library-stat-label">Total readers</span></div>' +
    '<div class="library-stat-card"><span class="library-stat-value">' + escape(stats.likes) + '</span><span class="library-stat-label">Total likes</span></div>' +
    '<div class="library-stat-card"><span class="library-stat-value">' + escape(stats.comments) + '</span><span class="library-stat-label">Total comments</span></div>' +
    '</div>' +
    '<div class="library-add-banner"><div><strong>Add a book</strong><span>Upload the file, choose the covers, and members get it instantly.</span></div>' +
    '<button class="admin-button primary" type="button" data-library-action="add">Add book</button></div>' +
    '<h2 class="library-books-heading">All books</h2>' +
    (state.error ? '<p class="form-error">' + escape(state.error) + '</p>' : '') +
    '<div class="library-admin-list">' + rows + '</div></section>';
  loadLibraryStats().then(function (stats) { state.stats = stats; const cards = root.querySelector(".library-stats-grid"); if (cards) { renderLibraryAdmin(root); } }).catch(function () {});
}

function renderLibraryForm(root) {
  const book = state.editingId ? state.books.find(function (item) { return String(item.id) === String(state.editingId); }) : null;
  root.innerHTML = '<section class="panel library-admin-panel"><header class="panel-head"><div><h1>' + (book ? "Edit book" : "Add book") + '</h1><p>' + (book ? "Update details or re-upload the file." : "Fill the details, choose covers and the book file.") + '</p></div>' +
    '<button class="admin-button" type="button" data-library-action="cancel">Cancel</button></header>' +
    '<form id="library-book-form" class="library-admin-form">' +
    '<label>Book title<input name="title" required value="' + escape(book && book.title || "") + '"></label>' +
    '<label>Author name<input name="author" value="' + escape(book && book.author || "") + '"></label>' +
    '<label>Front cover image<input name="front_cover" type="file" accept="image/*"></label>' +
    '<label>Back cover image<input name="back_cover" type="file" accept="image/*"></label>' +
    (book ? '<label>Re-upload book file (optional: replaces pages)<input name="bookfile" type="file" accept=".pdf,.txt"></label>' : '<label>Book file (PDF or TXT)<input name="bookfile" type="file" accept=".pdf,.txt" required></label>') +
    (state.error ? '<p class="form-error">' + escape(state.error) + '</p>' : '') +
    '<button class="admin-button primary" type="submit" ' + (state.busy ? "disabled" : "") + '>' + (state.busy ? "Saving…" : (book ? "Save changes" : "Upload book")) + '</button></form></section>';
  const form = root.querySelector("#library-book-form");
  form.addEventListener("submit", function (event) { event.preventDefault(); saveBookForm(form); });
}

function escape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

async function saveBookForm(form) {
  const data = new FormData(form);
  state.busy = true; state.error = ""; renderLibraryForm(document.getElementById("admin-content"));
  try {
    const title = String(data.get("title") || "").trim();
    if (!title) throw new Error("Enter the book title.");
    const front = await uploadLibraryImage(data.get("front_cover"), "front");
    const back = await uploadLibraryImage(data.get("back_cover"), "back");
    const file = data.get("bookfile");
    let body = { title, author: String(data.get("author") || "").trim(), updated_at: new Date().toISOString() };
    if (front) body.front_cover_url = front;
    if (back) body.back_cover_url = back;
    let editing = state.editingId ? state.books.find(function (item) { return String(item.id) === String(state.editingId); }) : null;
    if (!editing) {
      body.status = "published";
      const created = await supabaseRequest("rest/v1/books", { method: "POST", body: JSON.stringify([body]) });
      editing = Array.isArray(created) ? created[0] : created;
      if (!editing || !editing.id) throw new Error("The book row was not saved. Try again.");
      state.books.push(editing);
    } else {
      await supabaseRequest("rest/v1/books?id=eq." + encodeURIComponent(editing.id), { method: "PATCH", body: JSON.stringify(body) });
      Object.assign(editing, body);
    }
    if (file && file.size) {
      const parsed = await parseBookFile(file);
      if (!parsed.length) throw new Error("The file had no readable pages.");
      await supabaseRequest("rest/v1/book_pages?book_id=eq." + encodeURIComponent(editing.id), { method: "DELETE" });
      const rows = [];
      let pageNumber = 1;
      for (const sourcePage of parsed) {
        const chunks = splitLongPage(sourcePage.content);
        for (const chunk of chunks) {
          rows.push({ book_id: editing.id, page_number: pageNumber, page_title: sourcePage.title || ("Page " + pageNumber), content: chunk, is_colored: /<(img|svg|figure)/i.test(chunk) });
          pageNumber += 1;
        }
      }
      for (let i = 0; i < rows.length; i += 100) await supabaseRequest("rest/v1/book_pages", { method: "POST", body: JSON.stringify(rows.slice(i, i + 100)) });
    }
    state.mode = "list"; state.busy = false;
    await loadBooks();
    renderLibraryAdmin(document.getElementById("admin-content"));
  } catch (error) {
    state.busy = false; state.error = (error && error.message) || "Could not save the book.";
    renderLibraryForm(document.getElementById("admin-content"));
  }
}

export async function handleLibraryAdminAction(button, root) {
  const action = button.dataset.libraryAction;
  if (!action) return false;
  if (action === "add") { state.mode = "form"; state.editingId = null; state.error = ""; renderLibraryForm(root); return true; }
  if (action === "cancel") { state.mode = "list"; state.error = ""; renderLibraryAdmin(root); return true; }
  if (action === "edit") { state.mode = "form"; state.editingId = button.dataset.id; state.error = ""; renderLibraryForm(root); return true; }
  if (action === "delete") {
    if (!window.confirm("Delete this book and all its pages?")) return true;
    await supabaseRequest("rest/v1/book_pages?book_id=eq." + encodeURIComponent(button.dataset.id), { method: "DELETE" });
    await supabaseRequest("rest/v1/books?id=eq." + encodeURIComponent(button.dataset.id), { method: "DELETE" });
    state.books = state.books.filter(function (item) { return String(item.id) !== String(button.dataset.id); });
    renderLibraryAdmin(root); return true;
  }
  return false;
}
