-- Jalankan di Supabase: SQL Editor > New query > tempel > Run
create table if not exists public.leaderboard (
  id         bigint generated always as identity primary key,
  name       text   not null check (char_length(name) between 1 and 20),
  kelas      text   not null check (kelas in ('X-1','X-2','X-3','X-4','X-5','X-6','X-7','X-8','X-9','X-10')),
  score      int    not null check (score between 0 and 100),
  benar      int    not null check (benar between 0 and 10),
  total      int    not null default 10 check (total between 1 and 10),
  waktu      int    not null check (waktu between 0 and 36000),   -- detik, waktu finish
  created_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

-- Siapa saja boleh melihat papan peringkat
create policy "leaderboard boleh dibaca" on public.leaderboard
  for select to anon, authenticated using (true);

-- Siapa saja boleh menambah nilai (tidak boleh mengubah / menghapus)
create policy "leaderboard boleh ditambah" on public.leaderboard
  for insert to anon, authenticated with check (true);
