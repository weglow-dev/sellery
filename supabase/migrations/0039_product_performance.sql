-- ============================================================
-- 0039 — 상품별 익명 실적 표 + 매출 데이터 확인권 (셀러리 샵 `datapass` · 인플루언서)
--
-- 배경: 인플루언서 상품 상세(`/influencer/products/[code]`)가 집계 두 개(캠페인 수 · 확정 판매 수량)만
--   보여주고 "인플루언서별 팔로워·참여율·확정 매출 표와 매출 데이터 확인권(🥬)은 다음 단계에서 열립니다"
--   로 예고해 왔다(#62). 0037 이 샵을 열 때도 인플루언서 `datapass` 는 `available: false` 였다.
--   운영 결정(2026-10-06): **프로토타입대로 구현**한다.
--
-- 프로토타입 규칙 (`packages/ui/modals/ProductDetailModal.svelte` · actions.ts `buyDataPass`)
--   · 표 = 그 상품을 진행한 캠페인별 한 행: 팔로워 · 좋아요 평균 · 참여율 · 기간 · 확정 매출 · 상태
--   · **인플루언서는 익명** — 이름·핸들을 담지 않는다(표 제목도 "인플루언서 익명")
--   · 확인권이 없으면 **첫 행만 보이고 2행부터 블러**(`blurrow`) + "🥬 2 로 전체 실적 보기" 버튼
--   · 확인권은 **1회 구매로 계정에 영구 적용**(`expires_on = null` · 상품마다 사지 않는다)
--
-- 익명 계약은 0026 랭킹 · 0035 갤러리와 같은 방식이다 — **잠긴 행의 지표를 서버가 보내지 않는다.**
--   블러는 "가린 것처럼 보이게" 하는 CSS 지만, 값 자체가 없으므로 HTML 을 봐도 알 수 없다.
--   브랜드는 자기 상품의 실적을 볼 권리가 있어 이 게이트를 적용하지 않는다(0035 갤러리가 그 경로다).
--
-- 확정 매출은 **정산 전에도 보여야** 한다(LIVE 캠페인). `settlements` 가 비어 있을 수 있으므로
--   주문에서 계산한다 — 0020 과 같은 식: `sum(amount) where status <> 'CANCELED'`
--   − `sum(amount) where REFUNDED` − `sum(refund_amount) where PAID`.
-- ============================================================

-- ------------------------------------------------------------
-- product_campaign_net(campaign) — 캠페인의 확정 순매출
--   0020 `app_admin_settle_run` 의 net 계산과 같은 식(샘플 주문은 빼지 않는다 — 표시용 총매출).
--   정산된 캠페인은 `settlements.net` 이 계약값이라 그쪽을 우선한다.
-- ------------------------------------------------------------
create or replace function public.product_campaign_net(p_campaign_id uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select st.net from public.settlements st where st.campaign_id = p_campaign_id),
    (select greatest(0,
         coalesce(sum(o.amount) filter (where o.status <> 'CANCELED'), 0)
       - coalesce(sum(o.amount) filter (where o.status = 'REFUNDED'), 0)
       - coalesce(sum(o.refund_amount) filter (where o.status = 'PAID' and coalesce(o.refund_amount, 0) > 0), 0))
       from public.orders o where o.campaign_id = p_campaign_id),
    0)::integer;
$$;

