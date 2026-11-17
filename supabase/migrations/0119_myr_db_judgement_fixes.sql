-- ============================================================
-- 0119 · MYR DB 판정 정리(결과가 달라질 수 있는 곳) — 공구 미리보기 기본가 · 문의 주문 주인 · 초대 상태 · 환불 사진 한도 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 6 · DB 안의 판정 중복):
--     공구 미리보기 기본가      coalesce(myr_product_unit_price(p, 0), p.price) 4곳 — 결제 단가(myr_line_price)는 대체값이 없다
--                              → myr_product_unit_price(p, 0) 그대로(값이 없으면 미리보기 NO_PRICE · 공구가 null — 결제가 BAD_OPTION 인 상품)
--     문의 주문 연결 주인      (user_id = 회원) or (customer_id = 고객) — 회원 주문도 customer_id 로 통과(원칙 6)
--                              → myr_order_owned_by(회원 주문은 회원 id · 비회원 주문은 고객 id) — 샵은 지금 customer_id 를 넘기지 않아 실제 동작은 같다
--     초대 상태                운영 목록이 상태 · 필터를 다시 썼다 → myr_invite_list_state(myr_invite_state 를 목록 이름으로) ·
--                              재발급 · 취소의 "아직 살아 있는 초대"(사용 · 취소 전 · 만료 포함) → myr_invite_outstanding · 요청은 myr_invite_state
--     환불 사진 한도 3장        요청 접수는 거절 · 바로 환불(myr_refund_lines)은 3장까지 잘라냈다 → myr_refund_photos_too_many 하나로 둘 다 거절(BAD_PHOTOS)
--   달라지는 것: 옵션 0번 가격이 잘못된 상품의 공구 미리보기 · 공구가가 비어 보인다(결제도 안 된다) · 회원 주문을 고객 id 로 문의 연결하면 연결하지 않는다 ·
--     바로 환불에 사진이 4장 이상이면 BAD_ITEMS(BAD_PHOTOS) — 샵 화면은 이미 3장까지만 보내서 고객이 겪는 변화는 없다
--   테스트: supabase/tests/myr_db_judgement_fixes.test.sql · 기존 공구 · 문의 · 초대 · 환불 · 요청 테스트
-- ============================================================

-- 환불 사진이 한도(3장)를 넘는지 — 바로 환불 · 교환·환불 요청이 같이 쓴다
create or replace function public.myr_refund_photos_too_many(p_photos text[])
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(p_photos), 0) > 3
$$;
revoke all on function public.myr_refund_photos_too_many(text[]) from public, anon, authenticated;

-- 운영 초대 목록 상태(pending · used · revoked · expired) — myr_invite_state 를 목록 이름으로
create or replace function public.myr_invite_list_state(i public.myr_invites)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(lower(public.myr_invite_state(i)), 'pending')
$$;
revoke all on function public.myr_invite_list_state(public.myr_invites) from public, anon, authenticated;

-- 아직 살아 있는 초대(사용 · 취소 전 · 만료돼도 포함) — 같은 이메일 재발급 · 취소가 거둘 초대
create or replace function public.myr_invite_outstanding(i public.myr_invites)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(public.myr_invite_state(i), 'PENDING') in ('PENDING', 'EXPIRED')
$$;
revoke all on function public.myr_invite_outstanding(public.myr_invites) from public, anon, authenticated;

-- 0099 정의 → 기본가 myr_product_unit_price(p, 0) · 없으면 NO_PRICE
create or replace function public.myr_app_groupbuy_preview(p_seller uuid, p_product_id uuid, p_pct integer)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select case
    when p.id is null then jsonb_build_object('ok', false, 'code', 'NOT_FOUND')
    when not public.myr_groupbuy_pct_ok(p_pct) then jsonb_build_object('ok', false, 'code', 'BAD_PCT', 'min', public.myr_groupbuy_pct_min(), 'max', public.myr_groupbuy_pct_max())
    -- 0119: 결제할 수 없는 기본가(옵션 0번 가격이 잘못됨)면 미리보기도 없다 — 결제(myr_line_price · BAD_OPTION)와 같은 값
    when public.myr_product_unit_price(p, 0) is null then jsonb_build_object('ok', false, 'code', 'NO_PRICE')
    else jsonb_build_object('ok', true,
                            'base_price', public.myr_product_unit_price(p, 0),
                            'price', public.myr_groupbuy_price(public.myr_product_unit_price(p, 0), p_pct))
  end
  from (select 1) one
  left join public.myr_products p on p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null
