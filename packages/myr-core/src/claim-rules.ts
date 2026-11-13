/**
 * 교환·환불 요청(승인형 CS · 0078) 순수 규칙 — 입력 검증 · 파서 · 처리 방법 이름 · 단계 문구 · 타임라인 · 처리 기준.
 * 샵(요청 남기기 · 주문 상세) · 크리에이터 콘솔(목록 · 승인/반려) · 운영 스크립트가 같이 쓴다. DB·환경 없음 — src/test/claim-rules.test.ts.
 *
 * 판정은 DB 한 곳(백엔드 원칙 1): 처리 방법 선택지 = JSON `options`(myr_refund_request_options) · 지금 단계 = `step`(myr_refund_request_step) ·
 * 왕복 배송비 = `return_fee`(platform_settings) · 회수/재발송/환불 여부 = needs_*. 여기서는 그 값을 **이름 · 문구로만** 바꾼다.
 */
import { ORDER_CODE_RE } from './checkout-rules';
import { QTY_INT_MAX, won } from './constants';
import { isRefundPhotoPath, REFUND_NOTE_MAX, REFUND_PHOTO_MAX, UUID_RE, type RefundQuote } from './refund-rules';
import { COURIERS, isCourier, normalizeCourier, normalizeTracking, TRACKING_RE } from './ship-rules';
import { charLength, cleanMultiline, sliceChars } from './text';
import { isOpenClaimStatus, isShipStatus, type OpenClaimStatus, type OrderItem, type ShipStatus } from './order-view';

