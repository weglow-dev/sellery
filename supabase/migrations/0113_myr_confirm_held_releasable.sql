-- ============================================================
-- 0113 · MYR 운영의 보류 확정이 "풀 수 있는 보류 줄" 함수를 쓴다 — 회차 자동 해제와 같은 기준 (2026-11-17)
--
--   점검(백엔드 원칙 1): "지금 확정할 수 있는 보류 줄"을 두 곳이 정했다.
--     회차 자동 해제(myr_settlement_run)      myr_settlement_row_releasable(r) = 보류 + 제조 원장 있음
--     운영 보류 확정(myr_settlement_confirm_held)  원장 있는지 먼저 보고(NO_MFG) → x.status = 'held' 를 따로 고름
--   두 단계로 나뉘어 검사 규칙(status = 'held' and myr_mfg_has_ledger)에도 잡히지 않았다. 한쪽 조건이 바뀌면 둘이 다른 줄을 푼다.
--   고침: 운영 보류 확정의 줄 고르기를 myr_settlement_row_releasable 로 · 거절 코드(NOT_FOUND · NO_MFG · NOTHING_HELD)는 그대로
--   계산 결과 불변 — 원장이 있는 것을 확인한 뒤라 releasable = 보류 · 반환 모양 그대로
--   테스트: supabase/tests/myr_confirm_held_releasable.test.sql · 기존 정산 · 지급 테스트(NO_MFG · 확정 · NOTHING_HELD)
-- ============================================================

-- 0087 정의 → 줄 고르기만 myr_settlement_row_releasable
create or replace function public.myr_settlement_confirm_held(p_product_id uuid, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r     record;
  v_n   integer := 0;
  v_pay integer := 0;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_mfg_has_ledger(p_product_id) then return jsonb_build_object('ok', false, 'code', 'NO_MFG'); end if;
  for r in select x.id from public.myr_settlement_rows x join public.myr_settlement_runs u on u.id = x.run_id
            where x.product_id = p_product_id and public.myr_settlement_row_releasable(x) order by u.month loop
    perform public.myr_settlement_apply(r.id, coalesce(p_actor, 'script'));
    v_n := v_n + 1;
    v_pay := v_pay + (select payout from public.myr_settlement_rows where id = r.id);
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_HELD'); end if;
  return jsonb_build_object('ok', true, 'confirmed', v_n, 'payout', v_pay);
end;
$$;
revoke all on function public.myr_settlement_confirm_held(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_settlement_confirm_held(uuid, text) to service_role;
