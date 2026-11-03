-- Supersedes 202611010002_form_response_ownership.sql. Ownership is auth.uid(), not
-- a caller-entered or caller-asserted email. Names, emails, and phones remain form
-- data, not keys for retrieving account-owned submissions.
-- Apply only after reviewing and explicitly approving the SQL in production.

alter table public.form_responses
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.registration_codes
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists form_responses_owner_created
  on public.form_responses(owner_user_id, created_at desc)
  where deleted_at is null;
create index if not exists registration_codes_owner
  on public.registration_codes(owner_user_id)
  where owner_user_id is not null;

-- Form respondent_email is not an account identifier. Remove its unique index so
-- distinct authenticated users may submit the same form email without conflict.
drop index if exists public.form_responses_unique_name;
drop index if exists public.form_responses_unique_email;
drop index if exists public.form_responses_unique_phone;

create or replace function public.submit_form_response(
  p_form_id uuid,
  p_data jsonb,
  p_respondent_name text default '',
  p_respondent_email text default '',
  p_respondent_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms%rowtype;
  account_id uuid := auth.uid();
  account_email text;
  rid uuid;
  code text := '';
  seq bigint;
  cfg jsonb;
  n integer;
begin
  select u.email into account_email
  from auth.users u
  where u.id = account_id and u.email_confirmed_at is not null;
  if account_id is null or account_email is null then
    raise exception 'Confirm your email before submitting a form.';
  end if;

  select * into f
  from public.forms
  where id = p_form_id and status = 'published' and deleted_at is null
    and (expires_at is null or expires_at >= current_date)
  for update;
  if not found then raise exception 'This form is unavailable or expired.'; end if;

  -- Names and phone numbers are form data, not account identifiers. Do not reject
  -- submissions merely because another person shares either value.
insert into public.form_responses(
    form_id, respondent_name, respondent_email, respondent_phone, data, owner_user_id
  ) values (
    p_form_id,
    coalesce(nullif(trim(p_respondent_name), ''), ''),
    lower(account_email),
    coalesce(nullif(trim(p_respondent_phone), ''), ''),
    jsonb_set(coalesce(p_data, '{}'::jsonb), '{respondent_email}', to_jsonb(lower(account_email)), true),
    account_id
  ) returning id into rid;

  cfg := coalesce(f.registration_config, '{}'::jsonb);
  if f.form_type = 'registration' and coalesce((cfg->>'enabled')::boolean, true) then
    seq := nextval('public.form_registration_sequence');
    n := greatest(4, least(coalesce((cfg->>'length')::integer, 4), 12));
    code := coalesce(nullif(cfg->>'prefix', ''), 'REG-' || to_char(current_date, 'YYYY') || '-')
      || lpad(seq::text, n, '0') || coalesce(cfg->>'suffix', '');
    update public.form_responses set registration_code = code where id = rid;
    insert into public.registration_codes(form_id, response_id, code, sequence_number, owner_user_id)
    values (p_form_id, rid, code, seq, account_id);
  end if;

  return jsonb_build_object('id', rid, 'registration_code', code);
end;
$$;

create or replace function public.get_my_form_responses()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  result jsonb;
begin
  select u.email into account_email
  from auth.users u
  where u.id = account_id and u.email_confirmed_at is not null;
  if account_id is null or account_email is null then
    raise exception 'Sign in with your confirmed email first.';
  end if;

  -- The account email was confirmed by Supabase OTP/magic-link before this RPC.
  -- Match it to old form data only after authentication; typed email alone cannot
  -- call this function because execution is granted to authenticated users only.
  update public.form_responses r
  set owner_user_id = account_id
  where r.owner_user_id is null and r.deleted_at is null
    and lower(r.respondent_email) = lower(account_email);
  update public.registration_codes c
  set owner_user_id = account_id
  from public.form_responses r
  where c.response_id = r.id and r.owner_user_id = account_id and c.owner_user_id is null;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'form_id', r.form_id,
      'respondent_name', r.respondent_name,
      'registration_code', r.registration_code,
      'created_at', r.created_at,
      'data', r.data,
      'form_updated_at', f.updated_at,
      'forms', jsonb_build_object('title', f.title, 'name', f.name)
    ) order by r.created_at desc
  ), '[]'::jsonb) into result
  from public.form_responses r
  join public.forms f on f.id = r.form_id
  where r.owner_user_id = account_id
    and r.deleted_at is null
    and f.deleted_at is null;
  return result;
end;
$$;

create or replace function public.update_my_form_response(
  p_response_id uuid,
  p_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  changed integer;
begin
  select u.email into account_email
  from auth.users u
  where u.id = account_id and u.email_confirmed_at is not null;
  if account_id is null or account_email is null then
    raise exception 'Confirm your email before editing a submission.';
  end if;

  update public.form_responses r
  set data = jsonb_set(coalesce(p_data, '{}'::jsonb), '{respondent_email}', to_jsonb(lower(account_email)), true),
      respondent_email = lower(account_email),
      respondent_name = coalesce(nullif(trim(p_data->>'respondent_name'), ''), nullif(trim(p_data->>'f_name'), ''), r.respondent_name),
      respondent_phone = coalesce(nullif(trim(p_data->>'respondent_phone'), ''), nullif(trim(p_data->>'f_phone'), ''), r.respondent_phone)
  where r.id = p_response_id and r.owner_user_id = account_id and r.deleted_at is null;

  get diagnostics changed = row_count;
  if changed = 0 then raise exception 'response not found or not owned by this account'; end if;
  return true;
end;
$$;

-- Drop prior email-argument overloads. Caller-supplied email is no longer an identity.
drop function if exists public.get_my_form_responses(text);
drop function if exists public.update_my_form_response(uuid, text, jsonb);

revoke all on function public.submit_form_response(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_form_response(uuid, jsonb, text, text, text) to authenticated;
revoke all on function public.get_my_form_responses() from public, anon;
grant execute on function public.get_my_form_responses() to authenticated;
revoke all on function public.update_my_form_response(uuid, jsonb) from public, anon;
grant execute on function public.update_my_form_response(uuid, jsonb) to authenticated;
