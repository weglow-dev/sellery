/* ============ 액션 (js/80-actions.js) — DOM 없이 데이터만 바꾼다. 화면은 반응형으로 따라온다. ============ */
import { S, D_, save, resetData } from './state.svelte';
import { toast, openModal, closeModal, go } from './ui.svelte';
import {
	brand, camp, campOrders, celBal, celSpend, gname, hadFreeSample, freeEligible, sampleLeft, sampleQuota, samplePrice, sampleSplit, spOf, seller, prod,
	passActive, periodBlock, stockLeft, pushSys, pushChat, settleDue, calc, sellerWht, spendData, freeRefLeft, bgname, autoMatches, optsOf, soldQty, leftOf,
	cartLines, csList, myProductIds, dataPrice
} from './helpers';
import { ACTIVE_BLOCKERS, BREF_TIMES, CLEAR_DAYS, KAKAO_DEMO, KAKAO_JS_KEY, PLAT_RATE, PRIORITY_TIER, SAMPLE_CEL_WON, SHOP, TEST_DAYS, TOPUP, WHT, BUYER_NAMES, COURIERS } from './constants';
import { CEL, gfull } from './icons';
import { addD, esc, fmt, md, P, strip, today, ymd } from './util';
import { persistCart, persistCust, persistSession } from './storage';
import type { Campaign, Option, Product, SamplePolicy, Status } from './types';

const nextId = (prefix: string) => prefix + D_().seq++;
export function transition(cid: string, st: Status, sysTxt?: string) { const c = camp(cid)!; c.status = st; if (sysTxt) pushSys(cid, sysTxt); save(); }

/* ---------- 세션 ---------- */
export function logout() { persistSession(null); S.session = null; }
export function setSeller(id: string) { S.actingSeller = id; }
export function setBrand(id: string) { S.actingBrand = id; }
export function reset() { resetData(); toast('초기화 완료'); }

/* ---------- 인플루언서: 샘플 ---------- */
export function reqSample(pid: string) {
	const p = prod(pid), me = seller(S.actingSeller);
	if (p.exclusiveSellerId && p.exclusiveSellerId !== S.actingSeller) { toast('이 상품은 독점 인플루언서가 확정되어 샘플 요청이 제한됩니다'); return; }
	if (!freeEligible(p, me)) { toast(`무상 샘플은 ${spOf(p).freeGrade} 등급 이상 — 샘플 구매로 진행할 수 있어요`); openModal('sampleBuy', { pid }); return; }
	if (hadFreeSample(p, me)) { toast('이 상품의 무상 샘플은 이미 받았어요 (상품당 1회) — 샘플 구매로 진행'); openModal('sampleBuy', { pid }); return; }
	if (sampleLeft(me) <= 0) { toast(`이번 달 무상 샘플 한도를 모두 사용했어요 (한도 ${sampleQuota(me)}회) — 샘플 구매로 진행`); openModal('sampleBuy', { pid }); return; }
	const id = nextId('c');
	D_().campaigns.push({ id, sellerId: S.actingSeller, productId: pid, status: 'SAMPLE_REQUESTED', createdAt: ymd(today()) });
	pushSys(id, `인플루언서 <b>${me.name}(${me.handle})</b>가 샘플을 요청했습니다`);
	closeModal(); save(); go.camp(id); toast('샘플 요청 완료 — 브랜드 승인 대기');
}
export function confirmSampleBuy(pid: string, method: 'cash' | 'cel') {
	const p = prod(pid), me = seller(S.actingSeller); const pr = samplePrice(p), sp = sampleSplit(pr);
	let paid = { price: pr, cel: 0, cash: pr, method: 'cash' as 'cash' | 'cel' };
	if (method === 'cel') { if (!celSpend(S.actingSeller, sp.cel, `샘플 구매 · ${p.name} (₩${fmt(sp.cel * SAMPLE_CEL_WON)} 상당)`)) return; paid = { price: pr, cel: sp.cel, cash: sp.cash, method: 'cel' }; }
	const id = nextId('c');
	D_().campaigns.push({ id, sellerId: S.actingSeller, productId: pid, status: 'SAMPLE_PURCHASED', createdAt: ymd(today()), purchased: true, samplePaid: paid });
	D_().orders.push({ id: nextId('o'), campaignId: id, buyer: `${me.name} (샘플 구매)`, qty: 1, unit: pr, status: 'PAID', at: ymd(today()), sample: true });
	pushSys(id, `🧾 인플루언서 <b>${me.name}(${me.handle})</b>가 샘플을 <b>구매</b>했습니다 · ₩${fmt(pr)}${paid.cel ? ` (${CEL} ${paid.cel} + ₩${fmt(paid.cash)})` : ' (현금)'} · 브랜드는 일반 판매와 동일하게 정산${spOf(p).refund ? ' · 판매 확정 시 구매액 환급' : ''}`);
	closeModal(); save(); go.camp(id); toast('샘플 구매 완료 — 브랜드 발송 대기');
}
export function reqExclusive(pid: string) {
	(D_().exclusiveReqs = D_().exclusiveReqs || []).push({ id: nextId('x'), productId: pid, sellerId: S.actingSeller, status: 'PENDING', at: ymd(today()) });
	closeModal(); save(); toast('독점권 신청 완료 — 브랜드에 내 프로필이 공개되고 승인 대기 상태가 됩니다');
}
export function buyDataPass(pid: string) {
	if (!celSpend(S.actingSeller, 2, '매출 데이터 확인권 구매')) return;
	const me = seller(S.actingSeller); me.celeryItems = { ...(me.celeryItems || {}), datapass: ymd(today()) };
	save(); openModal('productDetail', { pid }); toast('✓ 매출 데이터 확인권 적용 — 전체 실적이 열렸습니다 (−2 🥬)');
}

