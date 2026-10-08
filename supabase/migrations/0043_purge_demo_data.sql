-- ============================================================
-- 0043 — 실판매 준비(2026-10-14 전환 · docs/launch-checklist.md §2): 시드·데모·개발 데이터 일괄 삭제 함수 + 토스 지급 하루 상한 설정
--        · admin_purge_demo_data(p_confirm, p_keep_emails, p_keep_codes, p_reset_seq) — FK 순서(자식 → 부모)로 한 트랜잭션 안에서 지우고 표별 건수를 돌려준다.
--          p_confirm <> 'PURGE' 면 **dry-run**(같은 조건으로 count 만) · 'PURGE' 면 삭제. 둘 다 같은 조건식을 쓴다(한 목록 · EXECUTE).
--        · platform_settings 'payout_daily_cap'(기본 5,000,000) — 토스 지급대행 상점 peerkeamf5 가 다른 서비스와 잔액을 공유하므로 셀러리가 하루(KST)에 요청할 수 있는 상한.
--          앱(@sellery/payments server/payouts requestDuePayouts) · 스크립트(partner-admin.mjs toss-payout-request) 가 요청 전에 검사한다. 바꾸기: partner-admin.mjs payout-cap <원>.
--
-- 실행: 0042 이후. 재실행 가능(create or replace / insert … on conflict do nothing). 호출: packages/db/scripts/purge-seed.mjs (service role · RPC).
--       0044~ 는 다른 작업자(파트너 관리)가 쓴다 — 이 파일은 함수 1개 + 설정 1행만.
--
-- 남기는 것(항상): platform_settings · grade_tiers · brand_grade_tiers · categories(정책 마스터 — 없으면 등급 계산·상품 등록이 깨진다) ·
--   관리자 계정(profiles.role = 'admin' — 단 `%@sellery.demo` · `%@sellery.test` 는 데모/개발 계정이라 관리자여도 지운다, dev-admin@sellery.test 포함) ·
--   p_keep_emails(auth.users.email · sellers.email · brands.email · customers.email 소문자 일치)에 걸린 계정·파트너·고객과 **그 밑에 달린 행**(브랜드의 상품,
--   양쪽이 다 남는 캠페인, 그 캠페인의 주문·정산·지급·문의, 🥬 원장 …) · p_keep_codes(s* b* p* c* 코드 — 캠페인 코드는 인플루언서·브랜드·상품을 같이 남긴다).
--   양쪽 중 한쪽이라도 지워지는 캠페인은 restrict FK 때문에 같이 지운다(예: 대표 실계정 s101 × 시드 상품 p1 의 c105·c106 — launch-checklist §2).
-- 지우는 것: 그 밖의 전부 — 시드 b1·b2 / s1~s8 / p1~p10 / c1~c15 / 주문 ~1,000 / 원장·열람·독점·조회·외부판매·추천 / cs / 결제 세션·이벤트 / 정산·지급·지급 이벤트 /
--   파트너 결제 / 🥬 구매 / 민감정보 열람 로그(지워지는 파트너 것) / 고객(회원·비회원) / profiles. auth.users 는 지우지 않고 **삭제 대상 id 목록만 돌려준다** — 스크립트가
--   auth.admin.deleteUser 로 지운다(GoTrue 가 identities·sessions 를 정리). 두 번 실행해도 안전(남은 사용자만 다시 나온다).
-- 시퀀스(p_reset_seq): 삭제 뒤 **표가 비었을 때만** 그 표의 코드 시퀀스를 처음값으로(campaign 100 · order 2000 · cs 100 · seller 100 · seller_channel 100 · brand 100 · product 100).
--   남는 행이 있으면 건드리지 않는다(코드 유일성). sensitive_access_log_id_seq 는 대상 아님.
-- 반환: { ok, dry_run, counts:[{ table, delete, keep }], auth_user_ids:[uuid], auth_users:[{ id, email_masked }], purged:{ seller_ids, brand_ids, product_ids }, sequences:[{ name, reset, restart }] }
-- ============================================================