revoke all on function public.product_campaign_net(uuid) from public, anon, authenticated;
grant execute on function public.product_campaign_net(uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_product_performance(p_seller_id, p_product_id) — 상품별 익명 실적 표
--   has_pass = 매출 데이터 확인권 보유 여부(`shop_item_active('seller', …, 'datapass')`)
--   rows     = 캠페인별 한 행. **확인권이 없으면 첫 행만 지표를 담고 나머지는 null**
--              (프로토타입은 2행부터 블러 — 여기서는 값 자체를 보내지 않는다)
--   내 캠페인은 확인권과 무관하게 항상 보인다 — 내 실적이다.
-- ------------------------------------------------------------
create or replace function public.app_seller_product_performance(p_seller_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_pass   boolean := public.shop_item_active('seller', p_seller_id, 'datapass');
  v_rows   jsonb;
  v_total  integer;
  v_qty    integer;
  v_price  integer;
begin
  -- 확인권 가격 (카탈로그 · `shop_items.seller[].datapass.price`)
  select coalesce(((public.shop_item_of('seller', 'datapass')) ->> 'price')::integer, 2) into v_price;

  with hist as (
    select c.id, c.status, c.start_date, c.end_date, c.sold_qty, c.seller_id, c.created_at,
           s.followers, s.likes_avg,
           row_number() over (order by c.created_at desc, c.id) as rn
      from public.campaigns c
      join public.sellers s on s.id = c.seller_id
     where c.product_id = p_product_id
       and c.status in ('SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING', 'SETTLED')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', h.rn,
           'is_me', (h.seller_id = p_seller_id),
           -- 공개 여부: 확인권 보유 · 첫 행 · 내 캠페인
           'open', (v_pass or h.rn = 1 or h.seller_id = p_seller_id),
           'status', h.status,
           -- **잠긴 행은 지표를 담지 않는다** (화면이 가리는 게 아니다)
           'followers',  case when v_pass or h.rn = 1 or h.seller_id = p_seller_id then h.followers end,
           'likes_avg',  case when v_pass or h.rn = 1 or h.seller_id = p_seller_id then h.likes_avg end,
           'engagement', case when (v_pass or h.rn = 1 or h.seller_id = p_seller_id)
                                   and coalesce(h.followers, 0) > 0
                              then round(h.likes_avg::numeric * 100 / h.followers, 1) end,
           'start_date', case when v_pass or h.rn = 1 or h.seller_id = p_seller_id then h.start_date end,
           'end_date',   case when v_pass or h.rn = 1 or h.seller_id = p_seller_id then h.end_date end,
           'net',        case when v_pass or h.rn = 1 or h.seller_id = p_seller_id
                              then public.product_campaign_net(h.id) end,
           'sold_qty',   case when v_pass or h.rn = 1 or h.seller_id = p_seller_id then h.sold_qty end
         ) order by h.rn), '[]'::jsonb),
         count(*)::integer,
         coalesce(sum(h.sold_qty), 0)::integer
    into v_rows, v_total, v_qty
    from hist h;

  return jsonb_build_object('ok', true,
    'has_pass', v_pass,
    'price_cel', v_price,
    'campaigns', v_total,
    'sold_qty', v_qty,
    -- 잠긴 행 수 — 화면이 "N건 더 보기" 를 적는다
    'locked', greatest(0, v_total - (select count(*)::integer from jsonb_array_elements(v_rows) r
                                      where (r ->> 'open')::boolean)),
    'rows', v_rows);
end;
$$;

