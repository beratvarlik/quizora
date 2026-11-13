-- Quizora — 0008 yarış sonrası soru incelemesi (çözüm açıklamaları)
-- 1) 24 soru tablosuna cozum_aciklamasi sütunu (öğrenciye gösterilir)
-- 2) get_game_review RPC'si: yalnızca BİTMİŞ oyunda, yalnızca üyeye
-- Yeniden çalıştırılabilir. Eski migration'lara dokunulmaz.
-- NOT: mevcut "aciklama" sütunu dahili nottur ("KONTROL: ..."), öğrenciye GÖSTERİLMEZ.
-- get_question / submit_answer / get_game / get_game_by_id DEĞİŞMEZ (açıklama sızmaz).

-- =====================================================================
-- 1. cozum_aciklamasi sütunu (en çok 400 karakter, boş olabilir)
-- =====================================================================
do $$
declare
  t text;
  tablolar text[] := array[
    'matematik_tyt','turkce_tyt','kimya_tyt','fizik_tyt','biyoloji_tyt',
    'tarih_tyt','cografya_tyt','felsefe_tyt','din_kulturu_tyt',
    'fizik_ayt','kimya_ayt','biyoloji_ayt','matematik_ayt','edebiyat_ayt',
    'tarih_ayt','cografya_ayt','felsefe_ayt','din_kulturu_ayt',
    'turkce_lgs','inkilap_lgs','din_kulturu_lgs','ingilizce_lgs','matematik_lgs','fen_lgs'
  ];
begin
  foreach t in array tablolar loop
    execute format('alter table public.%I add column if not exists cozum_aciklamasi text', t);
    -- kısıt zaten varsa tekrar eklenmez
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and conname = t || '_cozum_aciklamasi_check'
    ) then
      execute format(
        'alter table public.%I add constraint %I check (cozum_aciklamasi is null or char_length(cozum_aciklamasi) <= 400)',
        t, t || '_cozum_aciklamasi_check');
    end if;
  end loop;
end $$;

-- =====================================================================
-- 2. get_game_review: çağıran oyuncunun 10 soruluk incelemesi
-- Oyunu BİTİRMEZ. Oyun 'finished' değilse hata verir (doğru şık sızmasın).
-- Silinmiş soru → o pozisyon atlanır.
-- =====================================================================
create or replace function public.get_game_review(p_game_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games;
  v_gq record;
  v_ans public.answers;
  v_q jsonb;
  v_items jsonb := '[]'::jsonb;
  v_selected text;
  v_outcome text;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  perform 1 from public.game_players where game_id = p_game_id and user_id = v_uid;
  if not found then raise exception 'Bu oyuna erişimin yok'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'Oyun bulunamadı'; end if;
  if v_game.status <> 'finished' then raise exception 'Yarış henüz bitmedi'; end if;

  for v_gq in
    select position, source_table, question_id
    from public.game_questions
    where game_id = p_game_id
    order by position
  loop
    execute format($f$
      select jsonb_build_object(
        'text', soru_metni,
        'image_url', gorsel_url,
        'options', jsonb_strip_nulls(jsonb_build_object(
          'A', secenek_a, 'B', secenek_b, 'C', secenek_c, 'D', secenek_d, 'E', secenek_e)),
        'correct_option', dogru_sik,
        'explanation', cozum_aciklamasi
      ) from public.%I where id = $1$f$, v_gq.source_table)
    into v_q
    using v_gq.question_id;

    -- soru artık yoksa (silinmiş) pozisyonu atla
    if v_q is null then continue; end if;

    select * into v_ans from public.answers
    where game_id = p_game_id and user_id = v_uid and position = v_gq.position;

    if found and v_ans.secenek is not null then
      v_selected := trim(v_ans.secenek::text);
    else
      v_selected := null;
    end if;

    v_outcome := case
      when v_selected is null then 'blank'
      when v_selected = v_q->>'correct_option' then 'correct'
      else 'wrong'
    end;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'position', v_gq.position,
      'ders', public.question_label(v_gq.source_table),
      'text', v_q->>'text',
      'image_url', v_q->'image_url',
      'options', v_q->'options',
      'selected', to_jsonb(v_selected),
      'correct_option', v_q->>'correct_option',
      'outcome', v_outcome,
      'points', case when v_ans.id is not null then v_ans.puan else 0 end,
      'time_ms', case when v_ans.id is not null then to_jsonb(v_ans.sure_ms) else 'null'::jsonb end,
      'explanation', v_q->'explanation'
    ));
  end loop;

  return json_build_object('items', v_items);
end;
$$;

revoke all on function public.get_game_review(uuid) from public, anon;
grant execute on function public.get_game_review(uuid) to authenticated;