insert into public.platform_settings (key, value, description)
values ('payout_daily_cap', '5000000'::jsonb, '하루(KST) 토스 지급 요청 상한(원) — 지급대행 상점(peerkeamf5)의 잔액이 다른 서비스와 공유되므로 셀러리 쪽 버그가 남의 돈을 쓰지 못하게. partner-admin.mjs payout-cap · 앱 requestDuePayouts 가드(0043)')
on conflict (key) do nothing;

create or replace function public.admin_purge_demo_data(
  p_confirm     text    default null,
  p_keep_emails text[]  default '{}',
  p_keep_codes  text[]  default '{}',
  p_reset_seq   boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_do        boolean := coalesce(p_confirm = 'PURGE', false);   -- null 이면 dry-run (null = 'PURGE' 는 null)
  v_emails    text[]  := coalesce((select array_agg(lower(trim(e))) from unnest(coalesce(p_keep_emails, '{}')) e where trim(e) <> ''), '{}');
  v_codes     text[]  := coalesce((select array_agg(trim(c)) from unnest(coalesce(p_keep_codes, '{}')) c where trim(c) <> ''), '{}');
  v_steps     text[][] := array[
    -- [표, 삭제 조건] — 자식 → 부모. 조건은 keep_* 임시표를 본다.
    ['payout_events',        'payout_id is null or payout_id not in (select id from pg_temp.keep_payouts)'],
    ['payouts',              'id not in (select id from pg_temp.keep_payouts)'],
    ['referral_earnings',    'not ((referrer_seller_id is null or referrer_seller_id in (select id from pg_temp.keep_sellers)) and (referred_seller_id is null or referred_seller_id in (select id from pg_temp.keep_sellers)) and (referrer_brand_id is null or referrer_brand_id in (select id from pg_temp.keep_brands)) and (referred_brand_id is null or referred_brand_id in (select id from pg_temp.keep_brands)) and (campaign_id is null or campaign_id in (select id from pg_temp.keep_campaigns)) and (settlement_id is null or settlement_id in (select id from pg_temp.keep_settlements)))'],
    ['settlements',          'id not in (select id from pg_temp.keep_settlements)'],
    ['partner_payments',     'not ((seller_id is null or seller_id in (select id from pg_temp.keep_sellers)) and (brand_id is null or brand_id in (select id from pg_temp.keep_brands)) and (product_id is null or product_id in (select id from pg_temp.keep_products)) and (campaign_id is null or campaign_id in (select id from pg_temp.keep_campaigns)) and (user_id is null or user_id in (select id from pg_temp.keep_users)))'],
    ['payment_events',       'toss_order_id is null or toss_order_id not in (select toss_order_id from pg_temp.keep_sessions)'],
    ['cs_messages',          'conversation_id not in (select id from pg_temp.keep_cs)'],
    ['cs_conversations',     'id not in (select id from pg_temp.keep_cs)'],
    ['orders',               'id not in (select id from pg_temp.keep_orders)'],
    ['checkout_sessions',    'id not in (select id from pg_temp.keep_sessions)'],
    ['campaign_events',      'campaign_id not in (select id from pg_temp.keep_campaigns)'],
    ['campaigns',            'id not in (select id from pg_temp.keep_campaigns)'],
    ['product_views',        'not (seller_id in (select id from pg_temp.keep_sellers) and product_id in (select id from pg_temp.keep_products))'],
    ['exclusive_requests',   'not (seller_id in (select id from pg_temp.keep_sellers) and product_id in (select id from pg_temp.keep_products))'],
    ['celery_purchases',     'not ((seller_id is null or seller_id in (select id from pg_temp.keep_sellers)) and (brand_id is null or brand_id in (select id from pg_temp.keep_brands)) and (product_id is null or product_id in (select id from pg_temp.keep_products)))'],
    ['data_views',           'not ((seller_id is null or seller_id in (select id from pg_temp.keep_sellers)) and (brand_id is null or brand_id in (select id from pg_temp.keep_brands)))'],
    ['seller_external_sales','seller_id not in (select id from pg_temp.keep_sellers)'],
    ['celery_ledger',        'not ((seller_id is null or seller_id in (select id from pg_temp.keep_sellers)) and (brand_id is null or brand_id in (select id from pg_temp.keep_brands)))'],
    ['products',             'id not in (select id from pg_temp.keep_products)'],
    ['seller_channels',      'seller_id not in (select id from pg_temp.keep_sellers)'],
    ['sensitive_access_log', '(seller_id is not null and seller_id not in (select id from pg_temp.keep_sellers)) or (brand_id is not null and brand_id not in (select id from pg_temp.keep_brands))'],
    ['sellers',              'id not in (select id from pg_temp.keep_sellers)'],
    ['brands',               'id not in (select id from pg_temp.keep_brands)'],
    ['customers',            'id not in (select id from pg_temp.keep_customers)'],
    ['profiles',             'id not in (select id from pg_temp.keep_users)']
  ];
  v_seqs      text[][] := array[
    ['campaign_code_seq', 'campaigns', '100'], ['order_code_seq', 'orders', '2000'], ['cs_code_seq', 'cs_conversations', '100'],
    ['seller_code_seq', 'sellers', '100'], ['seller_channel_code_seq', 'seller_channels', '100'], ['brand_code_seq', 'brands', '100'], ['product_code_seq', 'products', '100']
  ];
  v_counts    jsonb := '[]'::jsonb;
  v_seqout    jsonb := '[]'::jsonb;
  v_table     text;
  v_where     text;
  v_del       bigint;
  v_total     bigint;
  v_remaining bigint;
  v_i         int;
  v_users     jsonb;
  v_user_ids  uuid[];
  v_purged    jsonb;
  v_empty     boolean;
begin
  -- ---------- 남길 집합 (임시표 · 트랜잭션 끝에 사라진다) ----------
  create temp table if not exists keep_users     (id uuid primary key) on commit drop;
  create temp table if not exists keep_sellers   (id uuid primary key) on commit drop;
  create temp table if not exists keep_brands    (id uuid primary key) on commit drop;
  create temp table if not exists keep_customers (id uuid primary key) on commit drop;
  create temp table if not exists keep_products  (id uuid primary key) on commit drop;
  create temp table if not exists keep_campaigns (id uuid primary key) on commit drop;
  create temp table if not exists keep_orders    (id uuid primary key) on commit drop;
  create temp table if not exists keep_sessions  (id uuid primary key, toss_order_id text) on commit drop;
  create temp table if not exists keep_settlements (id uuid primary key) on commit drop;
  create temp table if not exists keep_payouts   (id uuid primary key) on commit drop;
  create temp table if not exists keep_cs        (id uuid primary key) on commit drop;
  truncate keep_users, keep_sellers, keep_brands, keep_customers, keep_products, keep_campaigns, keep_orders, keep_sessions, keep_settlements, keep_payouts, keep_cs;

  -- 계정: 관리자(데모/개발 도메인 제외) + 지정 이메일
  insert into keep_users (id)
    select u.id from auth.users u
      left join public.profiles p on p.id = u.id
     where (p.role = 'admin' and lower(coalesce(u.email, '')) not like '%@sellery.demo' and lower(coalesce(u.email, '')) not like '%@sellery.test')
        or lower(coalesce(u.email, '')) = any (v_emails)
  on conflict do nothing;

  -- 파트너: 지정 이메일 · 남는 계정에 연결 · 코드 지정
  insert into keep_sellers (id)
    select s.id from public.sellers s
     where lower(coalesce(s.email, '')) = any (v_emails) or (s.user_id is not null and s.user_id in (select id from keep_users)) or s.code = any (v_codes)
  on conflict do nothing;
  insert into keep_brands (id)
    select b.id from public.brands b
     where lower(coalesce(b.email, '')) = any (v_emails) or (b.user_id is not null and b.user_id in (select id from keep_users)) or b.code = any (v_codes)
  on conflict do nothing;
  -- 코드로 남기는 캠페인·상품은 부모도 남긴다(restrict FK)
  insert into keep_brands (id)   select p.brand_id from public.products p where p.code = any (v_codes) on conflict do nothing;
  insert into keep_sellers (id)  select c.seller_id from public.campaigns c where c.code = any (v_codes) on conflict do nothing;
  insert into keep_brands (id)   select c.brand_id  from public.campaigns c where c.code = any (v_codes) on conflict do nothing;
  insert into keep_brands (id)   select p.brand_id  from public.campaigns c join public.products p on p.id = c.product_id where c.code = any (v_codes) on conflict do nothing;
  -- 남는 파트너의 계정도 남긴다
  insert into keep_users (id) select s.user_id from public.sellers s where s.user_id is not null and s.id in (select id from keep_sellers) on conflict do nothing;
  insert into keep_users (id) select b.user_id from public.brands  b where b.user_id is not null and b.id in (select id from keep_brands)  on conflict do nothing;

  -- 상품: 남는 브랜드 것 전부 + 코드 지정
  insert into keep_products (id)
    select p.id from public.products p where p.brand_id in (select id from keep_brands) or p.code = any (v_codes)
  on conflict do nothing;
  -- 캠페인: 인플루언서 · 브랜드 · 상품이 전부 남을 때만
  insert into keep_campaigns (id)
    select c.id from public.campaigns c
     where c.seller_id in (select id from keep_sellers) and c.brand_id in (select id from keep_brands) and c.product_id in (select id from keep_products)
  on conflict do nothing;
  -- 고객: 지정 이메일 · 남는 계정
  insert into keep_customers (id)
    select c.id from public.customers c
     where lower(coalesce(c.email, '')) = any (v_emails) or (c.user_id is not null and c.user_id in (select id from keep_users))
  on conflict do nothing;
  -- 주문 · 세션: 남는 캠페인 + 남는(또는 없는) 고객/계정
  insert into keep_orders (id)
    select o.id from public.orders o
     where o.campaign_id in (select id from keep_campaigns)
       and (o.customer_id is null or o.customer_id in (select id from keep_customers))
       and (o.user_id is null or o.user_id in (select id from keep_users))
  on conflict do nothing;
  insert into keep_sessions (id, toss_order_id)
    select cs.id, cs.toss_order_id from public.checkout_sessions cs
     where cs.campaign_id in (select id from keep_campaigns)
       and (cs.customer_id is null or cs.customer_id in (select id from keep_customers))
       and (cs.user_id is null or cs.user_id in (select id from keep_users))
  on conflict do nothing;
  insert into keep_settlements (id) select st.id from public.settlements st where st.campaign_id in (select id from keep_campaigns) on conflict do nothing;
  insert into keep_payouts (id)
    select po.id from public.payouts po
     where po.settlement_id in (select id from keep_settlements)
       and (po.seller_id is null or po.seller_id in (select id from keep_sellers))
       and (po.brand_id is null or po.brand_id in (select id from keep_brands))
  on conflict do nothing;
  insert into keep_cs (id)
    select cv.id from public.cs_conversations cv
     where cv.brand_id in (select id from keep_brands)
       and (cv.campaign_id is null or cv.campaign_id in (select id from keep_campaigns))
       and (cv.order_id is null or cv.order_id in (select id from keep_orders))
       and (cv.customer_id is null or cv.customer_id in (select id from keep_customers))
       and (cv.user_id is null or cv.user_id in (select id from keep_users))
  on conflict do nothing;

  -- ---------- 삭제 대상 식별자 (스토리지 정리용 · 삭제 전에 모은다) ----------
  select jsonb_build_object(
           'seller_ids',  coalesce((select jsonb_agg(id) from public.sellers  where id not in (select id from keep_sellers)),  '[]'::jsonb),
           'brand_ids',   coalesce((select jsonb_agg(id) from public.brands   where id not in (select id from keep_brands)),   '[]'::jsonb),
           'product_ids', coalesce((select jsonb_agg(id) from public.products where id not in (select id from keep_products)), '[]'::jsonb))
    into v_purged;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email_masked',
           case when u.email is null then null
                else left(u.email, 2) || '***' || substring(u.email from '@.*$') end) order by u.created_at), '[]'::jsonb),
         coalesce(array_agg(u.id), '{}')
    into v_users, v_user_ids
    from auth.users u where u.id not in (select id from keep_users);

  -- ---------- 표별 count / delete (같은 조건식) ----------
  for v_i in 1 .. array_length(v_steps, 1) loop
    v_table := v_steps[v_i][1];
    v_where := v_steps[v_i][2];
    execute format('select count(*) from public.%I', v_table) into v_total;
    if v_do then
      execute format('delete from public.%I where %s', v_table, v_where);
      get diagnostics v_del = row_count;
    else
      execute format('select count(*) from public.%I where %s', v_table, v_where) into v_del;
    end if;
    v_counts := v_counts || jsonb_build_object('table', v_table, 'delete', v_del, 'keep', v_total - v_del);
  end loop;

  -- ---------- 시퀀스 ----------
  for v_i in 1 .. array_length(v_seqs, 1) loop
    select (c->>'keep')::bigint into v_remaining from jsonb_array_elements(v_counts) c where c->>'table' = v_seqs[v_i][2];
    v_empty := coalesce(v_remaining, 0) = 0;
    if p_reset_seq and v_do and v_empty then
      execute format('alter sequence public.%I restart with %s', v_seqs[v_i][1], v_seqs[v_i][3]);
    end if;
    v_seqout := v_seqout || jsonb_build_object('name', v_seqs[v_i][1], 'table', v_seqs[v_i][2], 'restart', v_seqs[v_i][3]::int,
                  'reset', (p_reset_seq and v_empty), 'skipped_reason', case when not p_reset_seq then 'flag_off' when not v_empty then 'rows_remain' else null end);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'dry_run', not v_do,
    'keep_emails', to_jsonb(v_emails),
    'keep_codes', to_jsonb(v_codes),
    'kept', jsonb_build_object(
      'users', (select count(*) from keep_users), 'sellers', (select count(*) from keep_sellers), 'brands', (select count(*) from keep_brands),
      'customers', (select count(*) from keep_customers), 'products', (select count(*) from keep_products), 'campaigns', (select count(*) from keep_campaigns)),
    'counts', v_counts,
    'auth_user_ids', to_jsonb(v_user_ids),
    'auth_users', v_users,
    'purged', v_purged,
    'sequences', v_seqout
  );
end;
$$;
revoke all on function public.admin_purge_demo_data(text, text[], text[], boolean) from public, anon, authenticated;
grant execute on function public.admin_purge_demo_data(text, text[], text[], boolean) to service_role;
comment on function public.admin_purge_demo_data(text, text[], text[], boolean) is
  '시드·데모·개발 데이터 일괄 삭제(0043 · launch-checklist §2). p_confirm=''PURGE'' 외에는 dry-run. platform_settings · grade_tiers · brand_grade_tiers · categories · 관리자 · p_keep_emails/p_keep_codes 에 걸린 행은 남긴다. auth.users 는 id 만 돌려준다(스크립트가 auth.admin.deleteUser). 호출: packages/db/scripts/purge-seed.mjs';
