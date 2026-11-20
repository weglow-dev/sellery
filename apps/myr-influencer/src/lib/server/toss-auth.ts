/**
 * 토스 지급대행 본인인증 — 가입 화면이 읽는 값(2026-11-18 토스페이먼츠 지급대행 결정 · docs/myr-admin-screens.md §5-3).
 * 실서비스(0124 · 2026-11-19): 정보를 저장하면 토스 셀러 등록(lib/server/toss-sellers.ts) → 저장된 상태(0121 카드 상태 · 0122 토스 지급 가능)로 화면 값을 만든다(tossAuthOf).
 *   시범운영은 모든 환경에서 tpeerkeamf5 테스트 키 — 키(TOSS_PAYOUT_SECRET_KEY · TOSS_PAYOUT_SECURITY_KEY)가 없으면 토스 화면 없이 환영 화면.
 * 미리보기(/invite/preview)는 저장하지 않으니 목 응답.
 */
import './env';
import type { BizKind, SettleInfo } from '@sellery/myr-core/settle-info';
import { hasTossPayouts } from '@sellery/myr-core/server/toss-payouts';
import { isTossCardState, type TossCardState } from '$lib/toss-card';
import { PARTIAL_LIMIT, tossCardOf } from './toss-card-preview';
export { tossCardOf, previewTossCardCheck } from './toss-card-preview';
import { invitePreviewAllowed } from './invite-preview';
import { admin } from '@sellery/myr-core/server/admin';

/** 화면 값 — kind: 개인사업자(문자 본인인증) · 법인(본인인증 없음) · verified: 토스 지급 가능(서버 toss_ready) ·
 *  waiting: 본인인증을 기다리는 중([인증을 마쳤어요]를 보일지 — 카드의 canCheck) · label: 환영 화면 칩 문구 · limit: 받을 수 있는 정산금 문구 */
export type TossAuth = { kind: BizKind; verified: boolean; waiting: boolean; label: string; phone: string; limit: string | null };
// 환영 화면 칩 — 내 정보 카드와 같은 문구표(tossCardOf)의 칩. 미리보기는 저장된 계정이 없어 카드 상태(0121 myr_toss_card_state)를 못 읽으니 목 상태로 고른다
const previewCard = (kind: BizKind, verified: boolean) => tossCardOf(kind === 'corporate' ? 'corporate' : verified ? 'partial' : 'wait', null);

/** 토스 연동이 켜졌는지 — 미리보기는 늘 · 실서비스는 지급대행 키가 있을 때 */
export const tossLive = (preview: boolean): boolean => preview || hasTossPayouts();

/** 실서비스 — 저장된 상태로 화면 값(카드 상태 · 토스 지급 가능은 서버 값) */
export function tossAuthOf(info: SettleInfo, phone: string): TossAuth {
	const card = tossCardOf(info.tossState ?? 'none', info);
	return { kind: info.bizKind ?? 'individual', verified: info.tossReady, waiting: card.canCheck, label: card.chip.label, phone: info.ceoPhone ?? phone, limit: PARTIAL_LIMIT };
}

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
	const card = previewCard(kind, verified);
	return { kind, verified, waiting: card.canCheck, label: card.chip.label, phone, limit: PARTIAL_LIMIT };
}

/** 미리보기 — [인증을 마쳤어요] 확인. 첫 확인은 "아직 인증 전", 두 번째부터 완료(두 화면을 다 볼 수 있게) */
export function previewTossCheck(attempt: number, phone: string): TossAuth {
	const verified = attempt >= 2;
	const card = previewCard('individual', verified);
	return { kind: 'individual', verified, waiting: card.canCheck, label: card.chip.label, phone, limit: PARTIAL_LIMIT };
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