$$;
revoke all on function public.myr_app_groupbuy_preview(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_groupbuy_preview(uuid, uuid, integer) to service_role;

-- 0099 정의 → 기본가 myr_product_unit_price(p, 0)
create or replace function public.myr_app_seller_groupbuys(p_seller uuid, p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
           'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'price', public.myr_product_unit_price(p, 0), 'status', p.status, 'listed', public.myr_product_listed(p),
                                         'sold_out', public.myr_product_sold_out(p), 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
           'pct_min', public.myr_groupbuy_pct_min(), 'pct_max', public.myr_groupbuy_pct_max(),
           'items', coalesce((select jsonb_agg(public.myr_groupbuy_seller_json(g, p) order by g.created_at desc)
                                from public.myr_groupbuys g where g.product_id = p.id), '[]'::jsonb))
    from public.myr_products p
   where p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null and p_seller is not null
$$;
revoke all on function public.myr_app_seller_groupbuys(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuys(uuid, uuid) to service_role;

-- 0086 정의 → 기본가 myr_product_unit_price(p, 0)
create or replace function public.myr_groupbuy_product_json(g public.myr_groupbuys, p public.myr_products)
returns jsonb
language sql
stable
as $$
  select public.myr_groupbuy_json(g, public.myr_product_unit_price(p, 0))
      || jsonb_build_object('options', coalesce((
           select jsonb_agg(jsonb_build_object('index', o.i - 1, 'name', coalesce(o.v ->> 'n', ''),
                                               'price', public.myr_product_unit_price(p, (o.i - 1)::integer),
                                               'groupbuy_price', public.myr_groupbuy_price(public.myr_product_unit_price(p, (o.i - 1)::integer), g.discount_pct))
                            order by o.i)
             from jsonb_array_elements(case when jsonb_typeof(p.options) = 'array' then p.options else '[]'::jsonb end) with ordinality as o(v, i)
            where public.myr_product_unit_price(p, (o.i - 1)::integer) is not null), '[]'::jsonb))
$$;
revoke all on function public.myr_groupbuy_product_json(public.myr_groupbuys, public.myr_products) from public, anon, authenticated;

-- 0063 정의 → 주문 주인 myr_order_owned_by
create or replace function public.myr_app_cs_open(p_product_id uuid, p_customer_id uuid, p_user_id uuid, p_buyer_name text, p_type text, p_body text,
                                                  p_order_code text default null, p_guest_token text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  v_body   text := public.myr_cs_normalize_body(p_body);
  v_type   text := btrim(coalesce(p_type, ''));
  v_name   text := nullif(left(regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g'), 40), '');
  v_ocode  text := nullif(left(btrim(coalesce(p_order_code, '')), 32), '');
  v_token  text := nullif(btrim(coalesce(p_guest_token, '')), '');
  v_oid    uuid;
  v_iid    uuid;
  v_seller text;
  x        public.myr_cs_conversations%rowtype;
begin
  select * into p from public.myr_products where id = p_product_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_type not in ('배송 문의', '교환·반품', '상품 문의', '기타') then return jsonb_build_object('ok', false, 'code', 'BAD_TYPE'); end if;
  if v_body = '' or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000); end if;

  if v_ocode is not null then
    select o.id into v_oid from public.myr_orders o
     where lower(o.code) = lower(v_ocode)
       and ((p_user_id is not null and public.myr_order_owned_by(o, p_user_id)) or (p_customer_id is not null and public.myr_order_owned_by(o, p_customer_id)))
     limit 1;
    if v_oid is null and v_token is not null then
      v_oid := public.myr_app_guest_order_verify(v_ocode, v_token);
    end if;
    if v_oid is not null then
      select i.id into v_iid from public.myr_order_items i where i.order_id = v_oid and i.product_id = p.id order by i.created_at limit 1;
      if v_iid is null then v_oid := null; end if;   -- 이 상품의 줄이 없는 주문은 이 셀러와 무관 — 연결하지 않는다
    end if;
  end if;

  insert into public.myr_cs_conversations (product_id, seller_id, order_code, order_id, order_item_id, customer_id, user_id, buyer_name, type, status, last_preview, last_message_at)
  values (p.id, p.seller_id, v_ocode, v_oid, v_iid, p_customer_id, p_user_id, coalesce(v_name, '고객'), v_type, 'OPEN', left(v_body, 80), now())
  returning * into x;
  insert into public.myr_cs_messages (conversation_id, sender, actor_role, actor_user_id, body) values (x.id, 'customer', 'customer', p_user_id, v_body);
  select name into v_seller from public.sellers where id = p.seller_id;

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'client_token', x.client_token,
                            'seller_id', p.seller_id, 'seller_name', v_seller, 'order_id', v_oid, 'order_item_id', v_iid, 'order_matched', v_oid is not null);
end;
$$;
revoke all on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) to service_role;

-- 0070 정의 → 상태 · 필터 myr_invite_list_state
create or replace function public.myr_app_admin_invite_list(p_state text default null, p_limit integer default 100)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(t.r order by (t.r ->> 'created_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', i.id, 'email', i.email, 'invited_by', i.invited_by, 'created_at', i.created_at, 'expires_at', i.expires_at,
               'used_at', i.used_at, 'revoked_at', i.revoked_at, 'revoked_reason', i.revoked_reason,
               'requested_at', i.requested_at, 'request_count', i.request_count,
               'state', public.myr_invite_list_state(i),
               'seller', case when s.id is null then null else jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) end
             ) as r
        from public.myr_invites i
        left join public.sellers s on s.id = i.seller_id
       where case coalesce(p_state, '')
               when '' then true
               when 'pending' then public.myr_invite_list_state(i) = 'pending'
               when 'used' then public.myr_invite_list_state(i) = 'used'
               when 'expired' then public.myr_invite_list_state(i) = 'expired'
               when 'revoked' then public.myr_invite_list_state(i) = 'revoked'
               -- 새 초대 요청 — 요청 뒤에 다시 초대한 적이 없는 것(같은 이메일의 더 새 초대가 없음)
               when 'requested' then i.requested_at is not null and public.myr_invite_list_state(i) <> 'used'
                                 and not exists (select 1 from public.myr_invites n where n.email = i.email and n.created_at > i.created_at)
               else false
             end
       order by i.created_at desc
       limit greatest(coalesce(p_limit, 100), 1)
    ) t
$$;
revoke all on function public.myr_app_admin_invite_list(text, integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_list(text, integer) to service_role;

-- 0070 정의 → 살아 있는 초대 myr_invite_outstanding
create or replace function public.myr_app_admin_invite_create(p_email text, p_invited_by text default null, p_days integer default 30)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_token    text := encode(extensions.gen_random_bytes(32), 'hex');
  v_reissued boolean;
  i          public.myr_invites%rowtype;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL');
  end if;
  -- 이미 크리에이터(시드 · 연결된 계정 포함) — 초대가 아니라 myr-creators.mjs account 로 잇는다
  if exists (select 1 from public.sellers s where lower(s.email) = v_email)
     or exists (select 1 from public.sellers s join auth.users u on u.id = s.user_id where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CREATOR');
  end if;
  -- 같은 이메일의 로그인 계정이 이미 있다(샵 고객 · 셀러리 계정 등) — 가입이 새 계정을 만들 수 없다
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_HAS_ACCOUNT');
  end if;

  update public.myr_invites
     set revoked_at = now(), revoked_reason = 'reissued'
   where email = v_email and public.myr_invite_outstanding(myr_invites);
  v_reissued := found;

  insert into public.myr_invites (email, token_hash, invited_by, expires_at)
  values (v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), nullif(btrim(coalesce(p_invited_by, '')), ''),
          now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)))
  returning * into i;

  return jsonb_build_object('ok', true, 'invite_id', i.id, 'token', v_token, 'email', i.email, 'expires_at', i.expires_at, 'reissued', v_reissued);
