import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("form ownership migration uses confirmed auth email and disallows anon response access", async () => {
  const sql = await read("supabase/migrations/202611010002_form_response_ownership.sql");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /email_confirmed_at is not null/i);
  assert.match(sql, /lower\(r\.respondent_email\)\s*=\s*lower\(u\.email\)/i);
  assert.match(sql, /where r\.id\s*=\s*p_response_id[\s\S]*lower\(r\.respondent_email\)\s*=\s*lower\(account_email\)/i);
  assert.match(sql, /revoke all on function public\.get_my_form_responses\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.update_my_form_response\(uuid, text, jsonb\) to authenticated/i);
  assert.match(sql, /drop index if exists public\.form_responses_unique_name/i);
  assert.match(sql, /drop index if exists public\.form_responses_unique_phone/i);
  assert.doesNotMatch(sql, /drop index if exists public\.form_responses_unique_email/i);
});

test("public response helpers no longer take a caller-asserted email as identity", async () => {
  const data = await read("js/form-data.js");
  const page = await read("js/forms-public.js");
  assert.match(data, /getMyResponses\(\)\s*\{/);
  assert.match(data, /updateMyResponse\(responseId,data\)/);
  assert.match(page, /getMyResponses\(\)/);
  assert.match(page, /updateMyResponse\(editing\.id,data\)/);
  assert.match(page, /prefillForm\(f,editing,form\)/);
  assert.doesNotMatch(page, /function prefillForm\(f,editing\)\{/);
});
