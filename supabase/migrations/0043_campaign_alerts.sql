-- ============================================================
-- 0043 — 오픈 알림 신청 (campaign_alerts) · 이메일 발송
--
-- 배경: 판매 페이지와 홈 카드에 "🔔 오픈 알림 받기" 버튼이 있었지만 신청을 저장하는 테이블도
--   발송 경로도 없이 토스트만 띄웠다 — 고객에게 "신청 완료" 라고 말하고 DB 에는 한 줄도 남지 않았다.
--   2026-10-08 에 그 버튼을 제거했고(허위 안내), 이 파일이 **실제 구현**이다.
--   채널은 이메일(Resend) — 운영 결정 2026-09-22 · docs/launch-checklist.md §5 결정 3.
--   카카오 알림톡은 발신 프로필·템플릿 심사·대행사 계약이 필요해 보류 상태다.
--
-- 범위 결정 (운영 2026-10-08)
--   · **이메일이 등록된 회원만** 신청할 수 있다. 비회원은 받지 않는다 —
--     이메일을 새로 수집하지 않으므로 개인정보 **수집 항목이 늘지 않는다**(방침 개정 불필요).
--     회원이 이미 제공한 주소를 쓰고, 신청 행위 자체가 그 목적에 대한 명시적 동의다.
--   · 수신거부는 **토큰 1클릭**(메일 하단 링크) + 판매 페이지에서 신청 취소 둘 다 된다.
--
-- 설계 요점
--   · 신청은 `(campaign_id, user_id)` 유니크 — 두 번 눌러도 1행. 취소는 삭제가 아니라
--     `unsubscribed_at` 기록이다(같은 사람이 취소했는지 신청한 적 없는지 구분해야 재신청 UI 가 맞는다).
--   · 이메일은 **신청 시점 스냅샷을 저장하지 않는다.** 발송 시점에 회원 계정에서 다시 읽는다
--     (주소를 바꾸면 바뀐 곳으로 가고, 탈퇴하면 `user_id` FK 가 cascade 로 지워져 발송 대상에서 빠진다).
--   · 대상 캠페인은 `SCHEDULE_CONFIRMED` 일 때만 신청을 받는다 — 이미 LIVE 면 알릴 것이 없고(바로 구매),
--     종료된 건은 의미가 없다.
--   · 발송 기록 `sent_at` 으로 멱등 — 크론이 여러 번 돌아도 한 통. 메일 쪽 멱등키(Resend)와 이중 방어.
--   · **발송 시각은 틱과 분리한다.** 캠페인은 KST 자정에 LIVE 가 되는데(크론 `5 * * * *` → KST 00:05)
--     그 시각에 메일을 보내면 새벽 0시에 도착한다. 발송 대상 조회 함수가 "오늘 LIVE 가 된 캠페인" 을
--     돌려주고, 앱이 **아침 발송 창**에서만 실제로 보낸다(라우트가 KST 시(hour)를 본다).
--
-- 함수
--   app_campaign_alert_subscribe(campaign, user)   신청  → {ok, already, campaign_code}
--   app_campaign_alert_unsubscribe(token)          수신거부(1클릭) → {ok, campaign_code}
--   app_campaign_alert_cancel(campaign, user)      판매 페이지에서 신청 취소
--   app_campaign_alert_state(campaign, user)       버튼 상태용 — {subscribed}
--   app_campaign_alerts_due(limit)                 발송 대상(오늘 LIVE · 미발송 · 미수신거부 · 이메일 있는 회원)
--   app_campaign_alert_sent(ids)                   발송 완료 기록
--   0007 패턴 — 전부 security definer · service_role 만 execute. 게이트는 라우트가 한다.
-- ============================================================

-- ------------------------------------------------------------
-- campaign_alerts — 캠페인 오픈 알림 신청
-- ------------------------------------------------------------
create table if not exists public.campaign_alerts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  -- 회원 전용 — 탈퇴하면 신청도 사라진다(이메일을 따로 보관하지 않는 이유)
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- 1클릭 수신거부 토큰 — 메일 링크에 담긴다. 추측 불가(gen_random_uuid)
  unsub_token     uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists campaign_alerts_pair_uidx
  on public.campaign_alerts (campaign_id, user_id);
