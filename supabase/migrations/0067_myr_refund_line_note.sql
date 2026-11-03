-- ============================================================
-- 0067 — MYR 환불 신청 페이지(대표 시안 2026-11-03)의 제품별 "상세 내용"
--   입력 [{ item_id, qty, note }] 의 note(선택 · 300자)를 그 줄의 refund_reason 에 "사유 — 상세" 로 남긴다(크리에이터 콘솔·셀러 메일이 본다).
--   주문의 refund_reason 은 드롭다운 사유만(그대로). 금액·가드·상태 전이는 0061 그대로 — note 는 계산에 쓰지 않는다.
--   myr_refund_lines 는 반환 컬럼이 늘어 drop 뒤 재생성(precheck 는 select * 라 그대로 · record 만 교체). 테스트: supabase/tests/myr_refund.test.sql. 재실행 가능.
-- ============================================================

drop function if exists public.myr_refund_lines(public.myr_orders, jsonb);
create function public.myr_refund_lines(o public.myr_orders, p_items jsonb)
returns table (item_id uuid, qty integer, unit_price integer, seller_id uuid, remaining integer, item_status text, problem text, note text)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  l jsonb;
  v_id uuid;
  v_qty integer;
  v_note text;
  v_req jsonb := '{}'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    -- 전체: 남은 수량이 있는 줄 전부(상세 없음)
    return query
      select i.id, (i.qty - i.refunded_qty), i.unit_price, i.seller_id, (i.qty - i.refunded_qty), i.status, null::text, null::text
        from public.myr_order_items i where i.order_id = o.id and i.status not in ('CANCELED') and (i.qty - i.refunded_qty) > 0;
    return;
  end if;
  for l in select * from jsonb_array_elements(p_items) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,3}$' then
      return query select null::uuid, 0, 0, null::uuid, 0, null::text, 'BAD_FORMAT'::text, null::text;
      return;
    end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int + coalesce((v_req -> v_id::text ->> 'q')::int, 0);
    -- 같은 줄이 두 번 오면 수량은 합치고 상세는 마지막 비지 않은 것
    v_note := coalesce(nullif(btrim(left(l ->> 'note', 300)), ''), v_req -> v_id::text ->> 'n');
    v_req := v_req || jsonb_build_object(v_id::text, jsonb_build_object('q', v_qty, 'n', v_note));
  end loop;
  return query
    select k.id, k.q, i.unit_price, i.seller_id, coalesce(i.qty - i.refunded_qty, 0), i.status,
           case when i.id is null then 'NOT_IN_ORDER'
                when i.status = 'CANCELED' then 'CANCELED'
                when k.q < 1 then 'BAD_QTY'
                when k.q > (i.qty - i.refunded_qty) then 'TOO_MANY'
                else null end,
           k.n
      from (select (key)::uuid as id, (value ->> 'q')::int as q, value ->> 'n' as n from jsonb_each(v_req)) k
      left join public.myr_order_items i on i.id = k.id and i.order_id = o.id;
end;
$$;
revoke all on function public.myr_refund_lines(public.myr_orders, jsonb) from public, anon, authenticated;

create or replace function public.myr_app_refund_record(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid, p_reason text, p_amount integer, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o         public.myr_orders%rowtype;
  r         record;
  v_reason  text := left(coalesce(p_reason, ''), 200);
  v_n       integer := 0;
  v_status  text;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status in ('REFUNDED','CANCELED') then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  if o.status = 'WAITING_DEPOSIT' then
    update public.myr_order_items set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor where order_id = o.id;
    update public.myr_orders set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = p_raw where id = o.id;
    return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED', 'amount', 0);
  end if;

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem is not null then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining))); end if;
    update public.myr_order_items
       set refunded_qty = refunded_qty + r.qty,
           refund_amount = refund_amount + r.unit_price * r.qty,
           status = case when refunded_qty + r.qty >= qty then 'REFUNDED' else 'PARTIAL_REFUNDED' end,
           refunded_at = now(),
           -- 0067: 줄에는 "사유 — 상세"(상세가 있을 때만)
           refund_reason = case when r.note is not null then left(v_reason || ' — ' || r.note, 500) else v_reason end,
           refund_actor = p_actor
     where id = r.item_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  select case when bool_and(i.status in ('REFUNDED','CANCELED')) then 'REFUNDED' else 'PARTIAL_REFUNDED' end into v_status
    from public.myr_order_items i where i.order_id = o.id;
  update public.myr_orders
     set refund_amount = refund_amount + greatest(coalesce(p_amount, 0), 0), status = v_status,
         refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = coalesce(p_raw, raw_cancel)
   where id = o.id;
  -- myr_order_items_sync_sold_qty(0058) 가 줄 update 마다 sold_qty 를 (qty − refunded_qty) 로 재계산했다.
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', v_status, 'amount', o.refund_amount + greatest(coalesce(p_amount, 0), 0));
end;
$$;
revoke all on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) to service_role;
