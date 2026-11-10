-- ============================================================
-- 0089 — MYR 크리에이터 정산 탭(docs/myr.md §9-6 작업 순서 6 · 2026-11-10 대표 결정)
--
--   정산 계산을 셋으로 나눠 정산 회차(0087 run)와 크리에이터 "다음 정산 예정"이 **같은 함수**를 쓰게 한다(백엔드 원칙 1 · 계산 결과 불변 — myr_settlements.test.sql 그대로 통과).
--     myr_settlement_candidates(end, seller)       대상 줄 — 처음 정산되는 줄(sale) + 정산 뒤 늘어난 환불(refund_adj)
--     myr_settlement_product_calc(product, sales, refund_adj)   이월 · 기준액 · 정산금(60% 버림) · 보류 여부
--     myr_settlement_offset_calc(product, settle)   상계 · 남은 제조금액 · 보증금 환급(읽기만 — 확정은 apply 가 표시까지)
--   myr_settlement_run · myr_settlement_apply 는 위 함수를 부르도록 다시 썼다(같은 결과).
--
--   크리에이터(콘솔 서버가 세션 계정을 넘긴다 · 결정 3)
--     myr_settlement_preview(seller, now)                 다음 정산 예정 — 다음 회차(지난달 회차가 아직이면 지난달까지 · 아니면 지금까지 배송 완료분)를 지금 돌리면 나올 값
--                                                         + 배송 완료 전 판매(줄 수 · 금액) · 상품 줄 · 합계 — 예상이다(월말 환불 · 배송 완료 · 제조금액 입력에 따라 달라진다)
--     myr_app_seller_settlements_of_user(user, now)       정산 탭 — 사업자 정보 상태 · 예상 · 제품별 제조 원장 · 월별 확정 내역(상품 줄 · 합계)
--     myr_app_seller_settle_preview_of_user(user, now)    홈 — 예상 합계만
--     myr_app_seller_settlement_items_of_user(user, month)   월 내역 펼쳐 보기 — 주문 줄(주문번호 · 고객 이름 가림 · 배송 완료일 · 상품 · 수량 · 단가 · 공구 · sale/정산 뒤 환불)
--     myr_app_seller_settle_preview_items_of_user(user, now)  다음 정산(예상)의 주문 줄 — 같은 모양 · 같은 대상(myr_settlement_next + candidates)
--   myr_settlement_next(now)  다음 회차(정산월 · 대상 끝 시각) — preview 와 예상 줄이 같이 쓴다
--   권한: service role 만(anon · authenticated EXECUTE 회수). 테스트: supabase/tests/myr_seller_settlements.test.sql. 재실행 가능.
-- ============================================================

-- ------------------------------------------------------------
-- 계산 조각(내부)
-- ------------------------------------------------------------
create or replace function public.myr_settlement_candidates(p_end timestamptz, p_seller uuid default null)
returns table (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer)
language sql
stable
as $$
  select i.id, i.product_id, i.seller_id, 'sale'::text, i.amount - i.refund_amount, i.refund_amount
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null and o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
     and i.status <> 'CANCELED' and i.delivered_at is not null and i.delivered_at < p_end
     and (p_seller is null or i.seller_id = p_seller)
     and not exists (select 1 from public.myr_settlement_items s where s.order_item_id = i.id and s.kind = 'sale')
  union all
  -- 환불이 있는 줄만 보고(refund_amount > 0), 스냅샷은 줄마다 한 번 모은다(줄마다 하위 조회하면 정산한 줄이 쌓일수록 느려진다)
  select i.id, i.product_id, i.seller_id, 'refund_adj'::text, i.refund_amount - last.snap, i.refund_amount
    from public.myr_order_items i
    join (select s.order_item_id, max(s.refund_snapshot) as snap from public.myr_settlement_items s group by s.order_item_id) last on last.order_item_id = i.id
   where i.refund_amount > 0 and i.refund_amount > last.snap
     and (p_seller is null or i.seller_id = p_seller)
