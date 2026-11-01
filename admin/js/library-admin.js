import { supabaseRequest } from "./supabase-client.js?v=34";
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

export function buildBookPageRows(bookId, parsed) {
  const rows = [];
  let pageNumber = 1;
  for (const sourcePage of parsed || []) {
    const chunks = splitLongPage(sourcePage.content);
    for (const chunk of chunks) {
      rows.push({ book_id: bookId, page_number: pageNumber, text_content: chunk, image_url: sourcePage.image_url || null, background_color: sourcePage.background_color || null });
      pageNumber += 1;
    }
  }
  return rows;
}

export async function replaceBookPages(bookId, parsed, request) {
  const send = request || supabaseRequest;
  const previous = await send("rest/v1/book_pages?select=page_number,text_content,image_url,background_color&book_id=eq." + encodeURIComponent(bookId) + "&order=page_number.asc");
  const replacementRows = buildBookPageRows(bookId, parsed);
  if (!replacementRows.length) throw new Error("The file had no readable pages.");
  await send("rest/v1/book_pages?book_id=eq." + encodeURIComponent(bookId), { method: "DELETE" });
  try {
    for (let i = 0; i < replacementRows.length; i += 100) {
      await send("rest/v1/book_pages", { method: "POST", body: JSON.stringify(replacementRows.slice(i, i + 100)) });
    }
  } catch (originalError) {
    try {
      await send("rest/v1/book_pages?book_id=eq." + encodeURIComponent(bookId), { method: "DELETE" });
      for (let i = 0; i < previous.length; i += 100) {
        const rows = previous.slice(i, i + 100).map(function (row) { return Object.assign({ book_id: bookId }, row); });
        await send("rest/v1/book_pages", { method: "POST", body: JSON.stringify(rows) });
      }
    } catch (cleanupError) {
      const originalMessage = originalError && originalError.message ? originalError.message : "Page save failed.";
      const cleanupMessage = cleanupError && cleanupError.message ? cleanupError.message : "Could not restore the previous pages.";
      throw new Error(originalMessage + " Previous pages may not have been restored: " + cleanupMessage);
    }
    throw originalError;
  }
  return replacementRows.length;
}

let state = { books: [], loaded: false, mode: "list", editingId: null, busy: false, error: "", pages: [], librarySection: "church", publicFrom: "", publicTo: "", storageUsage: "Usage unavailable. Cloudinary admin API needs a secured server function and credentials." };

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
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 90000);
  let response;
  let result;
  try {
    response = await fetch(endpoint, { method: "POST", body: form, signal: controller.signal });
    result = await response.json().catch(function () { return null; });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("Cloudinary " + kind + " cover upload timed out after 90 seconds. Check the network and Cloudinary upload configuration, then retry.");
    throw new Error("Cloudinary " + kind + " cover upload failed: " + ((error && error.message) || "network error"));
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok || !result || !result.secure_url) {
    const detail = result && result.error && result.error.message;
    throw new Error("Cloudinary rejected the " + kind + " cover upload" + (detail ? ": " + detail : " (HTTP " + response.status + ")") + ".");
  }
  return result.secure_url;
}

