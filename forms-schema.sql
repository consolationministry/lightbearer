-- Lightbearer forms schema, v1.0.6
-- Paste once into Supabase SQL Editor. Admin is restricted to the configured email.
create extension if not exists pgcrypto;

create table if not exists public.forms (
 id uuid primary key default gen_random_uuid(), title text not null default '', name text not null default '', description text not null default '',
 status text not null default 'draft' check(status in ('draft','published')), form_type text not null default 'other' check(form_type in ('other','registration')),
 expires_at date, registration_config jsonb not null default '{}'::jsonb, section_style jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete set null
);
create unique index if not exists forms_active_name_unique on public.forms(lower(name)) where deleted_at is null;
create table if not exists public.form_fields (
 id uuid primary key default gen_random_uuid(), form_id uuid not null references public.forms(id) on delete cascade, label text not null default '', placeholder text not null default '',
 kind text not null check(kind in ('text','number','date','file','text_number','gender','country_state_lga')), required boolean not null default false,
 options jsonb not null default 'null'::jsonb, position integer not null default 0, section_index integer not null default 0, section_style jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists form_fields_form_position on public.form_fields(form_id,position);
create table if not exists public.form_testers (
 id uuid primary key default gen_random_uuid(), form_id uuid not null references public.forms(id) on delete cascade,
 email text not null default '', created_at timestamptz not null default now(), unique(form_id,email)
);
create table if not exists public.form_responses (
 id uuid primary key default gen_random_uuid(), form_id uuid not null references public.forms(id) on delete cascade,
 respondent_name text not null default '', respondent_email text not null default '', respondent_phone text not null default '', data jsonb not null default '{}'::jsonb,
 registration_code text not null default '', created_at timestamptz not null default now(), deleted_at timestamptz, deleted_by uuid references auth.users(id) on delete set null
);
create unique index if not exists form_responses_unique_name on public.form_responses(form_id,lower(respondent_name)) where deleted_at is null and respondent_name<>'';
create unique index if not exists form_responses_unique_email on public.form_responses(form_id,lower(respondent_email)) where deleted_at is null and respondent_email<>'';
create unique index if not exists form_responses_unique_phone on public.form_responses(form_id,respondent_phone) where deleted_at is null and respondent_phone<>'';
create index if not exists form_responses_form_created on public.form_responses(form_id,created_at desc);
create table if not exists public.registration_codes (
 id uuid primary key default gen_random_uuid(), form_id uuid not null references public.forms(id) on delete cascade,
 response_id uuid references public.form_responses(id) on delete set null, code text not null default '', sequence_number bigint not null default 0,
 created_at timestamptz not null default now(), unique(form_id,code), unique(form_id,sequence_number)
);
create sequence if not exists public.form_registration_sequence;

create or replace function public.is_lightbearer_form_admin() returns boolean language sql stable security definer set search_path=public,auth as $$
 select exists(select 1 from auth.users where id=auth.uid() and lower(email)='olaosebikanelijah936@gmail.com');
$$;
create or replace function public.authorize_form_tester(p_form_id uuid,p_email text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.forms f join public.form_testers t on t.form_id=f.id where f.id=p_form_id and f.status='draft' and f.deleted_at is null and (f.expires_at is null or f.expires_at>=current_date) and lower(t.email)=lower(coalesce(p_email,'')));
$$;
create or replace function public.get_tester_draft(p_form_id uuid,p_email text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare f jsonb; fs jsonb;
begin
 if not public.authorize_form_tester(p_form_id,p_email) then raise exception 'tester access denied'; end if;
 select to_jsonb(x) into f from (select id,title,name,description,expires_at,form_type,registration_config,section_style from public.forms where id=p_form_id and status='draft' and deleted_at is null) x;
 select coalesce(jsonb_agg(to_jsonb(ff) order by ff.position),'[]'::jsonb) into fs from public.form_fields ff where ff.form_id=p_form_id;
 return jsonb_build_object('form',f,'fields',fs);
end; $$;
create or replace function public.submit_form_response(p_form_id uuid,p_data jsonb,p_respondent_name text default '',p_respondent_email text default '',p_respondent_phone text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare f public.forms%rowtype; rid uuid; code text:=''; seq bigint; cfg jsonb; n integer; generated text;
begin
 select * into f from public.forms where id=p_form_id and status='published' and deleted_at is null and (expires_at is null or expires_at>=current_date) for update;
 if not found then raise exception 'This form is unavailable or expired.'; end if;
 if coalesce(trim(p_respondent_name),'')<>'' and exists(select 1 from public.form_responses where form_id=p_form_id and deleted_at is null and lower(respondent_name)=lower(trim(p_respondent_name))) then raise exception 'duplicate respondent name'; end if;
 if coalesce(trim(p_respondent_email),'')<>'' and exists(select 1 from public.form_responses where form_id=p_form_id and deleted_at is null and lower(respondent_email)=lower(trim(p_respondent_email))) then raise exception 'duplicate respondent email'; end if;
 if coalesce(trim(p_respondent_phone),'')<>'' and exists(select 1 from public.form_responses where form_id=p_form_id and deleted_at is null and respondent_phone=trim(p_respondent_phone)) then raise exception 'duplicate respondent phone'; end if;
 insert into public.form_responses(form_id,respondent_name,respondent_email,respondent_phone,data) values(p_form_id,coalesce(trim(p_respondent_name),''),lower(coalesce(trim(p_respondent_email),'')),coalesce(trim(p_respondent_phone),''),coalesce(p_data,'{}'::jsonb)) returning id into rid;
 if f.form_type='registration' then
  cfg:=coalesce(f.registration_config,'{}'::jsonb); seq:=nextval('public.form_registration_sequence'); n:=greatest(1,least(coalesce((cfg->>'length')::integer,6),20));
  if cfg->>'alphabet'='alphabet' then generated:=lpad(to_char(seq,'FM99999999999999999999'),n,'A'); else generated:=lpad(seq::text,n,'0'); end if;
  code:=coalesce(cfg->>'prefix','')||generated||coalesce(cfg->>'suffix','');
  update public.form_responses set registration_code=code where id=rid;
  insert into public.registration_codes(form_id,response_id,code,sequence_number) values(p_form_id,rid,code,seq);
 end if;
 return jsonb_build_object('id',rid,'registration_code',code);
exception when unique_violation then raise exception 'duplicate respondent name, email, or phone';
end; $$;
create or replace function public.get_my_form_responses(p_email text) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'form_id',r.form_id,'respondent_name',r.respondent_name,'registration_code',r.registration_code,'created_at',r.created_at,'forms',jsonb_build_object('title',f.title,'name',f.name)) order by r.created_at desc),'[]'::jsonb)
 from public.form_responses r join public.forms f on f.id=r.form_id where lower(r.respondent_email)=lower(coalesce(p_email,'')) and r.deleted_at is null and f.deleted_at is null;
