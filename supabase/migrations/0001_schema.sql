-- Quizora — 0001 veritabanı şeması
-- Yeniden çalıştırılabilir: create ... if not exists, drop policy if exists.

-- =====================================================================
-- 1. SORU TABLOLARI (18 adet, aynı şema)
-- Hiç policy yok + RLS açık + anon/authenticated yetkisi alınır:
-- yalnızca security definer RPC'ler bu tablolara erişir.
-- =====================================================================
do $$
declare
  t text;
  tablolar text[] := array[
    'matematik_tyt', 'turkce_tyt', 'kimya_tyt', 'fizik_tyt', 'biyoloji_tyt',
    'tarih_tyt', 'cografya_tyt', 'felsefe_tyt', 'din_kulturu_tyt',
    'fizik_ayt', 'kimya_ayt', 'biyoloji_ayt', 'matematik_ayt', 'edebiyat_ayt',
    'tarih_ayt', 'cografya_ayt', 'felsefe_ayt', 'din_kulturu_ayt'
  ];
begin
  foreach t in array tablolar loop
    execute format($f$
      create table if not exists public.%I (
        id uuid primary key default gen_random_uuid(),
        soru_metni text not null,
        gorsel_url text,
        secenek_a text not null,
        secenek_b text not null,
        secenek_c text not null,
        secenek_d text not null,
        secenek_e text not null,
        dogru_sik char(1) not null check (dogru_sik in ('A','B','C','D','E')),
        aciklama text,
        aktif boolean not null default true,
        created_at timestamptz not null default now()
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- =====================================================================
-- 2. OYUN TABLOLARI
-- =====================================================================

-- Kullanıcı profili (anonim oturumla bağlı)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  avatar_key text,
  photo_url text,
  created_at timestamptz not null default now()
);

-- Oyun odası
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kategori text not null check (kategori in ('sayisal','esit_agirlik','sozel','tyt')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  host_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  speedup_at timestamptz,
  speedup_remaining_ms int,
  speedup_by uuid references public.profiles(id),
  finished_at timestamptz,
  winner_id uuid references public.profiles(id),
  duration_ms int not null default 120000,
  total_questions int not null default 10
);

-- Oyundaki oyuncular ve ilerlemeleri
create table if not exists public.game_players (
  game_id uuid references public.games on delete cascade,
  user_id uuid references public.profiles,
  joined_at timestamptz not null default now(),
  current_q int not null default 0,
  q_started_at timestamptz,
  score int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  total_time_ms int not null default 0,
  finished_at timestamptz,
  primary key (game_id, user_id)
);

-- Oyun için seçilen sorular (hangi tablodan hangi soru, hangi sırada)
create table if not exists public.game_questions (
  game_id uuid references public.games on delete cascade,
  position int check (position between 0 and 9),
  source_table text not null,
  question_id uuid not null,
  primary key (game_id, position)
);

-- Verilen cevaplar (puan sunucuda hesaplanır)
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games on delete cascade,
  user_id uuid references public.profiles,
  position int,
  secenek char(1),
  dogru boolean,
  sure_ms int,
  puan int not null,
  answered_at timestamptz not null default now(),
  unique (game_id, user_id, position)
);

-- Genel liderlik tablosu
create table if not exists public.global_scores (
  user_id uuid primary key references public.profiles,
  total_points int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists games_code_idx on public.games (code);
create index if not exists game_players_user_idx on public.game_players (user_id);

-- =====================================================================
-- 3. RLS: istemci yalnızca okur, yazma yalnızca RPC (security definer)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_questions enable row level security;
alter table public.answers enable row level security;
alter table public.global_scores enable row level security;

-- Yardımcı: çağıran kullanıcı bu oyunun oyuncusu mu?
create or replace function public.is_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_players
    where game_id = gid and user_id = auth.uid()
  );
$$;

-- profiles: herkes (giriş yapmış) okur; yalnızca kendi satırını yazar
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- games / game_players: yalnızca oyunun üyeleri okur
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated using (public.is_member(id));

drop policy if exists game_players_select on public.game_players;
create policy game_players_select on public.game_players
  for select to authenticated using (public.is_member(game_id));

-- global_scores: giriş yapmış herkes okur
drop policy if exists global_scores_select on public.global_scores;
create policy global_scores_select on public.global_scores
  for select to authenticated using (true);

-- game_questions ve answers: policy yok (istemci erişimi yok)
-- Ek güvenlik: tablo yetkilerini de kapat (yazma yalnızca RPC / service role)
revoke all on public.game_questions, public.answers from anon, authenticated;
revoke all on public.games, public.game_players, public.global_scores from anon;
revoke insert, update, delete on public.games, public.game_players, public.global_scores from authenticated;
revoke all on public.profiles from anon;

-- =====================================================================
-- 4. REALTIME
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['games', 'game_players', 'global_scores'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 5. STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('soru-gorselleri', 'soru-gorselleri', true)
on conflict (id) do update set public = excluded.public;

-- avatars: herkes okur (public bucket); kullanıcı yalnızca kendi klasörüne yazar
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- soru-gorselleri: istemci yazma policy'si YOK (yalnızca service role yükler)