create unique index if not exists campaign_alerts_token_uidx
  on public.campaign_alerts (unsub_token);
-- 발송 대상 조회 — 미발송·미수신거부만
create index if not exists campaign_alerts_pending_idx
  on public.campaign_alerts (campaign_id)
  where sent_at is null and unsubscribed_at is null;

drop trigger if exists campaign_alerts_updated_at on public.campaign_alerts;
create trigger campaign_alerts_updated_at
  before update on public.campaign_alerts
  for each row execute function public.set_updated_at();

alter table public.campaign_alerts enable row level security;
revoke all on public.campaign_alerts from anon, authenticated;
-- 정책 없음 — 전부 service_role(아래 함수)로만 접근한다. 신청 여부는 app_campaign_alert_state 가 돌려준다.

comment on table public.campaign_alerts is
  '캠페인 오픈 알림 신청 (0043) — 이메일이 등록된 회원만. 이메일은 저장하지 않고 발송 시점에 계정에서 읽는다';

-- ------------------------------------------------------------
-- app_campaign_alert_subscribe(p_campaign_id, p_user_id) — 신청
--   SCHEDULE_CONFIRMED 만(이미 LIVE 면 알릴 것이 없다) · 이메일 없는 계정은 NO_EMAIL
--   이미 신청했으면 already · 취소한 적 있으면 되살린다(unsubscribed_at 비움)
--   반환: { ok:true, already, campaign_code } | { ok:false, code:'NOT_FOUND'|'WRONG_STATUS'(status)|'NO_EMAIL' }
-- ------------------------------------------------------------
create or replace function public.app_campaign_alert_subscribe(p_campaign_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c       public.campaigns%rowtype;
  v_mail  text;
  x       public.campaign_alerts%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status <> 'SCHEDULE_CONFIRMED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  -- 회원 전용 · 이메일이 있어야 보낼 수 있다(카카오는 이메일을 안 줄 수 있다)
  select u.email into v_mail from auth.users u where u.id = p_user_id;
  if v_mail is null or btrim(v_mail) = '' then
    return jsonb_build_object('ok', false, 'code', 'NO_EMAIL');
  end if;

  select * into x from public.campaign_alerts
   where campaign_id = c.id and user_id = p_user_id;

  if found then
    -- 취소했던 사람이 다시 신청 — 되살린다. 이미 살아 있으면 already
    if x.unsubscribed_at is null then
      return jsonb_build_object('ok', true, 'already', true, 'campaign_code', c.code);
    end if;
    update public.campaign_alerts set unsubscribed_at = null where id = x.id;
    return jsonb_build_object('ok', true, 'already', false, 'campaign_code', c.code);
  end if;

  insert into public.campaign_alerts (campaign_id, user_id)
  values (c.id, p_user_id)
  on conflict (campaign_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'already', false, 'campaign_code', c.code);
end;
$$;
revoke all on function public.app_campaign_alert_subscribe(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_campaign_alert_subscribe(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_campaign_alert_cancel(p_campaign_id, p_user_id) — 판매 페이지에서 신청 취소
--   삭제하지 않고 unsubscribed_at 을 적는다(재신청 UI 가 "다시 신청" 을 보여줄 수 있어야 한다)
--   반환: { ok:true, already } | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_campaign_alert_cancel(p_campaign_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x public.campaign_alerts%rowtype;
begin
  select * into x from public.campaign_alerts
   where campaign_id = p_campaign_id and user_id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if x.unsubscribed_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  update public.campaign_alerts set unsubscribed_at = now() where id = x.id;
  return jsonb_build_object('ok', true, 'already', false);
end;
$$;
revoke all on function public.app_campaign_alert_cancel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_campaign_alert_cancel(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_campaign_alert_unsubscribe(p_token) — 메일 하단 1클릭 수신거부
--   토큰만으로 동작한다(로그인 없이 — 메일을 받은 사람이 곧 본인). 추측 불가 uuid.
--   반환: { ok:true, already, campaign_code } | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_campaign_alert_unsubscribe(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x       public.campaign_alerts%rowtype;
  v_code  text;
begin
  if p_token is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into x from public.campaign_alerts where unsub_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select code into v_code from public.campaigns where id = x.campaign_id;
  if x.unsubscribed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_code', v_code);
  end if;
  update public.campaign_alerts set unsubscribed_at = now() where id = x.id;
  return jsonb_build_object('ok', true, 'already', false, 'campaign_code', v_code);
end;
$$;
revoke all on function public.app_campaign_alert_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.app_campaign_alert_unsubscribe(uuid) to service_role;

-- ------------------------------------------------------------
-- app_campaign_alert_state(p_campaign_id, p_user_id) — 버튼 상태
--   반환: { subscribed:bool, can_subscribe:bool, has_email:bool }
--   can_subscribe = 캠페인이 SCHEDULE_CONFIRMED 이고 이메일이 있을 때
-- ------------------------------------------------------------
create or replace function public.app_campaign_alert_state(p_campaign_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_status text;
  v_mail   text;
  v_sub    boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object('subscribed', false, 'can_subscribe', false, 'has_email', false);
  end if;
  select status into v_status from public.campaigns where id = p_campaign_id;
  select u.email into v_mail from auth.users u where u.id = p_user_id;
  select exists (
    select 1 from public.campaign_alerts
     where campaign_id = p_campaign_id and user_id = p_user_id and unsubscribed_at is null
  ) into v_sub;
  return jsonb_build_object(
    'subscribed', v_sub,
    'has_email', v_mail is not null and btrim(v_mail) <> '',
    'can_subscribe', v_status = 'SCHEDULE_CONFIRMED' and v_mail is not null and btrim(v_mail) <> ''
  );
end;
$$;
revoke all on function public.app_campaign_alert_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_campaign_alert_state(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_campaign_alerts_due(p_limit) — 발송 대상
--   조건: 캠페인이 **LIVE** 이고 start_date = 오늘(KST) · 미발송 · 미수신거부 · 회원 이메일 있음
--   start_date 를 오늘로 제한하는 이유: 크론이 멈췄다 늦게 돌아도 지난 캠페인의 오픈 메일을
--   뒤늦게 보내지 않는다(이미 판매 중인 걸 "오픈했어요" 로 받으면 혼란스럽다).
--   반환: { ok:true, today, rows:[{alert_id, email, unsub_token, campaign_code, seller_handle,
--                                 product_name, brand_name, sale_price, consumer_price, end_date}] }
-- ------------------------------------------------------------
create or replace function public.app_campaign_alerts_due(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_rows  jsonb;
  v_lim   integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
begin
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'alert_id', a.id,
               'email', u.email,
               'unsub_token', a.unsub_token,
               'campaign_code', c.code,
               'seller_handle', s.handle,
               'product_name', p.name,
               'brand_name', b.name,
               'sale_price', p.sale_price,
               'consumer_price', p.consumer_price,
               'end_date', c.end_date
             ) as r
        from public.campaign_alerts a
        join public.campaigns c on c.id = a.campaign_id
        join public.products   p on p.id = c.product_id
        join public.sellers    s on s.id = c.seller_id
        join public.brands     b on b.id = c.brand_id
        join auth.users        u on u.id = a.user_id
       where a.sent_at is null
         and a.unsubscribed_at is null
         and c.status = 'LIVE'
         and c.start_date = v_today
         and s.active and b.active
         and p.deleted_at is null
         and u.email is not null and btrim(u.email) <> ''
       order by a.created_at
       limit v_lim
    ) q;
  return jsonb_build_object('ok', true, 'today', v_today, 'rows', v_rows);
end;
$$;
revoke all on function public.app_campaign_alerts_due(integer) from public, anon, authenticated;
grant execute on function public.app_campaign_alerts_due(integer) to service_role;

-- ------------------------------------------------------------
-- app_campaign_alert_sent(p_ids) — 발송 완료 기록 (멱등 — 이미 적힌 건 건드리지 않는다)
--   반환: { ok:true, marked:n }
-- ------------------------------------------------------------
create or replace function public.app_campaign_alert_sent(p_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', true, 'marked', 0);
  end if;
  with upd as (
    update public.campaign_alerts set sent_at = now()
     where id = any(p_ids) and sent_at is null
     returning id
  )
  select count(*) into v_n from upd;
  return jsonb_build_object('ok', true, 'marked', v_n);
end;
$$;
revoke all on function public.app_campaign_alert_sent(uuid[]) from public, anon, authenticated;
grant execute on function public.app_campaign_alert_sent(uuid[]) to service_role;
