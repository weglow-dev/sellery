/**
 * 토스페이먼츠 서버 API — packages/payments/src/server/toss.server.ts 복사(셀러리 코드는 복사만). 키는 `TOSS_SECRET_KEY`(`$env/dynamic/private`).
 * 반환 { ok, status, body }: ok = 2xx + JSON · **status 0 = 네트워크 오류·타임아웃·2xx 파싱 실패(처리 여부 불명)** · 5xx 도 불명 — `isUncertain()` 이면 재조회로 확정.
 * 4xx 본문 { code, message }. 키가 없으면 CONFIG_ERROR(4xx 취급) 로 드러난다 — 빌드는 키 없이 통과.
 */
import { env } from '$env/dynamic/private';

const TOSS_BASE = 'https://api.tosspayments.com';
const DEFAULT_TIMEOUT_MS = 10_000;

export type TossCancel = { cancelAmount: number; cancelReason: string; canceledAt: string; transactionKey?: string; [k: string]: unknown };
export type TossPayment = {
	paymentKey: string;
	orderId: string;
	orderName?: string;
	status: string;
	method?: string | null;
	approvedAt?: string | null;
	requestedAt?: string;
	totalAmount: number;
	balanceAmount?: number;
	cancels?: TossCancel[] | null;
	virtualAccount?: { bankCode?: string; accountNumber?: string; customerName?: string; dueDate?: string } | null;
	[k: string]: unknown;
};
export type TossError = { code: string; message: string };
export type TossResult = { ok: boolean; status: number; body: TossPayment | TossError };

export const isTossError = (body: TossPayment | TossError): body is TossError =>
	typeof (body as TossError).code === 'string' && typeof (body as TossPayment).paymentKey !== 'string';
export const isUncertain = (res: TossResult): boolean => res.status === 0 || res.status >= 500;
export const hasToss = (): boolean => typeof env.TOSS_SECRET_KEY === 'string' && env.TOSS_SECRET_KEY.trim() !== '';

const looksLikePayment = (v: unknown): v is TossPayment =>
	!!v && typeof v === 'object' && typeof (v as TossPayment).paymentKey === 'string' && typeof (v as TossPayment).status === 'string';
const looksLikeError = (v: unknown): v is TossError => !!v && typeof v === 'object' && typeof (v as TossError).code === 'string';

async function request(
	path: string,
	init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> },
	timeoutMs: number
): Promise<TossResult> {
	const secret = (env.TOSS_SECRET_KEY ?? '').trim();
	if (!secret) {
		console.error('[toss] TOSS_SECRET_KEY 없음 — docs/deploy.md MYR 표');
		return { ok: false, status: 400, body: { code: 'CONFIG_ERROR', message: '결제 서버 설정 오류' } };
	}
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${TOSS_BASE}${path}`, {
			method: init.method,
			headers: { Authorization: `Basic ${btoa(`${secret}:`)}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			signal: ctrl.signal,
			cache: 'no-store'
		});
		let json: unknown = null;
		let parsed = false;
		try {
			const text = await res.text();
			json = text ? JSON.parse(text) : null;
			parsed = true;
		} catch {
			parsed = false;
		}
		if (res.ok) {
			if (parsed && looksLikePayment(json)) return { ok: true, status: res.status, body: json };
			return { ok: false, status: 0, body: { code: 'PARSE_ERROR', message: `토스 응답을 읽지 못했습니다 (HTTP ${res.status})` } };
		}
		const err: TossError =
			parsed && looksLikeError(json)
				? { code: json.code, message: typeof json.message === 'string' ? json.message : json.code }
				: { code: `HTTP_${res.status}`, message: `토스 API 오류 (HTTP ${res.status})` };
		return { ok: false, status: res.status, body: err };
	} catch (e) {
		const aborted = e instanceof Error && e.name === 'AbortError';
		return { ok: false, status: 0, body: { code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', message: aborted ? '토스 응답 시간 초과' : '토스 연결 오류' } };
	} finally {
		clearTimeout(timer);
	}
}

/** POST /v1/payments/confirm — amount 는 반드시 세션의 amount */
export const tossConfirm = (input: { paymentKey: string; orderId: string; amount: number }): Promise<TossResult> =>
	request('/v1/payments/confirm', { method: 'POST', body: input }, DEFAULT_TIMEOUT_MS);

/** POST /v1/payments/{paymentKey}/cancel — Idempotency-Key 로 재시도 안전 · cancelAmount 없으면 전액 */
export function tossCancel(paymentKey: string, reason: string, o: { idempotencyKey: string; cancelAmount?: number }): Promise<TossResult> {
	const body: Record<string, unknown> = { cancelReason: (reason || '고객 요청').slice(0, 200) };
	if (typeof o.cancelAmount === 'number' && o.cancelAmount > 0) body.cancelAmount = o.cancelAmount;
	return request(
		`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`,
		{ method: 'POST', body, headers: { 'Idempotency-Key': o.idempotencyKey } },
		DEFAULT_TIMEOUT_MS
	);
}

/** GET /v1/payments/{paymentKey} — 웹훅·재조회·reconcile 의 유일한 진실 */
export const tossGetPayment = (paymentKey: string, o: { timeoutMs?: number } = {}): Promise<TossResult> =>
	request(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: 'GET' }, o.timeoutMs ?? 8_000);
