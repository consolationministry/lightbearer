-- Library feature: books, pages, likes, comments
-- Matches the live project schema (created 2026-10-31). Safe to run on a fresh Supabase project.

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text default '',
  front_cover_url text default '',
  back_cover_url text default '',
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  page_number integer not null,
  page_title text default '',
  content text not null default '',
  is_colored boolean not null default false,
  created_at timestamptz not null default now(),
  unique (book_id, page_number)
);

create table if not exists public.book_page_likes (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.book_pages(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (page_id, device_id)
);

create table if not exists public.book_page_comments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.book_pages(id) on delete cascade,
  device_id text not null default '',
  author text default '',
  content text not null,
  created_at timestamptz not null default now()
);

-- Public reads for the member app
grant select on public.books to anon, authenticated;
grant select on public.book_pages to anon, authenticated;
grant select on public.book_page_likes to anon, authenticated;
grant select on public.book_page_comments to anon, authenticated;
-- Members may like and comment from the app
grant insert on public.book_page_likes to anon, authenticated;
grant insert on public.book_page_comments to anon, authenticated;

alter table public.books enable row level security;
alter table public.book_pages enable row level security;
alter table public.book_page_likes enable row level security;
alter table public.book_page_comments enable row level security;

drop policy if exists "books public read" on public.books;
create policy "books public read" on public.books for select using (status = 'published');

drop policy if exists "pages public read" on public.book_pages;
create policy "pages public read" on public.book_pages for select using (true);

drop policy if exists "likes public read" on public.book_page_likes;
create policy "likes public read" on public.book_page_likes for select using (true);

drop policy if exists "likes public insert" on public.book_page_likes;
create policy "likes public insert" on public.book_page_likes for insert with check (true);

drop policy if exists "comments public read" on public.book_page_comments;
create policy "comments public read" on public.book_page_comments for select using (true);

drop policy if exists "comments public insert" on public.book_page_comments;
create policy "comments public insert" on public.book_page_comments for insert with check (true);

-- Admin (authenticated, admin_users-checked client side) full access for managing books
grant all on public.books to authenticated;
grant all on public.book_pages to authenticated;
