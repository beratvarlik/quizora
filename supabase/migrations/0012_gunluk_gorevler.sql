-- Quizora — 0012 Günlük görevler
-- İlerleme AYRI SAYILMAZ: o günün (Europe/Istanbul) verilerinden anlık hesaplanır. Yalnızca ödül alımı kaydedilir.
-- 1) mistake_book.practice_resolved_at (yalnızca practice_answer doğru çözümünde dolar; remove_mistake ve yarış çözümü DOLDURMAZ)
-- 2) daily_claims (alınan ödüller) — istemci erişimi YOK, yazma yalnız claim_daily_task
-- 3) Görev havuzu (_daily_pool), günün 3 görevi (_daily_task_ids), ilerleme (_daily_progress): iç yardımcılar (istemciye KAPALI)
-- 4) practice_answer (0010 gövdesi + practice_resolved_at)
-- 5) get_daily_tasks, claim_daily_task
-- Yeniden çalıştırılabilir. Eski migration'lara dokunulmaz.
--
-- Tasarım notları:
-- * "Bugün" = Europe/Istanbul takvim günü; bir oyun BİTTİĞİ (games.finished_at) güne yazılır.
-- * Günün 3 görevi, havuzu md5(tarih || görev_id) sırasına dizip ilk 3'ü alarak seçilir: deterministik, herkes aynı.
-- * "Oynanmış oyun" = bitmiş ve oyuncunun en az 1 soru cevapladığı (current_q >= 1) oyun.
-- * acc70: o oyunda en az 5 soru cevaplanmış (boş bırakılanlar hariç) ve doğru/cevaplanan >= %70.
-- * Bonus 'completed' = bugünün 3 görevinin ödülünün üçü de ALINMIŞ (spesifikasyon: bonus 3 görev alındıysa alınabilir).

-- =====================================================================
-- 1-2. Tablolar
-- =====================================================================
alter table public.mistake_book add column if not exists practice_resolved_at timestamptz;

create table if not exists public.daily_claims (
  user_id uuid not null references public.profiles on delete cascade,
  date date not null,                       -- Europe/Istanbul günü
  task_id text not null,                    -- görev id'si ya da 'bonus'
  claimed_at timestamptz not null default now(),
  xp_gained int not null default 0,
  primary key (user_id, date, task_id)
);

alter table public.daily_claims enable row level security;
revoke all on public.daily_claims from anon, authenticated;
-- policy yok: istemci erişimi yok

-- =====================================================================
-- 3. İç yardımcılar
-- =====================================================================
create or replace function public._daily_pool()
returns table (id text, title text, target int, xp int)
language sql
immutable
set search_path = public
as $$
  select * from (values
    ('math10',    '10 Matematik sorusu çöz',            10, 30),
    ('win1',      '1 yarışma kazan',                     1, 40),
    ('correct5',  '5 doğru cevap ver',                   5, 20),
    ('friends2',  '2 arkadaşınla yarış (3+ kişilik)',    1, 30),
    ('notebook3', 'Yanlışlarım''dan 3 soru çöz',         3, 30),
    ('acc70',     'Bir yarışta %70 doğruluk yakala',     1, 30),
    ('quick1',    'Hemen Katıl ile 1 yarış',             1, 20),
    ('games3',    '3 yarışma tamamla',                   3, 30)
  ) as t(id, title, target, xp)
$$;

-- Verilen günün 3 görevi (deterministik; herkes için aynı)
create or replace function public._daily_task_ids(p_day date)
returns setof text
language sql
immutable
set search_path = public
as $$
  select p.id from public._daily_pool() p order by md5(p_day::text || p.id) limit 3
$$;

