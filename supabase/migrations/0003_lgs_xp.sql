-- Quizora — 0003 LGS soruları ve XP/rank sistemi
-- 0001 ve 0002 DEĞİŞTİRİLMEDİ; tüm değişiklikler burada.
-- Yeniden çalıştırılabilir: if not exists / create or replace / drop ... if exists / on conflict.

-- =====================================================================
-- 1. LGS SORU TABLOLARI (6 adet; 18 YKS tablosuyla aynı şema ve güvenlik)
-- RLS açık + policy yok + anon/authenticated yetkisi alınır:
-- yalnızca security definer RPC'ler bu tablolara erişir.
-- =====================================================================
do $$
declare
  t text;
  tablolar text[] := array[
    'turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs',
    'ingilizce_lgs', 'matematik_lgs', 'fen_lgs'
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
-- 2. games: kategori kısıtı (6 değer) ve sinav sütunu
-- =====================================================================
-- Eski kategori check kısıtının adı sabit varsayılmaz; pg_constraint'ten bulunur.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.games'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kategori%'
  loop
    execute format('alter table public.games drop constraint %I', c.conname);
  end loop;

  alter table public.games add constraint games_kategori_check
    check (kategori in ('sayisal','esit_agirlik','sozel','tyt','lgs_sozel','lgs_sayisal'));
end $$;

-- Sınav türü: kategori 'lgs_' ile başlıyorsa 'lgs', değilse 'yks'
alter table public.games add column if not exists sinav text
  generated always as (case when left(kategori, 4) = 'lgs_' then 'lgs' else 'yks' end) stored;

-- =====================================================================
-- 3. RANK TABLOSU
-- =====================================================================
create table if not exists public.rank_tiers (
  min_xp int primary key,
  rank_key text not null,
  rank_label text not null
);

insert into public.rank_tiers (min_xp, rank_key, rank_label) values
  (0,    'caylak',  'Çaylak'),
  (100,  'bronz_1', 'Bronz I'),
  (150,  'bronz_2', 'Bronz II'),
  (200,  'bronz_3', 'Bronz III'),
  (260,  'gumus_1', 'Gümüş I'),
  (330,  'gumus_2', 'Gümüş II'),
  (400,  'gumus_3', 'Gümüş III'),
  (480,  'altin_1', 'Altın I'),
  (570,  'altin_2', 'Altın II'),
  (660,  'altin_3', 'Altın III'),
  (760,  'elmas_1', 'Elmas I'),
  (870,  'elmas_2', 'Elmas II'),
  (980,  'elmas_3', 'Elmas III'),
  (1100, 'efsane',  'Efsane')
on conflict (min_xp) do update
  set rank_key = excluded.rank_key, rank_label = excluded.rank_label;

alter table public.rank_tiers enable row level security;
revoke all on public.rank_tiers from anon;
revoke insert, update, delete on public.rank_tiers from authenticated;
grant select on public.rank_tiers to authenticated;

drop policy if exists rank_tiers_select on public.rank_tiers;
create policy rank_tiers_select on public.rank_tiers
  for select to authenticated using (true);

-- =====================================================================
-- 4. OYUNCU İSTATİSTİKLERİ (XP, galibiyet, oynanan oyun)
-- İstemci yalnızca okur; yazma yalnızca RPC (security definer).
-- =====================================================================
create table if not exists public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp int not null default 0,
  wins int not null default 0,
  games_played int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.player_stats enable row level security;
revoke all on public.player_stats from anon;
revoke insert, update, delete on public.player_stats from authenticated;
grant select on public.player_stats to authenticated;

drop policy if exists player_stats_select on public.player_stats;
create policy player_stats_select on public.player_stats
  for select to authenticated using (true);

-- Realtime (zaten ekliyse hata vermez)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_stats'
  ) then
    alter publication supabase_realtime add table public.player_stats;
  end if;
end $$;

-- =====================================================================
-- 5. YARIŞ SONUCU SÜTUNLARI
-- finish_game XP'yi yarış başına bir kez uygular (games.xp_applied);
-- ikinci çağrıda sonuç bu sütunlardan okunur.
-- =====================================================================
alter table public.game_players add column if not exists xp_gained int;
alter table public.game_players add column if not exists xp_before int;
alter table public.game_players add column if not exists xp_after int;
alter table public.game_players add column if not exists xp_participation int;
alter table public.game_players add column if not exists xp_points int;
alter table public.game_players add column if not exists xp_placement int;
alter table public.game_players add column if not exists xp_first int;

alter table public.games add column if not exists xp_applied boolean not null default false;

-- =====================================================================
-- 6. YARDIMCI FONKSİYONLAR
-- =====================================================================

