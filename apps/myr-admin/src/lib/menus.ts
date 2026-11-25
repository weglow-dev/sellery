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
	{ key: 'products', href: '/products', name: '상품', icon: 'box', ready: true },
	{ key: 'orders', href: '/orders', name: '주문 · 배송', icon: 'order', ready: true },
	{ key: 'cs', href: '/cs', name: '문의 · 교환/환불', icon: 'cs', ready: true },
	{ key: 'talk', href: '/talk', name: '파트너팀 톡', icon: 'm_talk', ready: true },
	{ key: 'settle', href: '/settle', name: '정산', icon: 'chart', ready: true },
	{ key: 'groupbuys', href: '/groupbuys', name: '공구 링크', icon: 'link', ready: true }
];

/** PC 상단 메뉴 · 모바일 전체 메뉴(시안 "MYR Admin PC" · "MYR Admin" · 2026-11-24) — 시안 순서 · 짧은 이름 · 시안 아이콘(m_* · 굵기 1.8).
 *  파트너팀 톡은 메뉴가 아니라 머리 오른쪽 아이콘(HeadIcons) */
export const TOP_NAV: { key: string; label: string; icon: string }[] = [
	{ key: 'home', label: '홈', icon: 'home' },
	{ key: 'products', label: '상품', icon: 'm_products' },
	{ key: 'creators', label: '크리에이터', icon: 'm_creators' },
	{ key: 'orders', label: '주문', icon: 'm_orders' },
	{ key: 'cs', label: 'CS 관리', icon: 'm_claims' },
	{ key: 'groupbuys', label: '공구 링크', icon: 'link' },
	{ key: 'settle', label: '정산', icon: 'm_settle' },
	{ key: 'payouts', label: '지급', icon: 'm_payouts' },
	{ key: 'tax', label: '세금계산서', icon: 'm_tax' }
];

/** 모바일 하단 탭(시안 "MYR Admin") — 홈 · 상품 · 주문 · CS 관리 + 다섯째 칸 "전체"(전체 메뉴) */
export const TABS = [
	{ key: 'home', href: '/', name: '홈', icon: 'home' },
	{ key: 'products', href: '/products', name: '상품', icon: 'm_products' },
	{ key: 'orders', href: '/orders', name: '주문', icon: 'm_orders' },
	{ key: 'cs', href: '/cs', name: 'CS 관리', icon: 'm_claims' }
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));