export const CLAIM_KINDS = ['refund', 'exchange'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_REASONS = ['단순 변심', '파손 · 누액', '오배송'] as const;
export type ClaimReason = (typeof CLAIM_REASONS)[number];
export type ClaimStatus = 'pending' | 'progress' | 'done' | 'rejected';
export type ClaimStep = 'decide' | 'collect' | 'refund' | 'reship';
export type Resolution = 'refund' | 'partial' | 'reship' | 'reship_collect';
export const CLAIM_MESSAGE_MAX = 1000;
export const CLAIM_CODE_RE = /^rq\d{1,12}$/;

export const isClaimKind = (v: unknown): v is ClaimKind => typeof v === 'string' && (CLAIM_KINDS as readonly string[]).includes(v);
export const isClaimReason = (v: unknown): v is ClaimReason => typeof v === 'string' && (CLAIM_REASONS as readonly string[]).includes(v);
const RESOLUTIONS: readonly Resolution[] = ['refund', 'partial', 'reship', 'reship_collect'];
export const isResolution = (v: unknown): v is Resolution => typeof v === 'string' && (RESOLUTIONS as readonly string[]).includes(v);

export const KIND_LABEL: Record<ClaimKind, string> = { refund: '환불', exchange: '교환' };

/** 신청 화면의 사유 규칙 — 서버 값 그대로(0099 `myr_app_claim_form_rules` · 요청 접수 `myr_app_claim_open` 과 같은 함수들).
 *  사유마다: 받을 수 있는 요청 종류(kinds — 단순 변심은 환불만) · 사진 필수 · 단순 변심 기한(수령 후 7일)이 걸리는지. 화면은 이 값을 읽기만 한다 */
export type ClaimReasonRule = { reason: ClaimReason; kinds: ClaimKind[]; photoRequired: boolean; changeMind: boolean };
export type ClaimFormRules = { returnFee: number | null; reasons: ClaimReasonRule[] };
export const EMPTY_CLAIM_FORM_RULES: ClaimFormRules = { returnFee: null, reasons: [] };
export function claimFormRulesFromJson(v: unknown): ClaimFormRules {
	const o = obj(v);
	if (!o) return EMPTY_CLAIM_FORM_RULES;
	const reasons = (Array.isArray(o.reasons) ? o.reasons : [])
		.map(obj)
		.filter((r): r is Record<string, unknown> => !!r && isClaimReason(r.reason))
		.map((r) => ({
			reason: r.reason as ClaimReason,
			kinds: Array.isArray(r.kinds) ? r.kinds.filter(isClaimKind) : [],
			photoRequired: r.photo_required === true,
			changeMind: r.change_mind === true
		}));
	return { returnFee: typeof o.return_fee === 'number' && Number.isFinite(o.return_fee) ? o.return_fee : null, reasons };
}
/** 고른 사유의 규칙 · 아직 고르지 않았으면 null */
export const reasonRule = (rules: ClaimFormRules, reason: ClaimReason | ''): ClaimReasonRule | null => rules.reasons.find((r) => r.reason === reason) ?? null;
/** 교환을 받지 않는 사유일 때 요청 종류 아래 한 줄 — 받는지 여부는 서버 값(kinds), 여기는 문구만(2026-11-06 대표 결정: 단순 변심은 환불만 — 교환은 왕복 배송비를 뺄 돈이 없다) */
const REFUND_ONLY_NOTES: Partial<Record<ClaimReason, string>> = { '단순 변심': '단순 변심은 환불로만 받아요 — 왕복 배송비를 빼고 돌려드려요' };
export const refundOnlyNote = (reason: ClaimReason): string => REFUND_ONLY_NOTES[reason] ?? '이 사유는 환불로만 받아요';
/** 그 사유로 이 요청 종류를 받을 수 있나 — 서버 값(kinds) 그대로 · 사유를 고르기 전에는 막지 않는다 */
export const kindAllowed = (kind: ClaimKind, rule: ClaimReasonRule | null): boolean => rule === null || rule.kinds.includes(kind);

/** 사유별 처리 기준 — 고객 신청 화면 · 콘솔 상세 "처리 기준"(2026-11-06 대표 승인 · 같은 날 문구 줄임) */
export function claimPolicy(reason: string, returnFee: number | null): string[] {
	switch (reason) {
		case '단순 변심':
			return ['수령 후 7일 이내 · 미개봉만 가능', returnFee === null ? '왕복 배송비는 고객 부담 — 환불 금액에서 빼요' : `왕복 배송비 ${won(returnFee)}은 고객 부담 — 환불 금액에서 빼요`, '식품 특성상 개봉 제품은 교환·환불이 어려워요'];
		case '파손 · 누액':
			return ['사진 확인 후 새 제품 재발송 또는 전액 환불'];
		case '오배송':
			return ['잘못 간 제품은 택배 기사가 방문해 회수해요'];
		default:
			return [];
	}
}

/** 예상 환불 금액(서버 refundQuote) — 콘솔 요청 상세. 처리 대기면 환불이 나가는 처리 방법별(options · 차감액은 서버 optionDeductions) · 환불 전 진행 중이면 current.
 *  고를 수 없는 처리 · 계산 실패한 칸은 null */
export type ClaimQuotes = { options?: Partial<Record<Resolution, RefundQuote | null>>; current?: RefundQuote | null };

/** 환불 금액을 결제 기준으로 펼친 한 벌(표시용) — 결제 금액(상품 + 함께 돌려줄 배송비) − 왕복 배송비 = 환불 금액.
 *  값은 서버가 정한 그대로(환불 전 = refundQuote · 환불 뒤 = claimRefundView) — 여기서 금액을 다시 계산하지 않는다. RefundQuote 도 이 모양이다 */
export type RefundView = Pick<RefundQuote, 'paid' | 'goods' | 'shippingBack' | 'deduction' | 'amount'>;
/** 식 — "(상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)" · 더하거나 뺄 게 없으면 '' */
export function refundCalcText(v: RefundView): string {
	const parts = [`상품 ${won(v.goods)}`];
	if (v.shippingBack) parts.push(`+ 배송비 ${won(v.shippingBack)}`);
	if (v.deduction) parts.push(`− 왕복 배송비 ${won(v.deduction)}`);
	return parts.length > 1 ? `(${parts.join(' ')})` : '';
}
/** 금액 + 식 — "₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)" */
export const refundAmountText = (v: RefundView): string => [won(v.amount), refundCalcText(v)].filter(Boolean).join(' ');
/** 샵 [바로 환불] 예상 금액 아래 한 줄 — 배송비를 함께 돌려주면 "상품 + 배송비" · 무료배송 주문 · 다른 상품이 남아 배송비는 나중(주문 전체 환불 때) · 배송비를 모르면(null) 상품만 */
export function refundPaidNote(v: Pick<RefundView, 'goods' | 'shippingBack'>, shippingFee: number | null): string {
	const goods = `상품 ${won(v.goods)}`;
	if (v.shippingBack) return `${goods} + 배송비 ${won(v.shippingBack)}`;
	if (shippingFee === null) return goods;
	if (shippingFee <= 0) return `${goods} · 무료배송 주문`;
	return `${goods} · 배송비 ${won(shippingFee)}는 주문 전체가 환불될 때 함께`;
}
/** 처리 결과 "환불 요청" 줄 — 주문한 수량 중 일부만 요청했을 때만 "1개 (주문 2개 중)" · 전부면 null(줄을 그리지 않는다) */
export const claimQtyText = (c: Pick<Claim, 'qty' | 'order'>): string | null => (c.qty < c.order.item.qty ? `${c.qty}개 (주문 ${c.order.item.qty}개 중)` : null);

/** 처리 방법 이름 — 요청 종류에 따라 다르다(환불 요청의 재발송 = "교환으로 전환") · desc 는 금액(서버 예상 금액 · 없으면 빼고) · 회수 안내 */
export function resolutionOption(r: Resolution, c: Pick<Claim, 'kind' | 'optionCollects'>, quote?: RefundView | null): { id: Resolution; title: string; desc: string } {
	const money = quote ? `${refundAmountText(quote)} · ` : '';
	switch (r) {
		case 'refund':
			return {
				id: r,
				title: c.kind === 'exchange' ? '환불로 전환' : '전액 환불',
				// 회수가 필요한지는 서버 값(optionCollects · 0099 myr_claim_resolution_collects — 승인과 같은 함수) · 응답에 없으면 회수하는 쪽으로 안내
				desc: `${money}${c.optionCollects[r] === false ? '회수 없이 바로 환불' : '회수 확인 뒤 환불'}`
			};
		case 'partial':
			return { id: r, title: '부분 환불 (왕복 배송비 차감)', desc: `${money}회수 확인 뒤 환불` };
		case 'reship':
			return { id: r, title: c.kind === 'refund' ? '교환으로 전환' : '새 제품 재발송', desc: '회수 없이 바로 출고 · 배송비 MYR 부담' };
		case 'reship_collect':
			return { id: r, title: c.kind === 'refund' ? '교환으로 전환' : '재발송 + 회수', desc: '새 제품 출고 · 잘못 간 제품은 기사 방문 회수' };
	}
}
export const RESOLUTION_NAMES: Record<Resolution, string> = {
	refund: '전액 환불',
	partial: '부분 환불 (왕복 배송비 차감)',
	reship: '새 제품 재발송',
	reship_collect: '재발송 + 회수'
};

/* ---------------- 입력 — POST /api/claims(샵) · 승인/반려(콘솔) ---------------- */
export type ClaimLineInput = { item_id: string; qty: number; note?: string; photos?: string[] };
export type ClaimOpenBody = { orderCode: string; kind: ClaimKind; reason: ClaimReason; items: ClaimLineInput[] };
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** `{ orderCode, kind, reason, items: [{ itemId, qty, note?, photos? }] }` — 줄 1~20 · 상세 300자 · 사진 3장(경로 형식). 틀리면 null */
export function parseClaimOpenBody(v: unknown): ClaimOpenBody | null {
	const b = obj(v);
	if (!b) return null;
	const orderCode = typeof b.orderCode === 'string' ? b.orderCode.trim().toLowerCase() : '';
	if (!ORDER_CODE_RE.test(orderCode) || !isClaimKind(b.kind) || !isClaimReason(b.reason)) return null;
	if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 20) return null;
	const items: ClaimLineInput[] = [];
	for (const raw of b.items) {
		const l = obj(raw);
		if (!l || typeof l.itemId !== 'string' || !UUID_RE.test(l.itemId) || !Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > QTY_INT_MAX) return null;
		if (l.note !== undefined && l.note !== null && typeof l.note !== 'string') return null;
		const line: ClaimLineInput = { item_id: l.itemId, qty: l.qty as number };
		// 상세 내용은 여러 줄 글 — 줄바꿈 · 이모지를 지우지 않는다(cleanText 는 이름 · 주소용)
		const note = sliceChars(cleanMultiline(l.note), REFUND_NOTE_MAX);
		if (note) line.note = note;
		if (l.photos !== undefined && l.photos !== null) {
			if (!Array.isArray(l.photos) || l.photos.length > REFUND_PHOTO_MAX || !l.photos.every((p) => typeof p === 'string' && isRefundPhotoPath(p))) return null;
			if (l.photos.length) line.photos = [...new Set(l.photos as string[])];
		}
		items.push(line);
	}
	return { orderCode, kind: b.kind, reason: b.reason, items };
}

