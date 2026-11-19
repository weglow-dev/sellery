/**
 * 토스페이먼츠 지급대행(Payouts) API 호출 — 순수 모듈(키 · fetch 를 받는다 · 설정 · DB 를 모른다). packages/payments/src/server/toss-payouts.server.ts 복사(셀러리 코드는 복사만).
 * 서버 기본 인스턴스(configureMyrCore 의 키)는 `server/toss-payouts.server.ts`. 테스트는 이 파일을 가짜 fetch 로 부른다(check-boundaries (c) — 테스트는 순수 모듈만).
 * 문서: docs.tosspayments.com/guides/v2/payouts · /reference/additional.
 *
 * 인증: Basic base64(`${secretKey}:`) — **API 개별 연동 시크릿 키**(`test_sk_` / `live_sk_`). 결제위젯 키(`gsk`)와 다르고 상점도 다를 수 있다.
 * 암호화: 셀러 등록 · 셀러 수정 · 지급 요청은 본문을 JWE(dir · A256GCM · 보안 키)로 보내고 `TossPayments-api-security-mode: ENCRYPTION` 을 붙인다.
 *   응답도 같은 키의 JWE 다(오류 응답은 평문 JSON 일 수 있다). 나머지(GET · 삭제 · 취소)는 평문.
 * 반환 { ok, status, body } — 던지지 않는다:
 *   ok = 2xx + 읽음 · status 0 = 네트워크 · 시간 초과 · 복호 · 읽기 실패(처리 여부 불명 → isUncertainPayout) · 4xx/5xx 본문 { code, message, traceId }.
 *   v2 응답은 봉투 { version, traceId, entityType, entityBody, error } — body 는 entityBody 를 푼 값, 오류는 envelope.error.
 * 접근 정책: 상점의 API 키 접근 정책(허용 IP · 국가)에 막히면 403 API_KEY_ACCESS_DENIED — MYR 서버 함수는 서울 리전(icn1)이라 국가(한국) 허용이면 통과한다.
 * 셀러리 원본과 다른 점: 목록 응답 { hasMore, size, nextCursor, items } 를 읽는다(2026-11-19 실측 — 원본은 data 만 읽어 PARSE_ERROR) · 목록은 TossList · 오류에 traceId.
 */
import { isJweCompact, jweDecrypt, jweEncrypt, tossIat } from './toss-jwe';
import { parseTossList, parseTossPayout, parseTossSeller, type TossList, type TossPayout, type TossPayoutItem, type TossSeller, type TossSellerBody } from './toss-payout-rules';

const TOSS_BASE = 'https://api.tosspayments.com';
const DEFAULT_TIMEOUT_MS = 10_000;

export type TossPayoutError = { code: string; message: string; traceId?: string };
export type TossPayoutResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: TossPayoutError };
export type TossBalance = { pendingAmount: number; availableAmount: number; currency: string };

export type TossPayoutsApi = {
	registerSeller(body: TossSellerBody): Promise<TossPayoutResult<TossSeller>>;
	updateSeller(id: string, body: Partial<TossSellerBody>): Promise<TossPayoutResult<TossSeller>>;
	deleteSeller(id: string): Promise<TossPayoutResult<{ id: string }>>;
	getSeller(id: string): Promise<TossPayoutResult<TossSeller>>;
	listSellers(opts?: { limit?: number; startingAfter?: string }): Promise<TossPayoutResult<TossList<TossSeller>>>;
	getBalance(): Promise<TossPayoutResult<TossBalance>>;
	requestPayouts(items: readonly TossPayoutItem[], opts: { idempotencyKey: string }): Promise<TossPayoutResult<TossList<TossPayout>>>;
	cancelPayout(id: string): Promise<TossPayoutResult<TossPayout>>;
	getPayout(id: string): Promise<TossPayoutResult<TossPayout>>;
};

export type CreateTossPayoutsOptions = {
	secretKey?: string;
	securityKey?: string;
	/** 키를 호출할 때마다 읽는다(서버 기본 인스턴스가 configureMyrCore 값을 넘긴다) — secretKey · securityKey 가 먼저 */
	keys?: () => { secretKey?: string; securityKey?: string };
	fetch?: typeof fetch;
	baseUrl?: string;
	/** 테스트용 시각(iat) */
	now?: () => Date;
};

/** 처리 여부를 모른다 — 응답 없음 · 시간 초과 · 5xx. 다시 보내기 전에 조회로 확인한다(같은 멱등 키) */
export const isUncertainPayout = (res: { ok: boolean; status: number }): boolean => !res.ok && (res.status === 0 || res.status >= 500);

function looksLikeError(v: unknown): v is { code: string; message?: unknown } {
	return !!v && typeof v === 'object' && typeof (v as { code?: unknown }).code === 'string';
}