/* ---------- 브랜드: 데이터 열람 · 제안 · 독점 ---------- */
export function unlockSellerData(sid: string) {
	const b = S.actingBrand; const s = seller(sid);
	const pr = spendData(b, s, `데이터 확인 · ${s.name} ${s.handle} (${gname(s)})`); if (pr === false) return;
	const m = D_().brandDataUnlocks = D_().brandDataUnlocks || {}; (m[b] = m[b] || []).push(sid);
	save(); toast(pr === 0 ? `브랜드 ${bgname(brand(b))} 등급 혜택 — 무료 열람 (이달 ${freeRefLeft(brand(b))}회 남음)` : `🥬 ${pr} 사용 — ${s.name}님의 성과 데이터가 열렸습니다`);
}
export function unlockRef(sid: string, thenInvite = false) {
	const s = seller(sid);
	const pr = spendData(S.actingBrand, s, `익명 레퍼런스 열람 · ○○○ 인플루언서 (${gname(s)})`); if (pr === false) return;
	(D_().unlockedRefs = D_().unlockedRefs || []).push(sid);
	closeModal(); save(); toast(pr === 0 ? '브랜드 등급 혜택 — 무료 열람. 바로 제안해보세요' : `🥬 ${pr} 사용 — 레퍼런스 상세 지표가 공개되었습니다`);
	if (thenInvite) openModal('invite', { sid });
}
/** 홈 TOP5 행 클릭: 공개·열람 완료 → 바로 제안 / 비공개 → 구매 확인 */
export function topSeller(sid: string) {
	const s = seller(sid); const un = (D_().unlockedRefs || []).includes(sid);
	if (!s.hidden || un) { openModal('invite', { sid }); return; }
	openModal('topSeller', { sid });
}
export function confirmInvite(sid: string, pid: string, msg: string) {
	const p = prod(pid);
	if (p.exclusiveSellerId && p.exclusiveSellerId !== sid) { toast('이 상품은 독점 인플루언서가 확정되어 다른 인플루언서에게 제안할 수 없습니다'); return; }
	const tg = gname(seller(sid));
	if ((tg === '다이아' || tg === '블랙') && !celSpend(S.actingBrand, 10, `${tg} 인플루언서 제안 · ${p.name}`)) return;
	const id = nextId('c'); const celUsed = (tg === '다이아' || tg === '블랙') ? 10 : 0;
	D_().campaigns.push({ id, sellerId: sid, productId: pid, status: 'INVITED', createdAt: ymd(today()), invited: true, celUsed });
	pushSys(id, `브랜드 <b>${brand(S.actingBrand).name}</b>가 <b>${p.name}</b> 판매를 직접 제안했습니다 · 인플루언서 수락 대기`);
	if (msg) pushChat(id, 'brand', msg);
	closeModal(); save(); go.camp(id); toast(`${seller(sid).hidden ? '○○○ 인플루언서' : seller(sid).name + '님'}에게 제안 발송 — 수락 대기`);
}
export function acceptInvite(cid: string) {
	const c = camp(cid)!, s = seller(c.sellerId), p = prod(c.productId);
	if (p.exclusiveSellerId && p.exclusiveSellerId !== c.sellerId) { toast('이 상품은 다른 인플루언서의 독점권이 확정되어 진행할 수 없습니다'); return; }
	if (p.status !== 'listed') { toast('현재 노출 중단된 상품입니다 — 브랜드에 문의하세요'); return; }
	transition(cid, 'SAMPLE_APPROVED', `인플루언서가 제안을 <b>수락</b>했습니다 · 샘플 발송 단계로 이동 (배송지 전달됨)${s.hidden ? ` · 🔓 익명 인플루언서 신원 공개 — <b>${esc(s.name)} ${s.handle}</b>` : ''}`);
	toast('제안 수락 — 브랜드가 샘플을 발송하면 운송장이 표시됩니다');
}
export function declineInvite(cid: string) {
	const c = camp(cid)!, p = prod(c.productId), b = brand(p.brandId);
	if (c.celUsed) { (D_().celeryLedger = D_().celeryLedger || []).push({ who: b.id, at: ymd(today()), delta: c.celUsed, memo: `제안 거절 환급 · ${p.name}` }); c.celRefunded = c.celUsed; }
	transition(cid, 'DECLINED', `인플루언서가 제안을 <b>거절</b>했습니다${c.celRefunded ? ` · 제안권 ${CEL} ${c.celRefunded} 브랜드에 환급` : ''}`);
	toast('제안을 거절했습니다');
}
export function approveExcl(rid: string) { const r = D_().exclusiveReqs.find((x) => x.id === rid); if (!r) return; r.status = 'APPROVED'; prod(r.productId).exclusiveSellerId = r.sellerId; save(); toast(`독점권 승인 — ${seller(r.sellerId).name}(${seller(r.sellerId).handle})만 이 상품을 진행할 수 있습니다`); }
export function rejectExcl(rid: string) { const r = D_().exclusiveReqs.find((x) => x.id === rid); if (!r) return; r.status = 'REJECTED'; save(); toast('독점권 신청을 거절했습니다'); }

