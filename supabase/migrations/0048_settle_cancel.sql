-- ============================================================
-- 0048 — 미지급 정산 취소 + 기일 전 강제 실행 사유 필수
--
-- 배경: 정산 실행을 되돌릴 경로가 **하나도 없었다**. `unsettle`·`revert`·`undo` 어느 이름으로도
--   함수가 없고, `payouts` 는 `paid` 가 종착점이다(`app_admin_payout_hold`·`release` 가 전부
--   `ALREADY_PAID` 로 거부 · 0020). 정산 1건이 남기는 것을 실측하면:
--     settlements +1 · payouts +3 · referral_earnings +1 · campaign_events +3 · campaigns.status → SETTLED
--   오조작하면 이 전부를 프로덕션 DB 에서 손으로 되돌려야 했다.
--
-- 운영 결정 (2026-10-08)
--   1. **돈이 한 푼도 안 나간 정산만 취소한다.** `payouts` 가 하나라도 `paid` 면 막는다 —
--      `paid` 는 "실제로 보냈다" 는 기록이고(이체 파일·토스 지급대행), DB 를 되돌려도 나간 돈은
--      돌아오지 않는다. 되돌리면 다음 배치에서 **이중 지급**이 된다.
--   2. **이미 보낸 뒤의 정정은 만들지 않는다.** 과지급 회수·추가 지급은 회계 정책이 걸린 별건이다
--      (반대 분개 · 다음 정산 차감 · 별도 청구 중 어느 것인지 운영·세무 판단).
--   3. **기일 전 강제 실행(`p_force`)은 남기되 사유를 필수로 받는다.** 제거를 검토했으나 실제 업무가
--      있다 — 지급 리허설(`docs/launch-checklist.md:184` · `:264` `settle-run <c> --force`).
--      지금은 memo 에 `'기준일 전 강제 실행'` 고정 문구만 들어가 **누가 왜 당겼는지 남지 않는다.**
--
-- 왜 취소가 안전한가: `payouts` 전부 `pending` 이면 돈이 움직이지 않았다는 뜻이다. 그 상태에서
--   파생 행을 지우고 캠페인을 `CLEARING` 으로 되돌리면 "정산하지 않은 상태" 와 같아진다 —
--   `app_admin_settle_run` 이 멱등하므로(SETTLED 조기 반환) 다시 실행할 수 있다.
--
-- 지우는 것: settlements(1) · payouts(그 정산의 전부) · referral_earnings(그 정산 것만)
-- 남기는 것: **campaign_events** — 정산했다 취소한 사실은 기록으로 남아야 한다(취소 이벤트를 더한다).
--
-- ⚠ **등급·m3_sales 를 반드시 다시 계산한다.** 처음에는 "월간 재계산(0032)이 바로잡는다" 고 두었는데
--   그러면 **영구 오염**이 생긴다. `m3_sales = m3_sales_base + Σ settlements.net(최근 3개월)` 인데
--   0032 의 기저 백필 조건이 `m3_sales_base = 0 and m3_sales > 0 and 정산 스냅샷 없음` 이다 —
--   취소 직후 상태가 정확히 그것이라(스냅샷은 지웠고 m3_sales 는 남았고 base 는 0) 다음 월간
--   재계산이 **부풀려진 m3_sales 를 기저로 굳힌다.** 그래서 취소 트랜잭션 안에서
--   `app_seller_grade_recalc` · `app_brand_grade_recalc` 를 불러 base + Σ(=0) 로 되돌린다.
-- ============================================================

