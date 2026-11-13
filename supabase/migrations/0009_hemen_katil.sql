-- Quizora — 0009 "Hemen Katıl" (hızlı eşleşme)
-- Yeni: games.is_public / auto_start_at / last_activity_at, _create_game_internal,
--       quick_join, start_if_ready, leave_game; join_game güncellemesi.
-- create_game AYNI imza ve davranışla kalır (özel lobi). Yeniden çalıştırılabilir.
-- Kilit sırası lobide hep: games satırı → game_players (kilitlenme riskini önler).
--
-- NOT (get_game / get_game_by_id): ikisi de game_snapshot() üzerinden to_jsonb(games) döndürür;
-- bu yüzden yeni is_public ve auto_start_at alanları game nesnesine OTOMATİK gelir,
-- fonksiyonların yeniden tanımlanmasına gerek yoktur (imza ve diğer alanlar değişmez).

-- =====================================================================
-- 1. Sütunlar ve index
-- =====================================================================
alter table public.games add column if not exists is_public boolean not null default false;
alter table public.games add column if not exists auto_start_at timestamptz;
alter table public.games add column if not exists last_activity_at timestamptz not null default now();

create index if not exists games_lobby_public_idx on public.games (status, is_public, kategori);

-- =====================================================================
-- 2. _create_game_internal: create_game'in gövdesi (0003'teki mantığın aynısı)
-- İstemciye KAPALI; yalnızca create_game ve quick_join çağırır.
-- =====================================================================
create or replace function public._create_game_internal(p_kategori text, p_host uuid, p_public boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if p_host is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from public.profiles where id = p_host) then
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

  insert into public.games (code, kategori, host_id, is_public, last_activity_at)
  values (v_code, p_kategori, p_host, p_public, now())
  returning id into v_game_id;

  -- Soruları rastgele sıraya diz (position 0..9)
  insert into public.game_questions (game_id, position, source_table, question_id)
  select v_game_id, (row_number() over (order by random()) - 1)::int, t.tab, t.qid
  from unnest(v_tabs, v_qids) as t(tab, qid);

  insert into public.game_players (game_id, user_id) values (v_game_id, p_host);

  return json_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

revoke all on function public._create_game_internal(text, uuid, boolean) from public, anon, authenticated;