/* ---------- 인플루언서: 채널 · 정산정보 · 프로필 ---------- */
export function saveChannel(chId: string | null, v: { platform: string; handle: string; url: string; followers: number }) {
	const me = seller(S.actingSeller); if (!v.handle) { toast('계정 핸들을 입력해주세요'); return; }
	me.channels = me.channels || [];
	if (chId) {
		const ch = me.channels.find((c) => c.id === chId)!; const changed = ch.handle !== v.handle || ch.platform !== v.platform;
		Object.assign(ch, { platform: v.platform as never, handle: v.handle, url: v.url, followers: v.followers });
		if (changed) { ch.verified = false; delete ch.vcode; }
		closeModal(); save(); toast(changed ? '채널 수정됨 — 사칭 방지를 위해 재인증이 필요합니다' : '채널 수정 완료');
	} else {
		me.channels.push({ id: nextId('ch'), platform: v.platform as never, handle: v.handle, url: v.url, followers: v.followers, verified: false });
		closeModal(); save(); toast('채널 추가됨 — 인증을 진행해주세요');
	}
}
export function delCh(chId: string) { const me = seller(S.actingSeller); const ch = (me.channels || []).find((c) => c.id === chId); if (ch && ch.primary) { toast('메인 SNS 채널은 삭제할 수 없습니다 — 먼저 다른 채널을 메인으로 설정하세요'); return; } me.channels = (me.channels || []).filter((c) => c.id !== chId); save(); toast('채널 삭제됨'); }
export function setPrimaryCh(chId: string) {
	const me = seller(S.actingSeller); const ch = (me.channels || []).find((c) => c.id === chId);
	if (!ch || !ch.verified) { toast('인증된 채널만 메인 SNS로 설정할 수 있습니다'); return; }
	me.channels!.forEach((c) => (c.primary = c.id === chId)); me.platform = ch.platform; me.handle = ch.handle; if (ch.followers) me.followers = ch.followers;
	save(); toast(`메인 SNS 변경 — ${ch.handle} (갤러리·필터에 이 채널 기준으로 노출됩니다)`);
}
export function openVerify(chId: string) { const me = seller(S.actingSeller); const ch = (me.channels || []).find((c) => c.id === chId); if (!ch) return; if (!ch.vcode) { ch.vcode = 'SLRY-' + Math.random().toString(36).slice(2, 6).toUpperCase(); save(); } openModal('verify', { chId }); }
export function confirmVerify(chId: string) { const me = seller(S.actingSeller); const ch = (me.channels || []).find((c) => c.id === chId); if (!ch) return; ch.verified = true; delete ch.vcode; closeModal(); save(); toast(`✓ ${ch.handle} 인증 완료 — 이제 브랜드에 노출됩니다 (시뮬레이션)`); }
export function copyText(text: string, ok: string) { try { navigator.clipboard.writeText(text); toast(ok); } catch { toast('복사 실패 — ' + text); } }
export const copyRef = (code: string) => copyText(`셀러리에서 같이 판매해요! 가입할 때 추천 코드 ${code} 입력하면 첫 5회 판매 수수료 +1% → sellery.co.kr`, '추천 메시지 복사됨 — DM으로 공유하세요');
export const copyBrandRef = (code: string) => copyText(`셀러리에 브랜드 입점하세요! 가입 시 추천 코드 ${code} 입력하면 첫 ${BREF_TIMES}회 판매 플랫폼 수수료 −1%p → sellery.co.kr/brand`, '브랜드 추천 메시지 복사됨');
export const copyLink = (url: string) => copyText('https://' + url, '링크 복사됨');
export function saveSettleInfo(v: { type: 'personal' | 'biz'; bank: string; account: string; holder: string; bizNo: string }) {
	const me = seller(S.actingSeller);
	if (v.bank === '선택' || !v.account || !v.holder) { toast('은행·계좌번호·예금주를 입력해주세요'); return; }
	if (v.type === 'biz' && !v.bizNo) { toast('사업자 정산은 사업자등록번호가 필요합니다'); return; }
	me.settleInfo = { ...(me.settleInfo || {}), ...v }; save(); toast('정산 정보 저장 완료 — 다음 정산부터 이 계좌로 지급됩니다');
}
export function saveBrandInfo(v: { manager: string; email: string; bank: string; account: string; holder: string; bizNo: string; mailOrder: string }) {
	const b = brand(S.actingBrand); b.manager = v.manager || b.manager; b.email = v.email || b.email;
	if (v.bank === '선택' || !v.account || !v.holder || !v.bizNo) { toast('은행·계좌·예금주·사업자등록번호를 입력해주세요'); save(); return; }
	b.settleInfo = { ...(b.settleInfo || {}), bank: v.bank, account: v.account, holder: v.holder, bizNo: v.bizNo, mailOrder: v.mailOrder }; save(); toast('브랜드 정보 저장 완료');
}
/** 파일 → 정사각 data URL */
export function fileToSquareDataURL(f: File, sz: number, cb: (url: string) => void) {
	const img = new Image();
	img.onload = () => { const cv = document.createElement('canvas'); cv.width = sz; cv.height = sz; const x = cv.getContext('2d')!; const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, sz, sz); cb(cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', .85)); URL.revokeObjectURL(img.src); };
	img.src = URL.createObjectURL(f);
}
export function fileToDataURL(f: File, maxW: number, cb: (url: string) => void) {
	const img = new Image();
	img.onload = () => { const sc = Math.min(1, maxW / img.width); const w = Math.round(img.width * sc), h = Math.round(img.height * sc); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(img, 0, 0, w, h); cb(cv.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', .8)); URL.revokeObjectURL(img.src); };
	img.src = URL.createObjectURL(f);
}
export function setAvatar(url: string) { seller(S.actingSeller).img = url; save(); toast('프로필 사진이 등록되었습니다'); }
export function setBrandLogo(url: string) { brand(S.actingBrand).logo = url; save(); toast('브랜드 로고가 등록되었습니다'); }
export function setBizDoc(name: string, who: 'seller' | 'brand') { const e = who === 'seller' ? seller(S.actingSeller) : brand(S.actingBrand); e.settleInfo = { ...(e.settleInfo || {}), bizDoc: name }; save(); toast('사업자등록증 첨부 완료 (프로토타입: 파일명만 저장)'); }

/* ---------- 셀러리 샵 ---------- */
export function buyItem(id: string) {
	const isBrand = S.role === 'brand'; const who = isBrand ? S.actingBrand : S.actingSeller; const ent = isBrand ? brand(who) : seller(who);
	const it = SHOP[isBrand ? 'brand' : 'seller'].find((x) => x.id === id); if (!it || typeof it.price !== 'number') return;
	if (!celSpend(who, it.price, `${it.name} 구매`)) return;
	ent.celeryItems = { ...(ent.celeryItems || {}), [id]: ymd(today()) };
	if (id === 'boost') { const p = D_().products.find((x) => x.brandId === who && x.status === 'listed'); if (p) { p.boosted = true; p.celeryItems = { ...(p.celeryItems || {}), boost: ymd(today()) }; } }
	if (id === 'fastreview') D_().products.filter((x) => x.brandId === who && x.status === 'pending').forEach((x) => { x.status = 'listed'; x.stock = x.stock || 500; });
	if (id === 'homefeature') {
		const cs = D_().campaigns.filter((c) => ['LIVE', 'SCHEDULE_CONFIRMED'].includes(c.status) && (isBrand ? prod(c.productId).brandId === who : c.sellerId === who));
		if (!cs.length) { toast('노출할 진행 중·예정 판매가 없어 적용되지 않았습니다 (셀러리는 차감되지 않음)'); D_().celeryLedger.pop(); save(); return; }
		cs.forEach((c) => (c.homeFeatured = ymd(today())));
	}
	save(); toast(`✓ ${it.name} 구매 완료 (−${it.price} 🥬)`);
}
export function topup(n: number) {
	const who = S.role === 'brand' ? S.actingBrand : S.actingSeller; const t = TOPUP.find((x) => x.n === n); if (!t) return;
	(D_().celeryLedger = D_().celeryLedger || []).push({ who, at: ymd(today()), delta: t.n, won: t.won, memo: `셀러리 충전 (₩${fmt(t.won)} 시뮬 결제)` }); save(); toast(`🥬 ${t.n} 충전 완료 (시뮬레이션)`);
}

/* ---------- 캠페인 진행 ---------- */
export function approveSample(cid: string) { transition(cid, 'SAMPLE_APPROVED', '브랜드가 샘플 요청을 <b>승인</b>했습니다 · 배송지 전달됨'); toast('샘플 승인'); }
export function rejectSample(cid: string) { transition(cid, 'REJECTED', '브랜드가 샘플 요청을 거절했습니다'); toast('거절 처리'); }
export function shipSample(cid: string, tracking: string) {
	const t = tracking.trim() || '6890-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000);
	camp(cid)!.tracking = t; transition(cid, 'SAMPLE_SHIPPED', `샘플 발송 · 운송장 <b>${t}</b>`); toast('발송 처리 완료');
}
export function receiveSample(cid: string) { const c = camp(cid)!; c.testDue = ymd(addD(today(), TEST_DAYS)); transition(cid, 'TESTING', `인플루언서가 샘플을 수령했습니다 · 테스트 기한 <b>${md(P(c.testDue))}</b>`); toast('수령 확인 — 테스트 시작'); }
export function passCamp(cid: string) { transition(cid, 'PASSED', '인플루언서가 테스트 후 <b>패스</b>를 선택했습니다'); toast('패스 처리'); }
export function proposeSchedule(cid: string, st: string, len: number, qty: number) {
	if (!st) { toast('시작일을 선택하세요'); return; }
	const en = ymd(addD(P(st), len - 1)); const c = camp(cid)!;
	const blk = periodBlock(c.productId, st, en, cid, c.sellerId);
	if (blk) { toast(`⚠ 이 기간은 ${gname(blk)} 등급 인플루언서가 선점했습니다 — ${strip(gfull(PRIORITY_TIER)).trim()} 이상만 함께 판매할 수 있어요. 다른 날짜를 선택해주세요`); return; }
	if (qty <= 0) { toast('배정 재고를 입력하세요'); return; }
	const sl = stockLeft(prod(c.productId), cid); if (qty > sl) { toast(`⚠ 배정 가능한 재고를 초과했어요 (잔여 ${fmt(sl)}개) — 수량을 줄여주세요`); return; }
	c.propStart = st; c.propEnd = en; c.propQty = qty; closeModal();
	if (c.regongu && passActive(seller(c.sellerId), 'regongu', 30)) {
		c.start = st; c.end = en; c.qty = qty;
		transition(cid, 'SCHEDULE_CONFIRMED', `⚡ <b>재판매 우선권</b> — 일정 <b>${md(P(st))} – ${md(P(en))}</b> · 재고 ${fmt(qty)} 즉시 확정 (브랜드 승인 생략)`); toast('재판매 우선권 — 일정 즉시 확정'); return;
	}
	transition(cid, 'SCHEDULE_PROPOSED', `인플루언서가 판매 일정을 제안했습니다 · <b>${md(P(st))} – ${md(P(en))}</b> · 재고 ${fmt(qty)}`); toast('일정 제안 완료 — 브랜드 승인 대기');
}
export function confirmSchedule(cid: string) {
	const c = camp(cid)!;
	const blk2 = periodBlock(c.productId, c.propStart!, c.propEnd!, cid, c.sellerId);
	if (blk2) { toast(`⚠ 제안 이후 ${gname(blk2)} 등급 인플루언서가 이 기간을 선점했어요 — 반려하고 재제안을 요청하세요`); return; }
	const sl = stockLeft(prod(c.productId), cid); if (c.propQty! > sl) { toast(`⚠ 잔여 재고(${fmt(sl)}개)보다 많은 수량입니다 — 재고를 늘리거나 반려하세요`); return; }
	c.start = c.propStart; c.end = c.propEnd; c.qty = c.propQty;
	transition(cid, 'SCHEDULE_CONFIRMED', `브랜드가 일정을 <b>승인</b>했습니다 · ${md(P(c.start!))} – ${md(P(c.end!))} 기간 확정`); toast('일정 확정 — 캘린더 잠금');
}
export function rejectSchedule(cid: string) { transition(cid, 'TESTING', '브랜드가 일정을 반려했습니다 · 다른 기간으로 재제안해주세요'); toast('반려 — 인플루언서 재제안 대기'); }
export function goLive(cid: string) { const c = camp(cid)!; if (P(c.start!) > today()) { c.start = ymd(today()); if (P(c.end!) < P(c.start)) c.end = ymd(addD(today(), 4)); } transition(cid, 'LIVE', '판매 링크 활성화 — <b>판매 시작</b>'); toast('판매 LIVE! 링크가 활성화되었습니다'); }
export function simSell(cid: string, n: number) {
	const c = camp(cid)!, p = prod(c.productId);
	for (let i = 0; i < n; i++) D_().orders.push({ id: nextId('o'), campaignId: cid, buyer: BUYER_NAMES[Math.floor(Math.random() * 8)], qty: Math.random() < .25 ? 2 : 1, unit: p.gp, status: 'PAID', at: ymd(today()) });
	save(); toast(`주문 ${n}건 발생 (시뮬레이션)`);
}
export function endCamp(cid: string) {
	const c = camp(cid)!; c.end = ymd(today());
	transition(cid, 'CLEARING', `판매 종료 · 교환/환불 기간 시작 (정산 예정 <b>${md(settleDue(c))}</b>)`);
	const po = D_().autoPO; if (po && po.on) { pushSys(cid, `📦 최종 발주서 자동 발송 완료 — ${esc(po.email)} (자동 발주)`); save(); }
	toast('판매 종료 — D+21 클리어링 시작' + (po && po.on ? ' · 최종 발주서 자동 발송됨' : ''));
}
export function ffwd(cid: string) { const c = camp(cid)!; c.end = ymd(addD(today(), -CLEAR_DAYS)); pushSys(cid, '⏩ (시뮬레이션) 3주 경과 — 정산 기준일 도래'); save(); toast('3주 경과 처리 — 관리자 탭에서 정산 실행 가능'); }
export function refund(oid: string) {
	const o = D_().orders.find((x) => x.id === oid); if (!o || o.status !== 'PAID') return;
	if (camp(o.campaignId)!.status === 'SETTLED') { toast('정산이 완료된 판매의 주문은 환불 처리할 수 없습니다 — 별도 CS 정산 조정 필요'); return; }
	if (o.sample) { toast('인플루언서 샘플 구매분은 브랜드 정산에 포함된 건이라 여기서 환불하지 않습니다 — 캠페인 스레드에서 협의'); return; }
	o.status = 'REFUNDED'; pushSys(o.campaignId, `환불 처리 · ${o.buyer} · ₩${fmt(o.unit * o.qty)} (정산액 차감)`); save(); toast('환불 처리 — 정산 기준액에서 차감됨');
}
export function runSettle(cid: string, quiet = false) {
	const c = camp(cid)!, k = calc(c), p = prod(c.productId), sl = seller(c.sellerId);
	c.status = 'SETTLED'; c.settledAt = ymd(today());
	if (+c.id.slice(1) >= 100) sl.m3Sales = (sl.m3Sales || 0) + k.net;
	let refundCash = 0;
	if (c.samplePaid && spOf(p).refund && !c.sampleRefunded) { const sp = c.samplePaid; if (sp.cel) (D_().celeryLedger = D_().celeryLedger || []).push({ who: c.sellerId, at: ymd(today()), delta: sp.cel, memo: `샘플 구매 환급 · ${p.name}` }); refundCash = sp.cash || 0; c.sampleRefunded = true; pushSys(cid, `🎁 샘플 구매액 환급 — ${sp.cel ? `${CEL} ${sp.cel}` : ''}${sp.cel && refundCash ? ' + ' : ''}${refundCash ? '₩' + fmt(refundCash) : ''} (판매 확정 조건 충족)`); }
	const bz = brand(p.brandId); const holdS = !(sl.settleInfo && sl.settleInfo.account), holdB = !(bz.settleInfo && bz.settleInfo.account);
	D_().settlements.push({ at: ymd(today()), cid, title: `${p.name} · ${sl.handle}`, net: k.net, brandPay: k.brandPay, sellerPay: k.sfTotal * (1 - sellerWht(sl)) + refundCash, platFee: k.pf, pfNet: k.pfNet, holdS, holdB });
	if (holdS || holdB) pushSys(cid, `⏸ 지급 보류 — ${[holdS ? '인플루언서' : '', holdB ? '브랜드' : ''].filter(Boolean).join('·')} 정산 계좌 미등록. 마이페이지에서 정산 정보를 등록하면 다음 지급 배치에 포함됩니다.`);
	if (k.refReward > 0) { const refId = sl.referredBy!; (D_().refEarnings = D_().refEarnings || []).push({ at: ymd(today()), referrerId: refId, fromSellerId: c.sellerId, campaignId: cid, amt: k.refReward }); pushSys(cid, `추천 보상 지급 — 추천인 ${seller(refId).name}에게 확정 매출의 2% ₩${fmt(k.refReward)} (플랫폼 부담)`); }
	if (k.bReward > 0) { const rb = bz.referredBy!; (D_().brandRefEarnings = D_().brandRefEarnings || []).push({ at: ymd(today()), referrerId: rb, fromBrandId: p.brandId, campaignId: cid, amt: k.bReward }); pushSys(cid, `브랜드 추천 보상 — 추천 브랜드 ${brand(rb).name}에게 확정 매출의 1% ₩${fmt(k.bReward)} · 신규 브랜드 수수료 −1%p 적용 (플랫폼 부담)`); }
	pushSys(cid, `<b>정산 완료</b> · 브랜드 ₩${fmt(k.brandPay)}${k.bb ? ' (추천 할인 −1%p 포함)' : ''}${k.bDisc ? ' (등급 할인 포함)' : ''} · 인플루언서 ₩${fmt(k.sfTotal)}${k.gBonus ? ` (${gname(sl)} 보너스 포함)` : ''}${k.rb ? ' (추천 부스트 +1%p 포함)' : ''} → ${sellerWht(sl) ? `원천징수 3.3% 공제 후 ₩${fmt(k.sfTotal * (1 - WHT))}` : '사업자 정산(세금계산서) ₩' + fmt(k.sfTotal)} · 명세 발행`);
	save(); if (!quiet) toast('정산 실행 완료 — 양측 지급 및 명세 발행');
}
export function runSettleAll() { const list = D_().campaigns.filter((c) => c.status === 'CLEARING' && settleDue(c) <= today()); list.forEach((c) => runSettle(c.id, true)); toast(`일괄 정산 ${list.length}건 완료`); }
export function regongu(cid: string) {
	const old = camp(cid)!; const id = nextId('c'); const prio = passActive(seller(old.sellerId), 'regongu', 30);
	D_().campaigns.push({ id, sellerId: old.sellerId, productId: old.productId, status: 'TESTING', testDue: ymd(addD(today(), TEST_DAYS)), createdAt: ymd(today()), regongu: true });
	pushSys(id, `🔁 <b>재판매</b> — 지난 판매(${cid.toUpperCase()}) 성과 기반. 샘플 단계 생략, 일정 제안부터 시작합니다${prio ? ' · <b>재판매 우선권</b> 보유: 일정 제안 시 즉시 확정' : ''}`);
	save(); go.camp(id); toast('재판매 캠페인 생성 — 일정 제안부터 시작');
}
export function sendChat(cid: string, text: string) { const t = text.trim(); if (!t) return; pushChat(cid, S.role === 'seller' ? 'seller' : 'brand', t); save(); }
/** 실시간 판매 시뮬레이션 (3.5초마다 주문) */
let liveTimer: ReturnType<typeof setInterval> | null = null;
export function toggleLive() {
	if (liveTimer) { clearInterval(liveTimer); liveTimer = null; S.ui.liveSim = false; toast('실시간 시뮬레이션 중지'); return; }
	liveTimer = setInterval(() => {
		const ls = D_().campaigns.filter((c) => c.status === 'LIVE'); if (!ls.length) return;
		if (Math.random() < .8) { const c = ls[Math.floor(Math.random() * ls.length)]; const p = prod(c.productId); D_().orders.push({ id: nextId('o'), campaignId: c.id, buyer: BUYER_NAMES[Math.floor(Math.random() * 8)], qty: Math.random() < .2 ? 2 : 1, unit: p.gp, status: 'PAID', at: ymd(today()) }); save(); }
	}, 3500);
	S.ui.liveSim = true; toast('실시간 판매 시뮬레이션 시작 — 3~4초마다 주문 발생');
}

/* ---------- 브랜드: 주문 · 발주 · 송장 ---------- */
export function dlCSV(name: string, rows: (string | number)[][]) {
	const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
	const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
const brandCids = () => { const myP = myProductIds(S.actingBrand); return D_().campaigns.filter((c) => myP.includes(c.productId)).map((c) => c.id); };
export function saveTrackOne(oid: string, courier: string, no: string) { const o = D_().orders.find((x) => x.id === oid); if (!o) return; if (!no.trim()) { toast('운송장 번호를 입력하세요'); return; } o.tracking = no.trim(); o.courier = courier; closeModal(); save(); toast('운송장 저장 — 배송중 처리 (구매자 알림은 실서비스에서 자동 발송)'); }
export function trackCSVTemplate() { const cids = brandCids(); const rows: (string | number)[][] = [['주문번호', '운송장번호']]; D_().orders.filter((o) => cids.includes(o.campaignId) && o.status === 'PAID' && !o.tracking).forEach((o) => rows.push([o.id.toUpperCase(), ''])); dlCSV(`송장양식_${ymd(today())}.csv`, rows); toast(`송장 양식 다운로드 — 미발송 ${rows.length - 1}건, 운송장번호 채워서 업로드하세요`); }
export function applyTrackCSV(text: string) {
	const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((x) => x.trim()); let n = 0;
	lines.forEach((ln) => { const cells = ln.split(/[,\t]/).map((x) => x.replace(/^"|"$/g, '').trim()); if (cells.length < 2 || !cells[1] || /주문번호/.test(cells[0])) return; const o = D_().orders.find((x) => x.id.toUpperCase() === cells[0].toUpperCase()); if (o && o.status === 'PAID') { o.tracking = cells[1]; n++; } });
	save(); toast(n ? `✓ 송장 ${n}건 적용 완료 — 배송중 처리` : '매칭된 주문이 없습니다 — 주문번호 열을 확인하세요');
}
export function poCSV() {
	const cids = brandCids(); const os = D_().orders.filter((o) => cids.includes(o.campaignId));
	const rows: (string | number)[][] = [['주문번호', '일자', '상품', '인플루언서', '구매자', '수량', '단가', '금액', '상태']];
	os.forEach((o) => { const c = camp(o.campaignId)!, p = prod(c.productId); rows.push([o.id.toUpperCase(), o.at, p.name, seller(c.sellerId).handle, o.buyer, o.qty, o.unit, o.unit * o.qty, o.status === 'PAID' ? '결제완료' : '환불']); });
	dlCSV(`발주서_${brand(S.actingBrand).name}_${ymd(today())}.csv`, rows); toast(`발주서 CSV 다운로드 — 주문 ${os.length}건`);
}
export function poEmail(email: string) { toast(`✉ 발주서가 ${email || (D_().autoPO || {}).email || 'logistics@brand.co'}(으)로 발송되었습니다 (시뮬레이션)`); }
export function saveAutoPO(email: string) { const cur = D_().autoPO || { on: false, email: '' }; D_().autoPO = { on: !cur.on, email: email || 'logistics@brand.co' }; save(); toast(D_().autoPO!.on ? `자동 발주 ON — 매일 09:00 ${D_().autoPO!.email} 발송` : '자동 발주 OFF'); }
export function settleCSV() {
	let cs: Campaign[];
	if (S.role === 'seller') cs = D_().campaigns.filter((c) => c.sellerId === S.actingSeller && ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status));
	else { const myP = myProductIds(S.actingBrand); cs = D_().campaigns.filter((c) => myP.includes(c.productId) && ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status)); }
	const rows: (string | number)[][] = [['캠페인', '상품', '인플루언서', '시작', '종료', '확정매출', 'PG수수료', '인플루언서수수료', '플랫폼수수료', '브랜드정산액', '상태']];
	cs.forEach((c) => { const k = calc(c), p = prod(c.productId); rows.push([c.id.toUpperCase(), p.name, seller(c.sellerId).handle, c.start || '', c.end || '', k.net, Math.round(k.pg), Math.round(k.sfTotal), Math.round(k.pf), Math.round(k.brandPay), c.status]); });
	dlCSV(`정산명세_${ymd(today())}.csv`, rows); toast('정산 명세 CSV 다운로드');
}

/* ---------- 상품 ---------- */
export interface ProductForm { name: string; desc: string; cat: string; cp: number; gp: number; totalRate: number; stock: number; sample: string; opts: string; samplePolicy: SamplePolicy; exclGrade: string; exclLabel: string; thumb: string | null; imgs: string[] }
const parseOpts = (s: string): Option[] => s.split(/\n/).map((l) => l.split('|')).filter((a) => a.length >= 2 && a[0].trim() && +a[1].replace(/[^\d]/g, '')).map((a) => ({ n: a[0].trim(), price: +a[1].replace(/[^\d]/g, '') }));
export function createProduct(f: ProductForm) {
	if (!f.name.trim()) { toast('상품명을 입력하세요'); return; }
	D_().products.push({ id: nextId('p'), brandId: S.actingBrand, name: f.name.trim(), desc: f.desc.trim() || '—', em: '📦', cat: f.cat || '건기식', thumb: f.thumb || null, imgs: f.imgs.slice(0, 4), options: parseOpts(f.opts), cp: f.cp || 0, gp: f.gp || 0, rate: Math.max(5, (f.totalRate || 30) - PLAT_RATE * 100) / 100, sample: f.sample || '무상 1개', samplePolicy: f.samplePolicy, stock: f.stock || 0, status: 'pending', ...(f.exclGrade ? { exclusive: { grade: f.exclGrade as never, label: f.exclLabel.trim() || f.exclGrade + ' 등급 독점권' } } : {}) });
	closeModal(); save(); toast('검수 요청 완료 — 관리자 승인 후 노출');
}
export function saveProduct(pid: string, f: ProductForm) {
	const p = prod(pid); if (!p) return; if (!f.name.trim()) { toast('상품명을 입력하세요'); return; }
	const locked = D_().campaigns.some((c) => c.productId === pid && ['SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING'].includes(c.status));
	p.name = f.name.trim(); p.desc = f.desc.trim() || '—'; p.cat = f.cat || p.cat; if (f.thumb) p.thumb = f.thumb; if (f.imgs.length) p.imgs = f.imgs.slice(0, 4);
	p.stock = f.stock || 0; p.sample = f.sample || p.sample; p.options = parseOpts(f.opts); p.samplePolicy = f.samplePolicy;
	if (f.exclGrade) p.exclusive = { grade: f.exclGrade as never, label: f.exclLabel.trim() || f.exclGrade + ' 등급 독점권' }; else if (!p.exclusiveSellerId) delete p.exclusive;
	if (!locked) { const cp = f.cp || p.cp, gp = f.gp || p.gp, rate = Math.max(5, (f.totalRate || 30) - PLAT_RATE * 100) / 100; const changed = gp !== p.gp || rate !== p.rate; p.cp = cp; p.gp = gp; p.rate = rate; if (changed && p.status === 'listed') { p.status = 'pending'; toast('판매가·수수료율 변경 — 재검수 대기로 전환됩니다'); } }
	if (p.status === 'rejected') { p.status = 'pending'; delete p.rejectReason; }
	closeModal(); save(); toast(p.status === 'pending' ? `${p.name} 수정 저장 — 재검수 요청됨` : `${p.name} 수정 저장 완료`);
}
export function deleteProduct(pid: string) {
	const p = prod(pid); if (!p) return;
	if (D_().campaigns.some((c) => c.productId === pid && !['REJECTED', 'PASSED', 'DECLINED'].includes(c.status))) { toast('진행 이력이 있는 상품은 삭제할 수 없습니다 — 노출 중단을 사용하세요'); return; }
	if (!confirm(`${p.name}을(를) 삭제할까요?`)) return;
	D_().products = D_().products.filter((x) => x.id !== pid); closeModal(); save(); toast('상품 삭제됨');
}
export function toggleListing(pid: string) { const p = prod(pid); if (!p || p.status === 'pending' || p.status === 'rejected') return; p.status = p.status === 'listed' ? 'paused' : 'listed'; save(); toast(p.status === 'listed' ? `${p.name} 노출 재개` : `${p.name} 노출 중단 — 새 샘플 요청이 막힙니다`); }
export function approveProduct(pid: string) { const p = prod(pid); p.status = 'listed'; delete p.rejectReason; p.stock = p.stock || 500; save(); toast(`${p.name} 노출 승인`); }
export function rejectProduct(pid: string) { const p = prod(pid); const why = prompt('반려 사유 (브랜드에 표시됩니다)', '건강·웰니스 카테고리 범위 밖 / 허위·과장 표기 확인 필요'); if (why === null) return; p.status = 'rejected'; p.rejectReason = why || '검수 기준 미달'; save(); toast(`${p.name} 반려 — 브랜드가 수정 후 재검수 요청할 수 있습니다`); }

/* ---------- 관리자 ---------- */
export function saveOpex(o: Record<string, number>) { D_().opex = o; save(); toast('운영 비용 저장 — 순이익 재계산'); }
export function resetOpex() { delete D_().opex; save(); toast('운영 비용 기본값으로 복원'); }
export function admToggleHidden(sid: string) { const x = seller(sid); x.hidden = !x.hidden; save(); toast(`${x.name} ${x.hidden ? '비공개' : '공개'} 전환`); }
export function admGrant(who: string) { (D_().celeryLedger = D_().celeryLedger || []).push({ who, at: ymd(today()), delta: 3, memo: '관리자 이벤트 지급' }); save(); toast('🥬 3 지급 완료'); }
export function toggleAutoPropose(bid: string) { const b = brand(bid); b.autoPropose = !b.autoPropose; save(); toast(`${b.name} 자동 제안 ${b.autoPropose ? 'ON' : 'OFF'}`); }
export function runAutoPropose() {
	const list = autoMatches().slice(0, 5); let n = 0, skip = 0;
	list.forEach(({ b, p, s }) => {
		const tg = gname(s); if ((tg === '다이아' || tg === '블랙') && celBal(b.id) < 10) { skip++; return; }
		const celUsed = (tg === '다이아' || tg === '블랙') ? 10 : 0; if (celUsed) celSpend(b.id, 10, `${tg} 인플루언서 자동 제안 · ${p.name}`);
		const id = nextId('c'); D_().campaigns.push({ id, sellerId: s.id, productId: p.id, status: 'INVITED', createdAt: ymd(today()), invited: true, auto: true, celUsed });
		pushSys(id, `🤖 <b>셀러리 자동 제안</b> — 트렌드·카테고리 적합도 기반으로 <b>${esc(b.name)}</b>가 <b>${esc(p.name)}</b> 판매를 제안했습니다 · 인플루언서 수락 대기`); n++;
	});
	save(); toast(`자동 제안 ${n}건 발송${skip ? ` · ${skip}건은 브랜드 셀러리 부족으로 보류` : ''}`);
}

/* ---------- 고객: 카카오 · 장바구니 · 주문 · CS ---------- */
export function placeOrder(c: Campaign, o: Option, q: number) { const id = nextId('o'); D_().orders.push({ id, campaignId: c.id, buyer: S.cust ? S.cust.name : '고객(구매 페이지)', buyerId: S.cust ? S.cust.id : null, qty: q, unit: o.price, opt: o.n, status: 'PAID', at: ymd(today()) }); return id; }
export function buyNow(cid: string) {
	const c = camp(cid); if (!c) return; const p = prod(c.productId);
	if (S.role !== 'customer') { toast('미리보기에서는 주문이 생성되지 않습니다 — 고객 화면에서 구매 흐름을 확인하세요 (주문 시뮬레이션은 관리자 스레드)'); return; }
	if (c.status !== 'LIVE') { toast('현재 판매 중이 아닙니다'); return; }
	const opts = optsOf(p), o = opts[Math.min(S.ui.storeOpt || 0, opts.length - 1)], q = S.ui.storeQty || 1;
	const left = leftOf(c); if (left < q) { toast(`남은 수량이 부족합니다 (잔여 ${Math.max(0, left)}개)`); return; }
	if (!S.cust) { kakaoStart('buy:' + cid); return; }
	const id = placeOrder(c, o, q); S.ui.storeQty = 1; save(); openModal('orderDone', { ids: [id] });
}
export function addCart(cid: string) {
	const c = camp(cid); if (!c || c.status !== 'LIVE') { toast('현재 판매 중이 아닙니다'); return; }
	const p = prod(c.productId), opts = optsOf(p), oi = Math.min(S.ui.storeOpt || 0, opts.length - 1), q = S.ui.storeQty || 1;
	const left = leftOf(c); if (left < q) { toast(`남은 수량이 부족합니다 (잔여 ${Math.max(0, left)}개)`); return; }
	const it = S.cart.find((x) => x.cid === cid && x.oi === oi); if (it) it.qty = Math.min(10, it.qty + q); else S.cart.push({ cid, oi, qty: q });
	persistCart(S.cart); S.ui.storeQty = 1; toast(`장바구니에 담았어요 · ${S.cart.reduce((a, x) => a + x.qty, 0)}개`);
}
export function cartQty(i: number, d: number) { const it = S.cart[i]; if (!it) return; it.qty = Math.max(1, Math.min(10, it.qty + d)); persistCart(S.cart); }
export function cartRemove(i: number) { S.cart.splice(i, 1); persistCart(S.cart); }
export function cartCheckout() {
	if (!S.cust) { kakaoStart('checkout'); return; }
	const L = cartLines().filter((x) => x.ok); if (!L.length) { toast('결제할 수 있는 상품이 없어요'); return; }
	const ids = L.map((x) => placeOrder(x.c, x.o, x.it.qty)); const done = new Set(L.map((x) => x.i));
	S.cart = S.cart.filter((_, i) => !done.has(i)); persistCart(S.cart); save(); openModal('orderDone', { ids });
}
export function custRefund(oid: string) {
	const o = D_().orders.find((x) => x.id === oid); if (!o || !S.cust || o.buyerId !== S.cust.id || o.status !== 'PAID') return;
	if (camp(o.campaignId)!.status === 'SETTLED') { toast('정산이 끝난 주문은 브랜드 고객 문의로 접수해주세요'); return; }
	openModal('custRefund', { oid });
}
export function custRefundGo(oid: string) { const o = D_().orders.find((x) => x.id === oid); if (!o || o.status !== 'PAID') return; o.status = 'REFUNDED'; pushSys(o.campaignId, `↩ 고객 환불 신청 · ${esc(o.buyer)} · ₩${fmt(o.unit * o.qty)} (정산액 차감)`); closeModal(); save(); toast('환불 신청 완료 — 결제수단으로 3영업일 내 환급'); }
export function submitCS(cid: string, type: string, msg: string, oid: string) {
	if (!msg.trim()) { toast('문의 내용을 입력해주세요'); return; }
	const c = camp(cid)!, p = prod(c.productId), b = brand(p.brandId);
	(D_().cs = D_().cs || []).push({ id: nextId('cs'), cid, orderId: oid.trim() || null, buyer: S.cust ? S.cust.name : '고객', type, msg: msg.trim(), status: 'OPEN', at: ymd(today()) });
	pushSys(cid, `💬 구매 고객이 <b>${esc(type)}</b> 문의를 남겼습니다 — <b>${esc(b.name)}</b> 고객 문의함으로 전달되었습니다`);
	closeModal(); save(); toast(`문의가 ${b.name}에 접수되었습니다 — 답변은 알림톡으로 안내됩니다`);
}
export function saveCSReply(id: string, t: string) { const x = csList().find((v) => v.id === id); if (!x) return; if (!t.trim()) { toast('답변 내용을 입력해주세요'); return; } x.reply = t.trim(); x.repliedAt = ymd(today()); x.status = 'ANSWERED'; pushSys(x.cid, `💬 브랜드가 고객 문의에 답변했습니다 (${esc(x.type)})`); closeModal(); save(); toast('답변 전송 — 고객에게 알림톡으로 안내됩니다'); }
export function csClose(id: string) { const x = csList().find((v) => v.id === id); if (!x) return; x.status = 'CLOSED'; save(); toast('처리 종료로 변경했습니다'); }
export function notifyMe() { toast('오픈 알림 신청 완료 — 판매 시작 시 카카오 알림톡으로 안내 (시뮬레이션)'); }

/* 카카오 로그인 — 키가 비면 데모 계정 선택, 있으면 SDK authorize 리다이렉트(서버 콜백 필요) */
export function kakaoStart(after: string) {
	S.ui.kakaoAfter = after || '';
	if (KAKAO_JS_KEY) { kakaoReal(); return; }
	openModal('kakao', {});
}
export function kakaoPick(k: string) {
	let acc = KAKAO_DEMO.find((a) => a.id === k);
	if (k === '__other') { const nm = prompt('카카오 계정 이름 (데모)'); if (!nm || !nm.trim()) return; acc = { id: 'k' + Date.now().toString(36), name: nm.trim(), email: '' }; }
	if (acc) kakaoSignIn(acc);
}
export function kakaoSignIn(acc: { id: string; name: string; email?: string }) {
	S.cust = { id: acc.id, name: acc.name, email: acc.email || '', kakao: true, at: ymd(today()) }; persistCust(S.cust); closeModal();
	const a = S.ui.kakaoAfter || ''; S.ui.kakaoAfter = ''; toast(`${acc.name}님, 카카오로 로그인했어요`);
	if (a === 'checkout') { cartCheckout(); return; }
	if (a.startsWith('buy:')) { buyNow(a.slice(4)); return; }
}
export function custLogout() { S.cust = null; persistCust(null); toast('로그아웃했어요'); }
declare global { interface Window { Kakao?: any } }
function kakaoReal() {
	const run = () => { try { if (!window.Kakao!.isInitialized()) window.Kakao!.init(KAKAO_JS_KEY); window.Kakao!.Auth.authorize({ redirectUri: location.origin + '/auth/kakao', state: 'cust:' + (S.ui.kakaoAfter || ''), scope: 'profile_nickname,account_email' }); } catch { toast('카카오 로그인 초기화 실패 — JavaScript 키와 등록 도메인을 확인해주세요'); } };
	if (window.Kakao) { run(); return; }
	const sc = document.createElement('script'); sc.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'; sc.crossOrigin = 'anonymous'; sc.onload = run; sc.onerror = () => toast('카카오 SDK를 불러오지 못했어요'); document.head.appendChild(sc);
}
export { COURIERS, dataPrice, soldQty, campOrders };
