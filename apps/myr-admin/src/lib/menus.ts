/** 운영 콘솔 메뉴 — docs/myr-admin-screens.md §1-1. ready=false 는 UI 단계에서 아직 만들지 않은 화면(자리만 · 홈 숫자는 보인다) */
export interface Menu {
	key: string;
	href: string;
	name: string;
	icon: string;
	ready: boolean;
}

export const MENUS: Menu[] = [
	{ key: 'home', href: '/', name: '홈', icon: 'home', ready: true },
	{ key: 'payouts', href: '/payouts', name: '지급', icon: 'wallet', ready: true },
	{ key: 'tax', href: '/tax', name: '세금계산서', icon: 'doc', ready: true },
	{ key: 'creators', href: '/creators', name: '크리에이터', icon: 'user', ready: true },
	{ key: 'products', href: '/products', name: '상품', icon: 'box', ready: false },
	{ key: 'orders', href: '/orders', name: '주문 · 배송', icon: 'order', ready: false },
	{ key: 'cs', href: '/cs', name: '문의 · 교환/환불', icon: 'cs', ready: false },
	{ key: 'talk', href: '/talk', name: '파트너팀 톡', icon: 'm_talk', ready: false },
	{ key: 'settle', href: '/settle', name: '정산', icon: 'chart', ready: false },
	{ key: 'groupbuys', href: '/groupbuys', name: '공구 링크', icon: 'link', ready: false }
];

/** PC 상단 메뉴(시안 "MYR Admin PC" · 2026-11-24) — 시안 순서 · 짧은 이름. 파트너팀 톡은 메뉴가 아니라 오른쪽 아이콘(TopNav) */
export const TOP_NAV: { key: string; label: string }[] = [
	{ key: 'home', label: '홈' },
	{ key: 'products', label: '상품' },
	{ key: 'creators', label: '크리에이터' },
	{ key: 'orders', label: '주문' },
	{ key: 'cs', label: 'CS 관리' },
	{ key: 'groupbuys', label: '공구 링크' },
	{ key: 'settle', label: '정산' },
	{ key: 'payouts', label: '지급' },
	{ key: 'tax', label: '세금계산서' }
];

/** 모바일 하단 탭 — 모바일에서 끝낼 수 있는 일(지급 · 세금계산서 · CS) + 전체 메뉴 */
export const TABS = [
	{ key: 'home', href: '/', name: '홈', icon: 'home' },
	{ key: 'payouts', href: '/payouts', name: '지급', icon: 'wallet' },
	{ key: 'tax', href: '/tax', name: '세금계산서', icon: 'doc' },
	{ key: 'cs', href: '/cs', name: 'CS', icon: 'cs' }
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));
