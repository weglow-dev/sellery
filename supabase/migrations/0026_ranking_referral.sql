-- ============================================================
-- 0026 — 인플루언서 랭킹 · 추천 프로그램
--
-- 배경: 프로토타입 `/influencer/rank` · `/influencer/ref` 두 화면이 실서비스에 없었다. 데이터는 다 있다 —
--   랭킹은 `sellers.m3_sales` · `grade_tiers`(top_pct · perk · bonus_pp), 추천은 `sellers.ref_code` ·
--   `referred_by` + `referral_earnings`(0005) 이고 **정산이 이미 이 표에 쓴다**(0020:652).
--
-- 익명 규칙: 리더보드는 **본인 외 전원 익명**(○○○ 인플루언서 — 프로토타입 rank 화면 주석 "순위와 지표만
--   공개, 저격 불가"). 그래서 이름·핸들·code 를 내려보내지 않고 순위·카테고리·지표만 준다. 내 행만
--   `is_me: true` 와 함께 이름을 담는다.
--
-- 보상 횟수 판정은 **정산(0020:366)과 같은 식** — 피추천 인플루언서의 `LIVE/CLEARING/SETTLED` 캠페인을
--   `(created_at, id)` 순으로 세어 첫 `REF_TIMES` 회. 여기서 다시 정의하지 않고 같은 규칙을 복제한다
--   (0020 은 캠페인 1건의 해당 여부, 여기는 진행 횟수 — 질문이 달라 함수를 나눌 수 없다).
--
-- 이 파일은 기존 함수를 바꾸지 않는다(추가만).
-- ============================================================

-- ------------------------------------------------------------
-- platform_ref_times() — 추천 보상 횟수 (REF_TIMES = 5). platform_settings 로 조절 가능.
-- ------------------------------------------------------------
create or replace function public.platform_ref_times()
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ref_times'), 5)
$$;

revoke all on function public.platform_ref_times() from public, anon, authenticated;
grant execute on function public.platform_ref_times() to service_role;

-- ------------------------------------------------------------
-- app_seller_ranking — 내 등급 카드 + 익명 리더보드
--   프로토타입 `(demo)/rank/+page.svelte`: 내 등급(상위 n%) · 다음 등급까지 남은 금액 · 등급별 혜택 표 ·
--   리더보드(3개월 매출 · 매출/팔로워 · 매출/좋아요 · 등급).
--
--   정지된 인플루언서(`active = false`)는 제외한다 — 프로토타입에는 정지 개념이 랭킹에 없었지만
--   실서비스에서 정지는 "판매할 수 없는 상태"라 순위에 남기지 않는다.
--   비공개(`hidden`)는 **포함**한다 — 리더보드는 전원 익명이라 신원이 드러나지 않고, 빼면 순위가
--   실제와 어긋난다(프로토타입도 전원 표시).
-- ------------------------------------------------------------
create or replace function public.app_seller_ranking(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s            public.sellers;
  v_grade      text;
  v_idx        integer;
  v_top_pct    integer;
  v_perk       text;
  v_bonus      numeric;
  v_next       record;
  v_rows       jsonb;
  v_tiers      jsonb;
  v_my_rank    integer;
  v_total      integer;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 내 등급 (0011 과 같은 규칙: 캐시 → 비면 m3_sales 로 재계산 · 표에 없으면 최하위)
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.sort_order, gt.top_pct, gt.perk, gt.bonus_pp
    into v_idx, v_top_pct, v_perk, v_bonus
    from public.grade_tiers gt where gt.name = v_grade;
  if v_idx is null then
    select gt.name, gt.sort_order, gt.top_pct, gt.perk, gt.bonus_pp
      into v_grade, v_idx, v_top_pct, v_perk, v_bonus
      from public.grade_tiers gt order by gt.sort_order desc limit 1;
  end if;

  -- 다음 등급 = 한 단 위(sort_order 작은 쪽). 최고 등급이면 없다.
  select gt.name, gt.min_m3_sales, gt.perk into v_next
    from public.grade_tiers gt where gt.sort_order = v_idx - 1;

  -- 등급별 혜택 표 (상위 등급부터)
  select jsonb_agg(jsonb_build_object(
           'name', gt.name, 'min_m3_sales', gt.min_m3_sales, 'top_pct', gt.top_pct,
           'bonus_pp', gt.bonus_pp, 'perk', gt.perk, 'is_mine', (gt.name = v_grade)
         ) order by gt.sort_order)
    into v_tiers from public.grade_tiers gt;

  -- 리더보드 — 본인 외 전원 익명. 이름·핸들·code 를 담지 않는다.
  with ranked as (
    select x.id,
           row_number() over (order by x.m3_sales desc, x.created_at, x.id) as rn,
           x.m3_sales, x.followers, x.likes_avg, x.category,
           coalesce(x.grade, public.grade_for_sales(x.m3_sales)) as grade
      from public.sellers x
     where x.active is not false
  )
  select jsonb_agg(jsonb_build_object(
           'rank', r.rn,
           'is_me', (r.id = p_seller_id),
           -- 내 행만 이름을 준다 (화면의 MY 배지). 남은 ○○○ 으로만 보인다.
           'name', case when r.id = p_seller_id then s.name else null end,
           'handle', case when r.id = p_seller_id then s.handle else null end,
           'category', r.category,
           'm3_sales', r.m3_sales,
           'followers', r.followers,
           'likes_avg', r.likes_avg,
           -- 효율 지표는 DB 가 계산한다 (0 나눗셈은 null)
           'per_follower', case when coalesce(r.followers, 0) > 0
                                then round(r.m3_sales::numeric / r.followers) else null end,
           'per_like', case when coalesce(r.likes_avg, 0) > 0
                            then round(r.m3_sales::numeric / r.likes_avg) else null end,
           'grade', r.grade
         ) order by r.rn), count(*)::integer
    into v_rows, v_total
    from ranked r;

  select r.rn into v_my_rank from (
    select x.id, row_number() over (order by x.m3_sales desc, x.created_at, x.id) as rn
      from public.sellers x where x.active is not false
  ) r where r.id = p_seller_id;

  return jsonb_build_object(
    'ok', true,
    'me', jsonb_build_object(
      'grade', v_grade, 'top_pct', v_top_pct, 'perk', v_perk, 'bonus_pp', v_bonus,
      'm3_sales', s.m3_sales, 'rank', v_my_rank, 'total', v_total,
      'next_grade', v_next.name,
      'next_min', v_next.min_m3_sales,
      'next_perk', v_next.perk,
      'next_gap', case when v_next.min_m3_sales is not null
                       then greatest(0, v_next.min_m3_sales - s.m3_sales) else null end,
      -- 다음 등급까지 진행률 (최고 등급이면 100)
      'next_pct', case when v_next.min_m3_sales is null or v_next.min_m3_sales = 0 then 100
                       else least(100, round(s.m3_sales::numeric * 100 / v_next.min_m3_sales))::integer end
    ),
    'tiers', coalesce(v_tiers, '[]'::jsonb),
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_seller_ranking(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_ranking(uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_referral — 내 추천 코드 · 내가 추천한 인플루언서 · 받은 보상
--   프로토타입 `(demo)/ref/+page.svelte`: 내 코드 · 보상 구조 · 누적 추천 수익 · 추천 인원 ·
--   인플루언서별 (보상 판매 진행 n/5 · 발생 수익).
--   내가 피추천인이면 부스트 남은 횟수도 준다(화면 상단 배너).
--
--   **추천한 인플루언서의 이름은 보여준다** — 내가 직접 데려온 사람이고 프로토타입도 실명이다
--   (리더보드의 익명 규칙은 "모르는 남" 에 대한 것이다).
-- ------------------------------------------------------------
create or replace function public.app_seller_referral(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s          public.sellers;
  v_times    integer := public.platform_ref_times();
  v_rows     jsonb;
  v_total    integer;
  v_count    integer;
  v_by_name  text;
  v_by_handle text;
  v_my_used  integer := 0;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 내가 추천한 인플루언서별: 보상 대상 판매 진행 횟수(0020:366 과 같은 상태 집합) + 발생 수익
  with mine as (
    select x.id, x.name, x.handle, x.avatar_url, x.created_at
      from public.sellers x where x.referred_by = p_seller_id
  ), used as (
    select c.seller_id, count(*)::integer as n
      from public.campaigns c
     where c.seller_id in (select id from mine)
       and c.status in ('LIVE', 'CLEARING', 'SETTLED')
     group by c.seller_id
  ), earned as (
    select e.referred_seller_id as sid, coalesce(sum(e.amount), 0)::integer as amt
      from public.referral_earnings e
     where e.side = 'seller' and e.referrer_seller_id = p_seller_id
     group by e.referred_seller_id
  )
  select jsonb_agg(jsonb_build_object(
           'name', m.name, 'handle', m.handle, 'avatar_url', m.avatar_url,
           'used', least(coalesce(u.n, 0), v_times),
           'times', v_times,
           'amount', coalesce(er.amt, 0),
           'joined_at', m.created_at
         ) order by m.created_at desc)
    into v_rows
    from mine m
    left join used u on u.seller_id = m.id
    left join earned er on er.sid = m.id;

  select count(*)::integer into v_count from public.sellers x where x.referred_by = p_seller_id;
  select coalesce(sum(e.amount), 0)::integer into v_total
    from public.referral_earnings e
   where e.side = 'seller' and e.referrer_seller_id = p_seller_id;

  -- 내가 추천받아 가입했나 — 부스트 배너용 (추천인 이름 + 남은 횟수)
  if s.referred_by is not null then
    select r.name, r.handle into v_by_name, v_by_handle from public.sellers r where r.id = s.referred_by;
    select count(*)::integer into v_my_used from public.campaigns c
      where c.seller_id = s.id and c.status in ('LIVE', 'CLEARING', 'SETTLED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ref_code', s.ref_code,
    'times', v_times,
    'total', v_total,
    'count', v_count,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'referred_by', case when s.referred_by is null then null else jsonb_build_object(
      'name', v_by_name, 'handle', v_by_handle,
      'used', least(coalesce(v_my_used, 0), v_times),
      'left', greatest(0, v_times - coalesce(v_my_used, 0))
    ) end
  );
end;
$$;

revoke all on function public.app_seller_referral(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_referral(uuid) to service_role;