-- ------------------------------------------------------------
-- app_admin_settle_cancel(p_campaign_id, p_reason, p_actor_user_id) — 미지급 정산 취소
--   `payouts` 전부 `pending` 일 때만. 하나라도 `paid` 면 `HAS_PAID`(held 는 돈이 안 나갔으니 허용).
--   사유 필수 — `campaign_events` 에 남아 인플루언서·브랜드 스레드에도 보인다.
--   반환: { ok:true, campaign_code, settlement_id, deleted:{payouts,referral_earnings} }
--       | { ok:false, code:'NOT_FOUND' | 'BAD_REASON' | 'WRONG_STATUS'(status) | 'NO_SETTLEMENT' | 'HAS_PAID'(paid_count) }
-- ------------------------------------------------------------
create or replace function public.app_admin_settle_cancel(
  p_campaign_id   uuid,
  p_reason        text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c         public.campaigns%rowtype;
  st        public.settlements%rowtype;
  v_reason  text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_paid    integer;
  v_po      integer;
  v_ref     integer;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  v_reason := left(v_reason, 200);
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_REASON');
  end if;

  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status <> 'SETTLED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  select * into st from public.settlements where campaign_id = c.id for update;
  if not found then
    -- 상태는 SETTLED 인데 스냅샷이 없다 — 손으로 고친 흔적이다. 자동으로 손대지 않는다.
    return jsonb_build_object('ok', false, 'code', 'NO_SETTLEMENT');
  end if;

  -- 돈이 나간 건이 하나라도 있으면 취소하지 않는다 (held 는 보류일 뿐 지급 전이라 허용)
  select count(*)::integer into v_paid
    from public.payouts where settlement_id = st.id and status = 'paid';
  if v_paid > 0 then
    return jsonb_build_object('ok', false, 'code', 'HAS_PAID', 'paid_count', v_paid);
  end if;

  with d as (delete from public.payouts where settlement_id = st.id returning id)
  select count(*)::integer into v_po from d;

  with d as (delete from public.referral_earnings where settlement_id = st.id returning id)
  select count(*)::integer into v_ref from d;

  delete from public.settlements where id = st.id;

  update public.campaigns set status = 'CLEARING' where id = c.id;

  -- 등급·m3_sales·🥬 기준액을 **스냅샷 삭제 후** 다시 계산한다(위 ⚠ 참고).
  --   `app_seller_grade_recalc` 가 `m3_sales = base + Σ settlements.net(최근 3개월)` 로 다시 쓰고
  --   `sellers_sync_grade` 트리거가 등급을 맞춘다. 브랜드도 같다.
  perform public.app_seller_grade_recalc(c.seller_id);
  perform public.app_brand_grade_recalc(c.brand_id);

  -- 정산했다 취소한 사실은 남긴다 — 지운 행 수와 사유를 함께
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id,
          format('셀러리 관리자가 정산을 취소했습니다 · 지급 전이라 되돌렸고 교환/환불 기간으로 돌아갑니다 · 사유: %s', v_reason),
          'settle_canceled',
          jsonb_build_object('reason', v_reason, 'settlement_id', st.id,
                             'deleted_payouts', v_po, 'deleted_referral_earnings', v_ref,
                             'net', st.net, 'today', v_today));

  return jsonb_build_object('ok', true, 'campaign_code', c.code, 'settlement_id', st.id,
                            'deleted', jsonb_build_object('payouts', v_po, 'referral_earnings', v_ref));
end;
$$;
revoke all on function public.app_admin_settle_cancel(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_settle_cancel(uuid, text, uuid) to service_role;

comment on function public.app_admin_settle_cancel(uuid, text, uuid) is
  '미지급 정산 취소 (0048) — payouts 전부 pending 일 때만. 지급 완료가 있으면 HAS_PAID. 사유 필수 · 이벤트 settle_canceled';

-- ------------------------------------------------------------
-- app_admin_settle_run — 기일 전 강제 실행에 **사유를 받는다** (0020 → 0048)
--   `p_force = true` 인데 사유가 없으면 `FORCE_REASON_REQUIRED`. 사유는 `settlements.memo` 에 남는다
--   (전에는 `'기준일 전 강제 실행'` 고정 문구라 누가 왜 당겼는지 알 수 없었다).
--   실제 업무: 지급 리허설(docs/launch-checklist.md §8-13 · `settle-run <c> --force`).
--
--   0020 본문을 그대로 두고 **앞에서 가로채는 래퍼**로 만들지 않고 인자를 추가한 이유:
--   `p_force` 와 사유는 한 트랜잭션에서 같은 스냅샷(memo)에 들어가야 한다. 래퍼로는 memo 를 못 바꾼다.
--   그래서 0020 의 함수를 호출한 뒤 memo 만 덮어쓴다 — 정산 로직은 한 곳(0020)에 그대로 둔다.
-- ------------------------------------------------------------
create or replace function public.app_admin_settle_run_v2(
  p_campaign_id   uuid,
  p_actor_user_id uuid default null,
  p_force         boolean default false,
  p_force_reason  text default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_res    jsonb;
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_force_reason, ''), '\s+', ' ', 'g')), '');
  v_sid    uuid;
begin
  if coalesce(p_force, false) then
    v_reason := left(v_reason, 200);
    if v_reason is null then
      return jsonb_build_object('ok', false, 'code', 'FORCE_REASON_REQUIRED');
    end if;
  end if;

  v_res := public.app_admin_settle_run(p_campaign_id, p_actor_user_id, p_force);

  -- 강제 실행이 **새로** 정산을 만들었을 때만 memo 를 사유로 바꾼다(already 는 손대지 않는다)
  if coalesce(p_force, false) and (v_res -> 'ok')::boolean and not coalesce((v_res -> 'already')::boolean, false) then
    v_sid := nullif(v_res ->> 'settlement_id', '')::uuid;
    if v_sid is not null then
      update public.settlements
         set memo = format('기준일 전 강제 실행 · 사유: %s', v_reason)
       where id = v_sid;
      v_res := v_res || jsonb_build_object('force_reason', v_reason);
    end if;
  end if;

  return v_res;
end;
$$;
revoke all on function public.app_admin_settle_run_v2(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.app_admin_settle_run_v2(uuid, uuid, boolean, text) to service_role;

comment on function public.app_admin_settle_run_v2(uuid, uuid, boolean, text) is
  '정산 실행 + 기일 전 강제 실행 사유 필수 (0048). 정산 로직은 0020 app_admin_settle_run 그대로 · force 면 사유를 settlements.memo 에 남긴다';
