-- ============================================================
-- 0084 — MYR 품절 상품도 찜 목록에 남는다(2026-11-09 대표 결정)
--
--   0057 myr_likes_get 은 "살 수 있는 상품"(myr_product_available — 판매 중 · 활성 셀러 · 남은 재고 > 0)만 돌려줬다.
--   그래서 품절 상품을 찜하면 DB 에는 저장되는데 응답 목록에서 빠져 하트가 바로 꺼져 보였다.
--   이제 찜 목록은 **판매 중 · 삭제 안 됨 · 활성 셀러**면 품절이어도 싣는다(카드의 sold_out 이 품절을 보여 준다 — 재입고 대기).
--   심사 중 · 일시중지 · 종료 · 비활성 셀러는 지금처럼 뺀다. 장바구니(myr_cart_get · available)는 그대로.
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_cart_likes.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_likes_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.myr_product_public_json(p, s) order by l.created_at desc), '[]'::jsonb)
    from public.myr_likes l
    join public.myr_products p on p.id = l.product_id
    join public.sellers s on s.id = p.seller_id
   where l.user_id = p_user_id and p.status = 'listed' and p.deleted_at is null and coalesce(s.active, false)
$$;
revoke all on function public.myr_likes_get(uuid) from public, anon, authenticated;
grant execute on function public.myr_likes_get(uuid) to service_role;
