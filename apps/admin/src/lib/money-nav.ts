/**
 * 관리자 콘솔 "정산 · 돈" 화면 목록 — `(console)/(money)/+layout.svelte` 가 상단 칩으로 그린다 (docs/admin-console-plan.md "정산·돈" PR-B).
 * 셸(`(console)/+layout.svelte` · 다른 작업자)에는 아직 탭 배열이 없어서 돈 화면만의 내비를 여기 둔다 — 셸에 탭이 생기면 이 표를 그쪽 한 줄로 옮긴다.
 * href 는 접두(`/admin`) 없는 콘솔 경로 — 레이아웃이 `base` 를 붙인다. 순수 모듈(브라우저 도달 · 서버 import 없음).
 */
export type MoneyNavItem = { href: string; label: string; title: string };

export const MONEY_NAV: readonly MoneyNavItem[] = [
	{ href: '/settle', label: '정산', title: '정산 실행 — 기준일 도래 캠페인 · 정산 명세' },
	{ href: '/settle/payouts', label: '지급', title: '지급 관리 — 이체 파일 · 지급 완료/보류' },
	{ href: '/orders', label: '주문', title: '전체 주문 검색 · 환불' },
	{ href: '/payments', label: '결제', title: '결제 정합성 대시보드' },
	{ href: '/cs', label: '문의', title: '고객 문의 열람 (답변은 브랜드)' }
];

/** 활성 판정 — `/settle` 은 `/settle/payouts` 아래가 아닐 때만 (지급 칩이 따로 있다). 나머지는 접두 일치. */
export function isMoneyNavActive(relPath: string, href: string): boolean {
	const under = relPath === href || relPath.startsWith(`${href}/`);
	if (href === '/settle') return under && !(relPath === '/settle/payouts' || relPath.startsWith('/settle/payouts/'));
	return under;
}
