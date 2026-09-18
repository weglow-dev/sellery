/* ============ 도메인 헬퍼 (js/02-state.js · js/40-brand.js 일부) ============ */
import { S, D_, save } from './state.svelte';
import type { Brand, Campaign, CS, Grade, Product, Seller, ExternalSale, Status } from './types';
import {
	ACTIVE_BLOCKERS, BG_DISC, BGRADES, BREF_DISC, BREF_RATE, BREF_TIMES, CATMAP, CELERY_PER, CLEAR_DAYS, DATA_PRICE, DEMO_REAL_ONLY,
	DONE_STATES, GRADES, PG_RATE, PLAT_RATE, PRIORITY_TIER, REF_BOOST, REF_RATE, REF_TIMES, SAMPLE_CEL_WON, WHT
} from './constants';
import { CEL, gfull } from './icons';
import { addD, DAY, fmt, md, P, today, ymd } from './util';
import { toast } from './ui.svelte';

/* ---- 조회 ---- */
export const prod = (id: string) => D_().products.find((p) => p.id === id) as Product;
export const brand = (id: string) => D_().brands.find((b) => b.id === id) as Brand;
export const seller = (id: string) => D_().sellers.find((s) => s.id === id) as Seller;
export const camp = (id: string) => D_().campaigns.find((c) => c.id === id) as Campaign | undefined;
export const campOrders = (cid: string) => D_().orders.filter((o) => o.campaignId === cid);
export const myProductIds = (bid: string) => D_().products.filter((p) => p.brandId === bid).map((p) => p.id);
export const brandCamps = (bid: string) => { const ids = myProductIds(bid); return D_().campaigns.filter((c) => ids.includes(c.productId)); };
export const sellerCamps = (sid: string) => D_().campaigns.filter((c) => c.sellerId === sid);

/* ---- 등급 ---- */
export const gradeOf = (m: number) => GRADES.find((t) => m >= t.min)!;
export const gname = (s: Seller): Grade => gradeOf(s.m3Sales).g;
export const tierIdx = (g: string) => GRADES.findIndex((t) => t.g === g);
export function gradeBonusOf(s: Seller) { const t = GRADES.find((t) => t.g === gname(s)); return t ? t.bonus / 100 : 0; }
export const exGradeOf = (p: Product): Grade | undefined => p.exclusive && (p.exclusive.grade || (p.exclusive.min! >= 50000000 ? '다이아' : '플래티넘'));
export const exEligible = (p: Product, s: Seller) => tierIdx(gname(s)) > -1 && tierIdx(gname(s)) <= tierIdx(exGradeOf(p) || '');
export function netOf(c: Campaign) { return campOrders(c.id).filter((o) => o.status === 'PAID').reduce((a, o) => a + o.unit * o.qty, 0); }
export function bGmv(b: Brand) { const my = myProductIds(b.id); return (b.gmvBase || 0) + D_().campaigns.filter((c) => my.includes(c.productId)).reduce((a, c) => a + netOf(c), 0); }
export const bgradeOf = (v: number) => BGRADES.find((t) => v >= t.min)!;
export const bgname = (b: Brand): Grade => bgradeOf(bGmv(b)).g;
export function bDiscOf(b: Brand) { return BG_DISC[bgname(b)] || 0; }
export function dataPrice(s: Seller) { return DATA_PRICE[gname(s)] || 2; }

/* ---- 데모 노출 ---- */
export function hasReal(p: Product) { return !!(p && p.thumb && !String(p.thumb).startsWith('data:')); }
export function demoVisible(p: Product) { return !DEMO_REAL_ONLY || hasReal(p); }
export const realFirst = (a: Product, b: Product) => (hasReal(b) ? 1 : 0) - (hasReal(a) ? 1 : 0);

/* ---- 상품 옵션 · 재고 ---- */
export function optsOf(p: Product) {
	if (p.options && p.options.length) return p.options;
	const r = (v: number) => Math.round(v / 100) * 100;
	return [{ n: '1개', price: p.gp }, { n: '2개 세트 · 5% 추가 할인', price: r(p.gp * 2 * .95) }, { n: '3개 세트 · 10% 추가 할인', price: r(p.gp * 3 * .9) }];
}
export function soldQty(cid: string) { return campOrders(cid).filter((o) => o.status === 'PAID').reduce((a, o) => a + o.qty, 0); }
export function allocated(pid: string, exceptCid?: string) { return D_().campaigns.filter((c) => c.productId === pid && c.id !== exceptCid && ['SCHEDULE_CONFIRMED', 'LIVE'].includes(c.status)).reduce((a, c) => a + (c.qty || 0), 0); }
export function stockLeft(p: Product, exceptCid?: string) { return Math.max(0, (p.stock || 0) - allocated(p.id, exceptCid)); }
export const leftOf = (c: Campaign) => (c.qty || 0) - soldQty(c.id);

