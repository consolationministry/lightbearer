-- Secure member response access using the Supabase Auth user from the JWT.
-- This migration is safe to commit and deploy as code, but must not be applied
-- to the live database without the owner's explicit instruction.
drop index if exists public.form_responses_unique_name;
drop index if exists public.form_responses_unique_phone;

create or replace function public.get_my_form_responses(p_email text)
returns jsonb
language sql stable security definer
set search_path = public, auth
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'form_id', r.form_id,
        'respondent_name', r.respondent_name,
        'registration_code', r.registration_code,
        'created_at', r.created_at,
        'data', r.data,
        'forms', jsonb_build_object('title', f.title, 'name', f.name)
      ) order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from public.form_responses r
  join public.forms f on f.id = r.form_id
  join auth.users u on u.id = auth.uid()
  where lower(r.respondent_email) = lower(u.email)
    and lower(coalesce(p_email, '')) = lower(u.email)
    and r.deleted_at is null
    and f.deleted_at is null;
$$;

create or replace function public.update_my_form_response(
  p_response_id uuid,
  p_email text,
  p_data jsonb
)
returns boolean
language plpgsql security definer
set search_path = public, auth
as $$
declare
  changed integer;
  account_email text;
begin
  select u.email into account_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if account_email is null or lower(coalesce(p_email, '')) <> lower(account_email) then
    raise exception 'response not found or not owned by this account';
  end if;

  update public.form_responses r
  set data = jsonb_set(coalesce(p_data, '{}'::jsonb), '{respondent_email}', to_jsonb(account_email), true),
      respondent_name = coalesce(nullif(trim(p_data->>'respondent_name'), ''), nullif(trim(p_data->>'f_name'), ''), r.respondent_name),
      respondent_phone = coalesce(nullif(trim(p_data->>'respondent_phone'), ''), nullif(trim(p_data->>'f_phone'), ''), r.respondent_phone)
  where r.id = p_response_id
    and r.deleted_at is null
    and lower(r.respondent_email) = lower(account_email);

  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'response not found or not owned by this account';
  end if;
  return true;
end;
$$;

revoke all on function public.get_my_form_responses(text) from public, anon;
revoke all on function public.update_my_form_response(uuid, text, jsonb) from public, anon;
grant execute on function public.get_my_form_responses(text) to authenticated;
grant execute on function public.update_my_form_response(uuid, text, jsonb) to authenticated;
