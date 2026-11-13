-- Quizora — 0004 oyun RPC'leri
-- get_question, submit_answer
-- Yeniden çalıştırılabilir (create or replace).
-- Soru tabloları (24 adet, YKS + LGS) aynı şemada olduğundan dinamik sorgu hepsinde çalışır.

-- =====================================================================
-- 1. get_question
-- Doğru şık, açıklama ve aktif bilgisi ASLA dönmez.
-- =====================================================================
create or replace function public.get_question(p_game_id uuid, p_position int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_gp public.game_players;
  v_gq public.game_questions;
  v_q json;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  -- Oyuncu satırını kilitle: aynı anda iki istek gelirse q_started_at bir kez set edilir
  select * into v_gp from public.game_players
  where game_id = p_game_id and user_id = v_uid
  for update;
  if not found then raise exception 'Bu oyuna erişimin yok'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'Oyun bulunamadı'; end if;
  if v_game.status = 'finished' then raise exception 'Oyun bitti'; end if;
  if v_game.status <> 'playing' or v_game.started_at is null or now() < v_game.started_at then
    raise exception 'Oyun başlamadı';
  end if;
  if public.remaining_ms(v_game) <= 0 then raise exception 'Süre doldu'; end if;

  -- Soru sırası: yalnızca oyuncunun şu anki sorusu istenebilir
  if p_position is null or p_position < 0 or p_position >= v_game.total_questions
     or p_position <> v_gp.current_q then
    raise exception 'Sıra dışı soru';
  end if;

  -- Süre sayacı: yalnızca ilk istekte başlar, tekrar isteklerde sıfırlanmaz
  if v_gp.q_started_at is null then
    update public.game_players
    set q_started_at = now()
    where game_id = p_game_id and user_id = v_uid;
  end if;

  select * into v_gq from public.game_questions
  where game_id = p_game_id and position = p_position;
  if not found then raise exception 'Soru bulunamadı'; end if;

  -- Yalnızca gösterilecek sütunlar seçilir (dogru_sik, aciklama, aktif YOK)
  execute format($f$
    select json_build_object(
      'text', soru_metni,
      'image_url', gorsel_url,
      'options', json_build_object(
        'A', secenek_a, 'B', secenek_b, 'C', secenek_c, 'D', secenek_d, 'E', secenek_e
      )
    ) from public.%I where id = $1$f$, v_gq.source_table)
  into v_q
  using v_gq.question_id;
  if v_q is null then raise exception 'Soru bulunamadı'; end if;

  return json_build_object(
    'position', p_position,
    'ders', public.question_label(v_gq.source_table),
    'text', v_q->>'text',
    'image_url', v_q->>'image_url',
    'options', v_q->'options'
  );
end;
$$;

-- =====================================================================
-- 2. submit_answer
-- Puan yalnızca sunucuda hesaplanır (docs/PROJE.md puan sistemi):
--   doğru: 100 + round(100 * max(0, 1 - t/20)), yanlış: -25, boş: 0
-- =====================================================================
create or replace function public.submit_answer(p_game_id uuid, p_position int, p_secenek text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_gp public.game_players;
  v_gq public.game_questions;
  v_secenek text := p_secenek;
  v_correct text;
  v_dogru boolean;
  v_sure_ms int;
  v_puan int;
  v_new_q int;
  v_new_score int;
  v_finished boolean;
  v_speedup boolean := false;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if p_secenek is not null and p_secenek not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Geçersiz şık';
  end if;

  -- Oyuncu satırını kilitle (aynı oyuncudan eşzamanlı iki cevap sıraya girer)
  select * into v_gp from public.game_players
  where game_id = p_game_id and user_id = v_uid
  for update;
  if not found then raise exception 'Bu oyuna erişimin yok'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'Oyun bulunamadı'; end if;
  if v_game.status = 'finished' then raise exception 'Oyun bitti'; end if;
  if v_game.status <> 'playing' then raise exception 'Oyun başlamadı'; end if;

  if p_position is null or p_position < 0 or p_position >= v_game.total_questions then
    raise exception 'Sıra dışı soru';
  end if;
  if p_position < v_gp.current_q
     or exists (select 1 from public.answers
                where game_id = p_game_id and user_id = v_uid and position = p_position) then
    raise exception 'Bu soru zaten cevaplandı';
  end if;
  if p_position <> v_gp.current_q then raise exception 'Sıra dışı soru'; end if;
  if v_gp.q_started_at is null then raise exception 'Önce soruyu getir'; end if;

  -- Cevap süresi (sunucu saati)
  v_sure_ms := greatest(0, floor(extract(epoch from (now() - v_gp.q_started_at)) * 1000))::int;

  -- Geç cevap: süre bittiyse BOŞ say
  if public.remaining_ms(v_game) <= 0 then v_secenek := null; end if;

  select * into v_gq from public.game_questions
  where game_id = p_game_id and position = p_position;
  if not found then raise exception 'Soru bulunamadı'; end if;

  execute format('select dogru_sik from public.%I where id = $1', v_gq.source_table)
  into v_correct
  using v_gq.question_id;
  if v_correct is null then raise exception 'Soru bulunamadı'; end if;

  -- Puan: boş 0 (dogru null), doğru 100..200, yanlış -25
  if v_secenek is null then
    v_dogru := null;
    v_puan := 0;
  elsif v_secenek = v_correct then
    v_dogru := true;
    v_puan := 100 + round(100 * greatest(0, 1 - (v_sure_ms / 1000.0) / 20.0))::int;
  else
    v_dogru := false;
    v_puan := -25;
  end if;

  insert into public.answers (game_id, user_id, position, secenek, dogru, sure_ms, puan)
  values (p_game_id, v_uid, p_position, v_secenek, v_dogru, v_sure_ms, v_puan);

  v_new_q := v_gp.current_q + 1;
  v_new_score := v_gp.score + v_puan;
  v_finished := v_new_q >= v_game.total_questions;

  update public.game_players
  set score = v_new_score,
      correct_count = correct_count + case when v_dogru is true then 1 else 0 end,
      wrong_count = wrong_count + case when v_dogru is false then 1 else 0 end,
      total_time_ms = total_time_ms + v_sure_ms,
      current_q = v_new_q,
      q_started_at = null,
      finished_at = case when v_finished then now() else finished_at end
  where game_id = p_game_id and user_id = v_uid;

  -- İlk bitiren: oyun satırını kilitle, hâlâ kimse tetiklememişse 2x hızı başlat
  if v_finished then
    select * into v_game from public.games where id = p_game_id for update;
    if v_game.speedup_at is null then
      update public.games
      set speedup_at = now(),
          speedup_remaining_ms = public.remaining_ms(v_game, now()),
          speedup_by = v_uid
      where id = p_game_id;
      v_speedup := true;
    end if;
  end if;

  return json_build_object(
    'correct', coalesce(v_dogru, false),
    'points', v_puan,
    'correct_option', v_correct,
    'new_score', v_new_score,
    'finished', v_finished,
    'speedup_triggered', v_speedup
  );
end;
$$;

-- =====================================================================
-- 3. Yetkiler: yalnızca giriş yapmış kullanıcı
-- =====================================================================
revoke all on function public.get_question(uuid, int) from public, anon;
grant execute on function public.get_question(uuid, int) to authenticated;
revoke all on function public.submit_answer(uuid, int, text) from public, anon;
grant execute on function public.submit_answer(uuid, int, text) to authenticated;
