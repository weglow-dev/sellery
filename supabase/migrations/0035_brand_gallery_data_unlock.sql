-- ============================================================
-- 0035 — 브랜드 인플루언서 갤러리 · 🥬 데이터 열람
--
-- 배경: 프로토타입 `/brand/gallery` 가 실서비스에 없었다. `data_views`(0005) 테이블과 가격
--   (`grade_tiers.data_price_cel`) · 무료 한도(`brand_grade_tiers.free_ref_per_month` ·
--   `brands.free_ref_used`)까지 다 있는데 읽고 쓰는 코드가 없었다.
--   유상 충전은 도입하지 않으므로(`points-policy.md` §0) **무상 🥬 로만 열람**한다.
--
-- 프로토타입 규칙 그대로 (`SellerCard.svelte` · actions.ts `unlockSellerData`/`unlockRef`/`spendData`)
--   가격      인플루언서 등급별 `grade_tiers.data_price_cel` (스타터·브론즈 1 … 블랙 5)
--   무료 1    **함께 판매한 이력**이 있으면 그 인플루언서 데이터는 영구 무료
--             (demo `worked` — LIVE/CLEARING/SETTLED 캠페인 중 내 브랜드 상품이 있으면)
--   무료 2    브랜드 등급 다이아·블랙은 **월 5회 무료**
--             (`brand_grade_tiers.free_ref_per_month` · 사용량은 `brands.free_ref_used` jsonb{YYYY-MM: n})
--   열람 종류  `data` = 공개 인플루언서의 성과 데이터 · `ref` = 비공개(익명) 인플루언서의 레퍼런스
--   한 번 열면 영구 — `data_views` 에 행이 있으면 다시 과금하지 않는다(멱등)
--
-- **익명 규칙**: `hidden` 인플루언서는 열람 전 이름·핸들·아바타를 내려보내지 않는다. 열람 후에만 공개한다.
--   공개 인플루언서는 이름이 처음부터 보이고 **지표만** 잠긴다(프로토타입 `SellerCard` 의 `.gate`).
--
-- 제안권(`invite` 🥬 차감)은 **이 파일 범위가 아니다** — `seller_invite_gated`(0017)가 아직
--   다이아·블랙을 초대 후보에서 빼고 있고, 그 게이트를 푸는 건 다음 작업이다.
--
-- 이 파일은 기존 함수를 바꾸지 않는다(추가만).
-- ============================================================