end;
$$;
revoke all on function public.myr_app_admin_invite_create(text, text, integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_create(text, text, integer) to service_role;

-- 0070 정의 → 살아 있는 초대 myr_invite_outstanding
create or replace function public.myr_app_admin_invite_revoke(p_email text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  n       integer;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL'); end if;
  update public.myr_invites
     set revoked_at = now(), revoked_reason = 'canceled'
   where email = v_email and public.myr_invite_outstanding(myr_invites);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'revoked', n);
end;
$$;
revoke all on function public.myr_app_admin_invite_revoke(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_revoke(text) to service_role;

-- 0070 정의 → 사용됨 myr_invite_state
create or replace function public.myr_app_invite_request(p_token text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  i public.myr_invites%rowtype;
begin
  select * into i from public.myr_invites where token_hash = public.myr_invite_token_hash(p_token) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_invite_state(i) = 'USED' then return jsonb_build_object('ok', false, 'code', 'USED'); end if;
  update public.myr_invites set requested_at = now(), request_count = request_count + 1 where id = i.id;
  return jsonb_build_object('ok', true, 'email', i.email);
end;
$$;
revoke all on function public.myr_app_invite_request(text) from public, anon, authenticated;
grant execute on function public.myr_app_invite_request(text) to service_role;

-- 0099 정의 → 사진 한도 거절 myr_refund_photos_too_many
create or replace function public.myr_refund_lines(o public.myr_orders, p_items jsonb)
returns table (item_id uuid, qty integer, unit_price integer, seller_id uuid, remaining integer, item_status text, problem text, note text, photos text[])
language plpgsql
stable
security definer set search_path = public
as $$
declare
  l jsonb;
  v_id uuid;
  v_qty integer;
  v_note text;
  v_photos jsonb;
  v_req jsonb := '{}'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    -- 전체: 남은 수량이 있는 줄 전부(상세·사진 없음)
    return query
      select i.id, public.myr_line_left(i), i.unit_price, i.seller_id, public.myr_line_left(i), i.status, null::text, null::text, '{}'::text[]
        from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i);
    return;
  end if;
  for l in select * from jsonb_array_elements(p_items) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or public.myr_qty_parse(l ->> 'qty') < 0 then   -- 숫자 형식만(수량 상한 없음 · 남은 수량은 TOO_MANY)
      return query select null::uuid, 0, 0, null::uuid, 0, null::text, 'BAD_FORMAT'::text, null::text, '{}'::text[];
      return;
    end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int + coalesce((v_req -> v_id::text ->> 'q')::int, 0);
    -- 같은 줄이 두 번 오면 수량은 합치고 상세·사진은 마지막 비지 않은 것
    v_note := coalesce(nullif(btrim(left(l ->> 'note', 300)), ''), v_req -> v_id::text ->> 'n');
    v_photos := case when jsonb_typeof(l -> 'photos') = 'array' and jsonb_array_length(l -> 'photos') > 0
                     then (select jsonb_agg(x) from jsonb_array_elements_text(l -> 'photos') x where x <> '')
                     else v_req -> v_id::text -> 'p' end;
    v_req := v_req || jsonb_build_object(v_id::text, jsonb_build_object('q', v_qty, 'n', v_note, 'p', v_photos));
  end loop;
  return query
    select k.id, k.q, i.unit_price, i.seller_id, public.myr_line_left(i), i.status,
           case when i.id is null then 'NOT_IN_ORDER'
                when not public.myr_line_valid(i) then 'CANCELED'
                when k.q < 1 then 'BAD_QTY'
                when k.q > public.myr_line_left(i) then 'TOO_MANY'
                -- 0119: 사진이 한도를 넘으면 거절(요청 접수 myr_app_claim_open 과 같은 함수 · 전에는 3장까지 잘라냈다)
                when public.myr_refund_photos_too_many(k.p) then 'BAD_PHOTOS'
                else null end,
           k.n, k.p
      from (select (key)::uuid as id, (value ->> 'q')::int as q, value ->> 'n' as n,
                   coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(value -> 'p') = 'array' then value -> 'p' else '[]'::jsonb end) x), '{}'::text[]) as p
              from jsonb_each(v_req)) k
      left join public.myr_order_items i on i.id = k.id and i.order_id = o.id;