$$;
revoke all on function public.myr_settlement_candidates(timestamptz, uuid) from public, anon, authenticated;

create or replace function public.myr_settlement_product_calc(p_product_id uuid, p_sales integer, p_refund_adj integer)
returns table (pct integer, carry_in integer, base integer, carry_out integer, settle integer, held boolean)
language sql
stable
as $$
  with c as (
    select public.myr_settlement_pct() as pct,
           coalesce((select r.carry_out from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                      where r.product_id = p_product_id order by u.month desc limit 1), 0) as carry_in
  )
  select c.pct, c.carry_in, p_sales - p_refund_adj + c.carry_in, least(p_sales - p_refund_adj + c.carry_in, 0),
         (greatest(p_sales - p_refund_adj + c.carry_in, 0)::bigint * c.pct / 100)::integer,
         not public.myr_mfg_has_ledger(p_product_id)
           or exists (select 1 from public.myr_settlement_rows r where r.product_id = p_product_id and r.status = 'held')
    from c
$$;
revoke all on function public.myr_settlement_product_calc(uuid, integer, integer) from public, anon, authenticated;

create or replace function public.myr_settlement_offset_calc(p_product_id uuid, p_settle integer)
returns table (mfg_before integer, offset_amount integer, mfg_after integer, deposit_refund integer)
language sql
stable
as $$
  with b as (select public.myr_mfg_remaining(p_product_id) as before)
  select b.before, least(p_settle, b.before), b.before - least(p_settle, b.before),
         case when b.before - least(p_settle, b.before) = 0
              then coalesce((select sum(m.deposit_amount) from public.myr_mfg_batches m
                              where m.product_id = p_product_id and m.voided_at is null and m.deposit_paid_at is not null and m.deposit_refund_row_id is null), 0)::integer
              else 0 end
    from b
$$;
revoke all on function public.myr_settlement_offset_calc(uuid, integer) from public, anon, authenticated;

-- 확정(내부 · 0087 과 같은 결과) — 계산은 offset_calc, 여기서는 고정 · 보증금 환급 표시
create or replace function public.myr_settlement_apply(p_row_id uuid, p_actor text)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r public.myr_settlement_rows%rowtype;
  c record;
begin
  select * into r from public.myr_settlement_rows where id = p_row_id for update;
  perform 1 from public.myr_mfg_batches where product_id = r.product_id for update;
  select * into c from public.myr_settlement_offset_calc(r.product_id, r.settle);
  if c.mfg_after = 0 then
    update public.myr_mfg_batches set deposit_refund_row_id = r.id
     where product_id = r.product_id and voided_at is null and deposit_paid_at is not null and deposit_refund_row_id is null;
  end if;
  update public.myr_settlement_rows
     set status = 'confirmed', mfg_before = c.mfg_before, offset_amount = c.offset_amount, mfg_after = c.mfg_after,
         deposit_refund = c.deposit_refund, payout = r.settle - c.offset_amount + c.deposit_refund, confirmed_at = now(), confirmed_by = coalesce(p_actor, 'script')
   where id = r.id;
end;
$$;
revoke all on function public.myr_settlement_apply(uuid, text) from public, anon, authenticated, service_role;

