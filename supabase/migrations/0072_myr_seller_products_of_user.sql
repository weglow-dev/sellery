-- ============================================================
-- 0072 — "내 제품" 을 로그인 계정으로 바로 조회(2026-11-05 · 콘솔 탭 이동 속도)
--   myr_app_seller_products_of_user(user) = 그 계정에 연결된 크리에이터(sellers.user_id)의 myr_app_seller_products(0071) 결과 · 연결이 없으면 []
--   콘솔은 크리에이터 게이트(정지 · 연결 여부 — sellers 조회)와 이 조회를 **동시에** 보낸다 — 크리에이터 id 를 먼저 받아야 하던 순서 대기(DB 왕복 1번)가 없어진다.
--   게이트가 통과하지 않으면 콘솔은 이 결과를 버리고 이동한다. 행 모양 · 필터 · 정렬은 0071 함수 하나에만 있다(그대로 호출).
--   계정 id 는 콘솔 서버가 검증한 세션에서만(결정 3). 권한: service role 만. 테스트: supabase/tests/myr_seller_products.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_app_seller_products_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select public.myr_app_seller_products(s.id) from public.sellers s where s.user_id = p_user), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_products_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_products_of_user(uuid) to service_role;
