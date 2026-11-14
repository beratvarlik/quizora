-- Quizora — 0014 Demo botları: ilk bitiren zaman sırasına göre
-- 0013'teki _bot_isle yalnızca speedup_at BOŞSA 2x'i başlatıyordu. Botlar tembel işlenir (user_id sırasıyla);
-- daha geç biten bir bot önce işlenirse 2x'i o tetikliyor, daha önce biten bot "ilk bitiren" olamıyordu.
-- Düzeltme: bot, kayıtlı speedup_at'ten DAHA ÖNCE bitirdiyse 2x başlangıcı ona çekilir (speedup_by = bu bot,
-- speedup_remaining_ms = 2x öncesi normal akışla). Böylece sonuç işlem sırasından bağımsız ve deterministiktir.
-- Yalnızca _bot_isle yeniden tanımlanır (0013 gövdesi + bu değişiklik). Yeniden çalıştırılabilir; eski migration'a dokunulmaz.

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
        -- İlk bitiren = ZAMAN SIRASINA göre ilk bitiren. Botlar tembel (kullanıcı_id sırasıyla) işlendiği için
        -- daha geç biten bir bot (ya da insan) önce işlenip 2x'i tetiklemiş olabilir: bu bot daha önce bittiyse
        -- 2x başlangıcı geriye alınır; kalan süre 2x öncesi normal akışla hesaplanır (sonuç işlem sırasından bağımsız).
        if v_game.speedup_at is null or v_t < v_game.speedup_at then
          v_game.speedup_at := null;
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

revoke all on function public._bot_isle(uuid) from public, anon, authenticated;