export type ClaimDecideBody = { decision: 'approve'; resolution: Resolution; message: string } | { decision: 'reject'; resolution: null; message: string };
/** 콘솔 승인/반려 본문 — 승인은 처리 방법 필수 · 메시지 1~1000자(정리 뒤) */
export function parseClaimDecideBody(v: unknown): ClaimDecideBody | null {
	const b = obj(v);
	if (!b) return null;
	// 고객에게 보낼 메시지는 여러 줄 글 — 줄바꿈 · 이모지를 지우지 않는다 · 글자 수는 DB 와 같은 기준(이모지 1자)
	const message = cleanMultiline(b.message);
	if (charLength(message) > CLAIM_MESSAGE_MAX) return null;
	// 반려는 사유를 고객에게 알려야 하니 메시지 필수 · 승인은 선택(0091 — 비면 null)
	if (b.decision === 'reject') return message ? { decision: 'reject', resolution: null, message } : null;
	if (b.decision === 'approve' && isResolution(b.resolution)) return { decision: 'approve', resolution: b.resolution, message };
	return null;
}
/** 승인 버튼 — 처리 방법만 고르면 된다(메시지는 선택 · 0091) · 메시지를 적었으면 길이만 본다 */
export const canDecide = (resolution: Resolution | null, message: string): boolean => !!resolution && charLength(cleanMultiline(message)) <= CLAIM_MESSAGE_MAX;