-- Oyuncunun verilen günkü ham ilerlemesi (görev id'si -> sayı; hedefle sınırlanmamış)
create or replace function public._daily_progress(p_uid uuid, p_day date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with gm as (
    select g.id, g.winner_id, g.is_public, gp.correct_count, gp.wrong_count,
           (select count(*) from public.game_players x where x.game_id = g.id) as nplayers
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

revoke all on function public._daily_pool() from public, anon, authenticated;
revoke all on function public._daily_task_ids(date) from public, anon, authenticated;
revoke all on function public._daily_progress(uuid, date) from public, anon, authenticated;

-- =====================================================================
-- 4. practice_answer (0010 gövdesi + practice_resolved_at)
-- =====================================================================
create or replace function public.practice_answer(p_question_id uuid, p_selected text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.mistake_book;
  v_correct text;
  v_has_e boolean;
  v_expl text;
  v_ok boolean;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if p_selected is null or p_selected not in ('A', 'B', 'C', 'D', 'E') then
    raise exception 'Geçersiz şık';
  end if;

  select * into v_row from public.mistake_book
  where user_id = v_uid and question_id = p_question_id and resolved_at is null
  for update;
  if not found then raise exception 'Bu soru defterinde yok'; end if;

  execute format('select trim(dogru_sik::text), secenek_e is not null, cozum_aciklamasi from public.%I where id = $1',
                 v_row.source_table)
  into v_correct, v_has_e, v_expl
  using p_question_id;
  if v_correct is null then raise exception 'Soru bulunamadı'; end if;
  if p_selected = 'E' and not v_has_e then raise exception 'Geçersiz şık'; end if;  -- LGS: yalnızca A-D

  v_ok := (p_selected = v_correct);
  if v_ok then
    update public.mistake_book set resolved_at = now(), practice_resolved_at = now()
    where user_id = v_uid and question_id = p_question_id;
  else
    update public.mistake_book
    set wrong_count = wrong_count + 1, last_answer = p_selected, last_wrong_at = now()
    where user_id = v_uid and question_id = p_question_id;
  end if;

  return json_build_object(
    'is_correct', v_ok,
    'correct_option', v_correct,
    'explanation', v_expl,
    'resolved', v_ok
  );
end;
$$;

revoke all on function public.practice_answer(uuid, text) from public, anon;
grant execute on function public.practice_answer(uuid, text) to authenticated;

-- =====================================================================
-- 5. get_daily_tasks
-- {date, resets_at (bir sonraki İstanbul gece yarısı), tasks:[{id, title, target, progress (hedefle sınırlı), xp, completed, claimed}],
--  bonus:{xp, completed, claimed}}
-- =====================================================================
create or replace function public.get_daily_tasks()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_prog jsonb;
  v_claims text[];
  v_tasks json;
  v_n_claimed int;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  v_prog := public._daily_progress(v_uid, v_today);
  select coalesce(array_agg(task_id), '{}') into v_claims
  from public.daily_claims where user_id = v_uid and date = v_today;

  select coalesce(json_agg(json_build_object(
      'id', p.id,
      'title', p.title,
      'target', p.target,
      'progress', least(coalesce((v_prog->>p.id)::int, 0), p.target),
      'xp', p.xp,
      'completed', coalesce((v_prog->>p.id)::int, 0) >= p.target,
      'claimed', p.id = any(v_claims)
    ) order by md5(v_today::text || p.id)), '[]'::json)
  into v_tasks
  from public._daily_pool() p
  where p.id in (select public._daily_task_ids(v_today));

  select count(*)::int into v_n_claimed
  from public._daily_pool() p
  where p.id in (select public._daily_task_ids(v_today)) and p.id = any(v_claims);

  return json_build_object(
    'date', to_char(v_today, 'YYYY-MM-DD'),
    'resets_at', ((v_today + 1)::timestamp at time zone 'Europe/Istanbul'),
    'tasks', v_tasks,
    'bonus', json_build_object(
      'xp', 50,
      'completed', v_n_claimed = 3,
      'claimed', 'bonus' = any(v_claims)
    )
  );
end;
$$;

-- =====================================================================
-- 6. claim_daily_task(p_task_id): ödülü al. XP player_stats'a eklenir (mevcut XP/rütbe mantığı).
-- Hatalar: 'Oturum yok', 'Geçersiz görev', 'Bu görev bugünün görevi değil', 'Ödül zaten alındı',
--          'Görev henüz tamamlanmadı', 'Önce üç görevin ödülünü al' (yalnızca 'bonus' için)
-- Dönüş: {xp_gained, new_xp, tier_before, tier_after} (tier = rütbe etiketi, örn. 'Bronz I')
-- =====================================================================
create or replace function public.claim_daily_task(p_task_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_def record;
  v_xp int;
  v_n int;
  v_before int;
  v_after int;
  v_tier_b text;
  v_tier_a text;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;
  if p_task_id is null or btrim(p_task_id) = '' then raise exception 'Geçersiz görev'; end if;

  -- Aynı kullanıcının eşzamanlı alımlarını sıraya koyar (çift ödül olmasın)
  perform pg_advisory_xact_lock(hashtext('daily_claim:' || v_uid::text));

  if p_task_id = 'bonus' then
    if exists (select 1 from public.daily_claims where user_id = v_uid and date = v_today and task_id = 'bonus') then
      raise exception 'Ödül zaten alındı';
    end if;
    select count(*)::int into v_n
    from public.daily_claims c
    where c.user_id = v_uid and c.date = v_today
      and c.task_id in (select public._daily_task_ids(v_today));
    if v_n < 3 then raise exception 'Önce üç görevin ödülünü al'; end if;
    v_xp := 50;
  else
    select * into v_def from public._daily_pool() p
    where p.id = p_task_id and p.id in (select public._daily_task_ids(v_today));
    if not found then raise exception 'Bu görev bugünün görevi değil'; end if;

    if exists (select 1 from public.daily_claims where user_id = v_uid and date = v_today and task_id = p_task_id) then
      raise exception 'Ödül zaten alındı';
    end if;
    if coalesce((public._daily_progress(v_uid, v_today)->>p_task_id)::int, 0) < v_def.target then
      raise exception 'Görev henüz tamamlanmadı';
    end if;
    v_xp := v_def.xp;
  end if;

  insert into public.daily_claims (user_id, date, task_id, xp_gained)
  values (v_uid, v_today, p_task_id, v_xp);

  insert into public.player_stats (user_id) values (v_uid) on conflict do nothing;
  select xp into v_before from public.player_stats where user_id = v_uid for update;
  update public.player_stats set xp = xp + v_xp, updated_at = now()
  where user_id = v_uid
  returning xp into v_after;

  select rank_label into v_tier_b from public.rank_of(v_before);
  select rank_label into v_tier_a from public.rank_of(v_after);

  return json_build_object(
    'xp_gained', v_xp,
    'new_xp', v_after,
    'tier_before', v_tier_b,
    'tier_after', v_tier_a
  );
end;
$$;

revoke all on function public.get_daily_tasks() from public, anon;
revoke all on function public.claim_daily_task(text) from public, anon;
grant execute on function public.get_daily_tasks() to authenticated;
grant execute on function public.claim_daily_task(text) to authenticated;
