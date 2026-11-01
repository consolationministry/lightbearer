import { supabaseRequest } from "./supabase-client.js?v=32";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

const SETTINGS_PATH = "rest/v1/admin_settings?id=eq.global&select=cloudinary_cloud_name,cloudinary_api_key,cloudinary_api_secret";

function normalizeSettings(row) {
  const cloudName = String(row && row.cloudinary_cloud_name || "").trim();
  const apiKey = String(row && row.cloudinary_api_key || "").trim();
  const apiSecret = String(row && row.cloudinary_api_secret || "").trim();
  return { available: true, configured: Boolean(cloudName && apiKey && apiSecret), cloudName, apiKey: "", apiSecret: "" };
}

export async function getCloudinarySettings() {
  const rows = await supabaseRequest(SETTINGS_PATH);
  return normalizeSettings(Array.isArray(rows) ? rows[0] : rows);
}

export async function saveCloudinarySettings(values) {
  const cloudName = String(values && values.cloudName || "").trim();
  const apiKey = String(values && values.apiKey || "").trim();
  const apiSecret = String(values && values.apiSecret || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(cloudName)) throw new Error("Enter a valid Cloudinary cloud name.");
  if (Boolean(apiKey) !== Boolean(apiSecret)) throw new Error("Enter both the Cloudinary API key and API secret to replace the saved credentials.");

  const current = await getCloudinarySettings();
  if (!current.configured && (!apiKey || !apiSecret)) throw new Error("Enter both the Cloudinary API key and API secret to connect Cloudinary.");
  const body = { cloudinary_cloud_name: cloudName, updated_at: new Date().toISOString() };
  if (apiKey && apiSecret) {
    body.cloudinary_api_key = apiKey;
    body.cloudinary_api_secret = apiSecret;
  }
  const rows = await supabaseRequest(SETTINGS_PATH, {
    method: "PATCH",
    prefer: "return=representation",
    body
  });
  const saved = Array.isArray(rows) ? rows[0] : rows;
  if (!saved || saved.cloudinary_cloud_name !== cloudName) throw new Error("Supabase did not confirm that the Cloudinary settings were stored.");
  return { available: true, configured: true, cloudName };
}

export async function removeCloudinarySettings() {
  await supabaseRequest(SETTINGS_PATH, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { cloudinary_cloud_name: "", cloudinary_api_key: "", cloudinary_api_secret: "", updated_at: new Date().toISOString() }
  });
  return { available: true, configured: false, cloudName: "" };
}

export function renderCloudinarySettingsPanel(config) {
  const settings = config || {};
  const configured = settings.configured === true;
  const available = settings.available !== false;
  const initialStatus = configured
    ? "Connected to Cloudinary · " + escapeHtml(settings.cloudName || "")
    : available
      ? "Not configured. Add the Cloudinary account details to enable audio uploads."
      : "Cloudinary settings are unavailable. Apply the database columns SQL first.";
  const secretHint = configured
    ? "Saved. The API secret is never displayed again. Leave both credential fields blank to keep the saved credentials."
    : "The API secret is only used by signed admin uploads and is never sent to the member app.";
  return '<section class="panel settings-module cloudinary-settings">' +
    '<header class="panel-header"><div><h2>Cloudinary audio storage</h2><p>Store live rewind segments and completed broadcast recordings in Cloudinary.</p></div></header>' +
    '<div class="panel-body"><form id="cloudinary-settings-form" novalidate>' +
    '<div class="admin-field"><label for="cloudinary-cloud-name">Cloud name</label><input class="form-input" id="cloudinary-cloud-name" name="cloudName" type="text" maxlength="64" autocomplete="off" value="' + escapeHtml(settings.cloudName || "") + '" required><p class="field-hint">Find this in your Cloudinary dashboard.</p></div>' +
    '<div class="admin-field"><label for="cloudinary-api-key">API key</label><input class="form-input" id="cloudinary-api-key" name="apiKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="' + (configured ? "Leave blank to keep saved credentials" : "Cloudinary API key") + '"></div>' +
    '<div class="admin-field"><label for="cloudinary-api-secret">API secret</label><input class="form-input" id="cloudinary-api-secret" name="apiSecret" type="password" autocomplete="new-password" spellcheck="false" placeholder="' + (configured ? "Saved, never displayed" : "Cloudinary API secret") + '"><p class="field-hint">' + secretHint + '</p></div>' +
    '<div id="cloudinary-settings-status" class="cloudinary-status" role="status" aria-live="polite">' + initialStatus + '</div>' +
    '<div class="form-actions"><div class="form-actions-left">' +
    (configured ? '<button class="button button-secondary" type="button" data-action="remove-cloudinary-settings">Disconnect Cloudinary</button>' : "") +
    '</div><div class="form-actions-right"><button class="button button-primary" type="submit"' + (available ? "" : " disabled") + '>Save Cloudinary settings</button></div></div>' +
    '</form></div></section>';
}
