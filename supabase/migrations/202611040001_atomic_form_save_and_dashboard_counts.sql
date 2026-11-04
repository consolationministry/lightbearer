-- Keep each form and its child data recoverable as one transaction, and load
-- dashboard counts without fetching every response body per form.
create or replace function public.save_admin_form(p_form jsonb, p_fields jsonb, p_testers text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  saved_form public.forms%rowtype;
  v_form_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'A verified administrator session is required.';
  end if;
  v_form_id := nullif(p_form->>'id', '')::uuid;
  if v_form_id is null then
    raise exception 'Form id is required.';
  end if;

  insert into public.forms (
    id, title, name, description, status, form_type, expires_at,
    registration_config, section_style, created_by, updated_at
  ) values (
    v_form_id,
    coalesce(p_form->>'title', ''),
    coalesce(p_form->>'name', ''),
    coalesce(p_form->>'description', ''),
    coalesce(p_form->>'status', 'draft'),
    coalesce(p_form->>'form_type', 'other'),
    nullif(p_form->>'expires_at', '')::date,
    coalesce(p_form->'registration_config', '{}'::jsonb),
    coalesce(p_form->'section_style', '{}'::jsonb),
    auth.uid(),
    now()
  )
  on conflict (id) do update set
    title = excluded.title,
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    form_type = excluded.form_type,
    expires_at = excluded.expires_at,
    registration_config = excluded.registration_config,
    section_style = excluded.section_style,
    updated_at = now()
  returning * into saved_form;

  delete from public.form_fields where public.form_fields.form_id = v_form_id;
  insert into public.form_fields (form_id, label, placeholder, kind, required, options, position, section_index, section_style)
  select v_form_id, x.label, x.placeholder, x.kind, coalesce(x.required, false), coalesce(x.options, 'null'::jsonb),
    x.position, coalesce(x.section_index, 0), coalesce(x.section_style, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_fields, '[]'::jsonb)) as x(
    label text, placeholder text, kind text, required boolean, options jsonb,
    position integer, section_index integer, section_style jsonb
  );

  delete from public.form_testers where public.form_testers.form_id = v_form_id;
  insert into public.form_testers (form_id, email)
  select v_form_id, lower(trim(x.email))
  from unnest(coalesce(p_testers, '{}'::text[])) as x(email)
  where trim(x.email) <> ''
  on conflict (form_id, email) do nothing;

  return to_jsonb(saved_form);
end;
$$;

create or replace function public.get_form_dashboard_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'A verified administrator session is required.';
  end if;

  return (
    select jsonb_build_object(
      'active_forms', (select count(*) from public.forms where deleted_at is null),
      'deleted_forms', (select count(*) from public.forms where deleted_at is not null),
      'active_responses', (
        select count(*) from public.form_responses r
        join public.forms f on f.id = r.form_id
        where r.deleted_at is null and f.deleted_at is null
      ),
      'deleted_responses', (select count(*) from public.form_responses where deleted_at is not null),
      'response_counts', coalesce((
        select jsonb_object_agg(counts.form_id::text, counts.total)
        from (
          select r.form_id, count(*) as total
          from public.form_responses r
          join public.forms f on f.id = r.form_id
          where r.deleted_at is null and f.deleted_at is null
          group by r.form_id
        ) counts
      ), '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.save_admin_form(jsonb, jsonb, text[]) from public, anon;
grant execute on function public.save_admin_form(jsonb, jsonb, text[]) to authenticated;
revoke all on function public.get_form_dashboard_counts() from public, anon;
grant execute on function public.get_form_dashboard_counts() to authenticated;
