import assert from "node:assert/strict";
import test from "node:test";
import { getResponseAnswers, responseValueText } from "../admin/js/response-data.js";

test("admin response answers show every submitted field and preserve historical answers", () => {
  const fields = [
    { id: "field-a", label: "Name", position: 0 },
    { id: "field-b", label: "Location", position: 1 }
  ];
  const data = {
    "f_field-a": "Ada",
    "f_field-b": "Kenya",
    "f_old_field": "Earlier question answer",
    "f_field-b_country": "KE",
    "f_field-b_state": "Nairobi",
    respondent_email: "ada@example.com"
  };
  assert.deepEqual(getResponseAnswers(fields, data), [
    { label: "Name", value: "Ada" },
    { label: "Location", value: "Kenya" },
    { label: "Location (Country)", value: "KE" },
    { label: "Location (State / region)", value: "Nairobi" },
    { label: "Previous answer (field changed)", value: "Earlier question answer" }
  ]);
});

test("admin response answers use current labels when their ids match and render values", () => {
  const answers = getResponseAnswers([{ id: "uuid-1", label: "Full name" }], { "f_uuid-1": "Ada" });
  assert.deepEqual(answers, [{ label: "Full name", value: "Ada" }]);
  assert.equal(responseValueText(["one", "two"]), "one, two");
  assert.equal(responseValueText({ answer: "yes" }), '{"answer":"yes"}');
});
