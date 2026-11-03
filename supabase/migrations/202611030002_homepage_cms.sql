-- Public homepage content with authenticated administrator writes only.
create table if not exists public.site_content (
  key text primary key check (key in ('about','hero','intro','retreat','social_links')),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
revoke all on public.site_content from public, anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant select, insert, update, delete on public.site_content to authenticated;
drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content for select to anon, authenticated using (true);
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-media', 'homepage-media', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists homepage_media_public_read on storage.objects;
create policy homepage_media_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'homepage-media');
drop policy if exists homepage_media_admin_insert on storage.objects;
create policy homepage_media_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'homepage-media' and (select public.is_admin()));
drop policy if exists homepage_media_admin_update on storage.objects;
create policy homepage_media_admin_update on storage.objects for update to authenticated using (bucket_id = 'homepage-media' and (select public.is_admin())) with check (bucket_id = 'homepage-media' and (select public.is_admin()));
drop policy if exists homepage_media_admin_delete on storage.objects;
create policy homepage_media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'homepage-media' and (select public.is_admin()));
