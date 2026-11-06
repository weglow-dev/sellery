/**
 * 이벗 OrderSheet API 호출 — 한 곳(바인허브 EbutOrderService 와 같은 규칙). 인증 헤더 `Bearer {api key}` · 응답 `status !== 'ok'` → EbutStatusNotOkError.
 *   ebutRegisterOrders(orderList)   ordercreatem — id · custCode 는 orderList 원소마다(호출부가 조립) · 반환은 응답 전체(result 배열로 부분 성공 판정)
 *   ebutOrderStatus(codeList)       orderstatus(codeType 2) — id · custCode 를 여기서 넣는다 · 반환은 data 배열
 * 키는 `configureMyrCore`(EBUT_*) — 비면 `ebutConfig()` 가 ready:false 이고, 호출하면 EbutConfigError.
 */
import { EBUT_BASE_URL, ebutReady, type EbutConfig } from '../ebut';
import { myrConfig } from './config.server';

export class EbutConfigError extends Error {}
export class EbutStatusNotOkError extends Error {}

export function ebutConfig(): EbutConfig & { ready: boolean } {
	const c = myrConfig();
	const e: EbutConfig = {
		id: c.ebutId,
		custCode: c.ebutCustCode,
		apiKey: c.ebutApiKey,
		ordShop: c.ebutOrdShop,
		senderName: c.ebutSenderName,
		senderPhone: c.ebutSenderPhone,
		senderZipcode: c.ebutSenderZipcode,
		senderAddress: c.ebutSenderAddress,
		courier: c.ebutCourier
	};
	return { ...e, ready: ebutReady(e) };
}

async function ebutRequest(endpoint: string, payload: unknown, timeoutMs = 20_000): Promise<Record<string, unknown>> {
	const c = ebutConfig();
	if (!c.ready) throw new EbutConfigError('ebut not configured');
	const base = (myrConfig().ebutApiUrl ?? EBUT_BASE_URL).replace(/\/+$/, '');
	const res = await fetch(`${base}/${endpoint}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!res.ok) throw new Error(`ebut ${endpoint} HTTP ${res.status}`);
	const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!json || json.status !== 'ok') throw new EbutStatusNotOkError(`ebut ${endpoint} status ${JSON.stringify(json)?.slice(0, 500)}`);
	return json;
}

export async function ebutRegisterOrders(orderList: Record<string, string | number>[]): Promise<Record<string, unknown>> {
	return ebutRequest('ordercreatem', { orderList });
}

export async function ebutOrderStatus(codeList: { orderCodeNo: string }[]): Promise<unknown[]> {
	const c = ebutConfig();
	const json = await ebutRequest('orderstatus', { id: c.id, custCode: c.custCode, codeType: '2', codeList });
	return Array.isArray(json.data) ? json.data : [];
}
