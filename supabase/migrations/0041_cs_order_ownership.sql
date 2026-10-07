-- ============================================================
-- 0041 — 고객 문의(CS)의 주문 연결에 소유 검증 추가
--
-- 배경: `app_cs_open`(0018:592)이 고객이 적은 주문번호를 **같은 캠페인인지만** 보고 연결했다.
--
--     select id into v_oid from public.orders
--      where campaign_id = c.id and lower(code) = lower(v_ocode) limit 1;
--
--   주문번호는 순차 시퀀스다 — `code default ('o' || nextval('order_code_seq'))`(0004:68·72) —
--   그래서 `o2031`, `o2032` … 를 훑으면 남의 주문에 자기 문의를 붙일 수 있었다.
--   붙으면 `cs_conversation_json`(0018:496-498)이 그 주문의
--   **금액 · 수량 · 옵션 · 택배사 · 운송장 번호 · 발송일 · 결제일**을 문의 스레드로 돌려준다.
--   운송장 번호는 택배사 사이트에서 배송 상태·수령지 일부를 볼 수 있어 특히 민감하다.
--   접수에는 인증이 전혀 없다(비회원 접수를 허용하므로 세션·토큰 모두 요구하지 않는다 —
--   `apps/shop/src/routes/cs/new/+page.server.ts`). 방어는 IP 레이트리밋뿐이고 그마저 프로세스 메모리다.
--
--   브랜드 화면이 `order_matched` 를 **"매칭"** 칩으로 보여주기 때문에(브랜드 `/cs`) 운영자가
--   "구매자 본인 확인됨" 으로 읽는다 — 사칭이 증폭된다.
--
-- 고치는 방식
--   `order_code` 는 **원문 그대로 계속 보관한다**(0018 결정 — 브랜드가 자기 주문 표에서 직접 찾을 수 있다).
--   바뀌는 것은 `order_id` 를 **소유가 증명될 때만** 세운다는 것이다. 증명 수단 세 가지:
--     ① 회원      `orders.user_id = p_user_id`
--     ② 고객 행    `orders.customer_id = p_customer_id`
--     ③ 비회원     주문 조회 토큰 — `app_guest_order_verify(code, token)`(0021:154) 에 위임.
--                 sha256 해시 비교이고 HttpOnly 쿠키라 고객만 가진다. 토큰이 가리키는 주문이
--                 **이 캠페인의 주문이 아니면 연결하지 않는다**(다른 캠페인 주문의 토큰으로
--                 이 캠페인 문의에 주문을 붙이는 경로를 막는다).
--
--   ③ 은 로그인 상태에서도 시도한다 — 비회원으로 사고 나중에 가입한 고객이 흔하고,
--   그 주문의 `user_id` 는 null 이어서 ① 로는 증명되지 않는다.
--
--   증명되지 않으면 `order_matched: false` 다. 브랜드 화면은 이미 그 경우를 "(미확인)" 으로
--   구분해 보여주고 있었다 — 문구만 "이 캠페인 주문에서 못 찾음" → "본인 주문으로 확인 안 됨" 으로 고친다.
--
-- 시그니처가 바뀐다(인자 8개). `create or replace` 는 인자 목록을 바꿀 수 없어 **drop 후 재생성**이다 —
--   7 인자 버전을 남겨 두면 기존 호출이 소유 검증 없는 쪽으로 붙는 과부하(overload)가 생긴다.
-- ============================================================

-- 소유 검증 없는 7 인자 버전을 지운다 (남겨 두면 과부하 해석으로 우회된다)
drop function if exists public.app_cs_open(uuid, uuid, uuid, text, text, text, text);

