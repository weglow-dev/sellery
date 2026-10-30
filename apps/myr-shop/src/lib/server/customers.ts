/** customers 행 — 회원(ensureCustomer · packages/db customers.server.ts 복사) · 비회원(0021 app_guest_customer_upsert 그대로 · 토큰은 0058 myr_app_guest_*). service role. */
import type { User } from '@supabase/supabase-js';
import { displayName } from '$lib/auth';
import { ORDER_CODE_RE, parseGuestToken, type GuestBuyer, type Shipping } from '$lib/checkout-rules';
import { admin } from './admin';

export type CustomerRef = { id: string; address: Shipping | null; phone: string | null };

function parseShipping(json: unknown): Shipping | null {
	if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
	const o = json as Record<string, unknown>;
	const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
	const recipient = s('recipient');
	const phone = s('phone');
	const address1 = s('address1');
	if (recipient === undefined || phone === undefined || address1 === undefined) return null;
	const out: Shipping = { recipient, phone, address1 };
	for (const k of ['address2', 'postcode', 'memo'] as const) {
		const v = s(k);
		if (v !== undefined) out[k] = v;
	}
	return out;
}

/** 회원 customers 행 보장(없으면 만들고 · 있으면 안 덮음) → id · 기본 배송지 · 연락처 */
export async function ensureCustomer(user: User): Promise<CustomerRef> {
	const db = admin();
	const { error: upsertError } = await db
		.from('customers')
		.upsert({ user_id: user.id, name: displayName(user), email: user.email ?? null }, { onConflict: 'user_id', ignoreDuplicates: true });
	if (upsertError) throw new Error(`customers upsert failed: ${upsertError.message}`);
	const { data, error } = await db.from('customers').select('id, address, phone').eq('user_id', user.id).maybeSingle();
	if (error) throw new Error(`customers select failed: ${error.message}`);
	if (!data) throw new Error('customers row missing after upsert');
	const row = data as { id: string; address: unknown; phone: string | null };
	return { id: row.id, address: parseShipping(row.address), phone: row.phone ?? null };
}

/** 비회원 customers 행 — 체크아웃 1건 = 행 1개 (0021) */
export async function createGuestCustomer(buyer: GuestBuyer): Promise<string> {
	const { data, error } = await admin().rpc('app_guest_customer_upsert', { p_name: buyer.name, p_phone: buyer.phone, p_email: buyer.email ?? undefined });
	if (error) throw new Error(`app_guest_customer_upsert failed: ${error.message}`);
	if (typeof data !== 'string' || !data) throw new Error('app_guest_customer_upsert returned no id');
	return data;
}

/** 비회원 주문 조회 토큰 발급(회전) — 회원 주문이면 null */
export async function issueGuestToken(orderCode: string): Promise<string | null> {
	if (!ORDER_CODE_RE.test(orderCode)) return null;
	const { data, error } = await admin().rpc('myr_app_guest_token_issue', { p_order_code: orderCode });
	if (error) throw new Error(`myr_app_guest_token_issue failed: ${error.message}`);
	return parseGuestToken(typeof data === 'string' ? data : null);
}

/** 쿠키 토큰 검증 → 주문 id | null */
export async function verifyGuestOrder(orderCode: string, tokenRaw: string | undefined | null): Promise<string | null> {
	const token = parseGuestToken(tokenRaw);
	if (!token || !ORDER_CODE_RE.test(orderCode)) return null;
	const { data, error } = await admin().rpc('myr_app_guest_order_verify', { p_order_code: orderCode, p_token: token });
	if (error) throw new Error(`myr_app_guest_order_verify failed: ${error.message}`);
	return typeof data === 'string' && data ? data : null;
}