-- Verilen XP'nin rankı: min_xp <= p_xp olan en yüksek satır
create or replace function public.rank_of(p_xp int)
returns table(rank_key text, rank_label text, min_xp int)
language sql
stable
security definer
set search_path = public
as $$
  select t.rank_key, t.rank_label, t.min_xp
  from public.rank_tiers t
  where t.min_xp <= p_xp
  order by t.min_xp desc
  limit 1;
$$;

-- Bir sonraki rank: min_xp > p_xp olan en düşük satır (Efsane'de boş döner)
create or replace function public.next_rank_of(p_xp int)
returns table(rank_label text, min_xp int)
language sql
stable
security definer
set search_path = public
as $$
  select t.rank_label, t.min_xp
  from public.rank_tiers t
  where t.min_xp > p_xp
  order by t.min_xp asc
  limit 1;
$$;

-- Çağıran oyuncunun XP/rank özeti. Satırı yoksa 0 değerleriyle oluşturur.
create or replace function public.get_my_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_xp int := 0;
  v_wins int := 0;
  v_played int := 0;
  v_cur record;
  v_next record;
  v_pct int;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  -- Profil varsa satırı oluştur (player_stats.user_id profiles'a bağlı)
  if exists (select 1 from public.profiles where id = v_uid) then
    insert into public.player_stats (user_id) values (v_uid) on conflict do nothing;
  end if;

  select ps.xp, ps.wins, ps.games_played into v_xp, v_wins, v_played
  from public.player_stats ps where ps.user_id = v_uid;
  v_xp := coalesce(v_xp, 0);
  v_wins := coalesce(v_wins, 0);
  v_played := coalesce(v_played, 0);

  select * into v_cur from public.rank_of(v_xp);
  select * into v_next from public.next_rank_of(v_xp);

  if v_next.min_xp is null then
    v_pct := 100; -- Efsane: sonraki rank yok
  else
    v_pct := round(100.0 * (v_xp - v_cur.min_xp) / (v_next.min_xp - v_cur.min_xp))::int;
  end if;

  return json_build_object(
    'xp', v_xp,
    'rank_key', v_cur.rank_key,
    'rank_label', v_cur.rank_label,
    'next_rank_label', v_next.rank_label,
    'xp_to_next', case when v_next.min_xp is null then null else v_next.min_xp - v_xp end,
    'progress_pct', v_pct,
    'wins', v_wins,
    'games_played', v_played
  );
end;
$$;

revoke all on function public.rank_of(int) from public, anon;
grant execute on function public.rank_of(int) to authenticated;
revoke all on function public.next_rank_of(int) from public, anon;
grant execute on function public.next_rank_of(int) to authenticated;
revoke all on function public.get_my_stats() from public, anon;
grant execute on function public.get_my_stats() to authenticated;

-- =====================================================================
-- 7. question_label: 18 YKS eşlemesi aynı + 6 LGS
-- =====================================================================
create or replace function public.question_label(source_table text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case source_table
    when 'matematik_tyt'   then 'Matematik (TYT)'
    when 'turkce_tyt'      then 'Türkçe (TYT)'
    when 'kimya_tyt'       then 'Kimya (TYT)'
    when 'fizik_tyt'       then 'Fizik (TYT)'
    when 'biyoloji_tyt'    then 'Biyoloji (TYT)'
    when 'tarih_tyt'       then 'Tarih (TYT)'
    when 'cografya_tyt'    then 'Coğrafya (TYT)'
    when 'felsefe_tyt'     then 'Felsefe (TYT)'
    when 'din_kulturu_tyt' then 'Din Kültürü (TYT)'
    when 'fizik_ayt'       then 'Fizik (AYT)'
    when 'kimya_ayt'       then 'Kimya (AYT)'
    when 'biyoloji_ayt'    then 'Biyoloji (AYT)'
    when 'matematik_ayt'   then 'Matematik (AYT)'
    when 'edebiyat_ayt'    then 'Edebiyat (AYT)'
    when 'tarih_ayt'       then 'Tarih (AYT)'
    when 'cografya_ayt'    then 'Coğrafya (AYT)'
    when 'felsefe_ayt'     then 'Felsefe (AYT)'
    when 'din_kulturu_ayt' then 'Din Kültürü (AYT)'
    when 'turkce_lgs'      then 'Türkçe (LGS)'
    when 'inkilap_lgs'     then 'T.C. İnkılap Tarihi ve Atatürkçülük (LGS)'
    when 'din_kulturu_lgs' then 'Din Kültürü ve Ahlak Bilgisi (LGS)'
    when 'ingilizce_lgs'   then 'İngilizce (LGS)'
    when 'matematik_lgs'   then 'Matematik (LGS)'
    when 'fen_lgs'         then 'Fen Bilimleri (LGS)'
    else source_table
  end;
$$;

revoke all on function public.question_label(text) from public, anon, authenticated;

-- =====================================================================
-- 8. create_game: 0002'deki mantığın aynısı; yalnızca dağılım genişledi
-- =====================================================================
create or replace function public.create_game(p_kategori text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dist jsonb;
  v_row record;
  v_picked uuid[];
  v_id uuid;
  v_tabs text[] := '{}';
  v_qids uuid[] := '{}';
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_game_id uuid;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Önce profil oluştur';
  end if;

  -- Kategori başına soru dağılımı (docs/PROJE.md ile aynı)
  v_dist := case p_kategori
    when 'sayisal' then
      '{"fizik_ayt":2,"kimya_ayt":2,"biyoloji_ayt":2,"matematik_ayt":4}'::jsonb
    when 'esit_agirlik' then
      '{"tarih_ayt":1,"cografya_ayt":1,"felsefe_ayt":1,"din_kulturu_ayt":1,"matematik_ayt":2,"edebiyat_ayt":4}'::jsonb
    when 'sozel' then
      '{"edebiyat_ayt":4,"tarih_ayt":2,"cografya_ayt":2,"felsefe_ayt":1,"din_kulturu_ayt":1}'::jsonb
    when 'tyt' then
      '{"turkce_tyt":1,"matematik_tyt":2,"kimya_tyt":1,"fizik_tyt":1,"biyoloji_tyt":1,"tarih_tyt":1,"cografya_tyt":1,"felsefe_tyt":1,"din_kulturu_tyt":1}'::jsonb
    when 'lgs_sozel' then
      '{"turkce_lgs":4,"inkilap_lgs":2,"din_kulturu_lgs":2,"ingilizce_lgs":2}'::jsonb
    when 'lgs_sayisal' then
      '{"matematik_lgs":5,"fen_lgs":5}'::jsonb
    else null
  end;
  if v_dist is null then raise exception 'Geçersiz kategori'; end if;

  -- Her tablodan rastgele aktif sorular
  for v_row in select key as tablo, value::int as adet from jsonb_each_text(v_dist) loop
    execute format(
      'select array_agg(id) from (select id from public.%I where aktif order by random() limit %s) s',
      v_row.tablo, v_row.adet
    ) into v_picked;
    if coalesce(array_length(v_picked, 1), 0) < v_row.adet then
      raise exception 'Bu kategori için yeterli soru yok: %', v_row.tablo;
    end if;
    foreach v_id in array v_picked loop
      v_tabs := v_tabs || v_row.tablo;
      v_qids := v_qids || v_id;
    end loop;
  end loop;

  -- Benzersiz kod (games.code tüm oyunlar arasında unique olduğundan bitmiş oyunlar da hariç tutulur)
  loop
    v_code := 'QZ-' || (
      select string_agg(substr(v_alpha, 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 4)
    );
    exit when not exists (select 1 from public.games where code = v_code);
  end loop;

  insert into public.games (code, kategori, host_id)
  values (v_code, p_kategori, v_uid)
  returning id into v_game_id;

  -- Soruları rastgele sıraya diz (position 0..9)
  insert into public.game_questions (game_id, position, source_table, question_id)
  select v_game_id, (row_number() over (order by random()) - 1)::int, t.tab, t.qid
  from unnest(v_tabs, v_qids) as t(tab, qid);

  insert into public.game_players (game_id, user_id) values (v_game_id, v_uid);

  return json_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

revoke all on function public.create_game(text) from public, anon;
grant execute on function public.create_game(text) to authenticated;

-- =====================================================================
-- 9. game_snapshot: get_game ve get_game_by_id bu fonksiyonu çağırır,
-- bu yüzden ikisinin imzası/gövdesi değişmeden çıktıları güncellenir.
--  - game nesnesi to_jsonb(g) olduğundan yeni 'sinav' sütunu otomatik gelir.
--  - her oyuncuya rank_key / rank_label eklenir (player_stats yoksa xp = 0).
-- =====================================================================
create or replace function public.game_snapshot(p_game_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'game', to_jsonb(g),
    'players', coalesce((
      select json_agg(json_build_object(
        'user_id', gp.user_id,
        'display_name', pr.display_name,
        'avatar_key', pr.avatar_key,
        'photo_url', pr.photo_url,
        'score', gp.score,
        'current_q', gp.current_q,
        'correct_count', gp.correct_count,
        'wrong_count', gp.wrong_count,
        'finished', gp.finished_at is not null,
        'total_time_ms', gp.total_time_ms,
        'rank_key', rk.rank_key,
        'rank_label', rk.rank_label
      ) order by gp.joined_at, gp.user_id)
      from public.game_players gp
      join public.profiles pr on pr.id = gp.user_id
      left join public.player_stats ps on ps.user_id = gp.user_id
      left join lateral public.rank_of(coalesce(ps.xp, 0)) rk on true
      where gp.game_id = g.id
    ), '[]'::json)
  )
  from public.games g
  where g.id = p_game_id;
$$;

revoke all on function public.game_snapshot(uuid) from public, anon, authenticated;
