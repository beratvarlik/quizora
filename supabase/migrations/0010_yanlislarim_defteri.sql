-- Quizora — 0010 Yanlışlarım defteri
-- 1) mistake_book (kullanıcının yanlış/boş yaptığı sorular) + mistake_games (oyun başına tek uygulama işareti)
-- 2) _game_mistakes / _apply_mistakes iç yardımcıları (istemciye KAPALI)
-- 3) finish_game: oyun bitince defteri doldurur (0005 gövdesi + tek satır; idempotent)
-- 4) get_game_review: yanıta added_to_notebook eklenir (0008 gövdesi + 3 satır)
-- 5) RPC'ler: get_mistake_summary, get_mistakes, practice_answer, remove_mistake
-- 6) Mevcut bitmiş oyunlardan defter doldurulur (backfill; yeniden çalıştırılırsa ikinci kez saymaz)
-- Yeniden çalıştırılabilir. Eski migration'lara dokunulmaz.
--
-- Tasarım notları:
-- * question_id tek başına yetmez (24 ayrı tablo): source_table da saklanır.
-- * "Boş" = sorunun cevap satırı secenek NULL olan ya da hiç cevaplanmamış ama oyuncunun GÖRDÜĞÜ soru.
--   Hiç görülmemiş sorular (yarışı erken bırakan oyuncu) deftere girmez.
-- * Deftere girmiş soru sonradan tablodan SİLİNİRSE listelerde ve sayımda atlanır.
-- * RPC yanıtları diğer RPC'ler gibi snake_case; src/lib/api.ts camelCase'e çevirir.

-- =====================================================================
-- 1. Tablolar
-- =====================================================================
create table if not exists public.mistake_book (
  user_id uuid not null references public.profiles on delete cascade,
  question_id uuid not null,
  source_table text not null,
  wrong_count int not null default 1,
  last_answer text,                       -- NULL = boş bırakıldı
  first_seen_at timestamptz not null default now(),
  last_wrong_at timestamptz not null default now(),
  last_game_id uuid,                      -- oyun silinirse boşta kalabilir (FK yok)
  resolved_at timestamptz,                -- NULL = defterde; dolu = çözüldü/elle çıkarıldı
  primary key (user_id, question_id),
  constraint mistake_book_last_answer_check check (last_answer is null or last_answer in ('A','B','C','D','E'))
);

create index if not exists mistake_book_open_idx
  on public.mistake_book (user_id, last_wrong_at desc) where resolved_at is null;

create table if not exists public.mistake_games (
  game_id uuid primary key references public.games on delete cascade,
  applied_at timestamptz not null default now()
);

alter table public.mistake_book enable row level security;
alter table public.mistake_games enable row level security;
revoke all on public.mistake_book, public.mistake_games from anon, authenticated;
grant select on public.mistake_book to authenticated;   -- yazma yalnızca RPC'lerle

drop policy if exists mistake_book_select on public.mistake_book;
create policy mistake_book_select on public.mistake_book
  for select to authenticated using (user_id = auth.uid());
-- mistake_games: policy yok (istemci erişimi yok)

-- =====================================================================
-- 2. İç yardımcılar
-- =====================================================================
-- Bir oyunda her oyuncunun doğru YAPMADIĞI ve GÖRDÜĞÜ soruları verir
-- (cevap satırı yok, secenek NULL veya yanlış). Görülen = cevap satırı var,
-- ya da position < current_q, ya da o an ekrandaki soru (position = current_q, q_started_at dolu).
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
  join public.game_questions gq on gq.game_id = gp.game_id
  left join public.answers a
    on a.game_id = gp.game_id and a.user_id = gp.user_id and a.position = gq.position
  where gp.game_id = p_game_id
    and (a.id is null or a.dogru is not true)
    and (a.id is not null
         or gq.position < gp.current_q
         or (gq.position = gp.current_q and gp.q_started_at is not null))
$$;

