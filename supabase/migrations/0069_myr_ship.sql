-- ============================================================
-- 0069 — MYR 발송 처리(운송장) RPC — 운영 스크립트 myr-ops.mjs(S8) 와 운영 콘솔 myr-admin(M6)이 같은 함수를 부른다.
--   발송은 MYR 물류센터가 주문 단위로 한 번에(결정 8) — 주문 1건 = 운송장 1개. 고객 화면 statusLabel 은 tracking_no/shipped_at 로 "배송 중".
--   myr_app_admin_ship(code, courier, tracking_no)  PAID·PARTIAL_REFUNDED 만 · 택배사 5곳(0004 enum 과 같은 한글명) · 운송장 숫자 8~30(하이픈·공백 무시)
--       같은 택배사·운송장이면 already:true(메일 없음) · 다르면 정정(shipped_at 은 처음 값 유지 · 호출자가 메일을 다시 보낼지 정한다)
--       { ok, already, order_id, order_code, status, courier, tracking_no, shipped_at } · { ok:false, code: NOT_FOUND | WRONG_STATUS | BAD_COURIER | BAD_TRACKING }
--   myr_app_admin_ship_pending(limit, shipped)      발송 대기(= PAID·PARTIAL_REFUNDED · 운송장 없음) 목록 · shipped=true 면 발송된 것(최근순)
--   권한: service role 만. 테스트: supabase/tests/myr_ship.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_app_admin_ship(p_order_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
begin
  if v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.tracking_no = v_tracking and o.courier = v_courier then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
  end if;
  update public.myr_orders
     set courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()), updated_at = now()
   where id = o.id
   returning * into o;
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

create or replace function public.myr_app_admin_ship_pending(p_limit integer default 100, p_shipped boolean default false)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'status', o.status, 'buyer_name', o.buyer_name, 'order_name', o.order_name, 'amount', o.amount,
           'paid_at', o.paid_at, 'created_at', o.created_at, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at,
           'recipient', o.shipping ->> 'recipient',
           'lines', (select count(*) from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0)
         ) order by case when p_shipped then o.shipped_at else o.paid_at end desc), '[]'::jsonb)
    from (select * from public.myr_orders o
           where o.status in ('PAID','PARTIAL_REFUNDED')
             and (case when p_shipped then o.tracking_no is not null else o.tracking_no is null end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;
