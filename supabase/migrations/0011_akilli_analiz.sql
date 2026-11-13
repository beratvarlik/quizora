-- Quizora — 0011 Akıllı analiz / Performansım
-- 1) 24 soru tablosuna topic (dersin alt konusu; kısa ve tutarlı isim, en çok 60 karakter) sütunu
-- 2) _perf_rows iç yardımcısı (istemciye KAPALI)
-- 3) get_game_review ve get_mistakes: her öğeye topic eklenir (0010 gövdeleri + 1 satır)
-- 4) get_performance(p_exam, p_days): çağıranın kendi performans özeti
-- Yeniden çalıştırılabilir. Eski migration'lara dokunulmaz.
--
-- NOT: topic NULL olabilir (yeni eklenen ama konusu girilmemiş soru); analizde 'Diğer' sayılır.
-- Mevcut soruların konuları migration'dan SONRA yüklenir:
--   npx tsx scripts/konu-yukle.ts scripts/konu-atamalari.csv
-- get_question / submit_answer / get_game / get_game_by_id DEĞİŞMEZ.

-- =====================================================================
-- 1. topic sütunu
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
    execute format('alter table public.%I add column if not exists topic text', t);
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and conname = t || '_topic_check'
    ) then
      execute format(
        'alter table public.%I add constraint %I check (topic is null or char_length(btrim(topic)) between 1 and 60)',
        t, t || '_topic_check');
    end if;
  end loop;
end $$;

-- =====================================================================
-- 2. İç yardımcı: bir oyuncunun BİTMİŞ oyunlardaki GÖRDÜĞÜ sorular ve sonuçları
-- Görülen = cevap satırı var / position < current_q / ekrandaki soru (position = current_q, q_started_at dolu).
-- outcome: correct | wrong | blank. ms: cevap süresi (boşta NULL).
-- =====================================================================
create or replace function public._perf_rows(p_uid uuid, p_since timestamptz, p_exam text)
returns table (gid uuid, fin timestamptz, tbl text, qid uuid, outcome text, ms int)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.finished_at, gq.source_table, gq.question_id,
         case when a.dogru is true then 'correct'
              when a.secenek is not null then 'wrong'
              else 'blank' end,
         a.sure_ms
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = p_uid
  join public.game_questions gq on gq.game_id = g.id
  left join public.answers a
    on a.game_id = g.id and a.user_id = p_uid and a.position = gq.position
  where g.status = 'finished'
    and g.finished_at >= p_since
    and (a.id is not null
         or gq.position < gp.current_q
         or (gq.position = gp.current_q and gp.q_started_at is not null))
    and (p_exam is null
         or (case when right(gq.source_table, 4) = '_lgs' then 'lgs' else 'yks' end) = p_exam)
$$;

revoke all on function public._perf_rows(uuid, timestamptz, text) from public, anon, authenticated;