-- 회차(0087 과 같은 결과) — 대상 줄 · 상품 계산을 위 함수로
create or replace function public.myr_settlement_run(p_month date, p_actor text default 'cron', p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_month   date := date_trunc('month', p_month)::date;
  v_end     timestamptz;
  v_run     public.myr_settlement_runs%rowtype;
  pr        record;
  pc        record;
  v_row_id  uuid;
begin
  if p_month is null then return jsonb_build_object('ok', false, 'code', 'BAD_MONTH'); end if;
  v_end := public.myr_month_start((v_month + interval '1 month')::date);
  if v_end > p_now then return jsonb_build_object('ok', false, 'code', 'NOT_CLOSED'); end if;
  perform pg_advisory_xact_lock(hashtext('myr_settlement_run'));
  select * into v_run from public.myr_settlement_runs where month = v_month;
  if found then return jsonb_build_object('ok', true, 'already', true, 'month', to_char(v_month, 'YYYY-MM')); end if;
  if exists (select 1 from public.myr_settlement_runs where month > v_month) then return jsonb_build_object('ok', false, 'code', 'OUT_OF_ORDER'); end if;

  insert into public.myr_settlement_runs (month, cutoff_at, created_by) values (v_month, p_now, coalesce(p_actor, 'cron')) returning * into v_run;

  create temp table if not exists _myr_settle_new (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer) on commit drop;
  truncate _myr_settle_new;
  insert into _myr_settle_new select * from public.myr_settlement_candidates(v_end, null);

  for pr in
    select n.product_id, min(n.seller_id::text)::uuid as seller_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj
      from _myr_settle_new n group by n.product_id order by n.product_id
  loop
    select * into pc from public.myr_settlement_product_calc(pr.product_id, pr.sales, pr.refund_adj);
    insert into public.myr_settlement_rows (run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status)
    values (v_run.id, pr.product_id, pr.seller_id, pc.pct, pr.sales, pr.refund_adj, pc.carry_in, pc.base, pc.carry_out, pc.settle, 'held')
    returning id into v_row_id;
    insert into public.myr_settlement_items (row_id, order_item_id, kind, amount, refund_snapshot)
    select v_row_id, n.order_item_id, n.kind, n.amount, n.refund_snapshot from _myr_settle_new n where n.product_id = pr.product_id;
    if not pc.held then perform public.myr_settlement_apply(v_row_id, coalesce(p_actor, 'cron')); end if;
  end loop;

  return jsonb_build_object('ok', true, 'already', false, 'month', to_char(v_month, 'YYYY-MM'),
    'rows', (select count(*) from public.myr_settlement_rows where run_id = v_run.id),
    'confirmed', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'confirmed'),
    'held', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'held'),
    'payout', coalesce((select sum(payout) from public.myr_settlement_rows where run_id = v_run.id and status = 'confirmed'), 0));
