/**
 * 토스 지급대행 본인인증 — 가입 화면이 읽는 값(2026-11-18 토스페이먼츠 지급대행 결정 · docs/myr-admin-screens.md §5-3).
 * 지금은 **미리보기(/invite/preview) 목 응답만** 있다. 토스 연동(다음 단계 — 셀러 등록 `POST /v2/sellers` · 상태 웹훅 `seller.changed` ·
 * 조회 `GET /v2/sellers/{id}` · 셀러리 0042 의 sellers.toss_seller_* 칸)이 붙으면 실제 상태로 바꾸고, 지급 가능 판정은 DB 함수가 정한다.
 * 실서비스 가입은 연동 전까지 null(토스 화면 없이 환영 화면) — 대표자 휴대폰 · 동의는 0121 로 지금부터 저장한다.
 */
import './env';
import type { BizKind, SettleInfo } from '@sellery/myr-core/settle-info';
import { isTossCardState, type TossCardState } from '$lib/toss-card';
import { PARTIAL_LIMIT, tossCardOf } from './toss-card-preview';
export { tossCardOf, previewTossCardCheck } from './toss-card-preview';
import { invitePreviewAllowed } from './invite-preview';
import { admin } from '@sellery/myr-core/server/admin';

/** 화면 값 — kind: 개인사업자(문자 본인인증) · 법인(본인인증 없음) · verified: 토스 지급 가능 · label: 환영 화면 칩 문구 · limit: 받을 수 있는 정산금 문구 */
export type TossAuth = { kind: BizKind; verified: boolean; label: string; phone: string; limit: string | null };
// 환영 화면 칩 — 내 정보 카드와 같은 문구표(tossCardOf)의 칩. 미리보기는 저장된 계정이 없어 카드 상태(0121 myr_toss_card_state)를 못 읽으니 목 상태로 고른다
const tossAuthLabel = (kind: BizKind, verified: boolean): string => tossCardOf(kind === 'corporate' ? 'corporate' : verified ? 'partial' : 'wait', null).chip.label;

/** 토스 연동이 켜졌는지 — 연동 전까지는 미리보기만 */
export const tossLive = (preview: boolean): boolean => preview;

/** 개인사업자 · 법인 — 서버 판정(0121 myr_biz_kind) 하나를 쓴다 */
async function bizKindOf(bizNo: string): Promise<BizKind> {
	const { data, error } = await admin().rpc('myr_biz_kind', { p_biz_no: bizNo.replace(/\D/g, '') });
	if (error) console.warn('[toss-auth] myr_biz_kind failed:', error.message);
	return data === 'corporate' ? 'corporate' : 'individual';
}


/** 미리보기 — 가입 직후 상태. 법인은 본인인증 없이 바로 지급 가능 */
export async function previewTossAfterSignup(bizNo: string, phone: string): Promise<TossAuth> {
	const kind = await bizKindOf(bizNo);
	const verified = kind === 'corporate';
	return { kind, verified, label: tossAuthLabel(kind, verified), phone, limit: PARTIAL_LIMIT };
}

/** 미리보기 — [인증을 마쳤어요] 확인. 첫 확인은 "아직 인증 전", 두 번째부터 완료(두 화면을 다 볼 수 있게) */
export function previewTossCheck(attempt: number, phone: string): TossAuth {
	const verified = attempt >= 2;
	return { kind: 'individual', verified, label: tossAuthLabel('individual', verified), phone, limit: PARTIAL_LIMIT };
}

/** 미리보기 — 저장하지 않으니 정산 계좌 요약의 가린 계좌번호도 서버 함수(0085 myr_mask_account)로 만든다(저장 응답과 같은 모양) */
export async function previewAccount(bank: string, account: string | null): Promise<{ bank: string; masked: string | null }> {
	const { data, error } = await admin().rpc('myr_mask_account', { p_account: account ?? '' });
	if (error) console.warn('[toss-auth] myr_mask_account failed:', error.message);
	return { bank, masked: typeof data === 'string' ? data : null };
}

/* ---------------- 내 정보 "토스 본인인증" 카드 — 미리보기(`/my?toss=<상태>` · 개발 서버 · Vercel Preview 만) ---------------- */
// 연동 뒤에는 셀러리 0042 의 sellers.toss_seller_status · toss_seller_error 를 읽는 DB 함수가 상태 · 문구를 정한다(이 목은 지운다).

/** 미리보기를 열어도 되는 환경인지 + 고른 상태 */
export function tossCardPreviewOf(url: URL): TossCardState | null {
	if (!invitePreviewAllowed()) return null;
	const s = url.searchParams.get('toss');
	return isTossCardState(s) ? s : null;
}