-- =====================================================================
-- 3. get_game_review (0010 gövdesi + topic)
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
  v_pos int[];
  v_added int := 0;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  perform 1 from public.game_players where game_id = p_game_id and user_id = v_uid;
  if not found then raise exception 'Bu oyuna erişimin yok'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'Oyun bulunamadı'; end if;
  if v_game.status <> 'finished' then raise exception 'Yarış henüz bitmedi'; end if;

  -- Bu oyundan deftere giren sorular (yanlış/boş; oyuncunun gördüğü sorular)
  select coalesce(array_agg(pos), '{}') into v_pos
  from public._game_mistakes(p_game_id) where uid = v_uid;

  for v_gq in
    select position, source_table, question_id
    from public.game_questions
    where game_id = p_game_id
    order by position
  loop
    execute format($f$
      select jsonb_build_object(
        'text', soru_metni,
        'topic', topic,
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

    if v_gq.position = any(v_pos) then v_added := v_added + 1; end if;

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
      'topic', v_q->'topic',
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

  return json_build_object('items', v_items, 'added_to_notebook', v_added);
end;
$$;

revoke all on function public.get_game_review(uuid) from public, anon;
grant execute on function public.get_game_review(uuid) to authenticated;

-- =====================================================================
-- 4. get_mistakes (0010 gövdesi + topic)
-- =====================================================================
create or replace function public.get_mistakes(
  p_exam text default null,
  p_subject text default null,
  p_limit int default 50
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  t record;
  v_exam text;
  v_subject text;
  v_part jsonb;
  v_all jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if p_exam is not null and p_exam not in ('yks', 'lgs') then raise exception 'Geçersiz sınav'; end if;

  for t in
    select distinct source_table from public.mistake_book
    where user_id = v_uid and resolved_at is null
    order by 1
  loop
    v_exam := case when right(t.source_table, 4) = '_lgs' then 'lgs' else 'yks' end;
    v_subject := public.question_label(t.source_table);
    if p_exam is not null and v_exam <> p_exam then continue; end if;
    if p_subject is not null and v_subject <> p_subject then continue; end if;

    execute format($f$
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', m.question_id,
        'exam', $4::text,
        'subject', $5::text,
        'text', q.soru_metni,
        'topic', q.topic,
        'image_url', q.gorsel_url,
        'options', jsonb_strip_nulls(jsonb_build_object(
          'A', q.secenek_a, 'B', q.secenek_b, 'C', q.secenek_c, 'D', q.secenek_d, 'E', q.secenek_e)),
        'last_answer', to_jsonb(m.last_answer),
        'wrong_count', m.wrong_count,
        'last_wrong_at', m.last_wrong_at
      )), '[]'::jsonb)
      from (
        select * from public.mistake_book
        where user_id = $1 and source_table = $2 and resolved_at is null
        order by last_wrong_at desc
        limit $3
      ) m
      join public.%I q on q.id = m.question_id$f$, t.source_table)
    into v_part
    using v_uid, t.source_table, v_limit, v_exam, v_subject;

    v_all := v_all || v_part;
  end loop;

  return json_build_object('items', coalesce((
    select jsonb_agg(e order by (e->>'last_wrong_at')::timestamptz desc)
    from (
      select e from jsonb_array_elements(v_all) e
      order by (e->>'last_wrong_at')::timestamptz desc
      limit v_limit
    ) s), '[]'::jsonb));
end;
$$;

revoke all on function public.get_mistakes(text, text, int) from public, anon;
grant execute on function public.get_mistakes(text, text, int) to authenticated;

