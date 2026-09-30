-- ============================================================
-- 0030 — 사업자 인플루언서 지급 보류 조건: 상호 → 사업자등록증
--
-- 배경: 인플루언서 정산 화면은 사업자에게 "사업자등록번호 · 등록증 필요", 세금계산서 발행 정보(상호 · 대표자 ·
--   업태 · 종목 · 이메일)는 "선택 · 비워 두면 운영팀이 이메일로 물어봐요" 라고 안내한다. 그런데 지급 보류 판정
--   (`admin_payout_hold_reason` 0020 · 0027)은 거꾸로 **상호(`tax_info.company`)가 비면 보류**하고 등록증은 보지
--   않았다. 안내를 믿고 상호를 비운 사업자는 D+21 에 "사업자 세금계산서 정보 미등록" 으로 보류되고, 운영팀이
--   이메일로 상호를 받아도 대신 넣을 화면이 없어 풀 방법이 없었다. 등록증은 "필요" 라면서 없어도 지급됐다.
--
-- 방식
--   · 사업자(`settle_type = 'biz'`) 보류 조건 = 사업자등록번호(`biz_no`) + **사업자등록증(`biz_doc_url`)**.
--     상호 등 세금계산서 정보는 보류 조건에서 뺀다 — 등록증에 상호 · 대표자 · 업태 · 종목이 찍혀 있어 운영팀이
--     등록증으로 세금계산서를 발행한다. 화면 안내("등록증 필요" · 세금계산서 정보 "선택")는 그대로 사실이 된다.
--   · 보류 코드는 `TAX_INFO_MISSING` 그대로(payouts_hold_code_check 제약 · TS `HOLD_CODES`) — 문구만
--     "사업자등록증 미등록" 으로 바꾼다(파트너 콘솔이 `hold_reason` 을 그대로 보여준다).
--   · 0029 자동 해제 트리거가 `biz_doc_url` 변경도 본다 — 등록증을 올리면 보류가 풀려 지급 대기가 된다.
--   · 개인(주민번호) · 추천인(계좌만 0027) · 브랜드(`brand_settle_info_complete` 0019) 조건은 바꾸지 않는다.
--   · 이미 `TAX_INFO_MISSING` 으로 보류된 지급은 새 조건으로 다시 검사한다(2026-09-30 운영 DB 사업자 인플루언서 0명).
-- ============================================================

-- ------------------------------------------------------------
-- admin_hold_label — 0020 과 같고 TAX_INFO_MISSING 문구만 다르다
-- ------------------------------------------------------------
create or replace function public.admin_hold_label(p_code text)
returns text
language sql immutable
set search_path = public
as $$
  select case p_code
           when 'BANK_MISSING'           then '정산 계좌 미등록'
           when 'RRN_MISSING'            then '주민등록번호 미등록 — 원천징수 자료'
           when 'TAX_INFO_MISSING'       then '사업자등록증 미등록'
           when 'SETTLE_INFO_INCOMPLETE' then '정산 정보 미완비 — 은행·계좌·예금주·사업자등록번호'
           when 'MANUAL'                 then '운영자 보류'
           else p_code end
$$;
revoke all on function public.admin_hold_label(text) from public, anon, authenticated;
grant execute on function public.admin_hold_label(text) to service_role;

-- ------------------------------------------------------------
-- admin_payout_hold_reason — 0027 과 같고 seller 의 사업자 분기만 다르다(상호 → 사업자등록증)
-- ------------------------------------------------------------
create or replace function public.admin_payout_hold_reason(p_payee_type text, p_seller_id uuid, p_brand_id uuid)
returns text
language plpgsql stable
security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
  b public.brands%rowtype;
begin
  if p_payee_type = 'seller' then
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    if s.settle_type = 'biz' then
      if coalesce(s.biz_no, '') = '' or coalesce(s.biz_doc_url, '') = '' then return 'TAX_INFO_MISSING'; end if;
    elsif s.rrn_set_at is null then
      return 'RRN_MISSING';
    end if;
    return null;
  elsif p_payee_type = 'referrer' then
    -- 추천 보상(0027): 계좌만 본다
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    return null;
  elsif p_payee_type = 'brand' then
    select * into b from public.brands where id = p_brand_id;
    if not found then return 'SETTLE_INFO_INCOMPLETE'; end if;
    if not public.brand_settle_info_complete(b) then return 'SETTLE_INFO_INCOMPLETE'; end if;
    return null;
  end if;
  return null;
end;
$$;
revoke all on function public.admin_payout_hold_reason(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payout_hold_reason(text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- sellers 자동 해제 트리거 — 0029 와 같고 감시 열에 biz_doc_url 을 더했다
-- ------------------------------------------------------------
drop trigger if exists sellers_payout_auto_release on public.sellers;
create trigger sellers_payout_auto_release
  after update of bank_info, settle_type, biz_no, tax_info, rrn_set_at, biz_doc_url on public.sellers
  for each row
  when (old.bank_info   is distinct from new.bank_info
     or old.settle_type is distinct from new.settle_type
     or old.biz_no      is distinct from new.biz_no
     or old.tax_info    is distinct from new.tax_info
     or old.rrn_set_at  is distinct from new.rrn_set_at
     or old.biz_doc_url is distinct from new.biz_doc_url)
  execute function public.sellers_payout_auto_release();

-- ------------------------------------------------------------
-- 기존 TAX_INFO_MISSING 보류를 새 조건으로 다시 검사 — 등록증이 있으면 풀고, 없으면 새 문구로 남는다
-- ------------------------------------------------------------
do $$
declare
  v_seller uuid;
begin
  for v_seller in
    select distinct seller_id from public.payouts
     where status = 'held' and hold_code = 'TAX_INFO_MISSING' and seller_id is not null
  loop
    perform public.admin_payouts_auto_release(v_seller, null);
  end loop;
  update public.payouts
     set hold_reason = public.admin_hold_label('TAX_INFO_MISSING')
   where status = 'held' and hold_code = 'TAX_INFO_MISSING';
end;
$$;
