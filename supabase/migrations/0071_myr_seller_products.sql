-- ============================================================
-- 0071 — MYR 크리에이터 콘솔 "내 제품" 읽기(docs/myr.md §4.2.1 3번 · 2026-11-05)
--
--   myr_products.status 에 두 상태 추가
--     draft   임시저장 — 상품 등록 에디터에서 저장만 한 것(4번 · 제출하면 pending)
--     ended   판매 종료 — 판매를 끝낸 상품(샵에서 내려감 · 지난 주문 · 환불은 그대로)
--     → draft · pending(심사 중) · listed(판매 중) · paused(일시중지) · rejected(반려) · ended
--     샵 공개 RPC(0056 myr_home_products · myr_product_card)와 체크아웃(0058)은 원래 listed 만 보므로 두 상태는 샵에 나오지 않는다.
--
--   myr_app_seller_products(seller)  그 크리에이터의 상품(삭제 제외 · 최근 수정순) — 콘솔 내 제품 · 홈 카운트
--     → [{ id, code, name, status, reject_reason, category, price, option_count, stock, sold_qty, stock_left,
--          tile, icon, thumb_url, submitted_at, reviewed_at, created_at, updated_at }]
--     stock_left = stock − sold_qty(0 아래면 0) — 콘솔은 읽기 전용(창고 기준 · 크리에이터가 입력하지 않는다 · 결정 13)
--     마진율 · 검수자 · 상세 섹션은 싣지 않는다(목록에 필요 없음 · 4번 에디터가 따로 읽는다)
--
--   권한: service role 만(anon · authenticated EXECUTE 회수) — 크리에이터 id 는 콘솔 서버가 세션(requireSeller)에서 정해 넘긴다(결정 3).
--   테스트: supabase/tests/myr_seller_products.test.sql. 재실행 가능.
-- ============================================================

alter table public.myr_products drop constraint if exists myr_products_status_check;
alter table public.myr_products add constraint myr_products_status_check
  check (status in ('draft', 'pending', 'listed', 'paused', 'rejected', 'ended'));

create index if not exists myr_products_seller_updated_idx on public.myr_products (seller_id, updated_at desc) where deleted_at is null;

create or replace function public.myr_app_seller_products(p_seller uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status, 'reject_reason', p.reject_reason,
           'category', p.category, 'price', p.price, 'option_count', jsonb_array_length(p.options),
           'stock', p.stock, 'sold_qty', p.sold_qty, 'stock_left', greatest(p.stock - p.sold_qty, 0),
           'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url,
           'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'created_at', p.created_at, 'updated_at', p.updated_at
         ) order by p.updated_at desc, p.created_at desc), '[]'::jsonb)
    from public.myr_products p
   where p.seller_id = p_seller
     and p.deleted_at is null
$$;
revoke all on function public.myr_app_seller_products(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_products(uuid) to service_role;