-- =====================================================================
-- 5. get_performance
-- answered = correct + wrong (boş bırakılanlar hariç); accuracy = 100 * correct / answered (0-100, 1 ondalık; answered 0 ise 0).
-- Yalnızca BİTMİŞ oyunlar ve çağıranın kendi cevapları. Silinmiş sorular atlanır; topic boşsa 'Diğer'.
-- totals/by_subject/by_topic: son p_days gün (1-365, varsayılan 30) içinde biten oyunlar; p_exam yks/lgs ya da null (hepsi).
-- by_subject/by_topic: yalnızca answered > 0 olan gruplar. by_topic: low_sample = answered < 3;
--   sıra: önce yeterli örnekli konular (doğruluk artan, answered azalan), sonra low_sample olanlar.
-- daily: son 7 gün (Europe/Istanbul takvim günü, bugün dahil, eskiden yeniye), boş gün 0; p_days'ten bağımsız.
-- streak_days: üst üste yarışılan gün sayısı (bugün ya da dün biten bir yarıştan geriye doğru; filtrelerden bağımsız).
-- avg_time_ms: cevaplanan (boş olmayan) sorularda ortalama süre; veri yoksa 0.
-- =====================================================================
create or replace function public.get_performance(p_exam text default null, p_days int default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_win timestamptz := now() - make_interval(days => v_days);
  v_since timestamptz;
  t record;
  v_part jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_gun date[];
  v_d date;
  v_streak int := 0;
  v_result json;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if p_exam is not null and p_exam not in ('yks', 'lgs') then raise exception 'Geçersiz sınav'; end if;

  -- Hem pencere hem son 7 gün için gereken en eski tarih
  v_since := least(v_win, ((v_today - 6)::timestamp at time zone 'Europe/Istanbul'));

  -- Satırlar soru tablosuna göre (topic için) tek tek çekilir; silinmiş soru join'de elenir
  for t in select distinct tbl from public._perf_rows(v_uid, v_since, p_exam) order by 1 loop
    execute format($f$
      select coalesce(jsonb_agg(jsonb_build_object(
        'gid', r.gid, 'fin', r.fin, 'tbl', r.tbl,
        'topic', coalesce(nullif(btrim(q.topic), ''), 'Diğer'),
        'outcome', r.outcome, 'ms', r.ms)), '[]'::jsonb)
      from public._perf_rows($1, $2, $3) r
      join public.%I q on q.id = r.qid
      where r.tbl = $4$f$, t.tbl)
    into v_part
    using v_uid, v_since, p_exam, t.tbl;
    v_rows := v_rows || v_part;
  end loop;

  -- Seri: tüm bitmiş oyunlardaki oyun günleri (filtrelerden bağımsız)
  select coalesce(array_agg(distinct (g.finished_at at time zone 'Europe/Istanbul')::date), '{}')
  into v_gun
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = v_uid
  where g.status = 'finished' and gp.current_q >= 1;

  v_d := case when v_today = any(v_gun) then v_today
              when (v_today - 1) = any(v_gun) then v_today - 1
              else null end;
  while v_d is not null and v_d = any(v_gun) loop
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  end loop;

  with x as (
    select (e->>'gid')::uuid as gid,
           (e->>'fin')::timestamptz as fin,
           e->>'tbl' as tbl,
           e->>'topic' as topic,
           e->>'outcome' as outcome,
           nullif(e->>'ms', '')::int as ms
    from jsonb_array_elements(v_rows) e
  ),
  w as (select * from x where fin >= v_win),
  tot as (
    select count(distinct gid)::int as games,
           count(*) filter (where outcome in ('correct', 'wrong'))::int as answered,
           count(*) filter (where outcome = 'correct')::int as correct,
           count(*) filter (where outcome = 'wrong')::int as wrong,
           count(*) filter (where outcome = 'blank')::int as blank,
           coalesce(round(avg(ms) filter (where outcome in ('correct', 'wrong')))::int, 0) as avg_ms
    from w
  ),
  subj as (
    select tbl,
           count(*) filter (where outcome in ('correct', 'wrong'))::int as answered,
           count(*) filter (where outcome = 'correct')::int as correct,
           coalesce(round(avg(ms) filter (where outcome in ('correct', 'wrong')))::int, 0) as avg_ms
    from w group by tbl
  ),
  top as (
    select tbl, topic,
           count(*) filter (where outcome in ('correct', 'wrong'))::int as answered,
           count(*) filter (where outcome = 'correct')::int as correct
    from w group by tbl, topic
  ),
  dy as (
    select (fin at time zone 'Europe/Istanbul')::date as d,
           count(*) filter (where outcome in ('correct', 'wrong'))::int as answered,
           count(*) filter (where outcome = 'correct')::int as correct
    from x
    where (fin at time zone 'Europe/Istanbul')::date >= v_today - 6
    group by 1
  )
  select json_build_object(
    'totals', (select json_build_object(
        'games', games, 'answered', answered, 'correct', correct, 'wrong', wrong, 'blank', blank,
        'avg_time_ms', avg_ms,
        'accuracy', case when answered > 0 then round(100.0 * correct / answered, 1) else 0 end)
      from tot),
    'by_subject', coalesce((
      select json_agg(json_build_object(
          'exam', case when right(tbl, 4) = '_lgs' then 'lgs' else 'yks' end,
          'subject', public.question_label(tbl),
          'answered', answered, 'correct', correct,
          'accuracy', round(100.0 * correct / answered, 1),
          'avg_time_ms', avg_ms) order by answered desc, tbl)
      from subj where answered > 0), '[]'::json),
    'by_topic', coalesce((
      select json_agg(json_build_object(
          'exam', case when right(tbl, 4) = '_lgs' then 'lgs' else 'yks' end,
          'subject', public.question_label(tbl),
          'topic', topic,
          'answered', answered, 'correct', correct,
          'accuracy', round(100.0 * correct / answered, 1),
          'low_sample', answered < 3)
        order by (answered < 3), round(100.0 * correct / answered, 1), answered desc, tbl, topic)
      from top where answered > 0), '[]'::json),
    'daily', (
      select json_agg(json_build_object(
          'date', to_char(v_today - 6 + i, 'YYYY-MM-DD'),
          'answered', coalesce(dy.answered, 0),
          'correct', coalesce(dy.correct, 0)) order by i)
      from generate_series(0, 6) i
      left join dy on dy.d = v_today - 6 + i),
    'streak_days', v_streak
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_performance(text, int) from public, anon;
grant execute on function public.get_performance(text, int) to authenticated;
