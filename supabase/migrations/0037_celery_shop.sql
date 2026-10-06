-- ============================================================
-- 0037 — 셀러리 샵 (노출·열람 아이템)
--
-- 배경: 프로토타입 `/influencer/shop` · `/brand/shop`(`packages/ui/views/Shop.svelte` · actions.ts
--   `buyItem`)이 실서비스에 없었다. 카탈로그는 `platform_settings.shop_items` 에, 구매 기록 테이블은
--   `celery_purchases`(0005)에 이미 있다. 유상 충전은 도입하지 않으므로(`points-policy.md` §0)
--   **무상 🥬 로만 구매**한다 — 샵 화면에 충전 버튼을 두지 않는다.
--
-- 이 파일이 다루는 아이템 (효과를 **읽는 코드가 이미 있는** 것들)
--   brand  datapass(30·30일)  갤러리 전체 무제한 열람 — `brand_data_free_reason` 에 'PASS' 추가(0035)
--   brand  boost(3·7일)       `products.boosted_at` — 인플루언서 상품 갤러리가 이미 이 열로 정렬한다
--                             (`products.server.ts:193 order('boosted_at')`)
--   brand  homefeature(5·7일) `campaigns.home_featured_at` — 고객 홈이 이미 읽고 정렬한다
--                             (`apps/shop/+page.server.ts` `isHomeFeat` · `platform_settings.home_feature_days`)
--   seller homefeature(3·7일) 같은 열. 내 캠페인만
--   seller featured(3·7일)    `sellers.featured_at`(이 파일에서 추가) — 브랜드 갤러리 추천 최상단 + 뱃지
--
-- 다음 PR 로 미룬 것
--   brand  fastreview  검수 생략 — 절차를 바꾸므로 따로
--   seller regongu     일정 즉시 확정(브랜드 승인 생략) — 절차를 바꾸므로 따로
--   seller datapass    인플루언서별 익명 실적 표를 먼저 만들어야 한다
--
-- 기간형은 `celery_purchases.expires_on = purchased_on + shop_items[].days` 로 서버가 넣는다
--   (0005 헤더의 설계 그대로). 영구형은 `expires_on = null`.
-- ============================================================

-- ------------------------------------------------------------
-- sellers.featured_at — 프로필 상단 노출 시작일 (7일 · `shop_items.seller[].featured.days`)
--   브랜드 갤러리(0035 `app_brand_gallery`)의 추천 정렬에 쓴다. 공개 grant 대상이 아니다.
-- ------------------------------------------------------------
alter table public.sellers
  add column if not exists featured_at date;

comment on column public.sellers.featured_at is
  '프로필 상단 노출 시작일 — 브랜드 갤러리 추천 최상단 + 뱃지. shop_items.seller featured(7일) 구매 시 설정 (0037)';

create index if not exists sellers_featured_at_idx on public.sellers (featured_at) where featured_at is not null;

