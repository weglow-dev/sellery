-- ============================================================
-- 0032 — 등급 월간 재계산 (전원 일괄)
--
-- 배경: 등급은 "최근 3개월 확정 매출" 로 정한다(`grade_for_sales` · `brand_grade_for_gmv`). `sellers.grade` 는
--   `m3_sales` 가 바뀔 때 트리거(`sellers_sync_grade` · 0001:378)가 맞춰 주므로 승급·강등이 모두 자동이다.
--   **문제는 `m3_sales` 를 갱신하는 주체가 정산 실행뿐이었다**(0020:679 — 그 캠페인의 당사자만).
--   판매가 끊긴 인플루언서는 3개월이 지나 매출이 집계 구간에서 빠져도 등급이 고점에 멈춘다.
--   인플루언서 홈은 "등급은 최근 3개월 확정 매출로 **매달** 다시 계산되고…" 로 안내하고 있었다
--   (`home/+page.svelte`) — 화면이 약속한 동작을 코드가 하지 않았다.
--
-- 운영 결정(2026-10-02): **매월 1일 전원 재계산** · **판매가 끊기면 강등된다.**
--   지급은 지금처럼 **정산 실행 시점 등급**으로 한다(등급 보너스는 플랫폼 부담이므로 브랜드 계약을 깨지 않는다.
--   브랜드가 부담하는 수수료율만 `campaigns.rate_locked` 로 고정한다 — settlement-policy §1).
--
-- 이 파일은 기존 함수를 바꾸지 않는다(추가만). 1건 재계산(`app_seller_grade_recalc` ·
-- `app_brand_grade_recalc`)을 그대로 호출하므로 계산 규칙이 갈라지지 않는다.
--
-- **`m3_sales_base` 백필 보정이 함께 들어간다.** `m3_sales = m3_sales_base + Σ settlements.net(최근 3개월)`
--   인데, 0020 의 백필은 마이그레이션 시점에 돌아서 그 뒤에 들어온 행(시드 · 오프라인 계약자 이관)은
--   `base = 0` 으로 남는다. 그 상태로 전원 재계산을 돌리면 **정산 이력이 없는 모든 파트너가 스타터로
--   떨어진다**(로컬 `db reset` 에서 실제로 재현했다 — s1~s8 전원 강등). 크론으로 매달 돌릴 함수라
--   같은 보정을 매번 적용해 사고를 막는다.
-- ============================================================

-- ------------------------------------------------------------
-- app_grade_recalc_all() — 인플루언서·브랜드 전원 재계산 (크론 `/api/cron/grade-tick`)
--   · 1건 함수를 그대로 부른다 — 규칙을 두 곳에 두지 않는다.
--   · 멱등: 등급이 같으면 update 가 일어나지 않는다(1건 함수의 `is distinct from` 가드).
--   · 정지(`active = false`)·삭제된 파트너도 포함한다 — 복구 시 등급이 맞아야 하고, 제외하면
--     정지 기간만큼 등급이 과거에 멈춘다. 대신 응답의 집계에서는 구분하지 않는다.
--   · 변경된 것만 `changed_sellers` · `changed_brands` 에 코드로 담는다(운영 확인용 · 최대 200개).
--     전원을 담으면 응답이 커지고 로그가 쓸모없어진다.
-- ------------------------------------------------------------
create or replace function public.app_grade_recalc_all()
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r              record;
  d              jsonb;
  v_sellers      integer := 0;
  v_brands       integer := 0;
  v_s_changed    integer := 0;
  v_b_changed    integer := 0;
  v_s_codes      text[]  := '{}';
  v_b_codes      text[]  := '{}';
  v_today        date    := (now() at time zone 'Asia/Seoul')::date;
  v_backfilled   integer := 0;
begin
  -- 기저 보정 — 0020 백필과 **같은 조건**이다(정산 스냅샷이 없는 행의 현재 m3_sales 가 곧 기저).
  -- 0020 이후에 들어온 행(시드 · 오프라인 계약자)을 여기서 구제한다. 정산이 있는 행은 건드리지 않는다.
  with f as (
    update public.sellers s
       set m3_sales_base = s.m3_sales
     where s.m3_sales_base = 0
       and s.m3_sales > 0
       and not exists (
         select 1 from public.settlements st
           join public.campaigns c on c.id = st.campaign_id
          where c.seller_id = s.id)
    returning 1
  ) select count(*)::integer into v_backfilled from f;
  for r in select id, code from public.sellers order by created_at, id loop
    d := public.app_seller_grade_recalc(r.id);
    v_sellers := v_sellers + 1;
    if coalesce((d ->> 'changed')::boolean, false) then
      v_s_changed := v_s_changed + 1;
      if array_length(v_s_codes, 1) is null or array_length(v_s_codes, 1) < 200 then
        -- "s1 다이아→플래티넘" 형태로 남긴다 — 어느 방향으로 바뀐지가 운영에 중요하다
        v_s_codes := v_s_codes || format('%s %s→%s', coalesce(r.code, r.id::text),
                                         coalesce(d ->> 'previous_grade', '-'), coalesce(d ->> 'grade', '-'));
      end if;
    end if;
  end loop;

  for r in select id, code from public.brands order by created_at, id loop
    d := public.app_brand_grade_recalc(r.id);
    v_brands := v_brands + 1;
    if coalesce((d ->> 'changed')::boolean, false) then
      v_b_changed := v_b_changed + 1;
      if array_length(v_b_codes, 1) is null or array_length(v_b_codes, 1) < 200 then
        v_b_codes := v_b_codes || format('%s %s→%s', coalesce(r.code, r.id::text),
                                         coalesce(d ->> 'previous', '-'), coalesce(d ->> 'grade', '-'));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'today', v_today,
    'base_backfilled', v_backfilled,
    'sellers', v_sellers, 'brands', v_brands,
    'sellers_changed', v_s_changed, 'brands_changed', v_b_changed,
    'changed_sellers', to_jsonb(v_s_codes), 'changed_brands', to_jsonb(v_b_codes)
  );
end;
$$;

revoke all on function public.app_grade_recalc_all() from public, anon, authenticated;
grant execute on function public.app_grade_recalc_all() to service_role;
