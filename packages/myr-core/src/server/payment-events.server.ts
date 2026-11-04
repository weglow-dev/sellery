/**
 * 결제 감사 로그 `payment_events`(셀러리와 공유하는 표 · toss_order_id 'myr_' 접두로 구분) — 기록은 best-effort(실패해도 throw 하지 않는다).
 * 샵의 결제 승인 · 웹훅 · 크론(`apps/myr-shop/src/lib/server/checkout-sync.ts`)과 환불(`refund.server.ts` — 샵 · 인플루언서 콘솔 · 운영 콘솔)이 같은 함수로 남긴다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Admin = SupabaseClient;
export type EventSource = 'webhook' | 'deposit_callback' | 'confirm' | 'cancel';

export async function logPaymentEvent(
	admin: Admin,
	ev: {
		source: EventSource;
		event_type?: string | null;
		toss_order_id?: string | null;
		/** 샵 주문번호(myr_orders.code · 0062) — 주문이 생긴 뒤의 로그(승인 성공 · 환불 · 입금)에 적는다 */
		order_code?: string | null;
		payment_key?: string | null;
		payload: unknown;
		handled?: boolean;
		result?: string | null;
	}
): Promise<string | null> {
	try {
		const { data, error } = await admin
			.from('payment_events')
			.insert({
				source: ev.source,
				event_type: ev.event_type ?? null,
				toss_order_id: ev.toss_order_id ?? null,
				order_code: ev.order_code ?? null,
				payment_key: ev.payment_key ?? null,
				payload: ev.payload ?? {},
				handled: ev.handled ?? false,
				result: ev.result ?? null
			})
			.select('id')
			.single();
		if (error) {
			console.error('[payment_events] insert failed:', error.message);
			return null;
		}
		return (data as { id: string }).id;
	} catch (e) {
		console.error('[payment_events] insert threw:', e instanceof Error ? e.message : e);
		return null;
	}
}

export async function markPaymentEvent(admin: Admin, id: string | null, patch: { handled: boolean; result: string }): Promise<void> {
	if (!id) return;
	const { error } = await admin.from('payment_events').update(patch).eq('id', id);
	if (error) console.error('[payment_events] update failed:', error.message);
}
