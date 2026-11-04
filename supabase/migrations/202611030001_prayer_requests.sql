-- Prayer inbox, designed for anonymous submission with admin-only access.
-- Safe to apply once: creates only this missing table and installs scoped grants and RLS policies.
-- Never put a service-role key in browser code.
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  request text not null check (length(btrim(request)) between 5 and 2000),
  contact text not null check (length(btrim(contact)) between 1 and 160),
  created_at timestamptz not null default now()
);
alter table public.prayer_requests enable row level security;
revoke all on public.prayer_requests from public, anon, authenticated;
grant insert on public.prayer_requests to anon, authenticated;
grant select, update, delete on public.prayer_requests to authenticated;
drop policy if exists prayer_requests_public_submit on public.prayer_requests;
create policy prayer_requests_public_submit on public.prayer_requests for insert to anon, authenticated with check (length(btrim(request)) between 5 and 2000 and length(btrim(contact)) between 1 and 160);
drop policy if exists prayer_requests_admin_read on public.prayer_requests;
create policy prayer_requests_admin_read on public.prayer_requests for select to authenticated using ((select public.is_admin()));
drop policy if exists prayer_requests_admin_update on public.prayer_requests;
create policy prayer_requests_admin_update on public.prayer_requests for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists prayer_requests_admin_delete on public.prayer_requests;
create policy prayer_requests_admin_delete on public.prayer_requests for delete to authenticated using ((select public.is_admin()));
comment on table public.prayer_requests is 'Private church prayer requests. Public may submit, only authenticated admins may read/manage.';