end;
$$;
revoke all on function public.myr_settlement_run(date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_run(date, text, timestamptz) to service_role;

-- 다음 회차 — 지난달 회차가 아직이면(매월 1일 13:00 전) 정산월 = 지난달 · 대상 끝 = 이번 달 1일 0시, 아니면 정산월 = 이번 달 · 대상 끝 = 지금
create or replace function public.myr_settlement_next(p_now timestamptz default now())
returns table (month date, end_at timestamptz)
language sql
stable
as $$
  with m as (select date_trunc('month', p_now at time zone 'Asia/Seoul')::date as this)
  select case when not exists (select 1 from public.myr_settlement_runs u where u.month >= (m.this - interval '1 month')::date)
              then (m.this - interval '1 month')::date else m.this end,
         case when not exists (select 1 from public.myr_settlement_runs u where u.month >= (m.this - interval '1 month')::date)
              then public.myr_month_start(m.this) else p_now end
    from m
$$;
revoke all on function public.myr_settlement_next(timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 다음 정산 예정(크리에이터 · 읽기만) — 다음 회차를 지금 돌리면 나올 값
--   지난달 회차가 아직이면(매월 1일 13:00 전) 다음 회차 = 지난달 · 대상 = 이번 달 1일 0시 전 배송 완료분, 아니면 다음 회차 = 이번 달 · 대상 = 지금까지 배송 완료분
-- ------------------------------------------------------------
create or replace function public.myr_settlement_preview(p_seller uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_month  date;
  v_end    timestamptz;
  v_rows   jsonb := '[]'::jsonb;
  pr       record;
  pc       record;
  oc       record;
  v_offset integer;
  v_refund integer;
  v_payout integer;
begin
  select n.month, n.end_at into v_month, v_end from public.myr_settlement_next(p_now) n;
  for pr in
    select n.product_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj,
           count(*) filter (where n.kind = 'sale') as lines
      from public.myr_settlement_candidates(v_end, p_seller) n group by n.product_id
  loop
    select * into pc from public.myr_settlement_product_calc(pr.product_id, pr.sales, pr.refund_adj);
    if pc.held then
      v_offset := null; v_refund := null; v_payout := null;
    else
      select * into oc from public.myr_settlement_offset_calc(pr.product_id, pc.settle);
      v_offset := oc.offset_amount; v_refund := oc.deposit_refund; v_payout := pc.settle - oc.offset_amount + oc.deposit_refund;
    end if;
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = pr.product_id),
      'status', case when pc.held then 'held' else 'estimated' end, 'lines', pr.lines, 'pct', pc.pct,
      'sales', pr.sales, 'refund_adj', pr.refund_adj, 'carry_in', pc.carry_in, 'settle', pc.settle,
      'offset', v_offset, 'deposit_refund', v_refund, 'payout', v_payout);
  end loop;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'settle_at', public.myr_month_start((v_month + interval '1 month')::date) + interval '13 hours',
    'rows', v_rows,
    'total', jsonb_build_object(
      'sales', coalesce((select sum((e ->> 'sales')::int) from jsonb_array_elements(v_rows) e), 0),
      'refund_adj', coalesce((select sum((e ->> 'refund_adj')::int) from jsonb_array_elements(v_rows) e), 0),
      'settle', coalesce((select sum((e ->> 'settle')::int) from jsonb_array_elements(v_rows) e), 0),
      'offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(v_rows) e), 0),
      'deposit_refund', coalesce((select sum((e ->> 'deposit_refund')::int) from jsonb_array_elements(v_rows) e), 0),
      'payout', coalesce((select sum((e ->> 'payout')::int) from jsonb_array_elements(v_rows) e), 0),
      'held', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'status' = 'held')),
    -- 아직 배송 완료가 아닌 판매(결제됨 · 취소 아님 · 남은 수량) — 배송 완료되면 그 회차에 들어간다
    'undelivered', (select jsonb_build_object('lines', count(*), 'amount', coalesce(sum(i.amount - i.refund_amount), 0))
                      from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                     where i.seller_id = p_seller and o.paid_at is not null and o.status in ('PAID', 'PARTIAL_REFUNDED')
                       and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- 크리에이터 — 정산 탭 · 홈 · 월 내역(계정 → 크리에이터는 함수 안에서 · 다른 크리에이터 것은 나오지 않는다)
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    'preview', public.myr_settlement_preview(s.id, p_now),
    -- 제조 원장 — 원장이 있거나 · 정산 줄이 있거나 · 팔린 적이 있는 내 상품(원장 없이 팔렸으면 "제조금액 확인 중"으로 보인다)
    'ledgers', coalesce((select jsonb_agg(jsonb_build_object(
                 'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                 'has_ledger', public.myr_mfg_has_ledger(p.id),
                 'batches', coalesce((select jsonb_agg(jsonb_build_object('seq', b.seq, 'amount', b.amount, 'deposit_amount', b.deposit_amount,
                                                                          'deposit_paid', b.deposit_paid_at is not null, 'deposit_refunded', b.deposit_refund_row_id is not null)
                                                       order by b.seq)
                                        from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), '[]'::jsonb),
                 'total', coalesce((select sum(b.amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), 0),
                 'offset', coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p.id and r.status = 'confirmed'), 0),
                 'remaining', public.myr_mfg_remaining(p.id),
                 'deposit_paid', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null and b.deposit_paid_at is not null), 0),
                 'deposit_unpaid', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null and b.deposit_paid_at is null), 0),
                 'deposit_refunded', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.deposit_refund_row_id is not null), 0))
               order by p.created_at)
               from public.myr_products p
              where p.seller_id = s.id and p.deleted_at is null
                and (public.myr_mfg_has_ledger(p.id) or exists (select 1 from public.myr_settlement_rows r where r.product_id = p.id)
                     or exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                                 where i.product_id = p.id and o.paid_at is not null and i.status <> 'CANCELED'))), '[]'::jsonb),
    -- 월별 내역(최근 순) — 내 상품 줄만
    'months', coalesce((select jsonb_agg(m.j order by m.month desc) from (
                 select u.month, jsonb_build_object(
                   'month', to_char(u.month, 'YYYY-MM'),
                   'settled_at', u.cutoff_at,
                   'total', jsonb_build_object(
                     'sales', sum(r.sales), 'refund_adj', sum(r.refund_adj), 'settle', sum(r.settle),
                     'offset', coalesce(sum(r.offset_amount), 0), 'deposit_refund', coalesce(sum(r.deposit_refund), 0),
                     'payout', coalesce(sum(r.payout), 0), 'held', count(*) filter (where r.status = 'held')),
                   'rows', jsonb_agg(jsonb_build_object(
                     'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                     'status', r.status, 'pct', r.pct, 'sales', r.sales, 'refund_adj', r.refund_adj, 'carry_in', r.carry_in, 'carry_out', r.carry_out,
                     'settle', r.settle, 'offset', r.offset_amount, 'mfg_after', r.mfg_after, 'deposit_refund', r.deposit_refund, 'payout', r.payout)
                     order by p.name)) as j
                   from public.myr_settlement_rows r
                   join public.myr_settlement_runs u on u.id = r.run_id
                   join public.myr_products p on p.id = r.product_id
                  where r.seller_id = s.id
                  group by u.month, u.cutoff_at) m), '[]'::jsonb))
    from public.sellers s
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

