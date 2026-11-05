/**
 * "내 제품" DB 행(0071 `myr_app_seller_products` · `@sellery/myr-core/seller-products`) → 콘솔 화면 모양(`Product`).
 * 상태 대응 · 보조 문구("2주 전 승인" · "심사 3일차" · "어제 저장") · 비주얼(샵과 같은 그라데이션 · 아이콘). 순수 — src/test/product-row.test.ts.
 */
import type { SellerProductRow, SellerProductStatus } from '@sellery/myr-core/seller-products';
import type { Product, ProductStatus } from './data';
import { rejectMeta } from './product-review';

export const STATUS_FROM_DB: Record<SellerProductStatus, ProductStatus> = {
	listed: 'live',
	paused: 'paused',
	pending: 'review',
	rejected: 'rejected',
	draft: 'draft',
	ended: 'ended'
};

const MIN = 60_000;
const DAY = 86_400_000;

/** 지난 시각 → "방금 · N분 전 · N시간 전 · 어제 · N일 전 · N주 전 · N개월 전"(한국어 콘솔 문구) */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
	const t = iso ? new Date(iso).getTime() : NaN;
	if (!Number.isFinite(t)) return '';
	const ms = Math.max(0, now.getTime() - t);
	if (ms < MIN) return '방금';
	if (ms < 60 * MIN) return `${Math.floor(ms / MIN)}분 전`;
	if (ms < DAY) return `${Math.floor(ms / (60 * MIN))}시간 전`;
	if (ms < 2 * DAY) return '어제';
	if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}일 전`;
	if (ms < 30 * DAY) return `${Math.floor(ms / (7 * DAY))}주 전`;
	return `${Math.max(1, Math.floor(ms / (30 * DAY)))}개월 전`;
}

/** 심사 N일차 — 제출한 날이 1일차 */
export const reviewDay = (iso: string | null | undefined, now: Date = new Date()): number => {
	const t = iso ? new Date(iso).getTime() : NaN;
	return Number.isFinite(t) ? Math.floor(Math.max(0, now.getTime() - t) / DAY) + 1 : 1;
};

/** 상태 옆 보조 문구 */
export function productMeta(r: SellerProductRow, now: Date = new Date()): string {
	switch (r.status) {
		case 'listed':
			return r.reviewedAt ? `${relativeTime(r.reviewedAt, now)} 승인` : `누적 ${r.soldQty.toLocaleString('ko-KR')}개 판매`;
		case 'pending':
			return `심사 ${reviewDay(r.submittedAt, now)}일차`;
		case 'draft':
			return `${relativeTime(r.updatedAt, now)} 저장`;
		case 'paused':
			return `${relativeTime(r.updatedAt, now)} 일시중지`;
		case 'rejected':
			return rejectMeta('new', r.reviewedAt, r.rejectItems, r.rejectReason, now);
		default:
			return '판매 종료';
	}
}

/** 수정 심사(0074) — 심사 중 "수정 심사 N일차" · 반려 "오늘 수정 반려 · N건 수정 필요"(시안) */
export function revisionFromRow(r: SellerProductRow, now: Date = new Date()): Product['revision'] {
	const v = r.revision;
	if (!v) return null;
	if (v.status === 'pending') return { state: 'review', meta: `수정 심사 ${reviewDay(v.submittedAt, now)}일차` };
	return { state: 'rejected', meta: rejectMeta('rev', v.reviewedAt, v.rejectItems, v.rejectReason, now) };
}

export function productFromRow(r: SellerProductRow, now: Date = new Date()): Product {
	return {
		id: r.id,
		code: r.code,
		name: r.name || '이름 없는 제품',
		price: r.price,
		stock: r.stockLeft,
		status: STATUS_FROM_DB[r.status],
		tile: 'slate',
		bg: r.tile,
		iconId: r.icon,
		thumbUrl: r.thumbUrl,
		sold: r.soldQty,
		meta: productMeta(r, now),
		rejectReason: r.rejectReason,
		revision: revisionFromRow(r, now)
	};
}
