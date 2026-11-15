import { isCloudinaryPublicUrl } from "../../js/cloudinary-live-audio.js";

const EXPORTABLE_HOSTS = new Set(["res.cloudinary.com"]);
const BLOCKED_SUBSTRINGS = ["seraphmedia.com", "seraph-media", "seraphmedia"];
const SUPPORTED_EXPORT_FORMATS = new Set(["webm", "ogg", "m4a", "mp3", "wav"]);

function asString(value) {
  return String(value || "").trim();
}

function recordingUrl(program) {
  return asString(program && (program.recordingPath || program.recording_path));
}

function containsBlockedSource(value) {
  const lower = asString(value).toLowerCase();
  return BLOCKED_SUBSTRINGS.some(part => lower.includes(part));
}

export function isExportableChurchRecording(program) {
  if (!program || program.status !== "published") return false;
  const url = recordingUrl(program);
  if (!url) return false;
  if (containsBlockedSource(url) || containsBlockedSource(program.title) && containsBlockedSource(program.description)) {
    // Title/description alone do not prove a blocked source; only guard on URL.
    // Re-check URL only below, so do not return false here for text alone.
  }
  if (containsBlockedSource(url)) return false;
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com)/i.test(url)) return false;
  if (url.startsWith("cloudinary:")) return false; // authenticated reference needs a signed playback URL, not a direct file export
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!EXPORTABLE_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  } catch (error) {
    return false;
  }
  return isCloudinaryPublicUrl(url);
}

export function getExportFormat(url) {
  const value = asString(url);
  try {
    const pathname = new URL(value).pathname;
    const ext = pathname.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SUPPORTED_EXPORT_FORMATS.has(ext)) return ext;
  } catch (error) {}
  return "webm";
}

export function getExportExtension(program) {
  return getExportFormat(recordingUrl(program));
}

function slugifyTitle(title) {
  const slug = asString(title).toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return slug || "audio-programme";
}

function formatDatePart(value) {
  const text = asString(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

export function getExportFilename(program) {
  const slug = slugifyTitle(program && program.title);
  const date = formatDatePart(program && program.date || program && program.createdAt);
  const extension = getExportExtension(program);
  return [slug, date].filter(Boolean).join("-") + "." + extension;
}

export function buildExportMetadata(program) {
  return {
    id: asString(program && program.id),
    title: asString(program && program.title),
    speaker: asString(program && program.speaker),
    category: asString(program && program.category),
    venue: asString(program && program.venue),
    date: asString(program && program.date),
    description: asString(program && program.description),
    durationSeconds: Math.max(0, Number(program && program.recordingDurationSeconds) || 0),
    status: asString(program && program.status),
    format: getExportExtension(program),
    exportedAt: new Date().toISOString(),
    source: "Lightbearer admin export (church-owned recording)"
  };
}

function createDownloadLink(documentLike, href, filename) {
  const link = documentLike.createElement("a");
  link.href = href;
  link.download = filename;
  documentLike.body.appendChild(link);
  link.click();
  link.remove();
  return link;
}

function fallbackDownload(documentLike, url, filename) {
  const link = documentLike.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  documentLike.body.appendChild(link);
  link.click();
  link.remove();
}

export async function exportLiveAudioProgram(program, options) {
  const opts = options || {};
  if (!isExportableChurchRecording(program)) {
    if (program && program.status !== "published") {
      throw new Error("Only published programmes can be exported.");
    }
    if (containsBlockedSource(recordingUrl(program)) || /embed|seraph/i.test(recordingUrl(program))) {
      throw new Error("This programme uses an embed-only licensed recording and cannot be exported. Only church recordings can be exported.");
    }
    throw new Error("This programme has no downloadable church recording to export.");
  }

  const url = recordingUrl(program);
  const filename = getExportFilename(program);
  const metadata = buildExportMetadata(program);
  const fetcher = opts.fetcher || globalThis.fetch;
  const documentLike = opts.document || (typeof document !== "undefined" ? document : null);
  const urlObj = opts.urlObject || globalThis.URL;
  const createObjectURL = opts.createObjectURL || (urlObj && typeof urlObj.createObjectURL === "function" ? urlObj.createObjectURL.bind(urlObj) : null);
  const revokeObjectURL = opts.revokeObjectURL || (urlObj && typeof urlObj.revokeObjectURL === "function" ? urlObj.revokeObjectURL.bind(urlObj) : null);

  if (typeof fetcher !== "function" || !documentLike || !createObjectURL) {
    throw new Error("Export is not supported in this browser. Try a newer browser or device.");
  }

  let blob;
  try {
    const response = await fetcher(url, { mode: "cors" });
    if (!response || !response.ok) throw new Error("The recording could not be fetched.");
    blob = await response.blob();
  } catch (error) {
    // Cross-origin / CORS / platform block: fall back to a direct download link.
    // This still exports only the same validated church recording URL.
    fallbackDownload(documentLike, url, filename);
    return { filename, metadata, fallback: true, size: 0, format: metadata.format, message: "Opened the recording for download. If it did not start, long-press or right-click and choose Save Audio." };
  }

  if (!blob || !blob.size) throw new Error("The recording file is empty and could not be exported.");

  const objectUrl = createObjectURL(blob);
  try {
    createDownloadLink(documentLike, objectUrl, filename);
  } finally {
    if (revokeObjectURL) {
      // Small delay lets the browser read the blob before revoking.
      setTimeout(() => { try { revokeObjectURL(objectUrl); } catch (error) {} }, 1000);
    }
  }
  return { filename, metadata, fallback: false, size: blob.size, format: metadata.format };
}
