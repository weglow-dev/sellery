-- ============================================================
-- 0034 — 🥬 유상(충전)분 / 무상분 구분 기록
--
-- 배경: 유상 충전(`topup`)은 도입하지 않고 **무상 지급분으로만 운영**한다(운영 결정 2026-10-06).
--   다만 추후 충전을 켤 때 "남은 🥬 중 환불 대상(충전분)이 얼마인가" 를 계산할 수 있어야 한다.
--   지금 `celery_ledger` 는 단일 잔액(Σ delta)이고 차감 행에 출처가 없다(`points-policy.md` §3
--   "충전 순서·소진 순서 구분 없음(단일 잔액)"). 차감이 어느 쪽에서 빠졌는지는 **그 순간에만 알 수
--   있는 정보**라 나중에 소급 복원이 불가능하다 — 그래서 충전을 만들기 전에 기록만 먼저 넣는다.
--
-- 설계: 컬럼 하나(`paid_part`)로 모든 행의 "유상 몫" 을 적는다. delta 와 같은 부호, 절대값은 |delta| 이하.
--     지급(delta > 0)  topup 이면 paid_part = delta, 그 외 무상 지급은 0
--     차감(delta < 0)  유상분에서 빠진 몫(음수). **무상분 우선 소진**이라 유상 잔액이 남는다
--                      — 환불 대상을 보존하는 쪽이 이용자에게 유리하다
--   그러면 유상 잔액 = Σ paid_part · 무상 잔액 = Σ delta − Σ paid_part 로 언제든 갈라진다.
--
-- **유효기간(소멸)은 두지 않는다**(운영 결정 2026-10-06 — 무상분도 소멸 없음). 그래서 소멸일 칸은
--   넣지 않는다. 정책이 생기면 `created_at`(지급일) + `reason`(지급 종류)이 이미 있으므로 소급 계산된다.
--
-- 지금은 충전이 없으므로 **모든 행의 paid_part = 0** 이고 화면·동작은 달라지지 않는다.
-- 충전을 켜는 날부터 자동으로 구분된다.
-- ============================================================

alter table public.celery_ledger
  add column if not exists paid_part integer not null default 0;

comment on column public.celery_ledger.paid_part is
  '이 행의 유상(충전)분 몫. delta 와 같은 부호 · |paid_part| <= |delta|. 지급: topup=delta, 그 외 0. 차감: 유상분에서 빠진 몫(무상분 우선 소진). 유상 잔액 = Σ paid_part (0034)';

-- 부호·범위 제약: 지급은 0..delta, 차감은 delta..0
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'celery_ledger_paid_part_range'
  ) then
    alter table public.celery_ledger
      add constraint celery_ledger_paid_part_range check (
        (delta > 0 and paid_part >= 0 and paid_part <= delta)
        or (delta < 0 and paid_part <= 0 and paid_part >= delta)
      );
  end if;
end $$;

-- 기존 행 보정: 충전이 없었으므로 전부 무상(0)이 맞다. default 0 으로 이미 채워졌지만
-- topup 행이 혹시 있다면(운영 스크립트 등) 유상으로 돌린다.
update public.celery_ledger set paid_part = delta
 where reason = 'topup' and delta > 0 and paid_part = 0;

-- ------------------------------------------------------------
-- celery_balance_split(owner_type, owner_id) — 잔액을 유상/무상으로 가른다
--   이 규칙이 사는 **유일한 곳**이다. 충전 도입 시 환불 가능액 = paid.
-- ------------------------------------------------------------
create or replace function public.celery_balance_split(p_owner_type text, p_owner_id uuid)
returns table (total integer, paid integer, free integer)
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(l.delta), 0)::integer                      as total,
         coalesce(sum(l.paid_part), 0)::integer                  as paid,
         coalesce(sum(l.delta) - sum(l.paid_part), 0)::integer   as free
    from public.celery_ledger l
   where l.owner_type = p_owner_type
     and ((p_owner_type = 'seller' and l.seller_id = p_owner_id)
       or (p_owner_type = 'brand'  and l.brand_id  = p_owner_id));
$$;

revoke all on function public.celery_balance_split(text, uuid) from public, anon, authenticated;
grant execute on function public.celery_balance_split(text, uuid) to service_role;