async function parseBookFile(file, onProgress) {
  const name = String(file.name || "").toLowerCase();
  const progress = typeof onProgress === "function" ? onProgress : function () {};
  const loadScript = function (src, globalName) {
    return new Promise(function (resolve, reject) {
      if (globalThis[globalName]) return resolve(globalThis[globalName]);
      const script = document.createElement("script"); script.src = src;
      script.onload = function () { globalThis[globalName] ? resolve(globalThis[globalName]) : reject(new Error("Parser library did not initialize.")); };
      script.onerror = function () { reject(new Error("Could not load the document parser.")); }; document.head.append(script);
    });
  };
  if (/\.(txt|md|html?|rtf|csv)$/i.test(name)) {
    const text = await file.text(); progress(file.size, file.size, 1, 1);
    if (name.endsWith(".csv")) {
      const lines = text.split(/\r?\n/).filter(Boolean).map(function (line) { return line.split(",").map(function (cell) { return cell.replace(/^\"|\"$/g, ""); }).join(" | "); });
      return lines.map(function (line, i) { return { title: "Row " + (i + 1), content: line }; });
    }
    return [{ title: "", content: text.trim() }];
  }
  if (/\.docx$/i.test(name)) {
    const mammoth = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js", "mammoth");
    const arrayBuffer = await file.arrayBuffer(); progress(file.size, file.size, 0, 1);
    const result = await mammoth.extractRawText({ arrayBuffer }); progress(file.size, file.size, 1, 1);
    const paragraphs = result.value.split(/\n\s*\n/).filter(Boolean);
    return paragraphs.map(function (content, i) { return { title: i ? "" : "", content }; });
  }
  if (/\.(xlsx|xls)$/i.test(name)) {
    const XLSX = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "XLSX");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return workbook.SheetNames.map(function (sheetName) { const text = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { FS: " | " }); progress(file.size, file.size, 1, 1); return { title: sheetName, content: text }; }).filter(function (p) { return p.content.trim(); });
  }
  if (name.endsWith(".pdf")) {
    if (!globalThis.pdfjsLib) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdfjsLib");
      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const pdf = await globalThis.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const source = await pdf.getPage(i); const textContent = await source.getTextContent();
      pages.push({ title: "Page " + i, content: textContent.items.map(function (item) { return item.str; }).join("\\n").trim() });
      progress(file.size, file.size, i, pdf.numPages);
    }
    return pages.filter(function (page) { return page.content; });
  }
  throw new Error("This document format could not be read by the supported text extractors.");
}

export function renderLibraryAdmin(root) {
  if (!state.loaded) { loadBooks().then(function () { renderLibraryAdmin(root); }); root.innerHTML = '<section class="panel"><p>Loading library…</p></section>'; return; }
  if (state.mode === "form") { renderLibraryForm(root); return; }
  const visibleBooks = state.books.filter(function (book) { return book.is_public === (state.librarySection === "public"); });
  const rows = visibleBooks.map(function (book) {
    const actionButtons = '<button class="admin-button" type="button" data-library-action="toggle-publish" data-id="' + book.id + '">' + (book.published ? "Unpublish" : "Publish") + '</button><button class="admin-button danger" type="button" data-library-action="delete" data-id="' + book.id + '">Delete</button>';
    const bookActions = book.is_public ? actionButtons : '<button class="admin-button" type="button" data-library-action="edit" data-id="' + book.id + '">Edit</button><button class="admin-button danger" type="button" data-library-action="delete" data-id="' + book.id + '">Delete</button>';
    return '<div class="library-admin-row"><img class="library-admin-cover" src="' + escape(book.front_cover_url || book.cover_url || "") + '" alt=""><div class="library-admin-meta"><strong>' + escape(book.title) + '</strong><span>' + escape(book.author || "") + '</span></div><div class="library-admin-actions">' + bookActions + '</div></div>';
  }).join("") || '<p>No books yet. Click “Add book” to upload the first one.</p>';
  const publics = state.books.filter(function (book) { return book.is_public; }).filter(function (book) {
    const date = String(book.scraped_at || book.created_at || "").slice(0, 10);
    return (!state.publicFrom || date >= state.publicFrom) && (!state.publicTo || date <= state.publicTo);
  }).map(function (book) {
    return '<div class="library-admin-row"><img class="library-admin-cover" src="' + escape(book.cover_url || "") + '" alt=""><div class="library-admin-meta"><strong>' + escape(book.title) + '</strong><span>' + escape(book.category || "Christian Living") + ' · ' + escape(book.source_name || "") + ' · ' + escape(book.scraped_at || book.created_at || "") + '</span><a href="' + escape(book.source_url || "#") + '" target="_blank" rel="noopener">Source</a></div><div class="library-admin-actions"><button class="admin-button" data-library-action="toggle-publish" data-id="' + book.id + '">' + (book.published ? "Unpublish" : "Publish") + '</button><button class="admin-button danger" data-library-action="delete" data-id="' + book.id + '">Delete</button></div></div>';
  }).join("") || '<p>No public books match this date range.</p>';
  const stats = state.stats || { pages: "…", likes: "…", comments: "…", readers: "…" };
  root.innerHTML = '<section class="panel library-admin-panel"><header class="panel-head"><div><h1>Library dashboard</h1><p>Church books at a glance. Members read them in the app.</p></div></header>' +
    '<div class="library-stats-grid"><div class="library-stat-card"><span class="library-stat-value">' + escape(state.books.length) + '</span><span class="library-stat-label">Total books</span></div><div class="library-stat-card"><span class="library-stat-value">' + escape(stats.readers) + '</span><span class="library-stat-label">Total readers</span></div><div class="library-stat-card"><span class="library-stat-value">' + escape(stats.likes) + '</span><span class="library-stat-label">Total likes</span></div><div class="library-stat-card"><span class="library-stat-value">' + escape(stats.comments) + '</span><span class="library-stat-label">Total comments</span></div></div>' +
    '<div class="library-add-banner"><div><strong>Add a book</strong><span>Upload the file, choose the covers, and members get it instantly.</span></div><button class="admin-button primary" type="button" data-library-action="add">Add book</button></div>' +
    '<nav class="library-section-tabs"><button type="button" data-library-section="church">Church books</button><button type="button" data-library-section="public">Public books</button></nav><h2 class="library-books-heading">' + (state.librarySection === "public" ? "Public books" : "Church books") + '</h2>' + (state.error ? '<p class="form-error">' + escape(state.error) + '</p>' : '') + '<div class="library-admin-list">' + rows + '</div>' +
    (state.librarySection === "public" ? '<div class="library-date-filter"><label>From <input type="date" data-public-date="from" value="' + escape(state.publicFrom || "") + '"></label><label>To <input type="date" data-public-date="to" value="' + escape(state.publicTo || "") + '"></label></div><div class="library-admin-list">' + publics + '</div>' : '') +
    '<div class="library-storage-card"><strong>Cloudinary storage</strong><span>' + escape(state.storageUsage || "Usage unavailable. Configure Cloudinary admin credentials to show usage.") + '</span></div></section>';
  root.querySelectorAll("[data-library-section]").forEach(function (button) { button.addEventListener("click", function () { state.librarySection = button.dataset.librarySection; renderLibraryAdmin(root); }); });
  root.querySelectorAll("[data-public-date]").forEach(function (input) { input.addEventListener("change", function () { state[input.dataset.publicDate === "from" ? "publicFrom" : "publicTo"] = input.value; renderLibraryAdmin(root); }); });
  loadLibraryStats().then(function (stats) { state.stats = stats; const grid = root.querySelector(".library-stats-grid"); if (!grid) return; [state.books.length, stats.readers, stats.likes, stats.comments].forEach(function (value, i) { const el = grid.querySelectorAll(".library-stat-value")[i]; if (el) el.textContent = String(value); }); }).catch(function () {});
}

function renderLibraryForm(root) {
  const book = state.editingId ? state.books.find(function (item) { return String(item.id) === String(state.editingId); }) : null;
  root.innerHTML = '<section class="panel library-admin-panel"><header class="panel-head"><div><h1>' + (book ? "Edit book" : "Add book") + '</h1><p>' + (book ? "Update details or re-upload the file." : "Fill the details, choose covers and the book file.") + '</p></div>' +
    '<button class="admin-button" type="button" data-library-action="cancel">Cancel</button></header>' +
    '<form id="library-book-form" class="library-admin-form">' +
    '<div class="library-form-row"><label class="library-field"><span>Book title</span><input name="title" required placeholder="e.g. The Ministry Handbook" value="' + escape(book && book.title || "") + '"></label>' +
    '<label class="library-field"><span>Author name</span><input name="author" placeholder="e.g. Pastor D. Peter" value="' + escape(book && book.author || "") + '"></label></div>' +
    '<div class="library-form-row"><label class="library-file-field"><span>Front cover image</span><input name="front_cover" type="file" accept="image/*" data-file-label="front"><span class="library-file-box"><b>Choose image</b><em class="library-file-name">No file chosen</em></span><img class="library-cover-preview" hidden alt=""></label>' +
    '<label class="library-file-field"><span>Back cover image</span><input name="back_cover" type="file" accept="image/*" data-file-label="back"><span class="library-file-box"><b>Choose image</b><em class="library-file-name">No file chosen</em></span><img class="library-cover-preview" hidden alt=""></label></div>' +
    '<label class="library-file-field library-bookfile"><span>' + (book ? "Re-upload book file (optional: replaces pages)" : "Book file (PDF, DOCX, TXT, Excel, CSV and other readable formats)") + '</span><input name="bookfile" type="file"' + (book ? "" : " required") + ' data-file-label="book"><span class="library-file-box"><b>Choose file</b><em class="library-file-name">No file chosen</em></span></label>' +
    '<div class="library-parse-overlay" hidden><div class="library-parse-card"><strong>Parsing…</strong><span class="library-parse-progress-label">Preparing document</span><progress max="100" value="0"></progress></div></div>' +
    '<div class="library-parse-success" hidden>Parsing succeeded</div>' +
    (state.error ? '<p class="form-error">' + escape(state.error) + '</p>' : '') +
    '<div class="library-upload-progress" hidden><div class="library-upload-bar"><div class="library-upload-bar-fill" style="width:2%"></div></div><span class="library-upload-label">Preparing…</span></div>' +
    '<div class="library-form-actions"><button class="admin-button primary" type="submit" ' + (state.busy ? "disabled" : "") + '>' + (state.busy ? "Saving…" : (book ? "Save changes" : "Save book")) + '</button><button class="admin-button" type="button" data-library-publish ' + (state.preparedPages && state.preparedPages.length ? "" : "disabled") + '>Publish</button></div></form></section>' +
    '<style>.library-parse-overlay{position:fixed;inset:0;z-index:1000;background:rgba(20,35,70,.16);display:grid;place-items:center;backdrop-filter:blur(1px)}.library-parse-overlay[hidden]{display:none}.library-parse-card{background:rgba(255,255,255,.94);border:1px solid #d9e4fa;border-radius:16px;padding:22px;min-width:min(320px,85vw);box-shadow:0 10px 40px #14234422;color:#183b76}.library-parse-card strong,.library-parse-card span{display:block;margin-bottom:10px}.library-parse-card progress{width:100%;accent-color:#2b64c8}.library-parse-success{color:#23623c;margin:10px 0;font-weight:600}</style></section>';
  const form = root.querySelector("#library-book-form");
  const parseOverlay = form.querySelector(".library-parse-overlay");
  const parseProgress = parseOverlay.querySelector("progress");
  const parseLabel = form.querySelector(".library-parse-progress-label");
  const parseSuccess = form.querySelector(".library-parse-success");
  form.elements.bookfile.addEventListener("change", async function () {
    const file = form.elements.bookfile.files && form.elements.bookfile.files[0];
    if (!file) { parseOverlay.hidden = true; parseSuccess.hidden = true; state.preparedPages = null; return; }
    parseOverlay.hidden = false; parseSuccess.hidden = true; parseProgress.value = 0; parseLabel.textContent = "Reading " + file.name;
    try {
      state.preparedPages = await parseBookFile(file, function (bytesDone, bytesTotal, pageDone, pageTotal) {
        const pct = pageTotal ? Math.round(pageDone / pageTotal * 100) : Math.round(bytesDone / Math.max(bytesTotal, 1) * 100);
        parseProgress.value = Math.min(100, pct);
        parseLabel.textContent = pageTotal ? "Page " + pageDone + " of " + pageTotal : Math.min(bytesDone, bytesTotal) + " of " + bytesTotal + " bytes";
      });
      if (!state.preparedPages.length) throw new Error("The file had no readable text.");
      parseProgress.value = 100; parseLabel.textContent = "Parsed " + state.preparedPages.length + " sections";
      parseOverlay.hidden = true; parseSuccess.hidden = false;
      form.querySelector('button[type="submit"]').textContent = book ? "Save changes" : "Save book";
      const publish = form.querySelector("[data-library-publish]"); if (publish) publish.disabled = false;
    } catch (error) {
      state.preparedPages = null; parseOverlay.hidden = true; state.error = error.message || "Could not parse this document.";
      const message = form.querySelector(".form-error"); if (message) message.textContent = state.error; else { const p = document.createElement("p"); p.className = "form-error"; p.textContent = state.error; form.prepend(p); }
    }
  });
  form.querySelectorAll('input[type=file]').forEach(function (input) {
    input.addEventListener("change", function () {
      const box = form.querySelector('.library-file-box:has(input[name="' + input.name + '"])') || input.parentElement.querySelector(".library-file-box");
      const nameEl = input.parentElement.querySelector(".library-file-name");
      if (nameEl) nameEl.textContent = input.files && input.files[0] ? input.files[0].name : "No file chosen";
      const preview = input.parentElement.querySelector(".library-cover-preview");
      if (preview) {
        if (input.files && input.files[0]) { preview.src = URL.createObjectURL(input.files[0]); preview.hidden = false; }
        else preview.hidden = true;
      }
    });
  });
  form.querySelector('[data-library-publish]').addEventListener("click", function () {
    form.dataset.publish = "true";
    if (!form.reportValidity()) return;
    saveBookForm(form);
  });
  form.addEventListener("submit", function (event) { event.preventDefault(); form.dataset.publish = "false"; saveBookForm(form); });
}

function escape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function setUploadProgress(root, percent, label) {
  const box = root.querySelector(".library-upload-progress");
  if (!box) return;
  box.hidden = false;
  box.querySelector(".library-upload-bar-fill").style.width = Math.min(100, Math.max(2, percent)) + "%";
  box.querySelector(".library-upload-label").textContent = label;
}

async function saveBookForm(form) {
  const data = new FormData(form);
  state.busy = true; state.error = ""; renderLibraryForm(document.getElementById("admin-content"));
  const liveRoot = document.getElementById("admin-content");
  setUploadProgress(liveRoot, 5, "Checking covers…");
  let editing = state.editingId ? state.books.find(function (item) { return String(item.id) === String(state.editingId); }) : null;
  let createdNew = !editing;
  try {
    const title = String(data.get("title") || "").trim();
    if (!title) throw new Error("Enter the book title.");
    setUploadProgress(liveRoot, 12, "Uploading front cover…");
    const front = await uploadLibraryImage(data.get("front_cover"), "front");
    setUploadProgress(liveRoot, 30, "Uploading back cover…");
    const back = await uploadLibraryImage(data.get("back_cover"), "back");
    const file = data.get("bookfile");
    let body = { title, author: String(data.get("author") || "").trim(), updated_at: new Date().toISOString() };
    if (front) body.front_cover_url = front;
    if (back) body.back_cover_url = back;
    if (!editing) {
      body.status = form.dataset.publish === "true" ? "published" : "draft";
      body.is_public = false;
      body.published = body.status === "published";
      const created = await supabaseRequest("rest/v1/books", { method: "POST", body: JSON.stringify([body]) });
      editing = Array.isArray(created) ? created[0] : created;
      if (!editing || !editing.id) throw new Error("The book row was not saved. Try again.");
      state.books.push(editing);
    } else {
      await supabaseRequest("rest/v1/books?id=eq." + encodeURIComponent(editing.id), { method: "PATCH", body: JSON.stringify(body) });
    }
    Object.assign(editing, body);
    if (file && file.size) {
      const parsed = state.preparedPages && state.preparedPages.length ? state.preparedPages : await parseBookFile(file, function (done, total, page, pages) { setUploadProgress(liveRoot, 55 + (pages ? page / pages * 20 : done / Math.max(total, 1) * 20), pages ? "Parsing page " + page + " of " + pages : "Parsing " + done + " of " + total + " bytes…"); });
      setUploadProgress(liveRoot, 75, "Saving " + parsed.length + " pages…");
      if (!parsed.length) throw new Error("The file had no readable pages.");
      await replaceBookPages(editing.id, parsed);
    }
    state.mode = "list"; state.busy = false;
    await loadBooks();
    renderLibraryAdmin(document.getElementById("admin-content"));
  } catch (error) {
    if (createdNew && editing && editing.id) {
      state.books = state.books.filter(function (item) { return item !== editing; });
      try { await supabaseRequest("rest/v1/books?id=eq." + encodeURIComponent(editing.id), { method: "DELETE" }); }
      catch (cleanupError) {
        const originalMessage = error && error.message ? error.message : "Could not save the book.";
        const cleanupMessage = cleanupError && cleanupError.message ? cleanupError.message : "Could not remove the incomplete book record.";
        error = new Error(originalMessage + " The incomplete book record could not be removed: " + cleanupMessage);
      }
    }
    state.busy = false; state.error = (error && error.message) || "Could not save the book.";
    renderLibraryForm(document.getElementById("admin-content"));
  }
}

export async function handleLibraryAdminAction(button, root) {
  const action = button.dataset.libraryAction;
  if (!action) return false;
  if (action === "toggle-publish") {
    const book = state.books.find(function (item) { return String(item.id) === String(button.dataset.id); });
    if (!book || !book.is_public) return true;
    const published = !book.published;
    await supabaseRequest("rest/v1/books?id=eq." + encodeURIComponent(book.id), { method: "PATCH", body: JSON.stringify({ published: published }) });
    book.published = published;
    renderLibraryAdmin(root); return true;
  }
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