revoke all on function public.app_seller_product_performance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_product_performance(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_shop_buy · app_shop_catalog — 인플루언서 datapass 를 연다
--   0038 판에서 `(p_owner_type = 'seller' and p_item_id = 'datapass')` 제외만 걷어낸다.
--   인플루언서 datapass 는 `days` 가 없어 `expires_on = null`(영구) 이 된다 — 프로토타입과 같다.
-- ------------------------------------------------------------
create or replace function public.app_shop_buy(p_owner_type text, p_owner_id uuid, p_item_id text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  it        jsonb;
  v_price   integer;
  v_days    integer;
  v_name    text;
  v_exp     date;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_bal     integer;
  v_n       integer := 0;
  v_ledger  uuid;
  v_default integer;
  v_codes   text[];
begin
  if p_owner_type not in ('seller', 'brand') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROLE');
  end if;

  it := public.shop_item_of(p_owner_type, p_item_id);
  if it is null then
    return jsonb_build_object('ok', false, 'code', 'NO_ITEM');
  end if;
  if coalesce((it ->> 'auto')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'AUTO_ITEM');
  end if;
  -- 효과를 붙이지 않은 아이템은 아직 팔지 않는다. **`app_shop_catalog` 의 `available` 과 같은 식이어야 한다.**
  --   0039 에서 인플루언서 datapass 가 들어왔다. 남은 것: regongu(재판매 흐름이 먼저다)
  if p_item_id not in ('datapass', 'boost', 'homefeature', 'featured', 'fastreview') then
    return jsonb_build_object('ok', false, 'code', 'NOT_AVAILABLE');
  end if;

  v_price := (it ->> 'price')::integer;
  if v_price is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PRICE');
  end if;
  v_days := (it ->> 'days')::integer;
  v_name := it ->> 'name';

  if public.shop_item_active(p_owner_type, p_owner_id, p_item_id) then
    return jsonb_build_object('ok', true, 'already', true, 'code', 'ALREADY', 'item_id', p_item_id);
  end if;

  -- 적용 대상 확인 (없으면 차감하지 않는다)
  if p_item_id = 'homefeature' then
    select count(*)::integer into v_n from public.campaigns c
      where c.status in ('LIVE', 'SCHEDULE_CONFIRMED')
        and ((p_owner_type = 'seller' and c.seller_id = p_owner_id)
          or (p_owner_type = 'brand' and exists (
                select 1 from public.products p where p.id = c.product_id and p.brand_id = p_owner_id)));
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', 'NO_TARGET_CAMPAIGN');
    end if;
  elsif p_item_id = 'boost' then
    select count(*)::integer into v_n from public.products p
      where p.brand_id = p_owner_id and p.status = 'listed' and p.deleted_at is null;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', 'NO_TARGET_PRODUCT');
    end if;
  elsif p_item_id = 'fastreview' then
    select count(*)::integer into v_n from public.products p
      where p.brand_id = p_owner_id and p.status = 'pending' and p.deleted_at is null;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', 'NO_TARGET_PENDING');
    end if;
  end if;

  begin
    v_bal := public.celery_spend(p_owner_type, p_owner_id, -v_price, 'shop_item',
      format('%s 구매', v_name), 'purchase', null);
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', 'CEL_INSUFFICIENT', 'price_cel', v_price);
  end;

  select id into v_ledger from public.celery_ledger
   where owner_type = p_owner_type
     and ((p_owner_type = 'seller' and seller_id = p_owner_id) or (p_owner_type = 'brand' and brand_id = p_owner_id))
     and reason = 'shop_item'
   order by created_at desc limit 1;

  v_exp := case when v_days is null then null else v_today + v_days end;

  insert into public.celery_purchases (owner_type, seller_id, brand_id, item_id, price_cel, purchased_on, expires_on, ledger_id)
  values (p_owner_type,
          case when p_owner_type = 'seller' then p_owner_id end,
          case when p_owner_type = 'brand'  then p_owner_id end,
          p_item_id, v_price, v_today, v_exp, v_ledger);

  -- ---- 효과 적용 ----
  if p_item_id = 'featured' and p_owner_type = 'seller' then
    update public.sellers set featured_at = v_today where id = p_owner_id;

  elsif p_item_id = 'homefeature' then
    update public.campaigns c set home_featured_at = v_today
     where c.status in ('LIVE', 'SCHEDULE_CONFIRMED')
       and ((p_owner_type = 'seller' and c.seller_id = p_owner_id)
         or (p_owner_type = 'brand' and exists (
               select 1 from public.products p where p.id = c.product_id and p.brand_id = p_owner_id)));

  elsif p_item_id = 'boost' and p_owner_type = 'brand' then
    update public.products set boosted_at = v_today
     where id = (select p.id from public.products p
                  where p.brand_id = p_owner_id and p.status = 'listed' and p.deleted_at is null
                  order by p.created_at desc limit 1);

  elsif p_item_id = 'fastreview' and p_owner_type = 'brand' then
    select coalesce((ps.value #>> '{}')::integer, 500) into v_default
      from public.platform_settings ps where ps.key = 'default_stock_on_approve';
    v_default := coalesce(v_default, 500);

    with up as (
      update public.products
         set status = 'listed',
             reject_reason = null,
             stock = case when coalesce(stock, 0) = 0 then v_default else stock end,
             fast_reviewed_at = v_today
       where brand_id = p_owner_id and status = 'pending' and deleted_at is null
       returning code
    ) select array_agg(code) into v_codes from up;

  -- datapass 는 별도 적용이 없다 — 브랜드는 `brand_data_free_reason`('PASS'),
  -- 인플루언서는 `app_seller_product_performance`(has_pass) 가 읽는다
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'item_id', p_item_id, 'name', v_name,
    'charged', v_price, 'balance', v_bal, 'expires_on', v_exp, 'applied', v_n,
    'codes', to_jsonb(coalesce(v_codes, array[]::text[])));
end;
$$;

revoke all on function public.app_shop_buy(text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_shop_buy(text, uuid, text) to service_role;

create or replace function public.app_shop_catalog(p_owner_type text, p_owner_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_items   jsonb;
  v_ledger  jsonb;
  v_bal     record;
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_owner_type not in ('seller', 'brand') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROLE');
  end if;

  select s.total, s.paid, s.free into v_bal from public.celery_balance_split(p_owner_type, p_owner_id) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i ->> 'id',
           'name', i ->> 'name',
           'desc', i ->> 'desc',
           'price', i -> 'price',
           'days', (i ->> 'days')::integer,
           'auto', coalesce((i ->> 'auto')::boolean, false),
           'active', public.shop_item_active(p_owner_type, p_owner_id, i ->> 'id'),
           'expires_on', (select max(cp.expires_on) from public.celery_purchases cp
                           where cp.owner_type = p_owner_type
                             and ((p_owner_type = 'seller' and cp.seller_id = p_owner_id)
                               or (p_owner_type = 'brand'  and cp.brand_id  = p_owner_id))
                             and cp.item_id = i ->> 'id'),
           -- **`app_shop_buy` 의 가드와 같은 식이어야 한다** (0037 에서 어긋나 버튼이 눌리고 실패한 적이 있다)
           'available', coalesce((i ->> 'auto')::boolean, false)
                        or (i ->> 'id') = any (array['datapass', 'boost', 'homefeature', 'featured', 'fastreview'])
         ) order by coalesce((i ->> 'auto')::boolean, false), i ->> 'id'), '[]'::jsonb)
    into v_items
    from public.platform_settings ps
    cross join lateral jsonb_array_elements(ps.value -> p_owner_type) i
   where ps.key = 'shop_items';

  select coalesce(jsonb_agg(t.r order by t.created_at desc), '[]'::jsonb) into v_ledger
    from (
      select jsonb_build_object('delta', l.delta, 'reason', l.reason, 'memo', l.memo,
                                'created_at', l.created_at) as r, l.created_at
        from public.celery_ledger l
       where l.owner_type = p_owner_type
         and ((p_owner_type = 'seller' and l.seller_id = p_owner_id)
           or (p_owner_type = 'brand'  and l.brand_id  = p_owner_id))
       order by l.created_at desc
       limit 8) t;

  return jsonb_build_object('ok', true,
    'balance', coalesce(v_bal.total, 0),
    'paid_balance', coalesce(v_bal.paid, 0),
    'free_balance', coalesce(v_bal.free, 0),
    'today', v_today,
    'items', v_items,
    'ledger', v_ledger);
end;
$$;

revoke all on function public.app_shop_catalog(text, uuid) from public, anon, authenticated;
grant execute on function public.app_shop_catalog(text, uuid) to service_role;
