-- ============================================================
-- 0031 — 독점권 승인 화면에 "진행 중인 다른 인플루언서 캠페인" 수를 싣는다
--
-- 배경: 독점권 승인(`app_brand_decide_exclusive` 0025)은 `products.exclusive_seller_id` 만 세운다.
--   잠금은 **새로 들어오는 것**(샘플 요청 0011 · 초대 후보/초대/수락 0016 · 0017)만 막고, 승인 전에 이미
--   생긴 다른 인플루언서의 캠페인은 샘플 승인 · 발송 · 일정 · LIVE 까지 그대로 간다(프로토타입 `approveExcl`
--   과 같다 — docs/period-policy.md §3). 그런데 브랜드 처리 대기 화면은 "승인하면 그 인플루언서만 이 상품을
--   진행합니다" 라고 안내해, 기존 캠페인도 멈추는 것처럼 읽혔다.
--
-- 결정(2026-09-30): 독점은 **승인 시점부터 새로 들어오는 것만** 막는다. 기존 캠페인은 끝까지 진행한다.
--   동작은 바꾸지 않고, 승인 전에 브랜드가 그 수를 보도록 목록에 `others_active` 를 더한다.
--
-- 진행 중 = 캠페인 상태가 REJECTED · PASSED · DECLINED · SETTLED 가 아님 (0016 초대 후보의 "진행 중" 과 같다)
-- `app_brand_exclusive_requests` 를 다시 정의한다 — 0025 와 같고 `others_active` 한 키만 다르다.
-- ============================================================

create or replace function public.app_brand_exclusive_requests(p_brand_id uuid, p_status text default 'PENDING')
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(t.r order by t.created_at), '[]'::jsonb))
  from (
    select jsonb_build_object(
             'id', x.id, 'status', x.status,
             'product_id', x.product_id, 'product_code', p.code, 'product_name', p.name,
             'exclusive_label', p.exclusive_label, 'exclusive_grade', p.exclusive_grade,
             'locked', (p.exclusive_seller_id is not null),
             'locked_seller_id', p.exclusive_seller_id,
             'others_active', (select count(*)::integer from public.campaigns c
                                where c.product_id = x.product_id and c.seller_id <> x.seller_id
                                  and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED')),
             'seller_id', s.id, 'seller_code', s.code, 'seller_name', s.name,
             'seller_handle', s.handle, 'seller_grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)),
             'seller_followers', s.followers, 'seller_m3_sales', s.m3_sales,
             'created_at', x.created_at, 'decided_at', x.decided_at
           ) as r, x.created_at
    from public.exclusive_requests x
    join public.products p on p.id = x.product_id
    join public.sellers  s on s.id = x.seller_id
    where p.brand_id = p_brand_id
      and p.deleted_at is null
      and (p_status is null or x.status = p_status)
  ) t;
$$;

revoke all on function public.app_brand_exclusive_requests(uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_exclusive_requests(uuid, text) to service_role;
