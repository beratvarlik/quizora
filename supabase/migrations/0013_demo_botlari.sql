-- Quizora — 0013 Demo botları (Hemen Katıl için sanal rakipler)
-- AMAÇ: demo sırasında herkese açık lobide TEK başına bekleyen insana sanal rakipler katılır, yarış normal akışta oynanır.
-- VARSAYILAN KAPALI (app_settings.bot_modu = 'kapali'). Arka plan işi / pg_cron / Edge Function YOK:
-- botlar lobi ve oyun sırasında get_game / get_game_by_id / finish_game çağrılarıyla "tembel" ilerletilir.
-- Botlar kendilerini dürüstçe gösterir: adları "(bot)" ile biter, game_snapshot'ta is_bot = true.
-- Botlar liderlik tablosuna ve player_stats'a HİÇ girmez; botlu oyunda insan yalnızca katılım + puan XP'si alır, wins artmaz.
-- Yeniden çalıştırılabilir. Eski migration'lara dokunulmaz. İç fonksiyonlara istemci erişimi YOK.
--
-- Açma / kapama (Supabase SQL Editor):
--   update app_settings set value = 'acik'   where key = 'bot_modu';
--   update app_settings set value = 'kapali' where key = 'bot_modu';
-- Botlar önce scripts/bot-olustur.ts ile oluşturulur.
--
-- Tasarım notları:
-- * Kilit sırası bozulmaz: lobide önce games sonra game_players; oyun sırasında önce oyuncu satırları sonra games
--   (submit_answer / finish_game ile aynı). Bu yüzden finish_game bot işlemeyi, kendi kilitlerini aldıktan SONRA çağırır.
-- * Bot ilerletme deterministiktir: aynı oyun için her çağrıda aynı plan (hash tabanlı); çağrı sıklığı sonucu değiştirmez.
-- * Bot, ilk bitiren olursa 2x modunu submit_answer ile aynı mantıkla tetikler (speedup_at boşsa).

-- =====================================================================
-- 1. Tablo / sütun / ayarlar
-- =====================================================================
alter table public.profiles add column if not exists is_bot boolean not null default false;

create table if not exists public.bot_profilleri (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dogruluk numeric not null check (dogruluk >= 0 and dogruluk <= 1),   -- doğru cevap olasılığı
  ort_sure_sn numeric not null check (ort_sure_sn > 0)                 -- soru başına ortalama cevap süresi (sn)
);
alter table public.bot_profilleri enable row level security;
revoke all on public.bot_profilleri from anon, authenticated;
-- policy yok: istemci erişimi yok

insert into public.app_settings (key, value) values ('bot_modu', 'kapali') on conflict (key) do nothing;
insert into public.app_settings (key, value) values ('bot_sayisi', '2') on conflict (key) do nothing;
insert into public.app_settings (key, value) values ('bot_bekleme_sn', '7') on conflict (key) do nothing;

-- İstemci profiline is_bot yazamaz (kendini "bot" yapamaz, bot profili ekleyemez). Servis anahtarı / SQL Editor serbest.
create or replace function public._profil_is_bot_koru()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.is_bot := false;
    elsif new.is_bot is distinct from old.is_bot then
      new.is_bot := old.is_bot;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_is_bot_koru on public.profiles;
create trigger profiles_is_bot_koru
  before insert or update on public.profiles
  for each row execute function public._profil_is_bot_koru();

-- =====================================================================
-- 2. Ayar okuma yardımcıları (iç)
-- =====================================================================
create or replace function public._bot_modu_acik()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = 'bot_modu'), 'kapali') = 'acik'
$$;

-- Lobiye eklenecek bot sayısı (1-4; insan dahil toplam en çok 5)
create or replace function public._bot_sayisi()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select least(greatest(coalesce((select value::int from public.app_settings where key = 'bot_sayisi'), 2), 1), 4)
$$;

-- İnsanın tek başına beklemesi gereken süre (sn)
create or replace function public._bot_bekleme_sn()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select least(greatest(coalesce((select value::numeric from public.app_settings where key = 'bot_bekleme_sn'), 7), 0), 600)
$$;