/* ---------------- 파서 — myr_refund_request_json ---------------- */
export type Claim = {
	id: string;
	code: string;
	status: ClaimStatus;
	step: ClaimStep | null;
	kind: ClaimKind;
	reason: ClaimReason;
	qty: number;
	note: string | null;
	photos: string[];
	options: Resolution[];
	/** 처리 방법마다 회수가 필요한가 — 서버 값(0099 option_collects) · 콘솔 처리 방법 안내가 사유로 다시 판정하지 않는다 */
	optionCollects: Partial<Record<Resolution, boolean>>;
	/** 환불이 나가는 처리 방법마다 뺄 왕복 배송비 — 서버 값(0105 option_deductions · 승인과 같은 myr_claim_option_deduction).
	 *  null = 차감 뒤 0원 이하라 고를 수 없음(myr_claim_option_blocked) · 키 없음 = 환불이 없는 처리(재발송) */
	optionDeductions: Partial<Record<Resolution, number | null>>;
	resolution: Resolution | null;
	message: string | null;
	decidedAt: string | null;
	needsCollect: boolean;
	collectedAt: string | null;
	needsReship: boolean;
	reshipCourier: string | null;
	reshipTrackingNo: string | null;
	reshippedAt: string | null;
	needsRefund: boolean;
	deduction: number;
	/** 왕복 배송비(서버 myr_refund_request_fee_due) — 응답에 없으면 null(숫자를 짐작하지 않는다) */
	returnFee: number | null;
	refundAmount: number | null;
	/** 환불이 끝난 요청의 결제 기준 금액(환불액 + 차감 = 상품 + 함께 돌려준 처음 배송비) · 환불 전이면 null — 서버 값(0099) */
	refundPaid: number | null;
	/** 함께 돌려준 처음 배송비 · 환불 전이면 0 — 서버 값(0099 · 화면이 거꾸로 계산하지 않는다) */
	shippingBack: number;
	refundedAt: string | null;
	doneAt: string | null;
	createdAt: string;
	/** 열린 요청인가(처리 대기 · 진행 중) — 서버 값(0099 myr_claim_status_open) */
	open: boolean;
	/** 단가 × 요청 수량(서버 값) */
	amount: number;
	buyerName: string;
	/** 가린 연락처(010-****-1234) · 없으면 null */
	buyerPhone: string | null;
	/** 주문 · 요청이 걸린 줄(배송 칸은 그 줄 값 — 0077 · 송장은 0080) */
	order: {
		id: string;
		code: string;
		status: string;
		paidAt: string | null;
		isMember: boolean;
		/** 주문 배송비(0090 · 무료배송이면 0) — 주문 전체에 한 번. 옛 응답(0090 전)이면 null → 배송비 칸을 그리지 않는다 */
		shippingFee: number | null;
		/** amount = 그 줄 주문 수량 전체의 금액(서버 값 · 0099) */
		item: { id: string; name: string; option: string; qty: number; unitPrice: number; amount: number; refundedQty: number; status: string; shipStatus: string; courier: string | null; trackingNo: string | null; shippedAt: string | null; deliveredAt: string | null };
		/** 같은 주문 · 같은 크리에이터의 다른 줄(요청 줄 제외 · 0100) — 콘솔 "함께 주문한 상품". 다른 크리에이터 줄은 서버가 싣지 않는다 · 옛 응답이면 [] */
		others: ClaimOrderLine[];
	};
	product: { id: string; code: string; name: string; tile: string | null; icon: string; thumbUrl: string | null } | null;
	seller: { id: string; name: string; handle: string } | null;
};
/** 같은 주문의 다른 줄 — 남은 수량 · 살아 있는 줄 · 열린 요청은 서버 값 그대로(0098 myr_line_left · myr_line_live · 0099 myr_claim_status_open) */
export type ClaimOrderLine = {
	id: string;
	name: string;
	option: string;
	qty: number;
	amount: number;
	refundedQty: number;
	/** 이 줄에 환불이 있었나 — 서버 값(0100 myr_line_has_refund) */
	hasRefund: boolean;
	status: string;
	shipStatus: ShipStatus;
	leftQty: number;
	live: boolean;
	deliveredAt: string | null;
	claim: { code: string; status: OpenClaimStatus; kind: string } | null;
};
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const sn = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const STEPS: readonly ClaimStep[] = ['decide', 'collect', 'refund', 'reship'];
const STATUSES: readonly ClaimStatus[] = ['pending', 'progress', 'done', 'rejected'];

