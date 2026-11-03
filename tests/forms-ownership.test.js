import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const migration = "supabase/migrations/202611030001_verified_form_response_ownership.sql";

test("verified ownership migration preserves legacy rows and anchors writes, reads, edits to auth.uid", async () => {
  const sql = await read(migration);
  assert.match(sql, /add column if not exists owner_user_id uuid references auth\.users\(id\)/i);
  assert.match(sql, /account_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /where r\.owner_user_id = account_id/i);
  assert.match(sql, /where r\.id = p_response_id and r\.owner_user_id = account_id/i);
  assert.match(sql, /insert into public\.form_responses\([\s\S]*owner_user_id[\s\S]*account_id/i);
  assert.match(sql, /insert into public\.registration_codes\([\s\S]*owner_user_id[\s\S]*account_id/i);
  assert.match(sql, /drop function if exists public\.get_my_form_responses\(text\)/i);
  assert.match(sql, /drop function if exists public\.update_my_form_response\(uuid, text, jsonb\)/i);
  assert.match(sql, /revoke all on function public\.get_my_form_responses\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_my_form_responses\(\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.submit_form_response\(uuid, jsonb, text, text, text\) from public, anon/i);
  assert.match(sql, /drop index if exists public\.form_responses_unique_name/i);
  assert.match(sql, /drop index if exists public\.form_responses_unique_phone/i);
  assert.match(sql, /drop index if exists public\.form_responses_unique_email/i);
  assert.match(sql, /where r\.owner_user_id is null[\s\S]*lower\(r\.respondent_email\) = lower\(account_email\)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.form_responses/i);
});

test("public client requires confirmed auth and sends no caller email as retrieval or edit identity", async () => {
  const data = await read("js/form-data.js");
  const page = await read("js/forms-public.js");
  assert.match(data, /sendEmailVerification\(email\)/);
  assert.match(data, /verifyEmailCode\(email,token\)/);
  assert.match(data, /email_confirmed_at/);
  assert.match(data, /get_my_form_responses"[\s\S]*body:\{\}/);
  assert.match(data, /update_my_form_response"[\s\S]*p_response_id:responseId,p_data/);
  assert.doesNotMatch(data, /get_my_form_responses"[\s\S]*p_email/);
  assert.doesNotMatch(data, /update_my_form_response"[\s\S]*p_email/);
  assert.match(page, /data-change-email/);
  assert.match(page, /requestEmailChange\(email\)/);
  assert.match(page, /data-edit/);
  assert.match(page, /await consumeAuthCallback\(\)/);
  assert.match(page, /updateMyResponse\(editing\.id,data\)/);
});

test("same-owner retrieval works and a different authenticated user cannot read or edit another response", async t => {
  const sql = await read(migration);
  assert.match(sql, /where r\.owner_user_id = account_id/i);
  assert.match(sql, /where r\.id = p_response_id and r\.owner_user_id = account_id/i);
  assert.match(sql, /where r\.id = p_response_id and r\.owner_user_id = account_id/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.form_responses/i);

  const storage = new Map();
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const row = { id: "response-a", owner_user_id: "user-a", form_id: "form-a", registration_code: "REG-2026-0001", data: { answer: "private" } };
  const tokens = new Map([["token-a", "user-a"], ["token-b", "user-b"]]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  globalThis.fetch = async (url, options) => {
    const actor = tokens.get(options.headers.authorization.slice("Bearer ".length));
    const path = new URL(url).pathname;
    if (path.endsWith("/rpc/submit_form_response")) {
      const body = JSON.parse(options.body);
    assert.equal(body.p_respondent_email, "a@example.com");
    assert.equal(body.p_data.respondent_email, "a@example.com");
      return new Response(JSON.stringify({ id: row.id, registration_code: row.registration_code, actor }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (path.endsWith("/rpc/get_my_form_responses")) {
      const rows = actor === row.owner_user_id ? [row] : [];
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (path.endsWith("/rpc/update_my_form_response")) {
      const body = JSON.parse(options.body);
      const ok = actor === row.owner_user_id && body.p_response_id === row.id;
      return new Response(JSON.stringify(ok), { status: ok ? 200 : 400, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected request: ${path}`);
  };
  t.after(() => { globalThis.localStorage = originalStorage; globalThis.fetch = originalFetch; });

  const { getMyResponses, updateMyResponse, saveResponse } = await import(`../js/form-data.js?ownership-test=${Date.now()}`);
  const sessionKey = "lightbearer-verified-auth-session";
  storage.set(sessionKey, JSON.stringify({ access_token: "token-a", refresh_token: "refresh-a", user: { id: "user-a", email: "a@example.com", email_confirmed_at: "2026-11-03T00:00:00Z" } }));
  assert.deepEqual(await getMyResponses(), [row]);
  assert.equal(await updateMyResponse(row.id, { answer: "updated" }), true);

  storage.set(sessionKey, JSON.stringify({ access_token: "token-b", refresh_token: "refresh-b", user: { id: "user-b", email: "b@example.com", email_confirmed_at: "2026-11-03T00:00:00Z" } }));
  assert.deepEqual(await getMyResponses(), []);
  await assert.rejects(updateMyResponse(row.id, { answer: "stolen edit" }), /Request failed/);
  assert.equal(row.data.answer, "private");
});
