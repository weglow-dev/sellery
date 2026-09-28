/**
 * 관리자 콘솔 "정산 · 돈" 화면 목록 — `(console)/(money)/+layout.svelte` 가 상단 칩으로 그린다 (docs/admin-console-plan.md "정산·돈" PR-B).
 * 셸 하단 탭의 "정산" 하나로는 settle · payouts · orders · payments · revenue · cs 여섯 화면을 오갈 수 없어 화면 안 내비로 남긴다.
 *
 * `href` 는 접두 없는 콘솔 경로이고, **링크와 활성 판정에는 `moneyNavHref()` 로 접두를 붙인 전체 경로를 쓴다** —
 * `$app/paths` 의 `base` 는 SvelteKit 2 의 `paths.relative` 기본값(`true`) 때문에 SSR 에서 상대 경로(`.` · `..`)가 되어
 * 경로 계산에 쓸 수 없다(`pathname.slice(base.length)` 가 `admin/settle` 이 된다). 셸 탭(`ConsoleTabs`)도 같은 이유로
 * `consolePath()` 로 접두를 붙여 전체 경로끼리 비교한다.
 * 순수 모듈(브라우저 도달 · 서버 import 없음).
 */
import { consolePath } from '@sellery/db/console-paths';
export type MoneyNavItem = { href: string; label: string; title: string };

export const MONEY_NAV: readonly MoneyNavItem[] = [
	{ href: '/settle', label: '정산', title: '정산 실행 — 기준일 도래 캠페인 · 정산 명세' },
	{ href: '/settle/payouts', label: '지급', title: '지급 관리 — 이체 파일 · 지급 완료/보류' },
	{ href: '/orders', label: '주문', title: '전체 주문 검색 · 환불' },
	{ href: '/payments', label: '결제', title: '결제 정합성 대시보드' },
	{ href: '/revenue', label: '매출·순수익', title: '플랫폼 손익 — GMV · 수수료 매출 · 순수익 · 운영비 · 최종 순이익' },
	{ href: '/cs', label: '문의', title: '고객 문의 열람 (답변은 브랜드)' }
];

/** 접두(`/admin`) 붙은 전체 경로 — 링크 `href` 와 활성 판정에 모두 이 값을 쓴다 */
export function moneyNavHref(href: string): string {
	return consolePath('admin', href);
}

/** 칩 전체의 href — `activeNavHref(page.url.pathname, MONEY_NAV_HREFS)` 로 활성 항목을 찾는다 */
export const MONEY_NAV_HREFS: readonly string[] = MONEY_NAV.map((t) => moneyNavHref(t.href));
