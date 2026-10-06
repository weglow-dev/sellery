-- ============================================================
-- 0036 — 제안권 🥬 차감 · 환급 (우선권 등급 · 익명 인플루언서 초대 개방)
--
-- 배경: `app_brand_invite_seller`(0017)가 두 가지를 **거부**하고 있었다.
--   · `invite_cost_cel > 0`(다이아·블랙) → `PRIORITY_INVITE_GATED` — 0016:30 "6단계 게이트"
--   · `s.hidden`(익명 인플루언서)        → `SELLER_HIDDEN`        — 갤러리 열람(6단계) 뒤로 미뤘다
--   `campaigns.cel_used` · `cel_refunded` 칸은 0003 부터 있었고 늘 0 이었다.
--   유상 충전은 도입하지 않으므로(`points-policy.md` §0) **무상 🥬 로만 제안**한다.
--
-- 프로토타입 규칙 그대로 (actions.ts `confirmInvite` · `declineInvite` · `runAutoPropose`)
--   비용      인플루언서 등급별 `grade_tiers.invite_cost_cel` (다이아·블랙 10 · 나머지 0)
--   익명 초대  갤러리에서 **레퍼런스를 열람한 뒤**에만 가능 — 0035 `data_views(kind='ref')` 가 근거다
--             (프로토타입도 `unlockRef` → `openModal('invite')` 순서였다)
--   거절 환급  `cel_used > 0` 이면 전액 브랜드에 환급 · `cel_refunded` 기록 (멱등)
--   자동 제안  관리자 매칭이 브랜드 RPC 를 대행 호출하므로 같은 차감이 걸린다.
--             원장 사유만 `auto_invite` 로 구분한다(프로토타입과 같다).
--
-- 환급은 `celery_spend(p_paid_part)` 에 **원 차감의 유상 몫을 그대로 넘긴다**(0034) — 지금은 전부
--   무상(0)이지만 충전을 켜면 자동으로 맞는다.
--
-- 기존 함수를 **교체**한다(0017 의 `app_brand_invite_seller` · 0016 의 `app_decline_invite`).
-- ============================================================

-- ------------------------------------------------------------
-- brand_can_invite_hidden(brand, seller) — 익명 인플루언서를 초대할 수 있나
--   갤러리에서 레퍼런스를 열람했으면 true. 공개 인플루언서는 항상 true(이 함수를 보지 않는다).
-- ------------------------------------------------------------
create or replace function public.brand_can_invite_hidden(p_brand_id uuid, p_seller_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.data_views v
     where v.brand_id = p_brand_id and v.seller_id = p_seller_id and v.kind = 'ref');
$$;

