/**
 * 가짜 토스 — 토스 지급대행 연동 전에 크리에이터 계정으로 본인인증 흐름을 끝까지 눌러 보는 용도(개발 서버 · Vercel Preview 만).
 * 실제 연동과 **같은 DB 칸 · 같은 함수**를 쓴다 — 셀러리 0042 sellers.toss_seller_status · toss_seller_error 를 0121 myr_app_seller_toss_sync 로 적고,
 * 카드 상태는 0121 myr_toss_card_state 가 정한다. 바뀌는 건 "토스 쪽 결과"를 누가 주느냐뿐(연동 뒤: 토스 등록 응답 · 웹훅 seller.changed · 셀러 조회).
 *   등록   사업자 · 정산 정보 저장 직후 — 법인(서버 biz_kind)은 PARTIALLY_APPROVED(본인인증 없음) · 개인사업자는 APPROVAL_REQUIRED(문자 보냄)
 *   인증   [인증을 마쳤어요] 두 번째부터 — 본인인증 전 → PARTIALLY_APPROVED · 추가 인증 → APPROVED (첫 번째는 "아직 인증 전")
 * 운영(실서비스)에서는 아무것도 하지 않는다(tossSimAllowed false).
 */
import './env';
import { admin } from '@sellery/myr-core/server/admin';
import { settleInfoFromJson, type SettleInfo } from '@sellery/myr-core/settle-info';
import { invitePreviewAllowed } from './invite-preview';

export const tossSimAllowed = (): boolean => invitePreviewAllowed();

async function sync(sellerId: string, status: string | null): Promise<SettleInfo | null> {
	const { data, error } = await admin().rpc('myr_app_seller_toss_sync', { p_seller: sellerId, p_status: status, p_error: null });
	if (error) {
		console.error('[toss-sim] sync failed:', error.message);
		return null;
	}
	const r = data as { ok?: boolean; info?: unknown } | null;
	return r?.ok ? settleInfoFromJson(r.info) : null;
}

/** 등록 — 정보 저장 직후(등록 전 · 거절 · 다시 확인이 필요한 변경일 때) */
export async function simRegister(sellerId: string, info: SettleInfo): Promise<SettleInfo | null> {
	return sync(sellerId, info.bizKind === 'corporate' ? 'PARTIALLY_APPROVED' : 'APPROVAL_REQUIRED');
}

/** 인증 결과 — 본인인증 전이면 인증 완료 · 추가 인증이면 한도 없음 */
export async function simApprove(sellerId: string, info: SettleInfo): Promise<SettleInfo | null> {
	if (info.tossState === 'kyc') return sync(sellerId, 'APPROVED');
	if (info.tossState === 'wait') return sync(sellerId, 'PARTIALLY_APPROVED');
	return info;
}