/* ---- 성장·매칭 ---- */
export function growthOf(s: Seller) { const r = s.recentLikes || []; if (r.length < 2) return 0; const h = Math.ceil(r.length / 2); const m = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length; return (m(r.slice(h)) / m(r.slice(0, h)) - 1) * 100; }
export function catFit(p: Product, s: Seller) { const g = Object.values(CATMAP).find((x) => x.includes(p.cat)); return !!g && g.includes(s.cat); }
export function autoMatches() {
	const out: { b: Brand; p: Product; s: Seller; growth: number; score: number }[] = [];
	D_().brands.filter((b) => b.autoPropose).forEach((b) => {
		D_().products.filter((p) => p.brandId === b.id && p.status === 'listed' && !p.exclusiveSellerId).forEach((p) => {
			const cands = D_().sellers.filter((s) => catFit(p, s) && !D_().campaigns.some((c) => c.productId === p.id && c.sellerId === s.id && !ACTIVE_BLOCKERS.includes(c.status)))
				.map((s) => ({ b, p, s, growth: growthOf(s), score: Math.round(growthOf(s) * 0.6 + (s.m3Sales / s.followers) / 10 + (s.hidden ? 0 : 5)) }))
				.sort((a, b) => b.score - a.score).slice(0, 2);
			out.push(...cands);
		});
	});
	return out.sort((a, b) => b.score - a.score);
}
/** 스케줄러 대행: 시작일 도래 → LIVE, 종료일 경과 → CLEARING */
export function autoTick() {
	let ch = false;
	D_().campaigns.forEach((c) => {
		if (c.status === 'SCHEDULE_CONFIRMED' && c.start && P(c.start) <= today()) { c.status = 'LIVE'; pushSys(c.id, '판매 시작 시각 도래 — 판매 링크 자동 활성화 (스케줄러)'); ch = true; }
		if (c.status === 'LIVE' && c.end && P(c.end) < today()) { c.status = 'CLEARING'; pushSys(c.id, `판매 기간 종료 (스케줄러) · 교환/환불 기간 시작 · 정산 예정 <b>${md(settleDue(c))}</b>`); ch = true; }
	});
	if (ch) save();
}

/* ---- 셀러리 포인트 ---- */
export function celEarned(who: string) {
	if (who[0] === 's') { const s = seller(who); return s ? Math.floor(s.m3Sales / CELERY_PER) : 0; }
	const b = brand(who); return b ? Math.floor(bGmv(b) / CELERY_PER) : 0;
}
export function celBal(who: string) { return celEarned(who) + (D_().celeryLedger || []).filter((e) => e.who === who).reduce((a, e) => a + e.delta, 0); }
export function celSpend(who: string, n: number, memo: string) {
	if (celBal(who) < n) { toast(`🥬 셀러리가 부족합니다 (보유 ${celBal(who)} / 필요 ${n}) — 셀러리 샵에서 충전하세요`); return false; }
	(D_().celeryLedger = D_().celeryLedger || []).push({ who, at: ymd(today()), delta: -n, memo }); return true;
}
export function passActive(ent: { celeryItems?: Record<string, string> } | null | undefined, id: string, days?: number) {
	const d = ent && ent.celeryItems && ent.celeryItems[id]; if (!d) return false; if (!days) return true;
	return (today().getTime() - P(d).getTime()) / DAY < days;
}
/** 브랜드 다이아·블랙: 데이터 열람 월 5회 무료 */
export function freeRefLeft(b: Brand) { const g = bgname(b); if (g !== '다이아' && g !== '블랙') return 0; const ym = ymd(today()).slice(0, 7); return Math.max(0, 5 - (((b.freeRefUsed || {})[ym]) || 0)); }
/** 데이터 열람 결제 — 0=무료 사용, 숫자=사용 🥬, false=잔액 부족 */
export function spendData(bid: string, s: Seller, memo: string): number | false {
	const b = brand(bid);
	if (freeRefLeft(b) > 0) { const ym = ymd(today()).slice(0, 7); b.freeRefUsed = { ...(b.freeRefUsed || {}), [ym]: ((((b.freeRefUsed || {})[ym]) || 0) + 1) }; return 0; }
	const pr = dataPrice(s); return celSpend(bid, pr, memo) ? pr : false;
}