revoke all on function public.brand_can_invite_hidden(uuid, uuid) from public, anon, authenticated;
grant execute on function public.brand_can_invite_hidden(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_seller — 0017 판 + 🥬 차감 · 익명 개방
--   p_reason 은 원장 사유를 바꾸는 용도('invite' 기본 · 관리자 자동 제안은 'auto_invite').
--   서명이 바뀌므로 0017 의 4인자 판은 아래에서 drop 한다.
-- ------------------------------------------------------------
create or replace function public.app_brand_invite_seller(
  p_brand_id uuid, p_seller_id uuid, p_product_id uuid,
  p_message text default null, p_actor_user_id uuid default null,
  p_reason text default 'invite')
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
  v_reason   text := case when p_reason = 'auto_invite' then 'auto_invite' else 'invite' end;
  v_bal      integer;
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
  v_cost := coalesce(v_cost, 0);

  -- 익명(hidden) 인플루언서는 레퍼런스를 열람한 브랜드만 제안할 수 있다 (0035 data_views kind='ref')
  if s.hidden and not public.brand_can_invite_hidden(p_brand_id, p_seller_id) then
    return jsonb_build_object('ok', false, 'code', 'REF_NOT_UNLOCKED', 'grade', v_grade,
      'price_cel', (select gt.data_price_cel from public.grade_tiers gt where gt.name = v_grade));
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

  -- 제안권 차감 — 우선권 등급(다이아·블랙)만. 캠페인을 만들기 **전에** 차감해 잔액 부족을 먼저 걸러낸다
  if v_cost > 0 then
    begin
      v_bal := public.celery_spend('brand', p_brand_id, -v_cost, v_reason,
        format('%s 인플루언서 %s · %s', v_grade,
               case when v_reason = 'auto_invite' then '자동 제안' else '제안' end, p.name),
        'product', p.id);
    exception
      when sqlstate 'P0001' then
        return jsonb_build_object('ok', false, 'code', 'CEL_INSUFFICIENT', 'grade', v_grade, 'cost_cel', v_cost);
    end;
  end if;

  begin
    insert into public.campaigns (seller_id, product_id, status, invited, cel_used)
    values (s.id, p.id, 'INVITED', true, v_cost)
    returning id, code into v_cid, v_code;
  exception when unique_violation then
    -- 차감했으면 되돌린다 (같은 유상 몫으로)
    if v_cost > 0 then
      perform public.celery_spend('brand', p_brand_id, v_cost, 'invite_refund',
        format('제안 생성 실패 환급 · %s', p.name), 'product', p.id, 0);
    end if;
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE');
  end;

  -- 프로토타입 confirmInvite 의 pushSys 원문 (+ 제안권 사용 표기)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (v_cid, 'system', 'system', 'brand', p_actor_user_id,
          format('브랜드 %s가 %s 판매를 직접 제안했습니다 · 인플루언서 수락 대기', b.name, p.name)
            || case when v_cost > 0 then format(' · 제안권 🥬 %s 사용', v_cost) else '' end,
          'invited',
          jsonb_strip_nulls(jsonb_build_object('brand_name', b.name, 'product_name', p.name, 'seller_grade', v_grade,
            'message', v_msg, 'cel_used', nullif(v_cost, 0), 'auto', (v_reason = 'auto_invite') or null)));
  if v_msg is not null then
    perform public.campaign_post_chat(v_cid, 'brand', p_actor_user_id, v_msg);
  end if;

  return jsonb_build_object('ok', true, 'campaign_id', v_cid, 'campaign_code', v_code, 'status', 'INVITED',
    'cel_used', v_cost, 'balance', v_bal,
    'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'grade', v_grade));
end;
$$;

revoke all on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid, text) to service_role;

-- 0017 의 5인자 판을 지운다 — 남겨두면 기본값 호출이 모호해진다
drop function if exists public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid);

-- ------------------------------------------------------------
-- app_decline_invite — 0016 판 + 제안권 환급
--   cel_used > 0 이면 전액 브랜드에 환급하고 cel_refunded 에 기록한다. 멱등(이미 환급했으면 다시 안 한다).
--   환급은 원 차감의 유상 몫(paid_part)을 그대로 되돌린다 — 0034 의 계약.
-- ------------------------------------------------------------
create or replace function public.app_decline_invite(p_seller_id uuid, p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  v_reason   text;
  v_brand    uuid;
  v_pname    text;
  v_refund   integer := 0;
  v_paid     integer := 0;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'DECLINED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'cel_refunded', coalesce(c.cel_refunded, 0));
  end if;
  if c.status <> 'INVITED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  v_reason := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');

  select p.brand_id, p.name into v_brand, v_pname from public.products p where p.id = c.product_id;

  -- 제안권 환급 — 쓴 적이 있고 아직 환급하지 않았을 때만
  if coalesce(c.cel_used, 0) > 0 and coalesce(c.cel_refunded, 0) = 0 and v_brand is not null then
    -- 원 차감 행의 유상 몫을 찾아 같은 비율로 되돌린다 (0034). 못 찾으면 무상(0)으로 본다
    select coalesce(-l.paid_part, 0) into v_paid
      from public.celery_ledger l
     where l.brand_id = v_brand and l.reason in ('invite', 'auto_invite')
       and l.ref_type = 'product' and l.ref_id = c.product_id and l.delta = -c.cel_used
     order by l.created_at desc limit 1;

    perform public.celery_spend('brand', v_brand, c.cel_used, 'invite_refund',
      format('제안 거절 환급 · %s', coalesce(v_pname, '상품')), 'campaign', c.id, coalesce(v_paid, 0));
    v_refund := c.cel_used;
  end if;

  update public.campaigns
     set status = 'DECLINED', decision_reason = v_reason,
         cel_refunded = coalesce(cel_refunded, 0) + v_refund
   where id = c.id;

  -- 프로토타입 declineInvite 의 pushSys 원문 (환급 문구 포함)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          '인플루언서가 제안을 거절했습니다' || coalesce(' · 사유: ' || v_reason, '')
            || case when v_refund > 0 then format(' · 제안권 🥬 %s 브랜드에 환급', v_refund) else '' end,
          'invite_declined',
          jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'cel_used', c.cel_used,
            'cel_refunded', nullif(v_refund, 0))));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'DECLINED',
    'cel_refunded', v_refund);
