/**
 * 내 정보 "토스 본인인증" 카드가 읽는 값(서버가 만든다 — lib/server/toss-card-preview.ts tossCardOf). 화면은 칩 · 문장 · 안내를 그대로 그린다.
 * 상태(토스 지급대행 셀러 상태 · docs/myr-admin-screens.md §5-3):
 *   none 시작 전(정보 미입력) · rejected 토스가 사업자번호 · 계좌를 거절 · wait 본인인증 전(APPROVAL_REQUIRED) · partial 인증 완료(PARTIALLY_APPROVED · 한 주 1천만 원 미만)
 *   kyc 추가 인증 필요(KYC_REQUIRED) · approved 한도 없음(APPROVED) · corporate 법인(본인인증 없음)
 */
import { TOSS_STATES, isTossState, type TossState } from '@sellery/myr-core/settle-info';

/** 상태 값은 서버(0121 myr_toss_card_state)와 같은 이름 — `@sellery/myr-core/settle-info` TossState */
export type TossCardState = TossState;
export const TOSS_CARD_STATES = TOSS_STATES;
export const isTossCardState = isTossState;

/** 시안 "MYR Influencer Admin"(· PC) 내 정보 토스 본인인증 카드 — 칩 · 한 문장(lead + 굵은 번호 + tail) · 회색 안내(note) · 버튼 줄 */
export type TossCard = {
	state: TossCardState;
	chip: { label: string; tone: 'muted' | 'accent' | 'ok' | 'danger' };
	/** 한 문장 — lead + **phone**(있으면 · 숫자만) + tail */
	lead: string;
	phone: string | null;
	tail: string;
	/** 회색 안내 한 줄 */
	note: string | null;
	/** 토스가 거절한 칸 — [수정하기]가 그 칸으로 */
	fixField: 'bizNo' | 'account' | null;
	/** [인증을 마쳤어요]로 결과를 물을 수 있는지 */
	canCheck: boolean;
	/** "문자를 못 받았어요"를 보일지 — 본인인증 전 */
	phoneHelp: boolean;
	/** 마지막 확인 결과가 "아직" 이었는지 */
	notYet: boolean;
};