end;
$$;
revoke all on function public.myr_refund_lines(public.myr_orders, jsonb) from public, anon, authenticated;

-- 0100 정의 → 사진 한도 myr_refund_photos_too_many
create or replace function public.myr_app_claim_open(p_order_id uuid, p_actor_id uuid, p_kind text, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  i          public.myr_order_items%rowtype;
  l          jsonb;
  v_id       uuid;
  v_qty      integer;
  v_note     text;
  v_photos   text[];
  v_problems jsonb := '[]'::jsonb;
  v_seen     uuid[] := '{}';
  v_out      jsonb := '[]'::jsonb;
  v_code     text;
  v_batch    uuid := gen_random_uuid();
begin
  if p_kind is null or p_kind not in ('refund','exchange') then return jsonb_build_object('ok', false, 'code', 'BAD_KIND'); end if;
  if p_reason is null or not (p_reason = any (public.myr_claim_reasons())) then return jsonb_build_object('ok', false, 'code', 'BAD_REASON'); end if;
  if not public.myr_claim_kind_allowed(p_kind, p_reason) then return jsonb_build_object('ok', false, 'code', 'EXCHANGE_NOT_ALLOWED'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found or not public.myr_order_owned_by(o, p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING'); end if;
  if jsonb_array_length(p_lines) > 20 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;

  -- 1) 검사(하나라도 걸리면 아무것도 만들지 않는다)
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or public.myr_qty_parse(l ->> 'qty') < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;   -- 숫자 형식만(수량 상한 없음 · 남은 수량은 아래 TOO_MANY)
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int;
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    select * into i from public.myr_order_items where id = v_id and order_id = o.id;
    if not found or v_id = any (v_seen) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_IN_ORDER');
    elsif not public.myr_line_valid(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > public.myr_line_left(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif public.myr_line_open_claim(i) is not null then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif public.myr_claim_reason_change_mind(p_reason) and not public.myr_line_change_mind_ok(i) then
      -- 단순 변심은 수령 후 7일(날짜 기준)까지 — 기한 판정은 myr_line_change_mind_until 한 곳(샵 화면도 같은 값 · 0093)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CHANGE_MIND_EXPIRED', 'until', public.myr_line_change_mind_until(i));
    elsif public.myr_refund_photos_too_many(v_photos) or exists (select 1 from unnest(v_photos) p where p !~ ('^' || o.id::text || '/' || v_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_PHOTOS');
    elsif public.myr_claim_photo_required(p_reason) and cardinality(v_photos) = 0 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'PHOTO_REQUIRED');
    end if;
    v_seen := v_seen || v_id;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;

  -- 2) 만들기
  for l in select * from jsonb_array_elements(p_lines) loop
    v_id := (l ->> 'item_id')::uuid;
    v_note := nullif(btrim(left(l ->> 'note', 300)), '');
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    insert into public.myr_refund_requests (batch, order_id, order_item_id, seller_id, product_id, kind, qty, reason, note, photos)
    select v_batch, o.id, i2.id, i2.seller_id, i2.product_id, p_kind, (l ->> 'qty')::int, p_reason, v_note, v_photos
      from public.myr_order_items i2 where i2.id = v_id
    returning code into v_code;
    v_out := v_out || jsonb_build_object('code', v_code, 'item_id', v_id);
  end loop;
  return jsonb_build_object('ok', true, 'order_code', o.code, 'requests', v_out);
end;
$$;
revoke all on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) to service_role;