export function claimFromJson(v: unknown): Claim | null {
	const o = obj(v);
	if (!o || !sn(o.id) || !sn(o.code) || !STATUSES.includes(o.status as ClaimStatus) || !isClaimKind(o.kind) || !isClaimReason(o.reason)) return null;
	const ord = obj(o.order) ?? {};
	const it = obj(ord.item) ?? {};
	const p = obj(o.product);
	const sl = obj(o.seller);
	return {
		id: s(o.id),
		code: s(o.code),
		status: o.status as ClaimStatus,
		step: STEPS.includes(o.step as ClaimStep) ? (o.step as ClaimStep) : null,
		kind: o.kind,
		reason: o.reason,
		qty: n(o.qty, 1),
		note: sn(o.note),
		photos: Array.isArray(o.photos) ? o.photos.filter((x): x is string => typeof x === 'string') : [],
		options: Array.isArray(o.options) ? o.options.filter(isResolution) : [],
		optionCollects: Object.fromEntries(Object.entries(obj(o.option_collects) ?? {}).filter(([k, v]) => isResolution(k) && typeof v === 'boolean')) as Partial<Record<Resolution, boolean>>,
		optionDeductions: Object.fromEntries(
			Object.entries(obj(o.option_deductions) ?? {}).filter(([k, v]) => isResolution(k) && (v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0)))
		) as Partial<Record<Resolution, number | null>>,
		resolution: isResolution(o.resolution) ? o.resolution : null,
		message: sn(o.message),
		decidedAt: sn(o.decided_at),
		needsCollect: o.needs_collect === true,
		collectedAt: sn(o.collected_at),
		needsReship: o.needs_reship === true,
		reshipCourier: sn(o.reship_courier),
		reshipTrackingNo: sn(o.reship_tracking_no),
		reshippedAt: sn(o.reshipped_at),
		needsRefund: o.needs_refund === true,
		deduction: n(o.deduction),
		returnFee: typeof o.return_fee === 'number' && Number.isFinite(o.return_fee) ? o.return_fee : null,
		refundAmount: typeof o.refund_amount === 'number' ? o.refund_amount : null,
		refundPaid: typeof o.refund_paid === 'number' ? o.refund_paid : null,
		shippingBack: n(o.shipping_back),
		open: o.open === true,
		refundedAt: sn(o.refunded_at),
		doneAt: sn(o.done_at),
		createdAt: s(o.created_at),
		amount: n(o.amount),
		buyerName: s(o.buyer_name, '고객'),
		buyerPhone: sn(o.buyer_phone),
		order: {
			id: s(ord.id),
			code: s(ord.code),
			status: s(ord.status, 'PAID'),
			paidAt: sn(ord.paid_at),
			isMember: ord.is_member === true,
			shippingFee: typeof ord.shipping_fee === 'number' && Number.isFinite(ord.shipping_fee) ? ord.shipping_fee : null,
			item: {
				id: s(it.id),
				name: s(it.name),
				option: s(it.option),
				qty: n(it.qty, 1),
				unitPrice: n(it.unit_price),
				amount: n(it.amount),
				refundedQty: n(it.refunded_qty),
				status: s(it.status),
				shipStatus: s(it.ship_status, 'PAID'),
				courier: sn(it.courier),
				trackingNo: sn(it.tracking_no),
				shippedAt: sn(it.shipped_at),
				deliveredAt: sn(it.delivered_at)
			},
			others: (Array.isArray(ord.others) ? ord.others : [])
				.map(obj)
				.filter((x): x is Record<string, unknown> => !!x && !!sn(x.id))
				.map((x) => {
					const q = obj(x.claim);
					return {
						id: s(x.id),
						name: s(x.name),
						option: s(x.option),
						qty: n(x.qty, 1),
						amount: n(x.amount),
						refundedQty: n(x.refunded_qty),
						hasRefund: x.has_refund === true,
						status: s(x.status, 'PAID'),
						shipStatus: isShipStatus(x.ship_status) ? x.ship_status : 'PAID',
						leftQty: n(x.left_qty),
						live: x.live === true,
						deliveredAt: sn(x.delivered_at),
						claim: q && sn(q.code) && isOpenClaimStatus(q.status) ? { code: s(q.code), status: q.status, kind: s(q.kind) } : null
					};
				})
		},
		product: p && sn(p.id) ? { id: s(p.id), code: s(p.code), name: s(p.name), tile: sn(p.tile), icon: s(p.icon, 'pill'), thumbUrl: sn(p.thumb_url) } : null,
		seller: sl && sn(sl.id) ? { id: s(sl.id), name: s(sl.name), handle: s(sl.handle) } : null
	};
}
export const claimsFromJson = (v: unknown): Claim[] => (Array.isArray(v) ? v.map(claimFromJson).filter((c): c is Claim => c !== null) : []);

