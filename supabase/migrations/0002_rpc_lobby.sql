-- Quizora — 0002 lobi RPC'leri
-- create_game, join_game, start_game, get_game, get_game_by_id, server_time
-- Yeniden çalıştırılabilir (create or replace / if not exists).

-- =====================================================================
-- 1. Ayarlar tablosu (istemci erişimi yok)
-- =====================================================================
create table if not exists public.app_settings (
  key text primary key,
  value text
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Geliştirirken 1'e indirmek için SQL Editor'de:
--   update app_settings set value = '1' where key = 'min_players';
insert into public.app_settings (key, value) values ('min_players', '2')
on conflict (key) do nothing;

-- Lobiyi başlatmak için gereken en az oyuncu sayısı
create or replace function public.min_players()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value::int from public.app_settings where key = 'min_players'), 2);
$$;

-- =====================================================================
-- 2. Yardımcılar
-- =====================================================================

-- Kalan süre (ms). src/lib/scoring.ts içindeki remainingMs ile birebir aynı mantık.
create or replace function public.remaining_ms(g public.games, p_at timestamptz default now())
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when g.started_at is null then g.duration_ms
    when g.speedup_at is null or g.speedup_remaining_ms is null then
      greatest(0, g.duration_ms - (extract(epoch from (p_at - g.started_at)) * 1000))::int
    else
      greatest(0, g.speedup_remaining_ms - 2 * (extract(epoch from (p_at - g.speedup_at)) * 1000))::int
  end;
$$;

-- Tablo adı -> ders etiketi
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
    else source_table
  end;
$$;

-- Oyun + oyuncular JSON'u (yetki kontrolü çağıran fonksiyonda yapılır)
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
        'total_time_ms', gp.total_time_ms
      ) order by gp.joined_at, gp.user_id)
      from public.game_players gp
      join public.profiles pr on pr.id = gp.user_id
      where gp.game_id = g.id
    ), '[]'::json)
  )
  from public.games g
  where g.id = p_game_id;
$$;

-- =====================================================================
-- 3. server_time
-- =====================================================================
create or replace function public.server_time()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;
  return (extract(epoch from clock_timestamp()) * 1000)::bigint;
end;
$$;

-- =====================================================================
-- 4. create_game
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

-- =====================================================================
-- 5. join_game
-- =====================================================================
create or replace function public.join_game(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  -- Aynı anda katılımlarda sayım yarışını önlemek için oyun satırını kilitle
  select * into v_game from public.games where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Kod bulunamadı'; end if;

  -- Zaten üyeyse yeniden bağlanma (oyun başlamış olsa da)
  if exists (select 1 from public.game_players where game_id = v_game.id and user_id = v_uid) then
    return json_build_object('game_id', v_game.id);
  end if;

  if v_game.status <> 'lobby' then raise exception 'Oyun başladı'; end if;
  if (select count(*) from public.game_players where game_id = v_game.id) >= 5 then
    raise exception 'Lobi dolu';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Önce profil oluştur';
  end if;

  insert into public.game_players (game_id, user_id) values (v_game.id, v_uid);
  return json_build_object('game_id', v_game.id);
end;
$$;

-- =====================================================================
-- 6. start_game
-- =====================================================================
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_min int := public.min_players();
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Oyun bulunamadı'; end if;
  if v_game.host_id <> v_uid then raise exception 'Sadece host başlatabilir'; end if;
  if v_game.status <> 'lobby' then raise exception 'Oyun zaten başladı'; end if;
  if (select count(*) from public.game_players where game_id = p_game_id) < v_min then
    raise exception 'En az % oyuncu gerekli', v_min;
  end if;

  -- 3 sn geri sayımdan sonra başlar
  update public.games
  set status = 'playing', started_at = now() + interval '3 seconds'
  where id = p_game_id;

  update public.game_players
  set current_q = 0, q_started_at = null
  where game_id = p_game_id;
end;
$$;

-- =====================================================================
-- 7. get_game / get_game_by_id (yalnızca üyeler görür)
-- =====================================================================
create or replace function public.get_game(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  select id into v_id from public.games where code = upper(trim(p_code));
  if v_id is null then raise exception 'Kod bulunamadı'; end if;
  if not exists (select 1 from public.game_players where game_id = v_id and user_id = v_uid) then
    raise exception 'Bu oyuna erişimin yok';
  end if;
  return public.game_snapshot(v_id);
end;
$$;

create or replace function public.get_game_by_id(p_game_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Oyun bulunamadı';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_uid) then
    raise exception 'Bu oyuna erişimin yok';
  end if;
  return public.game_snapshot(p_game_id);
end;
$$;

-- =====================================================================
-- 8. Yetkiler
-- =====================================================================
-- İç yardımcılar: istemci doğrudan çağıramaz (yalnızca diğer RPC'ler kullanır)
revoke all on function public.min_players() from public, anon, authenticated;
revoke all on function public.remaining_ms(public.games, timestamptz) from public, anon, authenticated;
revoke all on function public.question_label(text) from public, anon, authenticated;
revoke all on function public.game_snapshot(uuid) from public, anon, authenticated;

-- İstemci RPC'leri: yalnızca giriş yapmış kullanıcı
revoke all on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;
revoke all on function public.create_game(text) from public, anon;
grant execute on function public.create_game(text) to authenticated;
revoke all on function public.join_game(text) from public, anon;
grant execute on function public.join_game(text) to authenticated;
revoke all on function public.start_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;
revoke all on function public.get_game(text) from public, anon;
grant execute on function public.get_game(text) to authenticated;
revoke all on function public.get_game_by_id(uuid) from public, anon;
grant execute on function public.get_game_by_id(uuid) to authenticated;
