-- ============================================================
-- 0126 · MYR 정산 "지급까지 할 일" ③ 토스 본인인증 — 정보 응답에 지급 방식이 토스인지(2026-11-24)
--
--   정산 상세 "지급까지 할 일"은 ① 정산 정보 등록 ② 세금계산서 발행 두 단계였다. 지급 방식이 토스(0122 platform_settings.myr_payout)면
--   토스 본인인증도 끝나야 지급된다(보류 이유 toss_auth) → ③ 토스 본인인증을 더한다.
--   ③ 을 보일지는 "지급 방식이 토스인가"(수동 지급이면 토스 인증이 없어도 지급된다)인데, 크리에이터 화면 응답 어디에도 이 값이 없었다.
--   ③ 이 끝났는지는 ① 과 같이 서버 보류 이유(toss_auth · 0122 myr_seller_hold_reasons · myr_payout_holds_json)로 정하고,
--   문구는 토스에서 할 일(toss_ask · 0124 myr_toss_creator_ask)로 고른다 — 둘 다 이미 있는 응답이다.
--
--   myr_settle_info_json(s) — 0124 정의 + payout_toss(myr_payout_toss_on · 0122). 새 판정 · 새 식 없음.
-- ============================================================

create or replace function public.myr_settle_info_json(s public.sellers)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'company', s.tax_info ->> 'company',
    'ceo', s.tax_info ->> 'ceo',
    'biz_no_masked', case when public.myr_has_biz_no(s.biz_no) then '***-**-' || right(s.biz_no, 5) end,
    'has_biz_no', public.myr_has_biz_no(s.biz_no),
    'bank', s.bank_info ->> 'bank',
    'holder', s.bank_info ->> 'holder',
    'account_masked', public.myr_mask_account(s.bank_info ->> 'account'),
    'has_account', public.myr_mask_account(s.bank_info ->> 'account') is not null,
    'tax_email', public.myr_seller_tax_email(s),
    'status', s.myr_settle_status,
    'note', case when s.myr_settle_status = 'rejected' then s.myr_settle_note end,
    'submitted_at', s.myr_settle_submitted_at,
    'checked_at', s.myr_settle_checked_at,
    -- 0116: 다음 정산 보류 이유(정산 탭 next_hold 와 같은 함수) — 홈 배너가 입력 상태로 다시 판정하지 않는다
    'hold', public.myr_seller_next_hold_json(s.id),
    -- 0121: 토스 지급대행 준비
    'ceo_phone', s.settle_phone,
    'toss_agreed', s.myr_toss_agreed_at is not null,
    'biz_kind', public.myr_biz_kind(s.biz_no),
    'toss_state', public.myr_toss_card_state(s),
    'toss_fix', case when s.toss_seller_error ->> 'field' in ('account', 'bizNo') then s.toss_seller_error ->> 'field' end,
    -- 0124: 토스로 지급 가능(0122)
    'toss_ready', public.myr_toss_ready(s),
    -- 0124: 내 정보 안내 · 확인 시트 — 본인인증을 마쳐 변경은 승인 때 · 승인 때 반영할 할 일이 있나 · 확인 중이라 잠김
    'review_on_change', public.myr_toss_verified(s),
    'toss_after_review', public.myr_seller_toss_todo_open(s),
    'edit_locked', public.myr_settle_edit_locked(s),
    -- 0124: 확인이 끝나면 토스 본인인증을 다시 해야 하나(사업자번호 · 대표자 변경 · 법인 제외)
    'reauth_after_review', public.myr_toss_reauth_pending(s),
    -- 0124: 크리에이터가 토스에서 할 일(본인인증 · 추가 인증 · 정보 고치기) — 홈 배너가 "확인하고 있어요"보다 먼저 보인다
    'toss_ask', public.myr_toss_creator_ask(s),
    -- 0126: 지급 방식이 토스인가(0122) — 정산 상세 "지급까지 할 일" ③ 토스 본인인증을 보일지
    'payout_toss', public.myr_payout_toss_on())
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;