/* ---- 샘플 정책 ---- */
export function sampleQuota(s: Seller) { const i = tierIdx(gname(s)); return i <= tierIdx('플래티넘') ? 5 : (i <= tierIdx('실버') ? 2 : 1); }
export function sampleUsed(s: Seller) { const ym = ymd(today()).slice(0, 7); return D_().campaigns.filter((c) => c.sellerId === s.id && !c.invited && !c.purchased && (c.createdAt || '').slice(0, 7) === ym).length; }
export function sampleLeft(s: Seller) { const q = sampleQuota(s); return Math.max(0, q + (s.sampleExtra || 0) - sampleUsed(s)); }
export function spOf(p: Product) { if (p.samplePolicy) return p.samplePolicy; const g: Grade = p.gp < 30000 ? '브론즈' : p.gp < 80000 ? '실버' : '골드'; return { freeGrade: g, buyMode: 'auto' as const, fixedPrice: 0, refund: false }; }
export function samplePrice(p: Product) { const sp = spOf(p); return sp.buyMode === 'fixed' && sp.fixedPrice ? sp.fixedPrice : Math.round(p.gp * (1 - p.rate) / 10) * 10; }
export function sampleSplit(price: number) { const cel = Math.floor(price / SAMPLE_CEL_WON); return { cel, cash: price - cel * SAMPLE_CEL_WON }; }
export function freeEligible(p: Product, s: Seller) { const i = tierIdx(gname(s)); return i > -1 && i <= tierIdx(spOf(p).freeGrade); }
export function hadFreeSample(p: Product, s: Seller) { return D_().campaigns.some((c) => c.productId === p.id && c.sellerId === s.id && !c.purchased && !c.invited && !['REJECTED', 'DECLINED'].includes(c.status)); }
export function sampleLine(p: Product) { const sp = spOf(p), pr = samplePrice(p), sl = sampleSplit(pr); return `${gfull(sp.freeGrade)} 이상 무상 1회 · 미달 시 ₩${fmt(pr)} 구매${sl.cel ? ` (${CEL} ${sl.cel}${sl.cash ? ' + ₩' + fmt(sl.cash) : ''})` : ''}${sp.buyMode === 'fixed' ? ' · 브랜드 지정가' : ''}${sp.refund ? ' · 판매 확정 시 환급' : ''}`; }
/** 인플루언서용 샘플 버튼 분기 */
export type SampleBtn = { kind: 'locked' | 'already' | 'free' | 'buy'; label: string; title?: string; price?: number };
export function sampleBtn(p: Product, sid: string): SampleBtn | null {
	const me = seller(sid); if (!me) return null;
	if (p.exclusiveSellerId && p.exclusiveSellerId !== sid) return { kind: 'locked', label: '독점 잠김' };
	const already = D_().campaigns.some((c) => c.sellerId === sid && c.productId === p.id && !ACTIVE_BLOCKERS.includes(c.status));
	if (already) return { kind: 'already', label: '진행 중' };
	const canFree = freeEligible(p, me) && !hadFreeSample(p, me) && sampleLeft(me) > 0;
	if (canFree) return { kind: 'free', label: '무상 샘플 요청' };
	return { kind: 'buy', label: `샘플 구매 ₩${fmt(samplePrice(p))}`, price: samplePrice(p), title: !freeEligible(p, me) ? '무상 기준 등급 미달' : hadFreeSample(p, me) ? '무상 샘플은 상품당 1회' : '이달 무상 한도 소진' };
}
/** 외부 판매 크롤링 추정 (가계산) */
export function estExternal(s: Seller, item: ExternalSale) { const eng = s.likesAvg / s.followers; const orders = s.followers * eng * 6 * 0.015; const mid = orders * item.price; return { lo: mid * 0.75, hi: mid * 1.25, orders: Math.round(orders) }; }

