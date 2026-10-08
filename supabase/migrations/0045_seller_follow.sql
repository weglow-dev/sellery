-- ============================================================
-- 0045 — 인플루언서 팔로우 (follows) · 홈 정렬 우대
--
-- 배경: `/about` 회원 혜택에 "신뢰하는 인플루언서를 팔로우하면 다음 판매 일정이 홈에 먼저
--   표시됩니다" 가 적혀 있는데 **구현이 전혀 없었다** — 테이블도, 저장 코드도, 프로토타입에도 없다.
--   프로토타입에는 고객 계정 자체가 없었으므로(docs/analysis/flows-and-invariants.md:417·568
--   "회원가입·고객 계정 … 전부 시뮬/미구현 (문구만)") 베낄 동작이 없고, `docs/` 전체에 "팔로우" 가
--   0건이다(팔로워는 SNS 채널 수치). **그 한 줄이 유일한 사양이고, 이 파일은 그것만 구현한다.**
--
-- 범위 결정 (운영 2026-10-08)
--   · 하는 일은 **홈 정렬 우대 하나**다. 메일은 보내지 않는다 — `/about` 이 약속한 것이 "홈에 먼저
--     표시" 이고, 셀러 단위 상시 메일 동의는 건별 오픈 알림(0044)보다 광고성 정보 요건이 무거워
--     법률 검토(launch-checklist §5)가 끝난 뒤에 따로 다룬다.
--   · 회원 전용. 새 개인정보를 수집하지 않는다(`user_id` ↔ `seller_id` 뿐) — 방침 §2 표 수정 불필요.
--   · 팔로우 수를 인플루언서에게 보여주지 않는다. `sellers.followers` 는 **SNS 채널 팔로워 수**이고
--     랭킹의 `per_follower`(팔로워당 매출)가 그 값을 쓴다(0001:326) — 같은 단어로 두 수치를 노출하면
--     콘솔·랭킹에서 혼동된다. 셀러리 내 팔로우는 고객 쪽 기능으로만 둔다.
--
-- 정렬 위치: **★ 추천(유료) 다음, 그 밖의 모든 판매보다 위.**
--   인플루언서 제안서 p.8 이 "고객 홈 상단 노출(7일)을 셀러리 포인트로 신청하시면, 진행 중인 판매가
--   **가장 먼저** 보입니다" 로 유료 노출에 최상단을 약속했다(docs/points-policy.md:148). 팔로우를 그
--   위에 두면 돈 받고 한 약속을 깬다. 그래서 `feat` → `followed` → 기존 키 순이다.
--
-- 해제는 **행 삭제**다. 0044 `campaign_alerts` 는 메일 수신거부 의사를 보존해야 해서
--   `unsubscribed_at` 을 남겼지만, 팔로우는 메일이 없어 보존할 의사가 없다 — 재팔로우는 그냥 insert.
--
-- 함수: app_follow_seller · app_unfollow_seller · app_followed_seller_ids
--   0007 패턴 — security definer · service_role 만 execute. 게이트는 라우트가 한다.
-- ============================================================

create table if not exists public.follows (
  id         uuid primary key default gen_random_uuid(),
  -- 회원 전용 — 탈퇴하면 팔로우도 사라진다
  user_id    uuid not null references auth.users (id) on delete cascade,
  seller_id  uuid not null references public.sellers (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists follows_pair_uidx on public.follows (user_id, seller_id);
-- 홈·목록이 "내가 팔로우한 셀러" 를 한 번에 읽는다
create index if not exists follows_user_idx on public.follows (user_id);

alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
-- 정책 없음 — 아래 함수(service_role)로만 접근한다.

comment on table public.follows is
  '고객의 인플루언서 팔로우 (0045) — 홈 정렬 우대 전용. 메일 발송 없음 · 팔로우 수는 인플루언서에게 노출하지 않는다(sellers.followers = SNS 수치와 구분)';

-- ------------------------------------------------------------
-- app_follow_seller(p_seller_id, p_user_id) — 팔로우
--   공개·활동 중인 인플루언서만(`seller_is_public` · `active`) → 그 외 NOT_FOUND.
--   반환: { ok:true, already } | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_follow_seller(p_seller_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_ok boolean;
  v_n  integer;
begin
  if p_user_id is null or p_seller_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  -- 비공개(hidden)·정지된 인플루언서는 목록에도 없다 — 존재 여부를 구분하지 않고 NOT_FOUND
  select s.active and public.seller_is_public(s.id) into v_ok
    from public.sellers s where s.id = p_seller_id;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  with ins as (
    insert into public.follows (user_id, seller_id)
    values (p_user_id, p_seller_id)
    on conflict (user_id, seller_id) do nothing
    returning id
  )
  select count(*) into v_n from ins;

  return jsonb_build_object('ok', true, 'already', v_n = 0);
end;
$$;
revoke all on function public.app_follow_seller(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_follow_seller(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_unfollow_seller(p_seller_id, p_user_id) — 팔로우 해제 (행 삭제)
--   비공개로 바뀐 인플루언서도 해제할 수 있어야 한다 — 여기서는 공개 여부를 보지 않는다.
--   반환: { ok:true, already }
-- ------------------------------------------------------------
create or replace function public.app_unfollow_seller(p_seller_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if p_user_id is null or p_seller_id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  with del as (
    delete from public.follows where user_id = p_user_id and seller_id = p_seller_id returning id
  )
  select count(*) into v_n from del;
  return jsonb_build_object('ok', true, 'already', v_n = 0);
end;
$$;
revoke all on function public.app_unfollow_seller(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_unfollow_seller(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_followed_seller_ids(p_user_id) — 내가 팔로우한 셀러 id 목록
--   홈 정렬과 `/influencers` 목록의 버튼 상태가 같은 호출을 쓴다(요청당 1회).
--   비공개로 바뀐 셀러도 그대로 돌려준다 — 목록에서 해제할 수 있어야 한다.
--   반환: { ok:true, ids:[uuid…] }   (비로그인은 빈 배열)
-- ------------------------------------------------------------
create or replace function public.app_followed_seller_ids(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'ids', coalesce((select jsonb_agg(f.seller_id order by f.created_at desc)
                       from public.follows f where f.user_id = p_user_id), '[]'::jsonb)
  )
$$;
revoke all on function public.app_followed_seller_ids(uuid) from public, anon, authenticated;
grant execute on function public.app_followed_seller_ids(uuid) to service_role;
