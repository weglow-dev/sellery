-- ============================================================
-- 0079 — MYR 주문 상세 "이 주문의 문의" 를 마이 "내 문의" 와 같은 모양으로(2026-11-06 대표 피드백)
--
--   myr_app_cs_for_order(order)   0063 은 코드 · 유형 · 상태 · 상품 이름만 줬다(답변 내용은 /cs/<code> 를 열어야 보였다).
--                                 이제 문의마다 스레드 전체 = myr_cs_thread_json(대화 JSON + 메시지) — 마이 "내 문의" 아코디언과 같은 데이터.
--                                 최근 메시지순. 주문 소유는 호출하는 라우트가 이미 확인했다(myr_app_order_view · 비회원 조회 토큰) —
--                                 비회원도 문의를 남긴 기기가 아니어도 주문 상세에서 답변을 본다.
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_cs.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_app_cs_for_order(p_order_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.myr_cs_thread_json(c) order by c.last_message_at desc)
                     from public.myr_cs_conversations c where c.order_id = p_order_id), '[]'::jsonb)
$$;
revoke all on function public.myr_app_cs_for_order(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_cs_for_order(uuid) to service_role;