/** 진행 중인 요청(처리 대기 · 진행 중) — 서버 값 그대로(0099 myr_claim_status_open) */
export const isOpenClaim = (c: Pick<Claim, 'open'>): boolean => c.open;
/** 환불이 끝난 요청을 결제 기준으로 — 서버가 준 값 그대로(refund_amount · refund_paid · shipping_back · deduction) · 환불 전이면 null. 여기서 금액을 계산하지 않는다 */
export type ClaimRefundFields = Pick<Claim, 'amount' | 'deduction' | 'refundAmount' | 'refundPaid' | 'shippingBack'>;
export function claimRefundView(c: ClaimRefundFields): RefundView | null {
	if (c.refundAmount === null || c.refundPaid === null) return null;
	return { paid: c.refundPaid, goods: c.amount, shippingBack: c.shippingBack, deduction: c.deduction, amount: c.refundAmount };
}
/** 처리 내역 "환불 완료" 한 줄 — "₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000)" · 환불 전이면 null */
export const claimRefundedText = (c: ClaimRefundFields): string | null => {
	const v = claimRefundView(c);
	return v ? refundAmountText(v) : null;
};

/** 단순 변심 기한(0093 · 수령 후 7일 · 날짜 기준) 줄 아래 안내 — 서버 changeMindOk · changeMindUntil 그대로(화면이 날짜를 계산하지 않는다).
 *  기한이 지났으면 "수령 후 7일이 지나 단순 변심 환불은 어려워요" · 아니면 null */
export function changeMindNote(i: Pick<OrderItem, 'changeMindOk' | 'changeMindUntil'>): string | null {
	if (i.changeMindOk) return null;
	return `수령 후 7일이 지나 단순 변심 환불은 어려워요`;
}

