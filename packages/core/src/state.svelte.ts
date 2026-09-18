/* ============ 반응형 상태 (Svelte 5 runes) ============
   원본 js/02-state.js 의 S. 모든 앱이 같은 모양을 쓴다. */
import type { CartItem, Cust, Data, Session } from './types';
import { seedData } from './seed';
import { getStore, loadCart, loadCust, loadSession, loadLinkCtxRaw, persistLinkCtx } from './storage';
import { DAY, P, today } from './util';

export type Role = 'seller' | 'brand' | 'admin' | 'customer';

export interface UIState {
	catFilter: string; galGrade: string; galPlat: string; calOff: number; reqOpen: boolean | null; dmQ: string;
	custSel: string | null; custCat: string; faqOpen: number | null; storeOpt: number; storeQty: number;
	admCF: string; admPS: string; admPB: string; admPC: string; admPQ: string; admIG: string; admIQ: string; admOF: string; bcF: string;
	profileOpen: string | null; kakaoAfter: string; liveSim: boolean;
}

function loadData(): Data {
	const d = getStore().loadData();
	return d || seedData();
}

export const S = $state({
	role: 'seller' as Role,
	data: loadData(),
	actingSeller: 's1',
	actingBrand: 'b1',
	session: loadSession() as Session | null,
	cust: loadCust() as Cust | null,
	cart: loadCart() as CartItem[],
	linkCtx: null as { cid: string } | null,
	ui: {
		catFilter: '전체', galGrade: '전체', galPlat: 'all', calOff: 0, reqOpen: null, dmQ: '',
		custSel: null, custCat: '전체', faqOpen: null, storeOpt: 0, storeQty: 1,
		admCF: 'all', admPS: 'all', admPB: 'all', admPC: 'all', admPQ: '', admIG: 'all', admIQ: '', admOF: 'all', bcF: 'all',
		profileOpen: null, kakaoAfter: '', liveSim: false
	} as UIState
});

export const D_ = () => S.data;
export function save() { getStore().saveData(S.data); }

/** 링크 진입 보호 — 판매 종료 +7일 또는 캠페인 소멸 시 해제 */
export function loadLinkCtx() {
	const v = loadLinkCtxRaw();
	if (!v || !v.cid) return null;
	const c = S.data.campaigns.find((x) => x.id === v.cid);
	if (!c) { persistLinkCtx(null); return null; }
	if (c.end && (today().getTime() - P(c.end).getTime()) / DAY > 7) { persistLinkCtx(null); return null; }
	return { cid: v.cid };
}
export function setLinkCtx(cid: string) { S.linkCtx = { cid }; persistLinkCtx({ cid, at: new Date().toISOString().slice(0, 10) }); }
export function clearLinkCtx() { S.linkCtx = null; persistLinkCtx(null); }
S.linkCtx = loadLinkCtx();

/* 파트너 세션이 있으면 접속 계정 고정 */
if (S.session) {
	if (S.session.role === 'seller' && S.data.sellers.some((x) => x.id === S.session!.id)) S.actingSeller = S.session.id;
	if (S.session.role === 'brand' && S.data.brands.some((x) => x.id === S.session!.id)) S.actingBrand = S.session.id;
}

/** 시드로 초기화 (관리자 [데이터 초기화]) — 고객 세션·장바구니는 유지 */
export function resetData() {
	getStore().clearData();
	clearLinkCtx();
	S.data = seedData();
	save();
}