-- ------------------------------------------------------------
-- brand_free_ref_left(brand) — 이번 달 남은 무료 열람 횟수
--   다이아·블랙만 > 0. 사용량은 brands.free_ref_used{'YYYY-MM': n} (KST 기준 월)
-- ------------------------------------------------------------
create or replace function public.brand_free_ref_left(p_brand_id uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select greatest(0,
           coalesce(bgt.free_ref_per_month, 0)
           - coalesce((b.free_ref_used ->> to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM'))::integer, 0))
    from public.brands b
    left join public.brand_grade_tiers bgt
      on bgt.name = coalesce(b.grade, public.brand_grade_for_gmv(public.brand_gmv(b.id)))
   where b.id = p_brand_id;
$$;

revoke all on function public.brand_free_ref_left(uuid) from public, anon, authenticated;
grant execute on function public.brand_free_ref_left(uuid) to service_role;

-- ------------------------------------------------------------
-- brand_data_free_reason(brand, seller) — 과금 없이 볼 수 있는 이유 (없으면 null)
--   'VIEWED'  이미 열람함 (data_views 행 있음 — 영구)
--   'WORKED'  함께 판매한 이력 (demo worked — 영구 무료)
--   'QUOTA'   브랜드 등급 월 무료 한도 잔여
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
    when public.brand_free_ref_left(p_brand_id) > 0 then 'QUOTA'
    else null
  end;
$$;

revoke all on function public.brand_data_free_reason(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_data_free_reason(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_gallery(p_brand_id) — 갤러리 한 번에
--   recommended  내 카테고리군 적합 + 매출 효율 상위 2명 (demo recs — featured 아이템은 아직 없다)
--   public       공개 인플루언서 전체 (이름 공개 · 지표는 unlocked 일 때만)
--   scout        비공개(hidden) 인플루언서 — 열람 전에는 등급·카테고리·3개월 매출만
--
--   **잠긴 행에는 지표를 담지 않는다** — 화면에서 가리는 게 아니라 서버가 안 보낸다.
--   비공개 인플루언서는 열람 전 이름·핸들·아바타도 담지 않는다.
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
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select ct.group_name into v_group from public.categories ct where ct.name = b.category;
  v_free := public.brand_free_ref_left(p_brand_id);

  -- 공개 인플루언서 — 이름은 보이고 지표는 열람 여부에 따라
  select coalesce(jsonb_agg(t.r order by t.followers desc nulls last, t.name), '[]'::jsonb) into v_public
    from (
      select jsonb_build_object(
               'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle,
               'platform', s.platform, 'avatar_url', s.avatar_url, 'intro', s.intro,
               'category', s.category, 'followers', s.followers,
               'grade', g.name,
               'price_cel', g.data_price_cel,
               'free_reason', fr.reason,
               'unlocked', (fr.reason is not null),
               'category_fit', (v_group is not null and exists (
                  select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)),
               -- 잠겨 있으면 지표를 담지 않는다 (null)
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
                   -- 외부 판매 감지 + 예상 매출(가계산). 공식은 프로토타입 `estExternal`(helpers.ts) 그대로:
                   --   참여율 = likes_avg / followers · 추정 주문 = followers × 참여율 × 6 × 0.015
                   --   중앙값 = 주문 × 판매가 · 범위 = ±25%. 크롤링 기반 가계산이라 화면에도 "(가계산)" 을 적는다.
                   'external', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'source', x.source, 'name', x.product_name, 'brand', x.brand_name,
                                  'seen_on', x.seen_on, 'price', x.price,
                                  'est_orders', round(v_orders),
                                  'est_low', round(v_orders * x.price * 0.75),
                                  'est_high', round(v_orders * x.price * 1.25))
                                  order by x.seen_on desc), '[]'::jsonb)
                                 from public.seller_external_sales x
                                 cross join lateral (select case when coalesce(s.followers, 0) > 0
                                        then s.likes_avg::numeric * 6 * 0.015 else 0 end as v_orders) e
                                where x.seller_id = s.id)
                 ) end
             ) as r,
             s.followers, s.name
        from public.sellers s
        join public.grade_tiers g on g.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
        cross join lateral (select public.brand_data_free_reason(p_brand_id, s.id) as reason) fr
       where s.active and not s.hidden
       limit 100) t;

  -- 비공개(익명) 인플루언서 — 열람 전에는 신원을 담지 않는다
  select coalesce(jsonb_agg(t.r order by t.m3_sales desc nulls last), '[]'::jsonb) into v_scout
    from (
      select jsonb_build_object(
               'id', s.id,
               'grade', g.name,
               'category', s.category,
               'm3_sales', s.m3_sales,                     -- 익명 카드도 매출은 보여준다 (프로토타입과 같다)
               'price_cel', g.data_price_cel,
               'free_reason', fr.reason,
               'unlocked', (fr.reason is not null),
               -- 열람 후에만 신원·상세 지표
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

  -- 맞춤 추천 2명 — 카테고리 적합(2점) + 매출 효율. 공개 인플루언서에서만 고른다
  select coalesce(jsonb_agg(t.id order by t.score desc), '[]'::jsonb) into v_rec
    from (
      select s.id,
             (case when v_group is not null and exists (
                select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)
              then 2 else 0 end)
             + case when coalesce(s.followers, 0) > 0 then (s.m3_sales::numeric / s.followers) / 300 else 0 end as score
        from public.sellers s
       where s.active and not s.hidden
       order by score desc
       limit 2) t;

  return jsonb_build_object('ok', true,
    'brand', jsonb_build_object('name', b.name, 'category', b.category,
                                'grade', coalesce(b.grade, public.brand_grade_for_gmv(public.brand_gmv(b.id)))),
    'free_left', v_free,
    'public', v_public,
    'scout', v_scout,
    'recommended', v_rec);
end;
$$;

revoke all on function public.app_brand_gallery(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_gallery(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_unlock_data(p_brand_id, p_seller_id, p_kind) — 🥬 로 데이터 열람
--   p_kind: 'data'(공개 인플루언서 성과) | 'ref'(비공개 익명 레퍼런스)
--   무료 사유가 있으면 과금하지 않는다. QUOTA 면 brands.free_ref_used 를 올린다.
--   멱등 — 이미 열람했으면 already:true (data_views 행 재사용)
-- ------------------------------------------------------------
create or replace function public.app_brand_unlock_data(
  p_brand_id uuid, p_seller_id uuid, p_kind text default 'data')
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s          public.sellers%rowtype;
  v_kind     text := case when p_kind = 'ref' then 'ref' else 'data' end;
  v_reason   text;
  v_price    integer;
  v_ledger   uuid;
  v_ym       text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM');
  v_bal      integer;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found or not s.active then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  -- 종류와 공개 여부가 맞아야 한다 (익명 카드에서 'data' 를 보내 신원을 캐는 걸 막는다)
  if (v_kind = 'ref') <> s.hidden then
    return jsonb_build_object('ok', false, 'code', 'KIND_MISMATCH');
  end if;

  if not exists (select 1 from public.brands where id = p_brand_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_reason := public.brand_data_free_reason(p_brand_id, p_seller_id);
  if v_reason = 'VIEWED' then
    return jsonb_build_object('ok', true, 'already', true, 'charged', 0, 'reason', 'VIEWED');
  end if;

  select gt.data_price_cel into v_price from public.grade_tiers gt
   where gt.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  v_price := coalesce(v_price, 2);

  if v_reason = 'WORKED' then
    insert into public.data_views (brand_id, seller_id, kind, price_cel, free)
      values (p_brand_id, p_seller_id, v_kind, 0, true);
    return jsonb_build_object('ok', true, 'already', false, 'charged', 0, 'reason', 'WORKED');
  end if;

  if v_reason = 'QUOTA' then
    update public.brands
       set free_ref_used = coalesce(free_ref_used, '{}'::jsonb)
             || jsonb_build_object(v_ym, coalesce((free_ref_used ->> v_ym)::integer, 0) + 1)
     where id = p_brand_id;
    insert into public.data_views (brand_id, seller_id, kind, price_cel, free)
      values (p_brand_id, p_seller_id, v_kind, 0, true);
    return jsonb_build_object('ok', true, 'already', false, 'charged', 0, 'reason', 'QUOTA',
      'free_left', public.brand_free_ref_left(p_brand_id));
  end if;

  -- 유상(🥬) 차감 — 잔액 부족은 celery_spend 가 CEL_INSUFFICIENT 로 올린다
  begin
    v_bal := public.celery_spend('brand', p_brand_id, -v_price,
      case when v_kind = 'ref' then 'ref_unlock' else 'data_unlock' end,
      case when v_kind = 'ref'
           then format('익명 레퍼런스 열람 · ○○○ 인플루언서 (%s)', coalesce(s.grade, public.grade_for_sales(s.m3_sales)))
           else format('데이터 확인 · %s %s (%s)', s.name, s.handle, coalesce(s.grade, public.grade_for_sales(s.m3_sales))) end,
      'seller', p_seller_id);
  exception
    when sqlstate 'P0001' then
      return jsonb_build_object('ok', false, 'code', 'CEL_INSUFFICIENT', 'price_cel', v_price);
  end;

  select id into v_ledger from public.celery_ledger
   where brand_id = p_brand_id and ref_type = 'seller' and ref_id = p_seller_id
   order by created_at desc limit 1;

  insert into public.data_views (brand_id, seller_id, kind, price_cel, free, ledger_id)
    values (p_brand_id, p_seller_id, v_kind, v_price, false, v_ledger);

  return jsonb_build_object('ok', true, 'already', false, 'charged', v_price, 'reason', 'PAID',
    'balance', v_bal);
end;
$$;

revoke all on function public.app_brand_unlock_data(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_unlock_data(uuid, uuid, text) to service_role;