/* ---- 정산 ---- */
export function isRefBoost(c: Campaign) {
	const s = seller(c.sellerId); if (!s || !s.referredBy) return false;
	const list = D_().campaigns.filter((x) => x.sellerId === c.sellerId && DONE_STATES.includes(x.status)).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
	const idx = list.findIndex((x) => x.id === c.id); return idx > -1 && idx < REF_TIMES;
}
export function isBrandRefBoost(c: Campaign) {
	const p = prod(c.productId); const b = p && brand(p.brandId); if (!b || !b.referredBy) return false;
	const myP = myProductIds(b.id);
	const list = D_().campaigns.filter((x) => myP.includes(x.productId) && DONE_STATES.includes(x.status)).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
	const idx = list.findIndex((x) => x.id === c.id); return idx > -1 && idx < BREF_TIMES;
}
export interface Calc {
	gross: number; refund: number; net: number; sampleNet: number; pg: number; sf: number; gBonus: number; sfTotal: number; boost: number; refReward: number;
	rb: boolean; bb: boolean; bBoost: number; bReward: number; bDisc: number; pfGross: number; costs: number; pf: number; vat: number; pfNet: number; brandPay: number; paidCnt: number; refCnt: number;
}
export function calc(c: Campaign): Calc {
	const os = campOrders(c.id);
	const gross = os.filter((o) => o.status !== 'CANCELED').reduce((a, o) => a + o.unit * o.qty, 0);
	const refund = os.filter((o) => o.status === 'REFUNDED').reduce((a, o) => a + o.unit * o.qty, 0);
	const net = gross - refund;
	const p = prod(c.productId), s = seller(c.sellerId), b = brand(p.brandId);
	const rb = isRefBoost(c), bb = isBrandRefBoost(c);
	const sampleNet = os.filter((o) => o.sample && o.status === 'PAID').reduce((a, o) => a + o.unit * o.qty, 0);
	const pg = net * PG_RATE, sf = (net - sampleNet) * p.rate;
	const gBonus = (net - sampleNet) * gradeBonusOf(s);
	const boost = rb ? net * REF_BOOST : 0, refReward = rb ? net * REF_RATE : 0;
	const bBoost = bb ? net * BREF_DISC : 0, bReward = bb ? net * BREF_RATE : 0;
	const bDisc = net * bDiscOf(b);
	const pfGross = net * PLAT_RATE;
	const costs = gBonus + boost + refReward + bBoost + bReward + bDisc;
	const pf = pfGross - costs;
	const vat = pf > 0 ? pf - pf / 1.1 : 0;
	const pfNet = pf - vat;
	return { gross, refund, net, sampleNet, pg, sf, gBonus, sfTotal: sf + gBonus + boost, boost, refReward, rb, bb, bBoost, bReward, bDisc, pfGross, costs, pf, vat, pfNet,
		brandPay: net - pg - sf - pfGross + bBoost + bDisc,
		paidCnt: os.filter((o) => o.status === 'PAID').length, refCnt: os.filter((o) => o.status === 'REFUNDED').length };
}
export function sellerWht(s: Seller) { return s.settleInfo && s.settleInfo.type === 'biz' ? 0 : WHT; }
export function settleDue(c: Campaign) { return addD(P(c.end!), CLEAR_DAYS); }

/* ---- 스레드 ---- */
export function pushSys(cid: string, txt: string) { (D_().messages[cid] = D_().messages[cid] || []).push({ type: 'sys', txt, at: ymd(today()) }); }
export function pushChat(cid: string, role: 'seller' | 'brand' | 'admin', txt: string) {
	const msgs = D_().messages[cid] = D_().messages[cid] || [];
	msgs.push({ type: 'chat', role, txt, at: ymd(today()) });
	if (/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|카카오톡|kakao/i.test(txt)) {
		msgs.push({ type: 'warn', txt: '⚠ 연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.', at: ymd(today()) });
	}
}

/* ---- 기간 정책: 플래티넘 이상이 잡은 기간에는 플래티넘 이상만 진입 ---- */
export function periodHolders(pid: string, s: string, e: string, exceptCid?: string) {
	return D_().campaigns.filter((c) => c.productId === pid && c.id !== exceptCid && ['SCHEDULE_CONFIRMED', 'LIVE'].includes(c.status) && !(P(e) < P(c.start!) || P(s) > P(c.end!)));
}
export function isPriority(sl: Seller | undefined) { return !!sl && tierIdx(gname(sl)) > -1 && tierIdx(gname(sl)) <= tierIdx(PRIORITY_TIER); }
export function periodBlock(pid: string, s: string, e: string, exceptCid: string | undefined, sellerId: string) {
	const me = seller(sellerId); if (isPriority(me)) return null;
	const hit = periodHolders(pid, s, e, exceptCid).find((c) => isPriority(seller(c.sellerId)));
	return hit ? seller(hit.sellerId) : null;
}

/* ---- 고객 CS ---- */
export const csList = () => D_().cs || []; // 읽기 전용 — 렌더 중 상태 쓰기 금지 (쓰기는 actions.ts submitCS 에서)
export const csBrandId = (x: CS) => { const c = camp(x.cid); return c ? prod(c.productId).brandId : null; };
export const csOf = (bid: string) => csList().filter((x) => csBrandId(x) === bid);
export const csOpen = (bid: string) => csOf(bid).filter((x) => x.status === 'OPEN');

