import { supabaseRequest } from "./supabase-client.js?v=33";
import { parseCloudinaryLiveAudioReference } from "../../js/cloudinary-live-audio.js";

const CATEGORIES = ["Bible Study", "Sunday Service", "Prayer Meeting", "Worship", "Youth Service", "Other"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function asArray(value) { return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []; }
function normalizeProgram(row) {
  return { id: String(row.id), title: String(row.title || ""), description: String(row.description || ""), speaker: String(row.speaker || ""), category: String(row.category || "Other"), imageUrl: String(row.image_url || ""), venue: String(row.venue || ""), date: String(row.program_date || ""), status: row.status === "published" ? "published" : "draft", onAir: row.is_live === true, liveSessionId: row.live_session_id || "", liveStartedAt: row.live_started_at || "", recordingPath: String(row.recording_path || ""), recordingDurationSeconds: Math.max(0, Number(row.recording_duration_seconds) || 0), createdAt: row.created_at || "", updatedAt: row.updated_at || "", listenCount: Math.max(0, Number(row.listener_count) || 0) };
}
const CLOUDINARY_CHUNK_SIZE = 20 * 1024 * 1024;

async function getCloudinaryCredentials() {
  const rows = await supabaseRequest("rest/v1/admin_settings?id=eq.global&select=cloudinary_cloud_name,cloudinary_api_key,cloudinary_api_secret");
  const row = Array.isArray(rows) ? rows[0] : rows;
  const credentials = { cloudName: String(row && row.cloudinary_cloud_name || "").trim(), apiKey: String(row && row.cloudinary_api_key || "").trim(), apiSecret: String(row && row.cloudinary_api_secret || "").trim() };
  if (!/^[a-z0-9_-]{1,64}$/i.test(credentials.cloudName) || !credentials.apiKey || !credentials.apiSecret) throw new Error("Cloudinary is not configured. Add the credentials in Admin Settings.");
  return credentials;
}
async function cloudinarySha1Hex(value) {
  if (!globalThis.crypto || !globalThis.crypto.subtle || typeof TextEncoder === "undefined") throw new Error("This browser cannot securely sign Cloudinary uploads. Use a newer browser.");
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function signCloudinaryParams(params, apiSecret) {
  const canonical = Object.keys(params).filter(key => params[key] !== "" && params[key] != null).sort().map(key => key + "=" + params[key]).join("&");
  return cloudinarySha1Hex(canonical + apiSecret);
}
async function getCloudinaryUploadSignature(programId, sessionId, kind, format, segmentIndex) {
  if (!UUID_PATTERN.test(String(programId || "")) || !UUID_PATTERN.test(String(sessionId || ""))) throw new Error("This broadcast upload could not be identified.");
  const expectedKind = kind === "segment" ? "segment" : "recording";
  const suffix = expectedKind === "segment" ? "/segments/" + String(Number(segmentIndex)).padStart(6, "0") : "/recording";
  const publicId = "live-audio/" + programId + "/" + sessionId + suffix;
  const assetReference = "cloudinary:video:authenticated:" + publicId + ":" + format;
  const asset = parseCloudinaryLiveAudioReference(assetReference);
  if (!asset || asset.kind !== expectedKind || asset.format !== format || (expectedKind === "segment" && asset.segmentIndex !== Number(segmentIndex))) throw new Error("This audio recording has invalid upload details.");
  const credentials = await getCloudinaryCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, type: "upload", overwrite: "true" };
  const signature = await signCloudinaryParams(params, credentials.apiSecret);
  return { ...credentials, timestamp, signature, public_id: publicId, assetReference, format };
}
function makeCloudinaryUploadForm(signature, blob, filename) {
  const form = new FormData();
  form.append("file", blob, filename); form.append("api_key", signature.apiKey); form.append("timestamp", String(signature.timestamp)); form.append("public_id", signature.public_id); form.append("overwrite", "true"); form.append("type", "upload"); form.append("signature", signature.signature);
  return form;
}
async function uploadToCloudinary(signature, blob, filename) {
  const endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(signature.cloudName) + "/auto/upload";
  const uploadId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  let finalResult = null;
  for (let start = 0; start < blob.size; start += CLOUDINARY_CHUNK_SIZE) {
    const endExclusive = Math.min(start + CLOUDINARY_CHUNK_SIZE, blob.size);
    const chunk = blob.slice(start, endExclusive, blob.type || undefined);
    const headers = blob.size > CLOUDINARY_CHUNK_SIZE ? { "Content-Range": "bytes " + start + "-" + (endExclusive - 1) + "/" + blob.size, "X-Unique-Upload-Id": uploadId } : undefined;
    let response;
    try { response = await fetch(endpoint, { method: "POST", headers, body: makeCloudinaryUploadForm(signature, chunk, filename) }); } catch (error) { throw new Error("Cloudinary upload was interrupted. Retry the recording upload."); }
    const text = await response.text(); let result = null;
    if (text) { try { result = JSON.parse(text); } catch (error) { result = null; } }
    if (!response.ok) throw new Error("Cloudinary rejected the audio upload. Check account limits and try again.");
    finalResult = result;
  }
  if (!finalResult || finalResult.public_id !== signature.public_id || !finalResult.secure_url || (finalResult.format && finalResult.format !== signature.format)) throw new Error("Cloudinary did not confirm the complete audio upload. Retry the recording upload.");
  const url = new URL(String(finalResult.secure_url));
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") throw new Error("Cloudinary returned an unsafe audio address.");
  return url.href;
}

export async function loadAdminLiveAudioData() {
  const [programRows, categoryRows, stats] = await Promise.all([supabaseRequest("rest/v1/live_audio_programs?select=*&order=updated_at.desc"), supabaseRequest("rest/v1/live_audio_categories?select=name&order=name.asc"), supabaseRequest("rest/v1/rpc/get_live_audio_admin_stats", { method: "POST", body: {} })]);
  const categories = asArray(categoryRows).map(row => String(row.name || "").trim()).filter(Boolean);
  return { programs: asArray(programRows).map(normalizeProgram), categories: categories.length ? categories : CATEGORIES.slice(), stats: stats || { total_broadcasts: 0, total_listeners: 0, total_likes: 0, total_comments: 0 } };
}
export async function loadAdminLiveAudioInteractions(programId) {
  if (!programId) return null;
  const rows = await supabaseRequest("rest/v1/rpc/get_live_audio_interactions", { method: "POST", body: { p_program_ids: [programId], p_visitor_id: null } });
  const row = asArray(rows).find(item => String(item.program_id || "") === String(programId));
  if (!row) return { loveCount: 0, clapCount: 0, fireCount: 0, commentCount: 0, listenCount: 0, comments: [] };
  const comments = Array.isArray(row.comments) ? row.comments : [];
  return { loveCount: Math.max(0, Number(row.love_count) || 0), clapCount: Math.max(0, Number(row.clap_count) || 0), fireCount: Math.max(0, Number(row.fire_count) || 0), likeCount: Math.max(0, Number(row.like_count) || 0), commentCount: Math.max(0, Number(row.comment_count) || 0), listenCount: Math.max(0, Number(row.listener_count) || 0), comments: comments.filter(comment => comment && String(comment.body || "").trim()).map(comment => ({ id: String(comment.id || ""), body: String(comment.body || "").trim().slice(0, 280), createdAt: String(comment.created_at || "") })) };
}
export async function saveAdminLiveAudioProgram(value) {
  const payload = { title: String(value.title || "").trim(), description: String(value.description || "").trim(), speaker: String(value.speaker || "").trim(), category: String(value.category || "Other").trim() || "Other", image_url: String(value.imageUrl || "").trim(), venue: String(value.venue || "").trim(), program_date: value.date || null, status: value.status === "published" ? "published" : "draft", updated_at: new Date().toISOString() };
  if (payload.image_url) { const imageUrl = new URL(payload.image_url); if (imageUrl.protocol !== "https:") throw new Error("Use a secure HTTPS cover image address."); payload.image_url = imageUrl.href; }
  if (!payload.title) throw new Error("Enter a programme title before saving.");
  const path = value.id ? "rest/v1/live_audio_programs?id=eq." + encodeURIComponent(value.id) + "&select=*" : "rest/v1/live_audio_programs?select=*";
  const rows = await supabaseRequest(path, { method: value.id ? "PATCH" : "POST", prefer: "return=representation", body: payload });
  const saved = asArray(rows)[0]; if (!saved) throw new Error("The programme could not be saved."); return normalizeProgram(saved);
}
export async function setAdminLiveAudioStatus(programId, status) {
  const rows = await supabaseRequest("rest/v1/live_audio_programs?id=eq." + encodeURIComponent(programId) + "&select=*", { method: "PATCH", prefer: "return=representation", body: { status, updated_at: new Date().toISOString() } });
  return normalizeProgram(asArray(rows)[0]);
}
export async function deleteAdminLiveAudioProgram(programId) { await supabaseRequest("rest/v1/live_audio_programs?id=eq." + encodeURIComponent(programId), { method: "DELETE" }); }
export async function uploadAdminLiveAudioImage(file) {
  if (!file || !file.size) throw new Error("Choose an image file to upload.");
  if (!/^image\/(jpeg|png|webp|gif)$/.test(String(file.type || ""))) throw new Error("Choose a JPG, PNG, WebP or GIF image for the thumbnail.");
  if (file.size > 10 * 1024 * 1024) throw new Error("This image is larger than 10 MB. Choose a smaller one.");
  const credentials = await getCloudinaryCredentials(); const timestamp = Math.floor(Date.now() / 1000); const params = { folder: "lightbearer/live-audio", timestamp };
  const signature = await signCloudinaryParams(params, credentials.apiSecret); const form = new FormData();
  form.append("file", file, file.name); form.append("api_key", credentials.apiKey); form.append("timestamp", String(timestamp)); form.append("folder", params.folder); form.append("signature", signature);
  const endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(credentials.cloudName) + "/image/upload";
  let response; try { response = await fetch(endpoint, { method: "POST", body: form }); } catch (error) { throw new Error("The image upload was interrupted. Try again."); }
  const text = await response.text(); let result = null; try { result = text ? JSON.parse(text) : null; } catch (error) { result = null; }
  if (!response.ok || !result || !result.secure_url) throw new Error("Cloudinary rejected the image upload. Check account limits and try again.");
  const url = new URL(String(result.secure_url)); if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") throw new Error("Cloudinary returned an unsafe image address."); return url.href;
}
function readAudioFileDuration(file) {
  return new Promise(resolve => { if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") return resolve(1); const audio = new Audio(); const objectUrl = URL.createObjectURL(file); const done = seconds => { URL.revokeObjectURL(objectUrl); resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 1); }; audio.preload = "metadata"; audio.onloadedmetadata = () => done(audio.duration); audio.onerror = () => done(0); audio.src = objectUrl; });
}
export async function uploadAdminLiveAudioFile(programId, file) {
  if (!file || !file.size) throw new Error("Choose an audio file to upload.");
  const name = String(file.name || "").toLowerCase(); let contentType = String(file.type || "").split(";")[0].trim().toLowerCase();
  if (contentType === "audio/x-m4a" || (!contentType && name.endsWith(".m4a"))) contentType = "audio/mp4";
  if (!contentType && name.endsWith(".webm")) contentType = "audio/webm"; if (!contentType && name.endsWith(".ogg")) contentType = "audio/ogg";
  if (!["audio/webm", "audio/ogg", "audio/mp4"].includes(contentType)) throw new Error("Choose a WebM, OGG or M4A audio file.");
  const durationSeconds = await readAudioFileDuration(file); const sessionId = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
  if (!sessionId) throw new Error("This browser can't prepare an audio upload. Try a newer browser.");
  return uploadAdminLiveAudioRecording(programId, sessionId, { blob: file, contentType, durationSeconds });
}
export async function uploadAdminLiveAudioRecording(programId, sessionId, recording) {
  if (!UUID_PATTERN.test(String(programId || "")) || !UUID_PATTERN.test(String(sessionId || ""))) throw new Error("This broadcast recording could not be identified.");
  if (!recording || !recording.blob || !recording.blob.size) throw new Error("There is no audio recording to upload.");
  const format = String(recording.contentType || recording.blob.type || "").split(";")[0].trim().toLowerCase(); const extensions = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" }; const extension = extensions[format];
  if (!extension) throw new Error("The recording uses an unsupported audio format.");
  const signature = await getCloudinaryUploadSignature(programId, sessionId, "recording", extension); const secureUrl = await uploadToCloudinary(signature, recording.blob, "recording." + extension);
  const rows = await supabaseRequest("rest/v1/live_audio_programs?id=eq." + encodeURIComponent(programId) + "&select=*", { method: "PATCH", prefer: "return=representation", body: { recording_path: secureUrl, recording_duration_seconds: Math.max(1, Math.round(Number(recording.durationSeconds) || 1)), updated_at: new Date().toISOString() } });
  const row = asArray(rows)[0]; if (!row) throw new Error("The recording uploaded to Cloudinary, but its broadcast details could not be saved. Retry publishing."); return normalizeProgram(row);
}
export async function uploadAdminLiveAudioSegment(programId, sessionId, segment) {
  if (!UUID_PATTERN.test(String(programId || "")) || !UUID_PATTERN.test(String(sessionId || ""))) throw new Error("This live audio segment could not be identified.");
  if (!segment || !segment.blob || !segment.blob.size || !Number.isInteger(Number(segment.index)) || Number(segment.index) < 0) throw new Error("This live audio segment is incomplete.");
  const format = String(segment.contentType || segment.blob.type || "").split(";")[0].trim().toLowerCase(); const extensions = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" }; const extension = extensions[format]; const startedAt = new Date(segment.startedAt); const durationSeconds = Number(segment.durationSeconds);
  if (!extension || Number.isNaN(startedAt.getTime()) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("This live audio segment has invalid recording details.");
  const segmentIndex = Number(segment.index); const signature = await getCloudinaryUploadSignature(programId, sessionId, "segment", extension, segmentIndex); const secureUrl = await uploadToCloudinary(signature, segment.blob, String(segmentIndex).padStart(6, "0") + "." + extension);
  await supabaseRequest("rest/v1/live_audio_segments", { method: "POST", prefer: "return=minimal", body: { program_id: programId, session_id: sessionId, segment_index: segmentIndex, started_at: startedAt.toISOString(), duration_seconds: Math.round(durationSeconds * 1000) / 1000, storage_path: secureUrl } });
  return secureUrl;
}
export async function saveAdminLiveAudioCategories(categories) {
  const names = Array.from(new Set((Array.isArray(categories) ? categories : []).map(value => String(value || "").trim().slice(0, 48)).filter(Boolean)));
  if (!names.length) throw new Error("Keep at least one programme category."); const currentRows = await supabaseRequest("rest/v1/live_audio_categories?select=name"); const current = asArray(currentRows).map(row => String(row.name || "")); const remove = current.filter(name => !names.includes(name));
  if (remove.length) await Promise.all(remove.map(name => supabaseRequest("rest/v1/live_audio_categories?name=eq." + encodeURIComponent(name), { method: "DELETE" })));
  await supabaseRequest("rest/v1/live_audio_categories?on_conflict=name", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: names.map(name => ({ name })) }); return names;
}
export async function startAdminLiveAudioProgram(programId, sessionId) {
  const rows = await supabaseRequest("rest/v1/live_audio_programs?id=eq." + encodeURIComponent(programId) + "&select=*", { method: "PATCH", prefer: "return=representation", body: { status: "published", is_live: true, live_session_id: sessionId, live_started_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
  const row = asArray(rows)[0]; if (!row) throw new Error("The programme could not be started."); return normalizeProgram(row);
}
export async function endAdminLiveAudioProgram(programId, status) {
  const finalStatus = status === "draft" ? "draft" : "published";
  const rows = await supabaseRequest("rest/v1/live_audio_programs?id=eq." + encodeURIComponent(programId) + "&select=*", { method: "PATCH", prefer: "return=representation", body: { status: finalStatus, is_live: false, live_session_id: null, live_started_at: null, updated_at: new Date().toISOString() } });
  const row = asArray(rows)[0]; if (!row) throw new Error("The broadcast could not be ended."); return normalizeProgram(row);
}
export async function loadAdminLiveAudioBursts(programId, afterId) {
  if (!programId) return [];
  const rows = await supabaseRequest("rest/v1/rpc/get_live_audio_recent_bursts", { method: "POST", body: { p_program_id: programId, p_after_id: afterId == null ? null : Number(afterId) } });
  return asArray(rows).map(row => ({ id: Number(row.id) || 0, reaction: String(row.reaction || ""), createdAt: String(row.created_at || "") })).filter(row => row.id > 0);
}
