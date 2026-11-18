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
	{ key: 'settle', href: '/settle', name: '정산', icon: 'chart', ready: false },
	{ key: 'groupbuys', href: '/groupbuys', name: '공구 링크', icon: 'link', ready: false }
];

/** 모바일 하단 탭 — 모바일에서 끝낼 수 있는 일(지급 · 세금계산서 · CS) + 전체 메뉴 */
export const TABS = [
	{ key: 'home', href: '/', name: '홈', icon: 'home' },
	{ key: 'payouts', href: '/payouts', name: '지급', icon: 'wallet' },
	{ key: 'tax', href: '/tax', name: '세금계산서', icon: 'doc' },
	{ key: 'cs', href: '/cs', name: 'CS', icon: 'cs' }
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));
