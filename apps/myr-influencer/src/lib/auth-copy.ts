/**
 * 로그인 · 가입 화면의 고정 문구 · 링크. 시안 "MYR Influencer Login PC" 의 왼쪽 소개 영역 숫자와 후기는 **시안 문구**다 —
 * 정산 비율 · 지급일 · 심사 기간은 정책이 정해지지 않았다(docs/myr.md §9-6 정산 · §9 열린 결정). 실판매 전에 확정값으로 바꾸거나 지운다.
 * 한곳에 모아 둔 이유: 화면을 열지 않고 이 파일만 고치면 되게.
 */

/** 제조 의뢰 안내 — 랜딩 제조의뢰 퍼널(apps/myr · 공개 주소 sellery.life/influencer/oem) */
export const MYR_APPLY_URL = 'https://sellery.life/influencer/oem/apply';

/** PC 로그인 왼쪽 숫자 카드 3개 — ⚠ 시안 값(정책 미확정) */
export const LOGIN_STATS = [
	{ big: '90%', label: '판매가 기준\n크리에이터 정산 비율' },
	{ big: '1~2일', label: '상세페이지 제출 후\n심사 · 샵 오픈' },
	{ big: '매월 10일', label: '정산 지급일\n자동 입금' }
] as const;

/** PC 로그인 왼쪽 후기 — ⚠ 시안의 예시 후기(실제 크리에이터 발언이 아니다). 실제 후기를 받으면 바꾸고, 없으면 실판매 전에 지운다 */
export const LOGIN_QUOTE = {
	text: '"팔로워들이 늘 물어보던 걸 제품으로 답했어요. 제조는 MYR이 해주니까 저는 레시피만 신경 썼고요."',
	who: '민지 루틴 · @minji.routine · 판매 중 2개',
	initial: '민',
	bg: '#FFB088'
} as const;

/** 초대한 곳 — 초대 정보 카드 */
export const INVITER = 'MYR 파트너팀';
