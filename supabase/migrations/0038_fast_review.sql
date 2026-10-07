-- ============================================================
-- 0038 — 우선 검수권 (셀러리 샵 `fastreview`)
--
-- 배경: 0037 이 샵을 열었지만 `fastreview` 는 `available: false`("준비 중")로 막아뒀다.
--   운영 결정(2026-10-06): **프로토타입대로 구현**한다 — 브랜드가 🥬 1 을 쓰면 **내 검수 대기 상품
--   전부가 즉시 노출**된다(actions.ts `buyItem`: `status='pending'` → `'listed'`, 재고 0 이면 기본값).
--
-- ⚠ 이 아이템은 **관리자 검수를 건너뛴다.** 건강·웰니스 상품은 표시광고 규제 대상이므로
--   "누가·언제·어느 상품에" 썼는지 추적할 수 있어야 한다. 전용 감사 테이블이 없어
--   `products.fast_reviewed_at` 에 날짜를 남기고 관리자 상품 화면이 그 값을 보여준다
--   (관리자는 사후에 `pause`·`reject` 로 되돌릴 수 있다 — 0015 `app_admin_review_product`).
--
-- 프로토타입과 같은 점
--   · 🥬 1 로 **대기 중 상품 전부** 통과 (상품당 과금이 아니다 — 가격 정책은 운영 결정)
--   · 재고가 0 이면 `platform_settings.default_stock_on_approve`(기본 500)로 채운다
--     — 관리자 승인(0015)과 **같은 결과**여야 한다
--   · 대기 중 상품이 없으면 적용하지 않고 **차감하지 않는다**(0037 의 `NO_TARGET_*` 규칙)
-- ============================================================

-- ------------------------------------------------------------
-- products.fast_reviewed_at — 우선 검수권으로 검수 없이 노출된 날
--   관리자 상품 목록·상세가 "검수 생략" 표시에 쓴다. 공개 grant 대상이 아니다.
-- ------------------------------------------------------------
alter table public.products
  add column if not exists fast_reviewed_at date;

comment on column public.products.fast_reviewed_at is
  '우선 검수권(🥬)으로 관리자 검수 없이 노출된 날. 표시광고 사후 점검용 — 관리자 화면에 "검수 생략" 으로 표시 (0038)';

create index if not exists products_fast_reviewed_at_idx
  on public.products (fast_reviewed_at) where fast_reviewed_at is not null;

-- ------------------------------------------------------------
-- app_shop_buy — 0037 판 + fastreview
--   fastreview 를 구매 가능 목록에 넣고 효과를 붙인다. 나머지는 0037 과 같다.
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
  --   0038 에서 fastreview 가 들어왔다. 남은 것: 인플루언서 datapass(익명 실적 표) · regongu(재판매 흐름)
  if p_item_id not in ('datapass', 'boost', 'homefeature', 'featured', 'fastreview')
     or (p_owner_type = 'seller' and p_item_id = 'datapass') then
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
    -- 검수 대기 중인 내 상품 (0038)
    select count(*)::integer into v_n from public.products p
      where p.brand_id = p_owner_id and p.status = 'pending' and p.deleted_at is null;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'code', 'NO_TARGET_PENDING');
    end if;
  end if;

  -- 🥬 차감
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
    -- 관리자 승인(0015 app_admin_review_product approve)과 **같은 결과**로 맞춘다:
    --   status='listed' · reject_reason 비움 · 재고 0 이면 기본값
    select coalesce((ps.value #>> '{}')::integer, 500) into v_default
      from public.platform_settings ps where ps.key = 'default_stock_on_approve';
    v_default := coalesce(v_default, 500);

    with up as (
      update public.products
         set status = 'listed',
             reject_reason = null,
             stock = case when coalesce(stock, 0) = 0 then v_default else stock end,
             fast_reviewed_at = v_today            -- 검수를 건너뛴 사실을 남긴다
       where brand_id = p_owner_id and status = 'pending' and deleted_at is null
       returning code
    ) select array_agg(code) into v_codes from up;

  -- brand datapass 는 별도 적용이 없다 — `brand_data_free_reason` 이 'PASS' 로 읽는다
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'item_id', p_item_id, 'name', v_name,
    'charged', v_price, 'balance', v_bal, 'expires_on', v_exp, 'applied', v_n,
    'codes', to_jsonb(coalesce(v_codes, array[]::text[])));
end;
$$;

revoke all on function public.app_shop_buy(text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_shop_buy(text, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_shop_catalog — 0037 판 + fastreview 를 `available` 에 넣는다
--   (두 식이 어긋나면 버튼이 눌리고 실패한다 — 0037 에서 한 번 겪었다)
-- ------------------------------------------------------------
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
           -- **`app_shop_buy` 의 가드와 같은 식이어야 한다**
           'available', coalesce((i ->> 'auto')::boolean, false)
                        or ((i ->> 'id') = any (array['datapass', 'boost', 'homefeature', 'featured', 'fastreview'])
                            and not (p_owner_type = 'seller' and (i ->> 'id') = 'datapass'))
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
