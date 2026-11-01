-- Public books and full-text page support.
alter table public.books add column if not exists is_public boolean not null default false;
alter table public.books add column if not exists category text not null default 'Christian Living';
alter table public.books add column if not exists source_name text not null default '';
alter table public.books add column if not exists source_url text not null default '';
alter table public.books add column if not exists cover_url text not null default '';
alter table public.books add column if not exists published boolean not null default true;
alter table public.books add column if not exists scraped_at timestamptz;
alter table public.books add column if not exists page_count integer not null default 0;
update public.books set published=(status='published') where published is distinct from (status='published');
update public.books set cover_url=front_cover_url where cover_url='' and coalesce(front_cover_url,'')<>'';
grant select on public.books to anon, authenticated;
grant select on public.book_pages to anon, authenticated;
drop policy if exists "books public read" on public.books;
create policy "books public read" on public.books for select using (status='published' and (not is_public or published));
notify pgrst, 'reload schema';