-- ------------------------------------------------------------
-- celery_spend — paid_part 를 채운다 (0012 의 함수를 교체. 시그니처에 p_paid_part 추가)
--   기존 7인자 호출은 그대로 동작한다(p_paid_part default null = 자동 판정).
--
--   자동 판정
--     delta > 0 : reason='topup' → 전액 유상, 그 외 → 0 (무상 지급)
--     delta < 0 : **무상분 우선 소진** — 무상 잔액으로 먼저 깎고 모자란 만큼만 유상에서
--
--   환급(delta > 0 · sample_refund · invite_refund 등)은 자동 판정으로는 무상으로 돌아간다.
--   원래 차감이 유상에서 빠졌다면 유상으로 되돌려야 맞으므로, **충전을 켤 때** 환급 호출부가
--   원 차감 행의 `paid_part` 를 읽어 `p_paid_part` 로 넘기도록 고친다. 지금은 모든 차감이
--   무상(0)이라 자동 판정이 정확하다.
-- ------------------------------------------------------------
create or replace function public.celery_spend(
  p_owner_type text, p_owner_id uuid, p_delta integer, p_reason text,
  p_memo text default null, p_ref_type text default null, p_ref_id uuid default null,
  p_paid_part integer default null)
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_bal       integer;
  v_paid      integer;
  v_free      integer;
  v_paid_part integer;
begin
  if p_owner_type not in ('seller','brand') then
    raise exception 'celery_spend: bad owner_type %', p_owner_type;
  end if;
  perform pg_advisory_xact_lock(hashtext('celery:' || p_owner_type || ':' || p_owner_id::text));

  select s.total, s.paid, s.free into v_bal, v_paid, v_free
    from public.celery_balance_split(p_owner_type, p_owner_id) s;

  if p_delta = 0 then
    return v_bal;
  end if;
  if v_bal + p_delta < 0 then
    raise exception 'CEL_INSUFFICIENT' using errcode = 'P0001', detail = format('balance=%s delta=%s', v_bal, p_delta);
  end if;

  if p_paid_part is not null then
    v_paid_part := p_paid_part;
  elsif p_delta > 0 then
    -- 지급: 충전만 유상. 환급은 무상으로 돌린다(위 주석 — 충전 도입 시 호출부가 명시한다)
    v_paid_part := case when p_reason = 'topup' then p_delta else 0 end;
  else
    -- 차감: 무상분 우선 소진 → 무상 잔액을 넘는 만큼만 유상에서 뺀다
    v_paid_part := least(0, p_delta + greatest(v_free, 0));
  end if;

  -- 제약과 같은 범위로 한 번 더 가둔다 (호출부가 넘긴 값이 틀려도 원장이 깨지지 않게)
  if p_delta > 0 then
    v_paid_part := greatest(0, least(v_paid_part, p_delta));
  else
    v_paid_part := least(0, greatest(v_paid_part, p_delta));
    -- 유상 잔액보다 많이 뺄 수 없다
    v_paid_part := greatest(v_paid_part, -greatest(v_paid, 0));
  end if;

  insert into public.celery_ledger (owner_type, seller_id, brand_id, delta, reason, memo, ref_type, ref_id, paid_part)
  values (p_owner_type,
          case when p_owner_type = 'seller' then p_owner_id end,
          case when p_owner_type = 'brand'  then p_owner_id end,
          p_delta, p_reason, p_memo, p_ref_type, p_ref_id, v_paid_part);
  return v_bal + p_delta;
end;
$$;

revoke all on function public.celery_spend(text, uuid, integer, text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.celery_spend(text, uuid, integer, text, text, text, uuid, integer) to service_role;

-- 0012 의 7인자 판을 지운다 — 남겨두면 기본값 호출이 모호해져(PostgREST·plpgsql 양쪽) 깨진다.
drop function if exists public.celery_spend(text, uuid, integer, text, text, text, uuid);

-- ------------------------------------------------------------
-- 0010 · 0014 의 직접 insert 는 무상 지급(가입 축하 · 입점 이벤트)이라 paid_part = 0 이 맞다.
-- default 0 이 적용되므로 두 파일은 고치지 않는다.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- celery_balances 뷰(0005)에 유상/무상 칸을 더한다 — `balance` 는 그대로(Σ delta)라
-- 기존 읽기(관리자 인플루언서·브랜드 표의 🥬 열 · `celeryBalances()`)는 영향이 없다.
-- 충전 도입 후 관리자 화면에서 "미사용 충전분" 을 보여줄 때 쓴다.
-- ------------------------------------------------------------
create or replace view public.celery_balances
with (security_invoker = true) as
  select owner_type,
         coalesce(seller_id, brand_id) as owner_id,
         seller_id,
         brand_id,
         sum(delta)::integer as balance,
         max(created_at)     as last_entry_at,
         -- 새 칸은 **끝에** 붙인다 — `create or replace view` 는 기존 컬럼의 이름·순서를 바꿀 수 없다
         sum(paid_part)::integer                    as paid_balance,   -- 유상(충전)분 = 환불 대상
         (sum(delta) - sum(paid_part))::integer     as free_balance    -- 무상 지급분
    from public.celery_ledger
   group by owner_type, seller_id, brand_id;