-- =====================================================================
-- 3. create_game: aynı imza, aynı çıktı ve hata mesajları; hep ÖZEL lobi
-- =====================================================================
create or replace function public.create_game(p_kategori text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  return public._create_game_internal(p_kategori, v_uid, false);
end;
$$;

revoke all on function public.create_game(text) from public, anon;
grant execute on function public.create_game(text) to authenticated;

-- =====================================================================
-- 4. quick_join: aynı kategoride uygun herkese açık lobiye ekle, yoksa yeni aç
-- =====================================================================
create or replace function public.quick_join(p_kategori text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_n int;
  v_new json;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Önce profil oluştur';
  end if;
  if p_kategori is null or p_kategori not in ('sayisal','esit_agirlik','sozel','tyt','lgs_sozel','lgs_sayisal') then
    raise exception 'Geçersiz kategori';
  end if;

  -- Kategori başına işlemleri sıraya diz (aynı anda gelenler tek lobide toplanır)
  perform pg_advisory_xact_lock(hashtext('quick_join:' || p_kategori));

  -- Zaten bu kategoride taze, herkese açık bir lobinin üyesiyse onu döndür
  select g.* into v_game
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = v_uid
  where g.status = 'lobby' and g.is_public and g.kategori = p_kategori
    and g.last_activity_at > now() - interval '2 minutes'
  order by g.created_at desc
  limit 1;
  if found then
    return json_build_object('game_id', v_game.id, 'code', v_game.code, 'created', false);
  end if;

  -- Aday lobi: aynı kategori, dolu değil, bayat değil, başlamak üzere değil, üye değil
  select g.* into v_game
  from public.games g
  where g.status = 'lobby'
    and g.is_public
    and g.kategori = p_kategori
    and g.last_activity_at > now() - interval '2 minutes'
    and (g.auto_start_at is null or g.auto_start_at > now() + interval '4 seconds')
    and (select count(*) from public.game_players gp where gp.game_id = g.id) < 5
    and not exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = v_uid)
  order by (select count(*) from public.game_players gp where gp.game_id = g.id) desc, g.created_at asc
  limit 1
  for update of g skip locked;

  if found then
    insert into public.game_players (game_id, user_id) values (v_game.id, v_uid);
    select count(*) into v_n from public.game_players where game_id = v_game.id;
    update public.games
    set last_activity_at = now(),
        auto_start_at = case
          when v_n >= 5 then now()
          when v_n = 2 then now() + interval '10 seconds'
          else auto_start_at
        end
    where id = v_game.id;
    return json_build_object('game_id', v_game.id, 'code', v_game.code, 'created', false);
  end if;

  -- Uygun lobi yok: yeni herkese açık lobi
  v_new := public._create_game_internal(p_kategori, v_uid, true);
  return json_build_object('game_id', v_new->>'game_id', 'code', v_new->>'code', 'created', true);
end;
$$;

revoke all on function public.quick_join(text) from public, anon;
grant execute on function public.quick_join(text) to authenticated;

-- =====================================================================
-- 5. start_if_ready: süre dolunca herkese açık lobiyi başlatır (idempotent)
-- Koşullar sağlanmıyorsa hata VERMEZ, hiçbir şey yapmaz.
-- =====================================================================
create or replace function public.start_if_ready(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_uid) then
    raise exception 'Bu oyuna erişimin yok';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then return; end if;

  if v_game.status = 'lobby'
     and v_game.is_public
     and v_game.auto_start_at is not null
     and v_game.auto_start_at <= now()
     and (select count(*) from public.game_players where game_id = p_game_id) >= public.min_players() then
    -- start_game ile aynı: 3 sn geri sayımdan sonra başlar
    update public.games
    set status = 'playing', started_at = now() + interval '3 seconds'
    where id = p_game_id;

    update public.game_players
    set current_q = 0, q_started_at = null
    where game_id = p_game_id;
  end if;
end;
$$;

revoke all on function public.start_if_ready(uuid) from public, anon;
grant execute on function public.start_if_ready(uuid) to authenticated;

-- =====================================================================
-- 6. leave_game: lobiden çık
-- =====================================================================
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_n int;
  v_new_host uuid;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  -- Kilit sırası: önce games, sonra game_players
  select * into v_game from public.games where id = p_game_id for update;
  if not found
     or not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_uid) then
    raise exception 'Bu oyuna erişimin yok';
  end if;
  if v_game.status <> 'lobby' then raise exception 'Oyun başladı'; end if;

  delete from public.game_players where game_id = p_game_id and user_id = v_uid;
  select count(*) into v_n from public.game_players where game_id = p_game_id;

  -- Kimse kalmadıysa oyunu sil (game_questions vb. cascade ile gider)
  if v_n = 0 then
    delete from public.games where id = p_game_id;
    return;
  end if;

  -- Host ayrıldıysa en eski oyuncuya devret
  v_new_host := v_game.host_id;
  if v_game.host_id = v_uid then
    select user_id into v_new_host
    from public.game_players
    where game_id = p_game_id
    order by joined_at asc, user_id asc
    limit 1;
  end if;

  update public.games
  set host_id = v_new_host,
      last_activity_at = now(),
      auto_start_at = case when is_public and v_n < 2 then null else auto_start_at end
  where id = p_game_id;
end;
$$;

revoke all on function public.leave_game(uuid) from public, anon;
grant execute on function public.leave_game(uuid) to authenticated;

-- =====================================================================
-- 7. join_game: mevcut mesajlar korunur; herkese açık lobi kuralları eklenir
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
  v_n int;
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
  -- Herkese açık lobide geri sayım bittiyse yeni oyuncu alınmaz
  if v_game.is_public and v_game.auto_start_at is not null and v_game.auto_start_at <= now() then
    raise exception 'Oyun başlamak üzere';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Önce profil oluştur';
  end if;

  insert into public.game_players (game_id, user_id) values (v_game.id, v_uid);
  select count(*) into v_n from public.game_players where game_id = v_game.id;

  update public.games
  set last_activity_at = now(),
      auto_start_at = case
        when not is_public then auto_start_at
        when v_n >= 5 then now()
        when v_n = 2 then now() + interval '10 seconds'
        else auto_start_at
      end
  where id = v_game.id;

  return json_build_object('game_id', v_game.id);
end;
$$;

revoke all on function public.join_game(text) from public, anon;
grant execute on function public.join_game(text) to authenticated;
