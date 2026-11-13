-- Quizora — 0005 yarışı bitirme (XP + rank) ve genel liderlik RPC'leri
-- finish_game, get_global_leaderboard
-- Yeniden çalıştırılabilir (create or replace).
-- global_scores tablosuna ARTIK yazılmaz (yerini player_stats aldı).

-- =====================================================================
-- 1. finish_game
-- Yarış bitince sıralamayı kesinleştirir, XP'yi yarış başına BİR kez uygular.
-- İdempotent: oyun zaten 'finished' ise hesaplamadan kayıtlı sonucu döndürür.
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

    -- Sıralama: puan azalan, eşitlikte toplam süre artan, sonra katılım sırası
    for v_r in
      select gp.user_id, gp.score, gp.current_q,
             row_number() over (order by gp.score desc, gp.total_time_ms asc, gp.joined_at asc) as rn
      from public.game_players gp
      where gp.game_id = p_game_id
      order by 4
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
      v_gain := v_part + v_pts + v_plc + v_first;

      if not v_game.xp_applied then
        if v_n >= 2 then
          insert into public.player_stats (user_id) values (v_r.user_id) on conflict do nothing;
          -- Satırı kilitleyerek xp_before oku (eşzamanlı iki yarış aynı oyuncuyu ezmesin)
          select xp into v_before from public.player_stats where user_id = v_r.user_id for update;
          update public.player_stats
          set xp = xp + v_gain,
              games_played = games_played + case when v_answered then 1 else 0 end,
              wins = wins + case when v_r.rn = 1 and v_answered then 1 else 0 end,
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

  -- ---- Sonuç: ilk çağrıda da sonraki çağrılarda da aynı koddan okunur ----
  select * into v_game from public.games where id = p_game_id;

  select coalesce(json_agg(json_build_object(
    'rank', t.rn,
    'user_id', t.user_id,
    'display_name', t.display_name,
    'avatar_key', t.avatar_key,
    'photo_url', t.photo_url,
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
           gp.*, pr.display_name, pr.avatar_key, pr.photo_url
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

-- =====================================================================
-- 2. get_global_leaderboard: XP'ye göre ilk 20
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
      order by ps.xp desc, ps.wins desc, ps.user_id
      limit 20
    ) t
    left join lateral public.rank_of(t.xp) rk on true
  );
end;
$$;

-- =====================================================================
-- 3. Yetkiler: yalnızca giriş yapmış kullanıcı
-- =====================================================================
revoke all on function public.finish_game(uuid) from public, anon;
grant execute on function public.finish_game(uuid) to authenticated;
revoke all on function public.get_global_leaderboard() from public, anon;
grant execute on function public.get_global_leaderboard() to authenticated;