-- ------------------------------------------------------------
-- shop_item_of(role, item_id) — 카탈로그 한 건 (platform_settings.shop_items)
--   없으면 null. `auto: true` 는 구매 대상이 아니다(사용 시 자동 차감).
-- ------------------------------------------------------------
create or replace function public.shop_item_of(p_role text, p_item_id text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select i
    from public.platform_settings ps
    cross join lateral jsonb_array_elements(ps.value -> p_role) i
   where ps.key = 'shop_items'
     and i ->> 'id' = p_item_id
   limit 1;
$$;

revoke all on function public.shop_item_of(text, text) from public, anon, authenticated;
grant execute on function public.shop_item_of(text, text) to service_role;

-- ------------------------------------------------------------
-- shop_item_active(owner_type, owner_id, item_id) — 보유 중인가
--   기간형은 expires_on > 오늘(KST) · 영구형은 행이 있으면 true.
--   프로토타입 `passActive(ent, id, days)` 와 같은 판정.
-- ------------------------------------------------------------
create or replace function public.shop_item_active(p_owner_type text, p_owner_id uuid, p_item_id text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.celery_purchases cp
     where cp.owner_type = p_owner_type
       and ((p_owner_type = 'seller' and cp.seller_id = p_owner_id)
         or (p_owner_type = 'brand'  and cp.brand_id  = p_owner_id))
       and cp.item_id = p_item_id
       and (cp.expires_on is null or cp.expires_on > (now() at time zone 'Asia/Seoul')::date));
$$;

revoke all on function public.shop_item_active(text, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_item_active(text, uuid, text) to service_role;

-- ------------------------------------------------------------
-- brand_data_free_reason — 0035 판 + 데이터 패스('PASS')
--   패스를 가진 브랜드는 갤러리 전체를 무제한 열람한다. 월 무료 한도(QUOTA)보다 앞에 둔다 —
--   패스가 있으면 한도를 깎지 않는다.
-- ------------------------------------------------------------
create or replace function public.brand_data_free_reason(p_brand_id uuid, p_seller_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.data_views v
                  where v.brand_id = p_brand_id and v.seller_id = p_seller_id) then 'VIEWED'
    when exists (select 1 from public.campaigns c
                  join public.products p on p.id = c.product_id
                 where c.seller_id = p_seller_id and p.brand_id = p_brand_id
                   and c.status in ('LIVE', 'CLEARING', 'SETTLED')) then 'WORKED'
    -- 0037 — 데이터 패스(30일 무제한). 월 한도를 쓰지 않는다
    when public.shop_item_active('brand', p_brand_id, 'datapass') then 'PASS'
    when public.brand_free_ref_left(p_brand_id) > 0 then 'QUOTA'
    else null
  end;
$$;

revoke all on function public.brand_data_free_reason(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_data_free_reason(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_shop_catalog(owner_type, owner_id) — 샵 화면 한 번에
--   카탈로그 + 보유 상태(남은 일수) + 🥬 잔액 + 최근 원장 8건.
--   `auto` 아이템은 구매 버튼 대신 "사용 시 자동 차감" 으로 보여준다(프로토타입과 같다).
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
           -- price 는 숫자 또는 'grade'(등급별) — 화면이 그대로 보여준다
           'price', i -> 'price',
           'days', (i ->> 'days')::integer,
           'auto', coalesce((i ->> 'auto')::boolean, false),
           'active', public.shop_item_active(p_owner_type, p_owner_id, i ->> 'id'),
           'expires_on', (select max(cp.expires_on) from public.celery_purchases cp
                           where cp.owner_type = p_owner_type
                             and ((p_owner_type = 'seller' and cp.seller_id = p_owner_id)
                               or (p_owner_type = 'brand'  and cp.brand_id  = p_owner_id))
                             and cp.item_id = i ->> 'id'),
           -- 아직 효과를 붙이지 않은 아이템은 구매를 막는다 (돈 받고 아무 일도 안 하는 걸 방지).
           -- **`app_shop_buy` 의 가드와 같은 식이어야 한다** — 다르면 버튼이 눌리고 실패한다.
           -- 인플루언서 datapass(익명 실적 표)는 그 화면을 먼저 만들어야 하므로 아직 제외한다.
           'available', coalesce((i ->> 'auto')::boolean, false)
                        or ((i ->> 'id') = any (array['datapass', 'boost', 'homefeature', 'featured'])
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

-- ------------------------------------------------------------
-- app_shop_buy(owner_type, owner_id, item_id) — 아이템 구매
--   가드: 카탈로그에 있는 id · auto 아님 · 효과가 붙은 아이템 · 이미 보유 중이 아님 · 잔액 충분
--   효과를 바로 적용한다(프로토타입 `buyItem` 과 같다). 적용 대상이 없으면 **차감하지 않는다**
--   (데모도 homefeature 에서 "노출할 판매가 없어 적용되지 않았습니다 (셀러리는 차감되지 않음)").
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
  -- 효과를 붙이지 않은 아이템(fastreview · regongu · seller datapass)은 아직 팔지 않는다
  if p_item_id not in ('datapass', 'boost', 'homefeature', 'featured')
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
    -- 프로토타입은 "내 대표 상품" 1개 — 노출 중 상품 중 가장 최근 등록분에 건다
    update public.products set boosted_at = v_today
     where id = (select p.id from public.products p
                  where p.brand_id = p_owner_id and p.status = 'listed' and p.deleted_at is null
                  order by p.created_at desc limit 1);

  -- brand datapass 는 별도 적용이 없다 — `brand_data_free_reason` 이 'PASS' 로 읽는다
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'item_id', p_item_id, 'name', v_name,
    'charged', v_price, 'balance', v_bal, 'expires_on', v_exp, 'applied', v_n);
end;
$$;

revoke all on function public.app_shop_buy(text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_shop_buy(text, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_gallery — 0035 판 + featured 정렬·뱃지
--   추천(recommended)에 `featured_at` 가중치를 더한다(프로토타입 `recs` 의 `passActive(s,'featured',7)? 5:0`).
--   공개 목록의 행에도 `featured` 를 담아 화면이 뱃지를 달 수 있게 한다.
-- ------------------------------------------------------------
create or replace function public.app_brand_gallery(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b          public.brands%rowtype;
  v_group    text;
  v_public   jsonb;
  v_scout    jsonb;
  v_rec      jsonb;
  v_free     integer;
  v_days     integer;
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select ct.group_name into v_group from public.categories ct where ct.name = b.category;
  v_free := public.brand_free_ref_left(p_brand_id);
  -- featured 유효 일수 (shop_items.seller featured.days · 기본 7)
  select coalesce(((public.shop_item_of('seller', 'featured')) ->> 'days')::integer, 7) into v_days;

  select coalesce(jsonb_agg(t.r order by t.featured desc, t.followers desc nulls last, t.name), '[]'::jsonb) into v_public
    from (
      select jsonb_build_object(
               'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle,
               'platform', s.platform, 'avatar_url', s.avatar_url, 'intro', s.intro,
               'category', s.category, 'followers', s.followers,
               'grade', g.name,
               'price_cel', g.data_price_cel,
               'free_reason', fr.reason,
               'unlocked', (fr.reason is not null),
               -- 0037 — 프로필 상단 노출 중(7일)
               'featured', (s.featured_at is not null and s.featured_at + v_days > v_today),
               'category_fit', (v_group is not null and exists (
                  select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)),
               'stats', case when fr.reason is null then null else jsonb_build_object(
                   'm3_sales', s.m3_sales,
                   'likes_avg', s.likes_avg,
                   'engagement', case when coalesce(s.followers, 0) > 0
                                      then round(s.likes_avg::numeric * 100 / s.followers, 1) else null end,
                   'per_follower', case when coalesce(s.followers, 0) > 0
                                        then round(s.m3_sales::numeric / s.followers) else null end,
                   'recent_likes', s.recent_likes,
                   'campaigns_done', (select count(*) from public.campaigns c
                                       where c.seller_id = s.id and c.status in ('LIVE','CLEARING','SETTLED')),
                   'avg_net', (select round(avg(st.net)) from public.settlements st
                                join public.campaigns c2 on c2.id = st.campaign_id
                               where c2.seller_id = s.id),
                   'external', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'source', x.source, 'name', x.product_name, 'brand', x.brand_name,
                                  'seen_on', x.seen_on, 'price', x.price,
                                  'est_orders', round(e.v_orders),
                                  'est_low', round(e.v_orders * x.price * 0.75),
                                  'est_high', round(e.v_orders * x.price * 1.25))
                                  order by x.seen_on desc), '[]'::jsonb)
                                 from public.seller_external_sales x
                                 cross join lateral (select case when coalesce(s.followers, 0) > 0
                                        then s.likes_avg::numeric * 6 * 0.015 else 0 end as v_orders) e
                                where x.seller_id = s.id)
                 ) end
             ) as r,
             (s.featured_at is not null and s.featured_at + v_days > v_today) as featured,
             s.followers, s.name
        from public.sellers s
        join public.grade_tiers g on g.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
        cross join lateral (select public.brand_data_free_reason(p_brand_id, s.id) as reason) fr
       where s.active and not s.hidden
       limit 100) t;

  select coalesce(jsonb_agg(t.r order by t.m3_sales desc nulls last), '[]'::jsonb) into v_scout
    from (
      select jsonb_build_object(
               'id', s.id,
               'grade', g.name,
               'category', s.category,
               'm3_sales', s.m3_sales,
               'price_cel', g.data_price_cel,
               'free_reason', fr.reason,
               'unlocked', (fr.reason is not null),
               'name', case when fr.reason is not null then s.name end,
               'handle', case when fr.reason is not null then s.handle end,
               'platform', case when fr.reason is not null then s.platform end,
               'avatar_url', case when fr.reason is not null then s.avatar_url end,
               'stats', case when fr.reason is null then null else jsonb_build_object(
                   'followers', s.followers,
                   'likes_avg', s.likes_avg,
                   'engagement', case when coalesce(s.followers, 0) > 0
                                      then round(s.likes_avg::numeric * 100 / s.followers, 1) else null end,
                   'per_follower', case when coalesce(s.followers, 0) > 0
                                        then round(s.m3_sales::numeric / s.followers) else null end
                 ) end
             ) as r,
             s.m3_sales
        from public.sellers s
        join public.grade_tiers g on g.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
        cross join lateral (select public.brand_data_free_reason(p_brand_id, s.id) as reason) fr
       where s.active and s.hidden
       limit 50) t;

  -- 추천 — 카테고리 적합(2) + 매출 효율 + **프로필 상단 노출(5)**. 프로토타입 `recs` 와 같은 가중치
  select coalesce(jsonb_agg(t.id order by t.score desc), '[]'::jsonb) into v_rec
    from (
      select s.id,
             (case when v_group is not null and exists (
                select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)
              then 2 else 0 end)
             + case when coalesce(s.followers, 0) > 0 then (s.m3_sales::numeric / s.followers) / 300 else 0 end
             + case when s.featured_at is not null and s.featured_at + v_days > v_today then 5 else 0 end as score
        from public.sellers s
       where s.active and not s.hidden
       order by score desc
       limit 2) t;

  return jsonb_build_object('ok', true,
    'brand', jsonb_build_object('name', b.name, 'category', b.category,
                                'grade', coalesce(b.grade, public.brand_grade_for_gmv(public.brand_gmv(b.id)))),
    'free_left', v_free,
    'has_pass', public.shop_item_active('brand', p_brand_id, 'datapass'),
    'public', v_public,
    'scout', v_scout,
    'recommended', v_rec);
end;
$$;

revoke all on function public.app_brand_gallery(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_gallery(uuid) to service_role;