const amountOf = (v: unknown): number => {
	if (typeof v === 'number') return v;
	if (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number') return (v as { value: number }).value;
	return 0;
};

export function createTossPayouts(opts: CreateTossPayoutsOptions = {}): TossPayoutsApi {
	const fetchFn = opts.fetch ?? fetch;
	const base = opts.baseUrl ?? TOSS_BASE;

	async function request<T>(
		path: string,
		init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown; encrypt?: boolean; headers?: Record<string, string> },
		parse: (json: unknown) => T | null,
		timeoutMs = DEFAULT_TIMEOUT_MS
	): Promise<TossPayoutResult<T>> {
		const k = opts.keys?.() ?? {};
		const secretKey = opts.secretKey || k.secretKey;
		const securityKey = opts.securityKey || k.securityKey;
		if (!secretKey || (init.encrypt && !securityKey)) {
			console.error('[toss-payouts] TOSS_PAYOUT_SECRET_KEY / TOSS_PAYOUT_SECURITY_KEY 가 없습니다 — $lib/server/env.ts configureMyrCore');
			return { ok: false, status: 400, body: { code: 'CONFIG_ERROR', message: '지급대행 서버 설정 오류' } };
		}

		let bodyText: string | undefined;
		const headers: Record<string, string> = { Authorization: `Basic ${btoa(`${secretKey}:`)}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) };
		if (init.encrypt) headers['TossPayments-api-security-mode'] = 'ENCRYPTION';
		if (init.body !== undefined) {
			const plain = JSON.stringify(init.body);
			if (init.encrypt) {
				try {
					bodyText = await jweEncrypt(plain, securityKey as string, { iat: tossIat(opts.now?.() ?? new Date()) });
				} catch (e) {
					console.error('[toss-payouts] encrypt failed:', e instanceof Error ? e.message : e);
					return { ok: false, status: 400, body: { code: 'ENCRYPT_ERROR', message: '지급대행 요청 암호화 실패' } };
				}
				headers['Content-Type'] = 'text/plain';
			} else bodyText = plain;
		}

		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetchFn(`${base}${path}`, { method: init.method, headers, body: bodyText, signal: ctrl.signal, cache: 'no-store' });
			const text = await res.text().catch(() => '');
			let json: unknown = null;
			let parsed = true;
			if (text.trim()) {
				try {
					json = JSON.parse(isJweCompact(text) ? await jweDecrypt(text, securityKey as string) : text);
				} catch (e) {
					if (isJweCompact(text)) console.error('[toss-payouts] decrypt failed:', e instanceof Error ? e.message : e);
					parsed = false;
				}
			}

			// v2 봉투 { version, traceId, entityType, entityBody, error }
			const envelope = json && typeof json === 'object' && !Array.isArray(json) && 'entityBody' in (json as object) ? (json as { entityBody?: unknown; error?: unknown; traceId?: unknown }) : null;
			const entity = envelope ? envelope.entityBody : json;
			const envErr = envelope && looksLikeError(envelope.error) ? envelope.error : null;
			const traceId = envelope && typeof envelope.traceId === 'string' ? envelope.traceId : undefined;
			if (res.ok && !envErr) {
				const out = parsed ? parse(entity) : null;
				if (out !== null) return { ok: true, status: res.status, body: out };
				return { ok: false, status: 0, body: { code: 'PARSE_ERROR', message: `토스 응답을 읽지 못했습니다 (HTTP ${res.status})`, traceId } };
			}
			const src = envErr ?? (parsed && looksLikeError(json) ? json : null);
			const err: TossPayoutError = src
				? { code: src.code, message: typeof src.message === 'string' ? src.message : src.code, traceId }
				: { code: `HTTP_${res.status}`, message: `토스 지급대행 API 오류 (HTTP ${res.status})`, traceId };
			return { ok: false, status: res.ok ? 400 : res.status, body: err };
		} catch (e) {
			const aborted = e instanceof Error && e.name === 'AbortError';
			return { ok: false, status: 0, body: { code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', message: aborted ? '토스 응답 시간 초과' : '토스 연결 오류' } };
		} finally {
			clearTimeout(timer);
		}
	}

	return {
		registerSeller(body) {
			return request('/v2/sellers', { method: 'POST', body, encrypt: true }, parseTossSeller);
		},
		updateSeller(id, body) {
			return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: 'POST', body, encrypt: true }, parseTossSeller);
		},
		deleteSeller(id) {
			return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: 'DELETE' }, (j) => ({ id: j && typeof j === 'object' && typeof (j as { id?: unknown }).id === 'string' ? (j as { id: string }).id : id }));
		},
		getSeller(id) {
			return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: 'GET' }, parseTossSeller, 8_000);
		},
		listSellers(o = {}) {
			const q = new URLSearchParams();
			if (o.limit) q.set('limit', String(o.limit));
			if (o.startingAfter) q.set('startingAfter', o.startingAfter);
			const qs = q.toString();
			return request(`/v2/sellers${qs ? `?${qs}` : ''}`, { method: 'GET' }, (j) => parseTossList(j, parseTossSeller));
		},
		getBalance() {
			return request(
				'/v2/balances',
				{ method: 'GET' },
				(j) => {
					const o = j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
					if (!o) return null;
					const available = o.availableAmount;
					const currency = available && typeof available === 'object' && typeof (available as { currency?: unknown }).currency === 'string' ? (available as { currency: string }).currency : 'KRW';
					return { pendingAmount: amountOf(o.pendingAmount), availableAmount: amountOf(available), currency };
				},
				8_000
			);
		},
		requestPayouts(items, o) {
			return request('/v2/payouts', { method: 'POST', body: items, encrypt: true, headers: { 'Idempotency-Key': o.idempotencyKey } }, (j) => parseTossList(j, parseTossPayout), 20_000);
		},
		cancelPayout(id) {
			return request(`/v2/payouts/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, parseTossPayout);
		},
		getPayout(id) {
			return request(`/v2/payouts/${encodeURIComponent(id)}`, { method: 'GET' }, parseTossPayout, 8_000);
		}
	};
}
