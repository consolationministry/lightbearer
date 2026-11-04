import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { filterLocationOptions, getLocationOptions } from "../js/form-location.js";
import { beginAdminSave } from "../admin/js/admin-save-state.js";
import { buildResponseTable, responseCsv, responseText, responseWorkbookBlob, responseDocumentBlob } from "../admin/js/response-export.js";

const countries = [{ name: "Nigeria", iso: "NG" }, { name: "Kenya", iso: "KE" }];
const regions = { countries: { NG: [{ name: "Lagos", lgas: ["Ikeja", "Surulere"] }, { name: "Oyo", lgas: ["Ibadan North"] }], KE: [{ name: "Nairobi", lgas: ["Westlands"] }] } };

test("public location fields preload country/state/LGA choices and cascade by selected parent", () => {
  assert.deepEqual(getLocationOptions("country", "", "", countries, regions).map(item => item.value), ["NG", "KE"]);
  assert.deepEqual(getLocationOptions("state", "NG", "", countries, regions).map(item => item.value), ["Lagos", "Oyo"]);
  assert.deepEqual(getLocationOptions("lga", "NG", "Lagos", countries, regions).map(item => item.value), ["Ikeja", "Surulere"]);
  assert.deepEqual(getLocationOptions("lga", "KE", "Nairobi", countries, regions).map(item => item.value), ["Westlands"]);
});

test("location search is case-insensitive, trims input, and caps suggestions", () => {
  const options = Array.from({ length: 15 }, (_, index) => ({ name: `District ${index}` }));
  assert.deepEqual(filterLocationOptions(options, " district 1 ").map(item => item.name), ["District 1", "District 10", "District 11", "District 12", "District 13", "District 14"]);
  assert.equal(filterLocationOptions(options, "", 12).length, 12);
});

test("admin save state blocks repeated submissions and restores the button after saving", () => {
  const attributes = new Map(); let removed = false; const form = { dataset: {} };
  const button = { disabled: false, isConnected: true, setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); }, prepend() {}, querySelector() { return { remove() { removed = true; } }; } };
  const release = beginAdminSave(form, button);
  assert.equal(typeof release, "function"); assert.equal(button.disabled, true); assert.equal(attributes.get("aria-busy"), "true");
  assert.equal(beginAdminSave(form, button), null); release();
  assert.equal(button.disabled, false); assert.equal(attributes.has("aria-busy"), false); assert.equal(removed, true);
});

test("export builds spreadsheet, word, CSV, and text responses safely", async () => {
  const table = buildResponseTable([{ id: "name-1", label: "Name", position: 0 }], [{ respondent_name: "=SUM(1,2)", respondent_email: "a@example.com", respondent_phone: "1", registration_code: "R1", created_at: "2026-11-04", data: { "f_name-1": "A, \"B\"" } }]);
  assert.equal(table.rows[0][0], "'=SUM(1,2)"); assert.equal(responseCsv(table).split("\r\n").length, 2);
  assert.match(responseCsv(table), /"A, ""B"""/); assert.equal(responseText(table).split("\r\n").length, 2);
  assert.ok((await responseWorkbookBlob(table).arrayBuffer()).byteLength > 100); assert.ok((await responseDocumentBlob(table, "Responses").arrayBuffer()).byteLength > 100);
});

test("dashboard uses aggregate counts and form save calls one transactional RPC", async () => {
  const source = await readFile(new URL("../admin/js/forms-dashboard.js", import.meta.url), "utf8");
  const data = await readFile(new URL("../admin/js/form-data.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/202611040001_atomic_form_save_and_dashboard_counts.sql", import.meta.url), "utf8");
  assert.match(source, /getFormDashboardCounts\(\)/); assert.doesNotMatch(source, /Promise\.all\(forms\.map\(async f=>\(\{f,n:\(await getResponses/);
  assert.doesNotMatch(source, /Deleted forms<\/span><strong>0/); assert.match(data, /rpc\/save_admin_form/);
  assert.doesNotMatch(data, /form_fields\?form_id=.*method:"DELETE"/); assert.doesNotMatch(data, /form_testers\?form_id=.*method:"DELETE"/);
  assert.match(migration, /delete from public\.form_fields[\s\S]*delete from public\.form_testers/); assert.match(migration, /get_form_dashboard_counts/);
});
