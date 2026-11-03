import assert from "node:assert/strict";
import test from "node:test";
import { filterLocationOptions, getLocationOptions } from "../js/form-location.js";
import { beginAdminSave } from "../admin/js/admin-save-state.js";

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
  const attributes = new Map();
  let removed = false;
  const form = { dataset: {} };
  const button = { disabled: false, isConnected: true, setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); }, prepend(node) { this.spinner = node; }, querySelector() { return { remove() { removed = true; } }; } };
  const release = beginAdminSave(form, button);
  assert.equal(typeof release, "function");
  assert.equal(button.disabled, true);
  assert.equal(attributes.get("aria-busy"), "true");
  assert.equal(beginAdminSave(form, button), null);
  release();
  assert.equal(button.disabled, false);
  assert.equal(attributes.has("aria-busy"), false);
  assert.equal(removed, true);
});
