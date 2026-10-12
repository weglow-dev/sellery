-- ============================================================
-- 0051 — 정산 후 환불 과지급 경고용 조회
--
-- 배경: 정산이 확정된 뒤 환불이 들어오면 **그만큼 과지급된다.** 정산은 보관액을 남김없이 쪼개는
--   구조이기 때문이다(실측):
--
--     보관액(net) 13,221,900 = PG 251,216 + 브랜드 9,334,661 + 인플(세전) 2,578,271
--                              + 추천 264,438 + 플랫폼 순수익 721,195 + VAT 72,119   → 차이 0
--
--   환불 ₩24,900 을 실행하면 **보관액만** 13,197,000 으로 줄고 `payouts` 금액은 그대로다
--   (실측: 브랜드·추천·인플 지급액이 환불 전후 동일). 약속한 금액을 다 보내면 ₩24,900 이 모자라고
--   그 차액을 **플랫폼이 자기 돈으로 메운다**(순수익에서 빠진다 · 0050 `platform_net_adjusted`).
--
--   깎을 수 있는 대상이 플랫폼뿐이다 — 파트너 지급액은 `payouts` 에 확정돼 있고 깎는 함수가 없으며,
--   PG 수수료·VAT 는 셀러리가 정할 수 없다.
--
-- 왜 금액을 자동으로 깎지 않나 — **설계가 수동 조정이다**
--   `docs/app-plan.md:625` · `docs/deploy.md:228`: "정산 완료 캠페인 · 샘플 주문의 콘솔 취소도 같은 큐
--   (`orders.status='CANCELED'`)로 간다 — **수동 정산 조정**". `0020:47` 과
--   `admin-refund.server.ts:6` 도 "정산 스냅샷은 그대로 · **조정은 운영자**" 로 적었고,
--   `docs/admin-console-plan.md:123` 은 `SETTLED` 면 "정산 조정으로 기록" **안내만** 둔다.
--   자동 차감 RPC 는 설계에 없다.
--
--   데모에는 이 상황이 아예 없다 — 프로토타입은 정산 후 환불을 **막는다**
--   (`core/actions.ts:222` "정산이 완료된 판매의 주문은 환불 처리할 수 없습니다 — 별도 CS 정산 조정 필요" ·
--   docs/period-policy.md:220 · settlement-policy.md:168). 실서비스가 허용하는 이유는 약관 제14조의
--   법정 기간이 D+21 을 넘기기 때문이다(표시·광고 상이 3개월 · 하자 30일 — `terms.ts:237`).
--
-- 그래서 이 마이그레이션은 **금액을 건드리지 않는다.** 운영자가 지급 버튼을 누르기 전에 알도록
-- 조회만 제공한다. 지급 전이면 정산 취소(0048) → 재실행으로 되돌릴 수 있다
-- (이미 있는 두 기능의 조합 · docs/settlement-policy.md §8).
-- ============================================================

-- ------------------------------------------------------------
-- app_admin_post_settle_refunds(p_limit) — 정산 후 환불이 있는 정산 건 목록
--   화면이 지급 카드마다 쓰므로 **한 번에** 받아 간다(건당 호출 N+1 을 피한다).
--   `campaign_post_settle_refunds`(0050)와 같은 조건 — `CANCELED` 주문의 `refund_amount`.
--   `SETTLED` 캠페인만 — 정산 전 환불은 이미 `net` 에서 빠져 과지급이 아니다.
--   반환: { ok:true, rows:[{ campaign_id, campaign_code, settlement_id, amount, count, unpaid_payouts, paid_payouts }] }
--     unpaid_payouts  아직 지급하지 않은 건수 — 0 이면 이미 다 나갔다(사후 조정만 가능)
-- ------------------------------------------------------------
create or replace function public.app_admin_post_settle_refunds(p_limit integer default 200)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(r order by (r ->> 'amount')::bigint desc), '[]'::jsonb))
    from (
      select jsonb_build_object(
               'campaign_id', c.id,
               'campaign_code', c.code,
               'settlement_id', st.id,
               'amount', sum(o.refund_amount),
               'count', count(*),
               'unpaid_payouts', (select count(*) from public.payouts po
                                   where po.settlement_id = st.id and po.status <> 'paid'),
               'paid_payouts', (select count(*) from public.payouts po
                                 where po.settlement_id = st.id and po.status = 'paid')) as r
        from public.orders o
        join public.campaigns c   on c.id = o.campaign_id
        join public.settlements st on st.campaign_id = c.id
       where o.status = 'CANCELED'
         and coalesce(o.refund_amount, 0) > 0
         and c.status = 'SETTLED'
       group by c.id, c.code, st.id
       limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) q
$$;
revoke all on function public.app_admin_post_settle_refunds(integer) from public, anon, authenticated;
grant execute on function public.app_admin_post_settle_refunds(integer) to service_role;

comment on function public.app_admin_post_settle_refunds(integer) is
  '정산 후 환불이 있는 정산 건 (0051) — 지급 화면이 과지급 경고에 쓴다. 금액은 건드리지 않는다(설계가 수동 정산 조정 · app-plan.md:625)';