create or replace function public.myr_app_seller_settle_preview_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.myr_settlement_preview(s.id, p_now) - 'rows' from public.sellers s where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settle_preview_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_preview_of_user(uuid, timestamptz) to service_role;

create or replace function public.myr_app_seller_settlement_items_of_user(p_user uuid, p_month date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'buyer', public.myr_mask_name(o.buyer_name), 'delivered_at', i.delivered_at,
           'product_code', p.code, 'product', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
           'groupbuy', i.groupbuy_id is not null, 'kind', t.kind, 'amount', t.amount, 'refund_snapshot', t.refund_snapshot)
         order by t.kind desc, i.delivered_at, o.code), '[]'::jsonb)
    from public.sellers s
    join public.myr_settlement_rows r on r.seller_id = s.id
    join public.myr_settlement_runs u on u.id = r.run_id and u.month = date_trunc('month', p_month)::date
    join public.myr_settlement_items t on t.row_id = r.id
    join public.myr_order_items i on i.id = t.order_item_id
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = r.product_id
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlement_items_of_user(uuid, date) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlement_items_of_user(uuid, date) to service_role;

-- 다음 정산(예상)의 주문 줄 — 월 내역과 같은 모양
create or replace function public.myr_app_seller_settle_preview_items_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'buyer', public.myr_mask_name(o.buyer_name), 'delivered_at', i.delivered_at,
           'product_code', p.code, 'product', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
           'groupbuy', i.groupbuy_id is not null, 'kind', c.kind, 'amount', c.amount, 'refund_snapshot', c.refund_snapshot)
         order by c.kind desc, i.delivered_at, o.code), '[]'::jsonb)
    from public.sellers s
    cross join lateral public.myr_settlement_next(p_now) n
    cross join lateral public.myr_settlement_candidates(n.end_at, s.id) c
    join public.myr_order_items i on i.id = c.order_item_id
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = c.product_id
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settle_preview_items_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_preview_items_of_user(uuid, timestamptz) to service_role;