/* ---- 대기 카운트 ---- */
export function brandPending(bid: string) {
	const myP = myProductIds(bid);
	const cs = D_().campaigns.filter((c) => myP.includes(c.productId) && ['SAMPLE_REQUESTED', 'SAMPLE_APPROVED', 'SAMPLE_PURCHASED', 'SCHEDULE_PROPOSED'].includes(c.status));
	const xr = (D_().exclusiveReqs || []).filter((r) => myP.includes(r.productId) && r.status === 'PENDING');
	return { cs, xr, n: cs.length + xr.length };
}
export function sellerPending(sid: string) {
	const cs = D_().campaigns.filter((c) => c.sellerId === sid && ['INVITED', 'SAMPLE_SHIPPED', 'TESTING', 'SAMPLE_APPROVED', 'SAMPLE_PURCHASED'].includes(c.status));
	const info = (c: Campaign) => c.status === 'SAMPLE_APPROVED' || c.status === 'SAMPLE_PURCHASED';
	return { cs, n: cs.filter((c) => !info(c)).length, info: cs.filter(info).length };
}
export function dmUnreadN(role: 'brand' | 'seller', id: string) {
	const cs = role === 'brand' ? brandCamps(id) : sellerCamps(id);
	return cs.filter((c) => { const m = D_().messages[c.id] || []; const l = m[m.length - 1]; return l && l.type === 'chat' && l.role !== role; }).length;
}
export function counts() {
	const cs = D_().campaigns;
	return {
		seller: cs.filter((c) => ['INVITED', 'SAMPLE_SHIPPED', 'TESTING'].includes(c.status)).length,
		brand: cs.filter((c) => ['SAMPLE_REQUESTED', 'SCHEDULE_PROPOSED', 'SAMPLE_APPROVED'].includes(c.status)).length + (D_().exclusiveReqs || []).filter((r) => r.status === 'PENDING').length + csList().filter((x) => x.status === 'OPEN').length,
		admin: D_().products.filter((p) => p.status === 'pending').length + cs.filter((c) => c.status === 'CLEARING' && settleDue(c) <= today()).length
	};
}

/* ---- 고객 화면 ---- */
/** 링크 진입 방문: 같은 상품·카테고리의 타 인플루언서 판매 비노출 */
export function custVisible(c: Campaign) {
	if (!S.linkCtx) return true; const lc = camp(S.linkCtx.cid); if (!lc) return true;
	if (c.sellerId === lc.sellerId) return true;
	const lp = prod(lc.productId), p = prod(c.productId);
	return p.id !== lp.id && p.cat !== lp.cat;
}
export const isHomeFeat = (c: Campaign) => !!(c.homeFeatured && (today().getTime() - P(c.homeFeatured).getTime()) / DAY < 7);
export function viewersOf(cid: string) { const seed = [...String(cid)].reduce((a, ch) => a + ch.charCodeAt(0), 0); const t = Math.floor(Date.now() / 20000); return 14 + ((seed * 31 + t * 7) % 53); }
export function platformGmv() { return D_().brands.reduce((a, b) => a + (b.gmvBase || 0), 0) + D_().campaigns.reduce((a, c) => a + netOf(c), 0); }
export const cartN = () => (S.cart || []).reduce((a, x) => a + x.qty, 0);
export function cartLines() {
	return (S.cart || []).map((it, i) => {
		const c = camp(it.cid); if (!c) return null; const p = prod(c.productId), opts = optsOf(p), o = opts[Math.min(it.oi, opts.length - 1)];
		const left = leftOf(c); const ok = c.status === 'LIVE' && left >= it.qty;
		return { i, it, c, p, o, s: seller(c.sellerId), b: brand(p.brandId), left, ok, sum: o.price * it.qty };
	}).filter((x): x is NonNullable<typeof x> => !!x);
}
export const custOrders = () => S.cust ? D_().orders.filter((o) => o.buyerId === S.cust!.id && !o.sample).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })) : [];
/** 상세페이지 미리보기: 판매 링크 발급 전 상품을 고객 화면 레이아웃으로 (id 'p:p1') */
export function storeCamp(cid: string, role: string, actingSeller: string): Campaign & { preview?: boolean } | undefined {
	if (cid.startsWith('p:')) {
		const pid = cid.slice(2), p = prod(pid); if (!p) return undefined;
		const sid = role === 'seller' ? actingSeller : (D_().campaigns.find((c) => c.productId === pid) || {} as Campaign).sellerId || D_().sellers.find((x) => !x.hidden)!.id;
		return { id: cid, productId: pid, sellerId: sid, status: 'LIVE' as Status, qty: p.stock || 0, preview: true, createdAt: '' };
	}
	return camp(cid);
}
export const statusLabel = (st: Status) => st;
