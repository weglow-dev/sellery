-- ============================================================
-- 0091 — MYR 교환·환불 승인 메시지 선택(2026-11-11 대표 피드백)
--
--   myr_app_claim_decide   0078 정의에서 메시지 검사만 바뀐다:
--                          승인 = 메시지 없어도 된다(빈 값은 null 로 저장 · 고객 메일은 결과 · 환불 예정 금액 · 다음 단계만)
--                          반려 = 지금처럼 필수(사유를 고객에게 알린다) · 둘 다 1000자까지
--                          그 밖의 판정(처리 방법 · 차감 · 회수 · 묶음 잠금)은 그대로.
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_refund_quote.test.sql · myr_refund_requests.test.sql. 재실행 가능.
-- ============================================================

-- 0078 정의 + 승인 메시지 선택
create or replace function public.myr_app_claim_decide(p_code text, p_user uuid, p_decision text, p_resolution text, p_message text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      public.myr_refund_requests%rowtype;
  i      public.myr_order_items%rowtype;
  v_msg  text := nullif(btrim(coalesce(p_message, '')), '');
  v_fee  integer;
begin
  select r2.* into r from public.myr_refund_requests r2 join public.sellers s on s.id = r2.seller_id
   where s.user_id = p_user and r2.code = lower(btrim(coalesce(p_code, ''))) for update of r2;
  if not found or p_user is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', r.status); end if;
  -- 같은 묶음의 다른 요청을 동시에 승인해도 배송비가 두 번 빠지지 않게 묶음을 잠근다
  perform 1 from public.myr_refund_requests q where q.batch = r.batch for update;
  if p_decision is null or p_decision not in ('approve','reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  -- 승인은 메시지 선택(비우면 null · 메일은 결과 · 다음 단계만) · 반려는 사유를 고객에게 알려야 하니 필수 · 둘 다 1000자까지
  if (p_decision = 'reject' and v_msg is null) or length(coalesce(v_msg, '')) > 1000 then return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE'); end if;

  if p_decision = 'reject' then
    update public.myr_refund_requests set status = 'rejected', message = v_msg, decided_at = now(), decided_by = p_user, done_at = now() where id = r.id
      returning * into r;
    return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', false);
  end if;

  if p_resolution is null or not (p_resolution = any (public.myr_refund_request_options(r.kind, r.reason))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION');
  end if;
  select * into i from public.myr_order_items where id = r.order_item_id;
  v_fee := public.myr_refund_request_fee_due(r);
  -- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다(같은 묶음에서 이미 뺐으면 v_fee = 0 → 전액과 같다)
  if p_resolution = 'partial' and i.unit_price * r.qty <= v_fee then return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION'); end if;

  update public.myr_refund_requests
     set status = 'progress', resolution = p_resolution, message = v_msg, decided_at = now(), decided_by = p_user,
         needs_refund  = p_resolution in ('refund','partial'),
         needs_reship  = p_resolution in ('reship','reship_collect'),
         -- 파손 · 누액은 회수 없이(사진으로 확인) · 단순 변심 · 오배송 환불과 회수 후 재발송은 회수
         needs_collect = case when p_resolution = 'reship_collect' or p_resolution = 'partial' then true
                              when p_resolution = 'refund' then r.reason <> '파손 · 누액'
                              else false end,
         deduction     = case when p_resolution = 'partial' then v_fee else 0 end
   where id = r.id
   returning * into r;
  return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', public.myr_refund_request_step(r) = 'refund');
end;
$$;
revoke all on function public.myr_app_claim_decide(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_claim_decide(text, uuid, text, text, text) to service_role;