$$;

alter table public.forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_testers enable row level security;
alter table public.form_responses enable row level security;
alter table public.registration_codes enable row level security;
drop policy if exists forms_public_published_read on public.forms;
create policy forms_public_published_read on public.forms for select to anon,authenticated using(status='published' and deleted_at is null and (expires_at is null or expires_at>=current_date));
drop policy if exists fields_public_published_read on public.form_fields;
create policy fields_public_published_read on public.form_fields for select to anon,authenticated using(exists(select 1 from public.forms f where f.id=form_id and f.status='published' and f.deleted_at is null and (f.expires_at is null or f.expires_at>=current_date)));
drop policy if exists forms_admin_access on public.forms;
create policy forms_admin_access on public.forms for all to authenticated using(public.is_lightbearer_form_admin() or auth.uid()=created_by) with check(public.is_lightbearer_form_admin() or auth.uid()=created_by);
drop policy if exists fields_admin_access on public.form_fields;
create policy fields_admin_access on public.form_fields for all to authenticated using(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin()))) with check(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin())));
drop policy if exists testers_admin_access on public.form_testers;
create policy testers_admin_access on public.form_testers for all to authenticated using(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin()))) with check(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin())));
drop policy if exists responses_admin_access on public.form_responses;
create policy responses_admin_access on public.form_responses for all to authenticated using(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin()))) with check(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin())));
drop policy if exists registrations_admin_access on public.registration_codes;
create policy registrations_admin_access on public.registration_codes for all to authenticated using(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin()))) with check(exists(select 1 from public.forms f where f.id=form_id and (f.created_by=auth.uid() or public.is_lightbearer_form_admin())));
grant select on public.forms,public.form_fields to anon,authenticated;
grant execute on function public.is_lightbearer_form_admin() to authenticated;
grant execute on function public.authorize_form_tester(uuid,text),public.get_tester_draft(uuid,text),public.submit_form_response(uuid,jsonb,text,text,text),public.get_my_form_responses(text) to anon,authenticated;
