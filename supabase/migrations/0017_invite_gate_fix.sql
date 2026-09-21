-- ============================================================
-- 0017 — 브랜드 직접 제안(초대) 등급 게이트 수정: 플래티넘은 무료, 다이아·블랙만 🥬 제안권 게이트
--        seller_invite_gated(seller_id) 헬퍼 추가 · app_brand_invite_candidates · app_brand_invite_seller 재정의
--
-- 근거: 0016 은 초대 게이트를 우선권 등급 전체(grade_tiers.is_priority = 플래티넘 이상)에 걸었다(docs/brand-console-plan.md §8 "3단계 초대 게이트 범위" 열린 결정).
--       정책의 정답은 packages/core/src/constants.ts `SHOP.brand.diamond`(다이아↑ 인플루언서 제안권 10🥬) · 프로토타입 actions.ts confirmInvite(다이아·블랙만 🥬 10 차감, 플래티넘은 무료)
--       · grade_tiers.invite_cost_cel(0001 헤더 "다이아·블랙 10" — 단일 소스, 플래티넘은 0). 게이트는 `invite_cost_cel > 0` 인 등급에만 건다 — is_priority(기간 우선권)와 초대 제안권은 별개 개념.
--       6단계(🥬 차감)에서는 같은 헬퍼가 참인 등급에 celery_spend 를 붙이면 된다(계획서 §6 행 6).
-- 실행: 0016 이후. 재실행 가능(create or replace 만 — 컬럼·테이블 추가 없음). 0001~0016 파일은 수정하지 않는다.
--       두 함수의 시그니처·반환 계약(0016 헤더의 코드 표)은 그대로 — 달라지는 것은 후보 조건 한 줄과 PRIORITY_INVITE_GATED 판정 조건 한 줄뿐이다.
--       순수 규칙 짝: packages/db/src/brand/invite-rules.ts INVITE_GATED_GRADES(다이아·블랙) · isInvitableGrade · INVITE_GATED_NOTICE.
-- ============================================================

-- 초대 제안권 게이트 대상인가 — 등급(캐시 → m3_sales 재계산) 의 grade_tiers.invite_cost_cel > 0 (시드: 다이아·블랙 10). 없는 인플루언서·등급 표 밖은 false.
create or replace function public.seller_invite_gated(p_seller_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce((
    select gt.invite_cost_cel > 0
      from public.sellers s
      left join public.grade_tiers gt on gt.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
     where s.id = p_seller_id), false)
$$;
revoke all on function public.seller_invite_gated(uuid) from public, anon, authenticated;
grant execute on function public.seller_invite_gated(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_candidates(p_brand_id, p_product_id) — 0016 과 동일. 조건 중 "우선권 등급 아님(seller_is_priority)" → "제안권 게이트 아님(seller_invite_gated)" 만 바뀐다.
--   조건: sellers.active · hidden=false(익명 스카우트는 6단계) · 다이아·블랙 아님(🥬 제안권은 6단계) · 메인 채널 verified
--         · 같은 상품 진행 중 캠페인 없음 · 독점 확정 상품이면 그 인플루언서만. 팔로워 내림차순 50명.
-- ------------------------------------------------------------
create or replace function public.app_brand_invite_candidates(p_brand_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p        public.products%rowtype;
  v_group  text;
  v_list   jsonb;
begin
  select * into p from public.products where id = p_product_id and brand_id = p_brand_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  select ct.group_name into v_group from public.categories ct where ct.name = p.category;

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'followers')::integer desc, row_json ->> 'name'), '[]'::jsonb) into v_list
    from (
      select jsonb_build_object(
               'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform, 'avatar_url', s.avatar_url,
               'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)), 'followers', s.followers,
               'category', s.category,
               'category_fit', (v_group is not null and exists (select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)),
               'primary_channel', (select jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url, 'followers', ch.followers, 'verified', ch.verified)
                                     from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary limit 1)) as row_json
        from public.sellers s
       where s.active and not s.hidden
         and not public.seller_invite_gated(s.id)
         and exists (select 1 from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary and ch.verified)
         and not exists (select 1 from public.campaigns c where c.seller_id = s.id and c.product_id = p.id
                                                          and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED'))
         and (p.exclusive_seller_id is null or p.exclusive_seller_id = s.id)
       order by s.followers desc, s.name
       limit 50) t;

  return jsonb_build_object('ok', true,
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'category', p.category, 'status', p.status, 'exclusive_seller_id', p.exclusive_seller_id),
    'candidates', v_list);
end;
$$;
revoke all on function public.app_brand_invite_candidates(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_invite_candidates(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_seller(p_brand_id, p_seller_id, p_product_id, p_message, p_actor_user_id) — 0016 과 동일. PRIORITY_INVITE_GATED 판정만 is_priority → invite_cost_cel > 0.
--   반환 계약은 0016 헤더 그대로 (PRIORITY_INVITE_GATED{grade, cost_cel} 는 이제 다이아·블랙에만).
-- ------------------------------------------------------------
create or replace function public.app_brand_invite_seller(p_brand_id uuid, p_seller_id uuid, p_product_id uuid, p_message text default null, p_actor_user_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  b          public.brands%rowtype;
  p          public.products%rowtype;
  s          public.sellers%rowtype;
  v_grade    text;
  v_cost     integer;
  v_msg      text;
  v_active   record;
  v_cid      uuid;
  v_code     text;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into p from public.products where id = p_product_id and brand_id = p_brand_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  select * into s from public.sellers where id = p_seller_id for update;
  if not found or not s.active then
    return jsonb_build_object('ok', false, 'code', 'SELLER_NOT_FOUND');
  end if;
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.invite_cost_cel into v_cost from public.grade_tiers gt where gt.name = v_grade;
  if coalesce(v_cost, 0) > 0 then
    return jsonb_build_object('ok', false, 'code', 'PRIORITY_INVITE_GATED', 'grade', v_grade, 'cost_cel', v_cost);
  end if;
  if s.hidden then
    return jsonb_build_object('ok', false, 'code', 'SELLER_HIDDEN');
  end if;
  if p.exclusive_seller_id is not null and p.exclusive_seller_id <> s.id then
    return jsonb_build_object('ok', false, 'code', 'EXCLUSIVE_LOCKED');
  end if;
  select c.code, c.status into v_active from public.campaigns c
   where c.seller_id = s.id and c.product_id = p.id and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED')
   order by c.created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE', 'campaign_code', v_active.code, 'campaign_status', v_active.status);
  end if;
  v_msg := nullif(btrim(regexp_replace(coalesce(p_message, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  if v_msg is not null and length(v_msg) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE', 'max', 500);
  end if;

  begin
    insert into public.campaigns (seller_id, product_id, status, invited, cel_used)
    values (s.id, p.id, 'INVITED', true, 0)
    returning id, code into v_cid, v_code;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE');
  end;

  -- 프로토타입 confirmInvite 의 pushSys 원문
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (v_cid, 'system', 'system', 'brand', p_actor_user_id,
          format('브랜드 %s가 %s 판매를 직접 제안했습니다 · 인플루언서 수락 대기', b.name, p.name),
          'invited',
          jsonb_strip_nulls(jsonb_build_object('brand_name', b.name, 'product_name', p.name, 'seller_grade', v_grade, 'message', v_msg)));
  if v_msg is not null then
    perform public.campaign_post_chat(v_cid, 'brand', p_actor_user_id, v_msg);
  end if;

  return jsonb_build_object('ok', true, 'campaign_id', v_cid, 'campaign_code', v_code, 'status', 'INVITED',
    'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'grade', v_grade));
end;
$$;
revoke all on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid) to service_role;