-- Bitmiş oyunu deftere işler. Oyun başına yalnızca BİR kez (mistake_games işareti).
create or replace function public._apply_mistakes(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ts timestamptz;
begin
  select coalesce(finished_at, now()) into v_ts
  from public.games where id = p_game_id and status = 'finished';
  if not found then return; end if;

  insert into public.mistake_games (game_id) values (p_game_id) on conflict do nothing;
  if not found then return; end if;   -- bu oyun zaten işlendi

  -- Yanlış/boş: yeni satır ya da wrong_count + 1, tekrar yanlışta deftere geri döner.
  -- order by: eşzamanlı iki oyunun aynı satırları farklı sırada kilitleyip kilitlenmesini önler.
  insert into public.mistake_book as mb
    (user_id, question_id, source_table, wrong_count, last_answer, first_seen_at, last_wrong_at, last_game_id, resolved_at)
  select m.uid, m.qid, m.tbl, 1, m.ans, v_ts, v_ts, p_game_id, null
  from public._game_mistakes(p_game_id) m
  order by m.uid, m.qid
  on conflict (user_id, question_id) do update
    set wrong_count = mb.wrong_count + 1,
        last_answer = excluded.last_answer,
        last_wrong_at = excluded.last_wrong_at,
        last_game_id = excluded.last_game_id,
        resolved_at = null;

  -- Defterdeki bir soruyu bu yarışta doğru yapan oyuncular için çözüldü işareti
  update public.mistake_book mb
  set resolved_at = v_ts
  from public.answers a
  join public.game_questions gq on gq.game_id = a.game_id and gq.position = a.position
  where a.game_id = p_game_id
    and a.dogru is true
    and mb.user_id = a.user_id
    and mb.question_id = gq.question_id
    and mb.resolved_at is null
    and mb.last_game_id is distinct from p_game_id;
end;
$$;

revoke all on function public._game_mistakes(uuid) from public, anon, authenticated;
revoke all on function public._apply_mistakes(uuid) from public, anon, authenticated;

-- =====================================================================
-- 3. finish_game (0005 gövdesi + defter çağrısı)
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

revoke all on function public.finish_game(uuid) from public, anon;
grant execute on function public.finish_game(uuid) to authenticated;

-- =====================================================================
-- 4. get_game_review (0008 gövdesi + added_to_notebook)
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
-- 5. RPC'ler (hepsi auth.uid() ile)
-- =====================================================================

-- 5a. get_mistake_summary: yalnızca çözülmemişler sayılır; silinmiş sorular atlanır
create or replace function public.get_mistake_summary()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t record;
  v_open int;
  v_res int;
  v_total int := 0;
  v_resolved int := 0;
  v_by jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  for t in select distinct source_table from public.mistake_book where user_id = v_uid loop
    execute format($f$
      select count(*) filter (where m.resolved_at is null),
             count(*) filter (where m.resolved_at is not null)
      from public.mistake_book m
      join public.%I q on q.id = m.question_id
      where m.user_id = $1 and m.source_table = $2$f$, t.source_table)
    into v_open, v_res
    using v_uid, t.source_table;

    v_total := v_total + v_open;
    v_resolved := v_resolved + v_res;
    if v_open > 0 then
      v_by := v_by || jsonb_build_array(jsonb_build_object(
        'exam', case when right(t.source_table, 4) = '_lgs' then 'lgs' else 'yks' end,
        'subject', public.question_label(t.source_table),
        'count', v_open));
    end if;
  end loop;

  return json_build_object(
    'total', v_total,
    'resolved_total', v_resolved,
    'by_subject', coalesce((
      select jsonb_agg(x order by (x->>'count')::int desc, x->>'subject')
      from jsonb_array_elements(v_by) x), '[]'::jsonb)
  );
end;
$$;

-- 5b. get_mistakes: çözülmemişler, en yeni önce. Doğru şık ve açıklama YOK.
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

-- 5c. practice_answer: defterdeki soruyu çöz. Doğruysa çözüldü, yanlışsa wrong_count + 1.
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
    update public.mistake_book set resolved_at = now()
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

-- 5d. remove_mistake: kullanıcı soruyu elle defterden çıkarır (zaten çıkarılmışsa sessiz)
create or replace function public.remove_mistake(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Oturum yok'; end if;

  update public.mistake_book set resolved_at = coalesce(resolved_at, now())
  where user_id = v_uid and question_id = p_question_id;
  if not found then raise exception 'Bu soru defterinde yok'; end if;
end;
$$;

revoke all on function public.get_mistake_summary() from public, anon;
revoke all on function public.get_mistakes(text, text, int) from public, anon;
revoke all on function public.practice_answer(uuid, text) from public, anon;
revoke all on function public.remove_mistake(uuid) from public, anon;
grant execute on function public.get_mistake_summary() to authenticated;
grant execute on function public.get_mistakes(text, text, int) to authenticated;
grant execute on function public.practice_answer(uuid, text) to authenticated;
grant execute on function public.remove_mistake(uuid) to authenticated;

-- =====================================================================
-- 6. Backfill: mevcut bitmiş oyunlar eskiden yeniye işlenir.
-- mistake_games işareti sayesinde bu migration tekrar çalıştırılırsa ikinci kez saymaz.
-- =====================================================================
do $$
declare
  g record;
begin
  for g in
    select id from public.games
    where status = 'finished'
      and not exists (select 1 from public.mistake_games mg where mg.game_id = games.id)
    order by finished_at, id
  loop
    perform public._apply_mistakes(g.id);
  end loop;
end $$;