end;
$$;

revoke all on function public.app_decline_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_decline_invite(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_candidates — 0017 판에서 두 게이트를 뺀다
--   · `not seller_invite_gated(s.id)`  제거 → 다이아·블랙도 후보에 든다(🥬 가 든다는 표시와 함께)
--   · `not s.hidden`                   **열람한 익명은 포함** → 레퍼런스를 연 브랜드에게는 더 이상
--     익명이 아니다(이름을 안다). 열람하지 않은 익명만 제외하므로 "○○○" 이 후보에 섞이지 않고,
--     갤러리에서 열람 → 상품 초대 화면에서 제안하는 경로가 이어진다. (열람하지 않았는데 RPC 만
--     허용하면 화면에서 도달할 수 없는 분기가 된다.)
--   후보 행에 `invite_cost_cel`·`affordable` 을 담아 화면이 비용을 미리 보여줄 수 있게 한다.
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
  v_bal    integer;
begin
  select * into p from public.products where id = p_product_id and brand_id = p_brand_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  select ct.group_name into v_group from public.categories ct where ct.name = p.category;
  select s.total into v_bal from public.celery_balance_split('brand', p_brand_id) s;

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'followers')::integer desc, row_json ->> 'name'), '[]'::jsonb) into v_list
    from (
      select jsonb_build_object(
               'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform, 'avatar_url', s.avatar_url,
               'grade', g.name, 'followers', s.followers,
               'category', s.category,
               'category_fit', (v_group is not null and exists (select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)),
               -- 제안권 비용(0036) — 0 이면 무료. 잔액이 모자라면 화면이 버튼을 막는다
               -- 열람해서 보이는 비공개 인플루언서임을 표시한다 (화면 배지)
               'hidden', s.hidden,
               'cost_cel', g.invite_cost_cel,
               'affordable', (g.invite_cost_cel = 0 or coalesce(v_bal, 0) >= g.invite_cost_cel),
               'primary_channel', (select jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url, 'followers', ch.followers)
                                     from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary limit 1)) as row_json
        from public.sellers s
        join public.grade_tiers g on g.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
       where s.active
         -- 비공개는 레퍼런스를 열람한 브랜드에게만 보인다 (0035 data_views kind='ref')
         and (not s.hidden or public.brand_can_invite_hidden(p_brand_id, s.id))
         and exists (select 1 from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary and ch.verified)
         and not exists (select 1 from public.campaigns c where c.seller_id = s.id and c.product_id = p.id
                                                          and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED'))
         and (p.exclusive_seller_id is null or p.exclusive_seller_id = s.id)
       order by s.followers desc, s.name
       limit 50) t;

  return jsonb_build_object('ok', true,
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'category', p.category, 'status', p.status, 'exclusive_seller_id', p.exclusive_seller_id),
    'balance', coalesce(v_bal, 0),
    'candidates', v_list);
end;
$$;

revoke all on function public.app_brand_invite_candidates(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_invite_candidates(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- `seller_invite_gated`(0017) 는 더 이상 쓰이지 않는다. 지우지 않고 남겨둔다 —
-- "이 등급은 제안권이 든다" 를 묻는 다른 코드(관리자 매칭 화면의 표시)가 참조할 수 있다.
-- ------------------------------------------------------------
