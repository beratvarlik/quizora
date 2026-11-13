-- Quizora — 0006b düzeltme: submit_answer'da eşzamanlı son soru kilitlenmesi (deadlock)
--
-- Bulgu (scripts/security-test.ts madde 9 + pg_stat_activity): iki oyuncu 10. soruyu aynı anda
-- gönderince iki işlem birbirini bekliyordu (pg_blocking_pids karşılıklı).
-- Neden: answers tablosuna insert, games satırında FK kilidi (FOR KEY SHARE) alır. Aynı işlem sonra
-- games satırını FOR UPDATE ile kilitlemek isteyince, diğer işlemin KEY SHARE kilidiyle çakışır
-- (FOR UPDATE, KEY SHARE ile çakışır); iki işlem birbirini bekler.
-- Çözüm: FOR NO KEY UPDATE. Bu kilit KEY SHARE ile çakışmaz, ama kendisiyle çakışır:
-- eşzamanlı bitirenler yine sıraya girer, speedup_at tek bir kez set edilir.
-- games'te anahtar sütunlar (id, code) değişmediğinden UPDATE zaten NO KEY UPDATE kilidi alır.
--
-- Yalnızca bu fonksiyonun tek satırı değişti (aşağıda "DEĞİŞEN SATIR"); gerisi 0004 ile aynıdır.
-- Yeniden çalıştırılabilir (create or replace).

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
    -- DEĞİŞEN SATIR: "for update" yerine "for no key update" (FK kilidiyle deadlock'u önler)
    select * into v_game from public.games where id = p_game_id for no key update;
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

-- Yetkiler create or replace ile korunur; yine de açıkça belirtilir
revoke all on function public.submit_answer(uuid, int, text) from public, anon;
grant execute on function public.submit_answer(uuid, int, text) to authenticated;
