-- Public book metadata and publication controls.
alter table public.books add column if not exists is_public boolean not null default false;
alter table public.books add column if not exists category text not null default 'Christian Living';
alter table public.books add column if not exists source_name text not null default '';
alter table public.books add column if not exists source_url text not null default '';
alter table public.books add column if not exists cover_url text not null default '';
alter table public.books add column if not exists published boolean not null default false;
alter table public.books add column if not exists scraped_at timestamptz;
grant select on public.books to anon, authenticated;
grant all on public.books to authenticated;

create or replace function public.set_public_book_published(book_id uuid, make_published boolean)
returns void language sql security definer set search_path = public as $$
  update public.books set published = make_published where id = book_id and is_public = true;
$$;
grant execute on function public.set_public_book_published(uuid, boolean) to anon, authenticated;

create or replace function public.delete_public_book(book_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.books where id = book_id and is_public = true;
$$;
grant execute on function public.delete_public_book(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
