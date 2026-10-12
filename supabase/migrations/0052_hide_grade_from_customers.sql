-- 0052 고객 화면 등급 숨김 (대표 결정 2026-10-12)
-- 고객(sellery.life)은 인플루언서·브랜드의 등급을 보지 않는다 — 등급은 파트너 콘솔(브랜드 → 인플루언서 등급 · 자기 등급)에서만.
--   1) anon/authenticated 의 sellers.grade · brands.grade 컬럼 select 권한 회수 (0001 의 컬럼 grant 에서 grade 만 뺀다).
--      콘솔·관리자는 service_role(RPC · admin 클라이언트)로 읽으므로 영향 없음. 고객 사이트의 anon 조인(campaign.server.ts)은 grade 를 더 이상 select 하지 않는다.
--   2) campaign_card(code) RPC(anon 호출) 응답에서 seller.grade · brand.grade 제거 — 0008 본문과 동일, grade 두 필드만 뺌.
revoke select (grade) on public.sellers from anon, authenticated;
revoke select (grade) on public.brands  from anon, authenticated;

create or replace function public.campaign_card(p_code text)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'code', c.code, 'status', c.status,
      'start_date', c.start_date, 'end_date', c.end_date,
      'qty',      case when c.status = 'SETTLED' then null else c.qty end,
      'sold_qty', case when c.status = 'SETTLED' then null else c.sold_qty end,
      'home_featured_at', c.home_featured_at,
      'today', (now() at time zone 'Asia/Seoul')::date),
    'product', jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'emoji', p.emoji,
      'thumb_url', p.thumb_url, 'image_urls', to_jsonb(p.image_urls), 'category', p.category,
      'consumer_price', p.consumer_price, 'sale_price', p.sale_price,
      'options', public.resolve_product_options(p.options, p.sale_price),
      'options_raw', p.options,
      'status', p.status),
    'seller', jsonb_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform,
      'avatar_url', s.avatar_url),
    'brand', jsonb_build_object(
      'id', b.id, 'code', b.code, 'name', b.name, 'logo_url', b.logo_url,
      'biz_no', b.biz_no, 'mail_order_no', b.mail_order_no),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url)
                       order by ch.is_primary desc, ch.created_at)
        from public.seller_channels ch
       where ch.seller_id = s.id and ch.verified
         and public.seller_is_public(s.id)), '[]'::jsonb),   -- 0001 seller_channels 정책과 같은 범위 (hidden 이면 빈 배열)
    'settings', jsonb_build_object(
      'clear_days',        coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'clear_days'), 21),
      'link_protect_days', coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'link_protect_days'), 7),
      'home_feature_days', coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'home_feature_days'), 7))
  )
  from public.campaigns c
  join public.products p on p.id = c.product_id
  join public.sellers  s on s.id = c.seller_id
  join public.brands   b on b.id = c.brand_id
  where c.code = p_code
    and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')
    and s.active and b.active
    and p.deleted_at is null
$$;
revoke all on function public.campaign_card(text) from public;
grant execute on function public.campaign_card(text) to anon, authenticated;