-- ------------------------------------------------------------
-- app_cs_open(p_campaign_id, p_customer_id, p_user_id, p_buyer_name, p_type, p_body, p_order_code, p_guest_token)
--   0018 과 같다 — 다른 점은 `order_id` 를 소유가 증명될 때만 세우는 것뿐이다.
--   캠페인 LIVE · CLEARING · SETTLED 만 → 그 외 WRONG_STATUS{status} · 없는 id NOT_FOUND
--   p_type ∈ CS_TYPES → BAD_TYPE · p_body 1~2000자 → BAD_BODY{max} · p_buyer_name ≤ 40(비면 '고객')
--   p_order_code: 원문 보관(≤ 32자). 소유 증명 실패는 **실패가 아니다** — order_id 가 null 이고 order_matched=false.
--   반환: { ok:true, conversation_id, conversation_code, client_token, brand_id, brand_name, order_id, order_matched:bool }
--       | { ok:false, code:'NOT_FOUND' | 'WRONG_STATUS'(status) | 'BAD_TYPE' | 'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.app_cs_open(p_campaign_id uuid, p_customer_id uuid, p_user_id uuid, p_buyer_name text, p_type text, p_body text,
                                              p_order_code text default null, p_guest_token text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_body   text := public.cs_normalize_body(p_body);
  v_type   text := btrim(coalesce(p_type, ''));
  v_name   text := nullif(left(regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g'), 40), '');
  v_ocode  text := nullif(left(btrim(coalesce(p_order_code, '')), 32), '');
  v_token  text := nullif(btrim(coalesce(p_guest_token, '')), '');
  v_oid    uuid;
  v_brand  text;
  x        public.cs_conversations%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status not in ('LIVE', 'CLEARING', 'SETTLED') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  if v_type not in ('배송 문의', '교환·반품', '상품 문의', '기타') then
    return jsonb_build_object('ok', false, 'code', 'BAD_TYPE');
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000);
  end if;

  -- 주문 연결 — **소유가 증명될 때만**. 증명 실패는 실패가 아니고 order_id 가 null 로 남는다.
  if v_ocode is not null then
    -- ① 회원 본인 주문 · ② 같은 고객 행
    select o.id into v_oid
      from public.orders o
     where o.campaign_id = c.id
       and lower(o.code) = lower(v_ocode)
       and ((p_user_id is not null and o.user_id = p_user_id)
         or (p_customer_id is not null and o.customer_id = p_customer_id))
     limit 1;

    -- ③ 비회원 주문 조회 토큰(0021) — 회원이 비회원으로 산 주문을 문의하는 경우도 여기로 온다
    if v_oid is null and v_token is not null then
      v_oid := public.app_guest_order_verify(v_ocode, v_token);
      -- 토큰이 맞아도 **다른 캠페인의 주문**이면 연결하지 않는다
      if v_oid is not null and not exists (
        select 1 from public.orders o where o.id = v_oid and o.campaign_id = c.id
      ) then
        v_oid := null;
      end if;
    end if;
  end if;

  insert into public.cs_conversations (campaign_id, brand_id, order_code, order_id, customer_id, user_id, buyer_name, type, status, last_preview, last_message_at)
  values (c.id, c.brand_id, v_ocode, v_oid, p_customer_id, p_user_id, coalesce(v_name, '고객'), v_type, 'OPEN', left(v_body, 80), now())
  returning * into x;

  insert into public.cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, 'customer', 'customer', p_user_id, v_body);

  select name into v_brand from public.brands where id = c.brand_id;

  -- 프로토타입 submitCS 의 pushSys 원문(<b> 제거)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'system',
          format('구매 고객이 %s 문의를 남겼습니다 — %s 고객 문의함으로 전달되었습니다', v_type, coalesce(v_brand, '브랜드')),
          'cs_received',
          jsonb_strip_nulls(jsonb_build_object('conversation_id', x.id, 'conversation_code', x.code, 'type', v_type, 'order_code', v_ocode, 'order_matched', v_oid is not null)));

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'client_token', x.client_token,
                            'brand_id', c.brand_id, 'brand_name', v_brand, 'order_id', v_oid, 'order_matched', v_oid is not null);
end;
$$;
revoke all on function public.app_cs_open(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_cs_open(uuid, uuid, uuid, text, text, text, text, text) to service_role;

comment on function public.app_cs_open(uuid, uuid, uuid, text, text, text, text, text) is
  '고객 문의 접수 (0018 → 0041 소유 검증). order_code 는 원문 보관 · order_id 는 회원 본인/고객 행/비회원 조회 토큰(0021)으로 증명될 때만';