-- Deterministik [0,1) değer (aynı tohum → aynı sayı)
create or replace function public._bot_u(p_tohum text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select (((hashtextextended(p_tohum, 0) % 1000000) + 1000000) % 1000000) / 1000000.0
$$;

-- =====================================================================
-- 3. bot_doldur: tek başına bekleyen insanın herkese açık lobisine bot ekler
-- Koşullar (hepsi, kilit altında): bot modu açık; lobi + herkese açık; içinde TAM 1 insan ve 0 bot;
-- insan en az bot_bekleme_sn bekledi; toplam <= 5. Eklenince auto_start_at = now() + 5 sn. Idempotent.
-- =====================================================================
create or replace function public.bot_doldur(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_insan int;
  v_bot int;
  v_katilis timestamptz;
  v_say int;
  v_botlar uuid[];
begin
  if not public._bot_modu_acik() then return; end if;

  -- Ucuz ön kontrol (kilitsiz): çoğu çağrı burada biter
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'lobby' or not v_game.is_public then return; end if;
  select count(*) filter (where not pr.is_bot), count(*) filter (where pr.is_bot)
  into v_insan, v_bot
  from public.game_players gp join public.profiles pr on pr.id = gp.user_id
  where gp.game_id = p_game_id;
  if v_insan <> 1 or v_bot <> 0 then return; end if;

  -- Kilit altında koşullar yeniden kontrol edilir (lobide kilit sırası: önce games)
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'lobby' or not v_game.is_public then return; end if;
  select count(*) filter (where not pr.is_bot), count(*) filter (where pr.is_bot), min(gp.joined_at) filter (where not pr.is_bot)
  into v_insan, v_bot, v_katilis
  from public.game_players gp join public.profiles pr on pr.id = gp.user_id
  where gp.game_id = p_game_id;
  if v_insan <> 1 or v_bot <> 0 then return; end if;
  if v_katilis > now() - make_interval(secs => public._bot_bekleme_sn()::double precision) then return; end if;

  v_say := least(public._bot_sayisi(), 5 - v_insan);
  -- En hızlı bot önce (Ada): sıra ort_sure_sn artan
  select array_agg(s.user_id order by s.ort_sure_sn, s.user_id) into v_botlar
  from (
    select bp.user_id, bp.ort_sure_sn
    from public.bot_profilleri bp
    join public.profiles pr on pr.id = bp.user_id and pr.is_bot
    order by bp.ort_sure_sn, bp.user_id
    limit v_say
  ) s;
  if v_botlar is null or cardinality(v_botlar) = 0 then return; end if;

  insert into public.game_players (game_id, user_id)
  select p_game_id, b from unnest(v_botlar) as b
  on conflict do nothing;

  update public.games
  set auto_start_at = now() + interval '5 seconds',
      last_activity_at = now()
  where id = p_game_id;
end;
$$;

-- =====================================================================
-- 4. _bot_isle: botların zamanı gelmiş cevaplarını yazar (İÇ İŞÇİ; kilitler ÇAĞIRANDA alınmış olmalı)
-- Plan (deterministik): d_j = max(2, ort_sure_sn * (0.6 + 0.8 * u_j)) sn; bot j. soruyu started_at + (d_0..d_j toplamı) anında bitirir.
-- Doğru mu: u'_j < dogruluk; değilse soruda olan doğru olmayan şıklardan biri (LGS 4, YKS 5 şık).
-- Puan scoring.ts / submit_answer ile aynı: doğru 100 + round(100 * max(0, 1 - sure/20)), yanlış -25.
-- Yalnızca t_i <= now() ve t_i <= oyun bitişi olan cevaplar yazılır; zaten yazılmış pozisyonlar atlanır.
-- =====================================================================
create or replace function public._bot_isle(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_bot record;
  v_gq public.game_questions;
  v_bitis timestamptz;
  v_t timestamptz;
  v_kum numeric;
  v_d numeric;
  v_j int;
  v_cur int;
  v_correct text;
  v_has_e boolean;
  v_siklar text[];
  v_yanlis text[];
  v_secenek text;
  v_dogru boolean;
  v_sure_ms int;
  v_puan int;
  v_yazildi int;
  v_biten boolean;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'playing' or v_game.started_at is null then return; end if;

  for v_bot in
    select gp.user_id, bp.dogruluk, bp.ort_sure_sn
    from public.game_players gp
    join public.profiles pr on pr.id = gp.user_id and pr.is_bot
    join public.bot_profilleri bp on bp.user_id = gp.user_id
    where gp.game_id = p_game_id and gp.finished_at is null
    order by gp.user_id
  loop
    v_kum := 0;
    for v_j in 0 .. v_game.total_questions - 1 loop
      -- Planlanan süre (deterministik)
      v_d := greatest(2, v_bot.ort_sure_sn * (0.6 + 0.8 * public._bot_u(p_game_id::text || v_bot.user_id::text || v_j::text)));
      v_kum := v_kum + v_d;
      v_t := v_game.started_at + make_interval(secs => v_kum::double precision);

      select current_q into v_cur from public.game_players where game_id = p_game_id and user_id = v_bot.user_id;
      if v_j < v_cur then continue; end if;   -- zaten işlenmiş
      if v_j <> v_cur then exit; end if;      -- beklenmeyen durum: güvenli çık

      -- Oyun bitişi (2x modu bir bot tarafından tetiklenmiş olabilir: her seferinde güncel oyun satırı)
      select * into v_game from public.games where id = p_game_id;
      v_bitis := case
        when v_game.speedup_at is null or v_game.speedup_remaining_ms is null
          then v_game.started_at + make_interval(secs => (v_game.duration_ms / 1000.0)::double precision)
        else v_game.speedup_at + make_interval(secs => (v_game.speedup_remaining_ms / 2000.0)::double precision)
      end;
      if v_t > now() or v_t > v_bitis then exit; end if;

      select * into v_gq from public.game_questions where game_id = p_game_id and position = v_j;
      if not found then exit; end if;

      v_correct := null; v_has_e := false;
      execute format('select trim(dogru_sik::text), secenek_e is not null from public.%I where id = $1', v_gq.source_table)
      into v_correct, v_has_e
      using v_gq.question_id;

      v_sure_ms := round(v_d * 1000)::int;
      if v_correct is null then
        -- Soru silinmiş: boş say
        v_secenek := null; v_dogru := null; v_puan := 0;
      else
        v_siklar := array['A', 'B', 'C', 'D'] || case when v_has_e then array['E'] else array[]::text[] end;
        if public._bot_u('d|' || p_game_id::text || v_bot.user_id::text || v_j::text) < v_bot.dogruluk then
          v_secenek := v_correct; v_dogru := true;
          v_puan := 100 + round(100 * greatest(0, 1 - (v_sure_ms / 1000.0) / 20.0))::int;
        else
          v_yanlis := array_remove(v_siklar, v_correct);
          v_secenek := v_yanlis[1 + floor(public._bot_u('y|' || p_game_id::text || v_bot.user_id::text || v_j::text) * cardinality(v_yanlis))::int];
          v_dogru := false; v_puan := -25;
        end if;
      end if;

      insert into public.answers (game_id, user_id, position, secenek, dogru, sure_ms, puan, answered_at)
      values (p_game_id, v_bot.user_id, v_j, v_secenek, v_dogru, v_sure_ms, v_puan, v_t)
      on conflict (game_id, user_id, position) do nothing;
      get diagnostics v_yazildi = row_count;
      if v_yazildi = 0 then continue; end if;

      v_biten := (v_j + 1) >= v_game.total_questions;
      update public.game_players
      set score = score + v_puan,
          correct_count = correct_count + case when v_dogru is true then 1 else 0 end,
          wrong_count = wrong_count + case when v_dogru is false then 1 else 0 end,
          total_time_ms = total_time_ms + v_sure_ms,
          current_q = v_j + 1,
          q_started_at = null,
          finished_at = case when v_biten then v_t else finished_at end
      where game_id = p_game_id and user_id = v_bot.user_id;

      -- İlk bitiren: submit_answer ile aynı mantık (speedup_at boşsa 2x modunu başlat)
      if v_biten then
        select * into v_game from public.games where id = p_game_id;
        if v_game.speedup_at is null then
          update public.games
          set speedup_at = v_t,
              speedup_remaining_ms = public.remaining_ms(v_game, v_t),
              speedup_by = v_bot.user_id
          where id = p_game_id;
          select * into v_game from public.games where id = p_game_id;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

-- =====================================================================
-- 5. bot_ilerlet: oyun sırasında botları ilerletir (kilit sırası: önce bot oyuncu satırları, sonra games)
-- Kilit alınamazsa (başka bir işlem o satırlarda) hiçbir şey yapmadan çıkar: sonraki çağrıda yeniden denenir.
-- =====================================================================
create or replace function public.bot_ilerlet(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_durum text;
  v_bot int;
  v_kilitli int;
begin
  if not public._bot_modu_acik() then return; end if;

  select status into v_durum from public.games where id = p_game_id;
  if v_durum is distinct from 'playing' then return; end if;

  select count(*) into v_bot
  from public.game_players gp join public.profiles pr on pr.id = gp.user_id
  where gp.game_id = p_game_id and pr.is_bot and gp.finished_at is null;
  if v_bot = 0 then return; end if;

  -- Bot oyuncu satırlarını kilitle (alınamayan varsa çık)
  select count(*) into v_kilitli from (
    select gp.user_id
    from public.game_players gp join public.profiles pr on pr.id = gp.user_id
    where gp.game_id = p_game_id and pr.is_bot and gp.finished_at is null
    order by gp.user_id
    for update of gp skip locked
  ) k;
  if v_kilitli <> v_bot then return; end if;

  -- Oyun satırı: "for no key update" (submit_answer ile aynı; answers FK kilidiyle çakışmaz)
  perform 1 from public.games where id = p_game_id for no key update skip locked;
  if not found then return; end if;

  perform public._bot_isle(p_game_id);
end;
$$;

-- =====================================================================
-- 6. game_snapshot (0003 gövdesi + players[].is_bot)
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
        'is_bot', pr.is_bot,
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

-- =====================================================================
-- 7. get_game / get_game_by_id: aynı imza ve çıktı; çağıran üyeyse bot_doldur + bot_ilerlet.
-- Artık yazma yaptıkları için 'stable' DEĞİL (volatile). Bot modu kapalıyken tek ucuz ayar kontrolüyle geçilir.
-- =====================================================================
create or replace function public.get_game(p_code text)
returns json
language plpgsql
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
  if public._bot_modu_acik() then
    perform public.bot_doldur(v_id);
    perform public.bot_ilerlet(v_id);
  end if;
  return public.game_snapshot(v_id);
end;
$$;

create or replace function public.get_game_by_id(p_game_id uuid)
returns json
language plpgsql
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
  if public._bot_modu_acik() then
    perform public.bot_doldur(p_game_id);
    perform public.bot_ilerlet(p_game_id);
  end if;
  return public.game_snapshot(p_game_id);
end;
$$;

revoke all on function public.get_game(text) from public, anon;
revoke all on function public.get_game_by_id(uuid) from public, anon;
grant execute on function public.get_game(text) to authenticated;
grant execute on function public.get_game_by_id(uuid) to authenticated;

-- =====================================================================
-- 8. finish_game (0010 gövdesi + botlar)
-- =====================================================================
create or replace function public.finish_game(p_game_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_me public.game_players;
  v_n int;
  v_r record;
  v_winner uuid;
  v_answered boolean;
  v_part int;
  v_pts int;
  v_plc int;
  v_first int;
  v_gain int;
  v_before int;
  v_ranking json;
  v_correct int;
  v_wrong int;
  v_sum_correct int;
  v_has_bots boolean;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_uid) then
    if not exists (select 1 from public.games where id = p_game_id) then
      raise exception 'Oyun bulunamadı';
    end if;
    raise exception 'Bu oyuna erişimin yok';
  end if;

  -- Kilit sırası submit_answer ile aynı olmalı (önce oyuncu satırları, sonra oyun);
  -- aksi halde iki fonksiyon birbirini bekleyip kilitlenebilir (deadlock).
  perform 1 from public.game_players where game_id = p_game_id order by user_id for update;
  select * into v_game from public.games where id = p_game_id for update;

  -- Demo botları: bot cevaplarından zamanı gelenleri şimdi yaz (bot durumu güncel olsun).
  -- Kilitler yukarıda ALINDI (önce oyuncu satırları, sonra oyun): bot işleme kilit sırasını bozmaz, deadlock olmaz.
  if public._bot_modu_acik() and v_game.status = 'playing' then
    perform public._bot_isle(p_game_id);
    select * into v_game from public.games where id = p_game_id;
  end if;

  if v_game.status <> 'finished' then
    -- Yarış bitmiş sayılması için: süre dolmuş VEYA herkes bitirmiş
    if v_game.status = 'lobby' then raise exception 'Yarış henüz bitmedi'; end if;
    if public.remaining_ms(v_game) > 0
       and exists (select 1 from public.game_players where game_id = p_game_id and finished_at is null) then
      raise exception 'Yarış henüz bitmedi';
    end if;

    -- Bitirmemiş oyuncuları işaretle (cevaplanmayan sorular boş sayılır)
    update public.game_players set finished_at = now()
    where game_id = p_game_id and finished_at is null;

    select count(*) into v_n from public.game_players where game_id = p_game_id;
    select exists (select 1 from public.game_players gp2
                   join public.profiles pr2 on pr2.id = gp2.user_id
                   where gp2.game_id = p_game_id and pr2.is_bot) into v_has_bots;

    -- Sıralama: puan azalan, eşitlikte toplam süre artan, sonra katılım sırası
    for v_r in
      select gp.user_id, gp.score, gp.current_q, pr.is_bot,
             row_number() over (order by gp.score desc, gp.total_time_ms asc, gp.joined_at asc) as rn
      from public.game_players gp
      join public.profiles pr on pr.id = gp.user_id
      where gp.game_id = p_game_id
      order by rn
    loop
      if v_r.rn = 1 then v_winner := v_r.user_id; end if;

      v_answered := v_r.current_q >= 1;
      v_part := 0; v_pts := 0; v_plc := 0; v_first := 0;

      -- XP: yalnızca >= 2 oyunculu yarış ve en az bir cevap veren oyuncu
      if not v_game.xp_applied and v_n >= 2 and v_answered then
        v_part := 20;
        v_pts := greatest(0, floor(v_r.score / 10.0)::int);
        v_plc := case v_r.rn when 1 then 30 when 2 then 15 when 3 then 8 else 0 end;
        v_first := case when v_r.user_id = v_game.speedup_by then 10 else 0 end;
      end if;
      -- Demo botları: bot hiç XP almaz; botlu oyunda insan yalnızca katılım + puan XP'si alır
      -- (derece ve ilk bitiren bonusu yok, wins artmaz).
      if v_r.is_bot then
        v_part := 0; v_pts := 0; v_plc := 0; v_first := 0;
      elsif v_has_bots then
        v_plc := 0; v_first := 0;
      end if;
      v_gain := v_part + v_pts + v_plc + v_first;

      if not v_game.xp_applied then
        if v_r.is_bot then
          -- Bot: player_stats satırı OLUŞTURULMAZ ve GÜNCELLENMEZ
          v_before := 0;
        elsif v_n >= 2 then
          insert into public.player_stats (user_id) values (v_r.user_id) on conflict do nothing;
          -- Satırı kilitleyerek xp_before oku (eşzamanlı iki yarış aynı oyuncuyu ezmesin)
          select xp into v_before from public.player_stats where user_id = v_r.user_id for update;
          update public.player_stats
          set xp = xp + v_gain,
              games_played = games_played + case when v_answered then 1 else 0 end,
              wins = wins + case when v_r.rn = 1 and v_answered and not v_has_bots then 1 else 0 end,
              updated_at = now()
          where user_id = v_r.user_id;
        else
          -- Tek oyunculu (geliştirme modu): XP verilmez, xp_before = xp_after = mevcut XP
          select coalesce(max(xp), 0) into v_before from public.player_stats where user_id = v_r.user_id;
        end if;

        update public.game_players
        set xp_before = v_before,
            xp_after = v_before + v_gain,
            xp_gained = v_gain,
            xp_participation = v_part,
            xp_points = v_pts,
            xp_placement = v_plc,
            xp_first = v_first
        where game_id = p_game_id and user_id = v_r.user_id;
      end if;
    end loop;

    update public.games
    set status = 'finished', finished_at = now(), winner_id = v_winner, xp_applied = true
    where id = p_game_id;
  end if;

  -- Yanlışlarım defteri: bu oyundaki yanlış/boş cevapları deftere işler.
  -- Oyun başına BİR kez uygulanır (mistake_games işareti); finish_game kaç kez çağrılırsa çağrılsın
  -- wrong_count tekrar artmaz. Oyun 'finished' değilse hiçbir şey yapmaz.
  perform public._apply_mistakes(p_game_id);

  -- ---- Sonuç: ilk çağrıda da sonraki çağrılarda da aynı koddan okunur ----
  select * into v_game from public.games where id = p_game_id;

  select coalesce(json_agg(json_build_object(
    'rank', t.rn,
    'user_id', t.user_id,
    'display_name', t.display_name,
    'avatar_key', t.avatar_key,
    'photo_url', t.photo_url,
    'is_bot', t.is_bot,
    'score', t.score,
    'current_q', t.current_q,
    'correct_count', t.correct_count,
    'wrong_count', t.wrong_count,
    'finished', t.finished_at is not null,
    'total_time_ms', t.total_time_ms,
    'rank_key', ra.rank_key,
    'rank_label', ra.rank_label,
    'xp_gained', coalesce(t.xp_gained, 0),
    'xp_before', coalesce(t.xp_before, 0),
    'xp_after', coalesce(t.xp_after, 0),
    'rank_label_before', rb.rank_label,
    'rank_label_after', ra.rank_label,
    'ranked_up', rb.rank_label <> ra.rank_label
  ) order by t.rn), '[]'::json)
  into v_ranking
  from (
    select row_number() over (order by gp.score desc, gp.total_time_ms asc, gp.joined_at asc) as rn,
           gp.*, pr.display_name, pr.avatar_key, pr.photo_url, pr.is_bot
    from public.game_players gp
    join public.profiles pr on pr.id = gp.user_id
    where gp.game_id = p_game_id
  ) t
  left join lateral public.rank_of(coalesce(t.xp_after, 0)) ra on true
  left join lateral public.rank_of(coalesce(t.xp_before, 0)) rb on true;

  -- breakdown: çağıran oyuncunun cevaplarından
  select count(*) filter (where dogru is true),
         count(*) filter (where dogru is false),
         coalesce(sum(puan) filter (where dogru is true), 0)
  into v_correct, v_wrong, v_sum_correct
  from public.answers
  where game_id = p_game_id and user_id = v_uid;

  select * into v_me from public.game_players where game_id = p_game_id and user_id = v_uid;

  return json_build_object(
    'winner_id', v_game.winner_id,
    'ranking', v_ranking,
    'breakdown', json_build_object(
      'base', 100 * v_correct,
      'bonus', v_sum_correct - 100 * v_correct,
      'penalty', 25 * v_wrong,
      'correct', v_correct,
      'wrong', v_wrong,
      'blank', greatest(0, v_game.total_questions - v_correct - v_wrong)
    ),
    'xp_breakdown', json_build_object(
      'participation', coalesce(v_me.xp_participation, 0),
      'points', coalesce(v_me.xp_points, 0),
      'placement', coalesce(v_me.xp_placement, 0),
      'first_finisher', coalesce(v_me.xp_first, 0),
      'total', coalesce(v_me.xp_gained, 0)
    )
  );
end;
$$;

revoke all on function public.finish_game(uuid) from public, anon;
grant execute on function public.finish_game(uuid) to authenticated;

-- =====================================================================
-- 9. get_global_leaderboard: botlar HİÇ dönmez
-- =====================================================================
create or replace function public.get_global_leaderboard()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Oturum yok'; end if;

  return (
    select coalesce(json_agg(json_build_object(
      'user_id', t.user_id,
      'display_name', t.display_name,
      'avatar_key', t.avatar_key,
      'photo_url', t.photo_url,
      'xp', t.xp,
      'rank_key', rk.rank_key,
      'rank_label', rk.rank_label,
      'wins', t.wins,
      'games_played', t.games_played
    ) order by t.xp desc, t.wins desc, t.user_id), '[]'::json)
    from (
      select ps.user_id, pr.display_name, pr.avatar_key, pr.photo_url, ps.xp, ps.wins, ps.games_played
      from public.player_stats ps
      join public.profiles pr on pr.id = ps.user_id
      where not pr.is_bot
      order by ps.xp desc, ps.wins desc, ps.user_id
      limit 20
    ) t
    left join lateral public.rank_of(t.xp) rk on true
  );
end;
$$;

revoke all on function public.get_global_leaderboard() from public, anon;
grant execute on function public.get_global_leaderboard() to authenticated;

-- =====================================================================
-- 10. leave_game: yalnızca botlar kalırsa oyun silinir; host devri insana
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
  v_insan int;
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
  select count(*) into v_insan
  from public.game_players gp join public.profiles pr on pr.id = gp.user_id
  where gp.game_id = p_game_id and not pr.is_bot;

  -- Kimse kalmadıysa ya da yalnızca botlar kaldıysa oyunu sil (game_questions vb. cascade ile gider)
  if v_n = 0 or v_insan = 0 then
    delete from public.games where id = p_game_id;
    return;
  end if;

  -- Host ayrıldıysa en eski oyuncuya devret
  v_new_host := v_game.host_id;
  if v_game.host_id = v_uid then
    -- Önce insanlar (bot host olmasın), sonra en eski
    select gp.user_id into v_new_host
    from public.game_players gp join public.profiles pr on pr.id = gp.user_id
    where gp.game_id = p_game_id
    order by pr.is_bot, gp.joined_at asc, gp.user_id asc
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
-- 11. Botlar deftere ve görev ilerlemesine karışmasın
-- =====================================================================
create or replace function public._game_mistakes(p_game_id uuid)
returns table (uid uuid, qid uuid, tbl text, pos int, ans text)
language sql
stable
security definer
set search_path = public
as $$
  select gp.user_id, gq.question_id, gq.source_table, gq.position,
         nullif(trim(a.secenek::text), '')
  from public.game_players gp
  join public.profiles pb on pb.id = gp.user_id and not pb.is_bot
  join public.game_questions gq on gq.game_id = gp.game_id
  left join public.answers a
    on a.game_id = gp.game_id and a.user_id = gp.user_id and a.position = gq.position
  where gp.game_id = p_game_id
    and (a.id is null or a.dogru is not true)
    and (a.id is not null
         or gq.position < gp.current_q
         or (gq.position = gp.current_q and gp.q_started_at is not null))
$$;

revoke all on function public._game_mistakes(uuid) from public, anon, authenticated;

create or replace function public._daily_progress(p_uid uuid, p_day date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with gm as (
    select g.id, g.winner_id, g.is_public, gp.correct_count, gp.wrong_count,
           (select count(*) from public.game_players x
            join public.profiles px on px.id = x.user_id and not px.is_bot
            where x.game_id = g.id) as nplayers
    from public.games g
    join public.game_players gp on gp.game_id = g.id and gp.user_id = p_uid
    where g.status = 'finished'
      and gp.current_q >= 1
      and (g.finished_at at time zone 'Europe/Istanbul')::date = p_day
  ),
  an as (
    select a.dogru, gq.source_table
    from gm
    join public.answers a on a.game_id = gm.id and a.user_id = p_uid and a.secenek is not null
    join public.game_questions gq on gq.game_id = a.game_id and gq.position = a.position
  )
  select jsonb_build_object(
    'math10',    (select count(*) from an where source_table in ('matematik_tyt', 'matematik_ayt', 'matematik_lgs')),
    'win1',      (select count(*) from gm where winner_id = p_uid),
    'correct5',  (select count(*) from an where dogru is true),
    'friends2',  (select count(*) from gm where nplayers >= 3),
    'notebook3', (select count(*) from public.mistake_book mb
                  where mb.user_id = p_uid
                    and (mb.practice_resolved_at at time zone 'Europe/Istanbul')::date = p_day),
    'acc70',     (select count(*) from gm
                  where correct_count + wrong_count >= 5
                    and correct_count * 10 >= (correct_count + wrong_count) * 7),
    'quick1',    (select count(*) from gm where is_public),
    'games3',    (select count(*) from gm)
  )
$$;

revoke all on function public._daily_progress(uuid, date) from public, anon, authenticated;

-- =====================================================================
-- 12. İç fonksiyonlar: istemci erişimi YOK
-- =====================================================================
revoke all on function public._profil_is_bot_koru() from public, anon, authenticated;
revoke all on function public._bot_modu_acik() from public, anon, authenticated;
revoke all on function public._bot_sayisi() from public, anon, authenticated;
revoke all on function public._bot_bekleme_sn() from public, anon, authenticated;
revoke all on function public._bot_u(text) from public, anon, authenticated;
revoke all on function public.bot_doldur(uuid) from public, anon, authenticated;
revoke all on function public._bot_isle(uuid) from public, anon, authenticated;
revoke all on function public.bot_ilerlet(uuid) from public, anon, authenticated;