/** 요청할 수 있는 줄 — 서버 refundPath = claim(0092 myr_line_refund_path · myr_app_claim_open 이 같은 함수로 다시 막는다).
 *  열린 요청이 있는 주문은 신청 페이지 자체가 닫힌다(customerCanRefund · claimStatus) — 같은 줄 중복은 서버(OPEN_EXISTS)가 다시 막는다 */
export const claimableItems = (items: OrderItem[]): OrderItem[] => items.filter((i) => i.refundPath === 'claim');

/* ---------------- 문구 — 상태 · 단계 · 타임라인 ---------------- */
export type ClaimTone = 'accent' | 'muted' | 'ok' | 'danger';
/** 고객 · 크리에이터 공통 상태 한 단어(콘솔 시안 처리 대기 · 진행 중 · 완료 · 반려) */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = { pending: '처리 대기', progress: '진행 중', done: '완료', rejected: '반려' };

/** 지금 무슨 일이 남았나(고객 화면 한 줄) */
export function claimStepText(c: Pick<Claim, 'status' | 'step' | 'kind' | 'resolution' | 'refundAmount' | 'reshipCourier' | 'reshipTrackingNo'>): string {
	if (c.status === 'rejected') return '크리에이터가 요청을 반려했어요';
	if (c.status === 'done') {
		if (c.resolution === 'reship' || c.resolution === 'reship_collect') return `새 제품을 보냈어요${c.reshipTrackingNo ? ` · ${c.reshipCourier ?? '택배'} ${c.reshipTrackingNo}` : ''}`;
		return `환불이 끝났어요${c.refundAmount != null ? ` · ${won(c.refundAmount)}` : ''}`;
	}
	switch (c.step) {
		case 'decide':
			return '크리에이터가 확인하고 있어요';
		case 'collect':
			return '회수를 기다리고 있어요 — 택배 기사가 방문해요';
		case 'refund':
			return '환불을 진행하고 있어요';
		case 'reship':
			return '새 제품 발송을 준비하고 있어요';
		default:
			return '';
	}
}

export type ClaimTimelineRow = { title: string; at: string | null; detail: string | null; done: boolean };
/** 처리 내역 — 실제 기록(접수 · 승인/반려 · 회수 · 환불 · 재발송) + 아직 남은 일(빈 점) */
export function claimTimeline(c: Claim): ClaimTimelineRow[] {
	const rows: ClaimTimelineRow[] = [{ title: '요청 접수', at: c.createdAt, detail: null, done: true }];
	if (c.status === 'pending') return [...rows, { title: '크리에이터 확인', at: null, detail: null, done: false }];
	if (c.status === 'rejected') return [...rows, { title: '반려', at: c.decidedAt, detail: c.message, done: true }];
	rows.push({ title: `${c.resolution ? RESOLUTION_NAMES[c.resolution] : '처리'} 승인`, at: c.decidedAt, detail: c.message, done: true });
	if (c.needsCollect) rows.push({ title: '회수 완료', at: c.collectedAt, detail: null, done: !!c.collectedAt });
	if (c.needsRefund)
		rows.push({ title: '환불 완료', at: c.refundedAt, detail: c.refundedAt ? claimRefundedText(c) : null, done: !!c.refundedAt });
	if (c.needsReship) rows.push({ title: '새 제품 발송', at: c.reshippedAt, detail: c.reshipTrackingNo ? `${c.reshipCourier ?? '택배'} ${c.reshipTrackingNo}` : null, done: !!c.reshippedAt });
	return rows;
}

/** 고객 쪽 실패 code → 문구(POST /api/claims) */
export const CLAIM_MESSAGES: Record<string, string> = {
	BAD_REQUEST: '요청 형식이 올바르지 않습니다',
	BAD_KIND: '교환 또는 환불을 골라주세요',
	BAD_REASON: '사유를 골라주세요',
	EXCHANGE_NOT_ALLOWED: '단순 변심은 환불로만 받아요',
	NOT_FOUND: '주문을 찾을 수 없어요',
	WRONG_STATUS: '요청할 수 없는 상태의 주문이에요',
	NOTHING: '제품을 골라주세요',
	BAD_ITEMS: '요청할 수 없는 제품이 있어요',
	UNAUTHORIZED: '로그인이 필요합니다',
	NO_SERVICE_KEY: '요청 처리가 아직 설정되지 않았어요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};
export const CLAIM_LINE_MESSAGES: Record<string, string> = {
	NOT_IN_ORDER: '이 주문의 제품이 아니에요',
	CANCELED: '취소된 제품이에요',
	BAD_QTY: '수량을 확인해주세요',
	TOO_MANY: '남은 수량보다 많아요',
	NOT_PREPARED: '아직 발주 전이라 바로 환불할 수 있어요',
	CHANGE_MIND_EXPIRED: '수령 후 7일이 지난 상품은 단순 변심 환불이 어려워요',
	OPEN_EXISTS: '이미 진행 중인 요청이 있어요',
	PHOTO_REQUIRED: '사진을 1장 이상 올려주세요',
	BAD_PHOTOS: '사진을 다시 올려주세요'
};
export function claimMessage(code: string, items?: { reason: string }[]): string {
	const line = items?.find((i) => CLAIM_LINE_MESSAGES[i.reason]);
	if (code === 'BAD_ITEMS' && line) return CLAIM_LINE_MESSAGES[line.reason];
	return CLAIM_MESSAGES[code] ?? '요청을 보내지 못했어요';
}
/** 콘솔 승인/반려 실패 code → 문구 */
export const DECIDE_MESSAGES: Record<string, string> = {
	NOT_FOUND: '요청을 찾을 수 없어요',
	NOT_PENDING: '이미 처리된 요청이에요',
	BAD_DECISION: '처리 방법을 골라주세요',
	BAD_RESOLUTION: '이 요청에 쓸 수 없는 처리 방법이에요',
	BAD_MESSAGE: '고객에게 보낼 메시지를 적어주세요 (1,000자까지)',
	BAD_REQUEST: '처리 방법과 메시지를 확인해주세요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};

/* ---------------- 운영(콘솔 전까지 myr-ops.mjs → 샵 /api/ops/claims) ---------------- */
export type ClaimOpsInput = { code: string; action: 'collected' | 'refund' } | { code: string; action: 'reship'; courier: string; trackingNo: string };
/** `{ code, action: collected | refund | reship, courier?, trackingNo? }` — 코드 소문자(RQ2001 → rq2001) · 택배사 별칭 정리 · 운송장 숫자만. 틀리면 field 와 문구 */
export function parseClaimOpsInput(raw: unknown): { ok: true; input: ClaimOpsInput } | { ok: false; field: 'code' | 'action' | 'courier' | 'trackingNo'; message: string } {
	const b = obj(raw);
	const code = typeof b?.code === 'string' ? b.code.trim().replace(/^#/, '').toLowerCase() : '';
	if (!CLAIM_CODE_RE.test(code)) return { ok: false, field: 'code', message: '요청번호 형식이 올바르지 않아요 (예: RQ2001)' };
	if (b?.action === 'collected' || b?.action === 'refund') return { ok: true, input: { code, action: b.action } };
	if (b?.action !== 'reship') return { ok: false, field: 'action', message: 'action 은 collected · refund · reship 중 하나예요' };
	const courier = normalizeCourier(typeof b.courier === 'string' ? b.courier : '');
	if (!isCourier(courier)) return { ok: false, field: 'courier', message: `택배사는 ${COURIERS.join(' · ')} 중 하나예요` };
	const trackingNo = normalizeTracking(typeof b.trackingNo === 'string' ? b.trackingNo : '');
	if (!TRACKING_RE.test(trackingNo)) return { ok: false, field: 'trackingNo', message: '운송장 번호는 숫자 8~30자리예요' };
	return { ok: true, input: { code, action: 'reship', courier, trackingNo } };
}
export const CLAIM_OPS_MESSAGES: Record<string, string> = {
	NOT_FOUND: '요청을 찾을 수 없어요',
	NOT_READY: '지금 단계에서 할 수 없는 처리예요(요청 상태 · 처리 방법을 확인해주세요)',
	BAD_COURIER: `택배사는 ${COURIERS.join(' · ')} 중 하나예요`,
	BAD_TRACKING: '운송장 번호는 숫자 8~30자리예요',
	NO_SERVICE_KEY: '처리가 아직 설정되지 않았어요',
	DB_ERROR: '잠시 후 다시 시도해주세요'
};
export const claimOpsMessage = (code: string): string => CLAIM_OPS_MESSAGES[code] ?? CLAIM_OPS_MESSAGES.DB_ERROR;
