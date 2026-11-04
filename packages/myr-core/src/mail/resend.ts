/**
 * Resend HTTP API 전송기 — 순수 모듈(설정·환경을 읽지 않는다 · fetch 주입 가능 → 테스트 src/test/mail-resend.test.ts). packages/db/src/mail/resend.ts 복사.
 * 규칙: API 키 없으면 비활성(프로세스당 1회 안내) · 절대 throw 하지 않는다 · `Idempotency-Key` + 프로세스 24시간 가드로 같은 이벤트는 한 통 · 예약 도메인(.example 등)과 형식 밖 주소는 보내지 않는다.
 */
export type MailMessage = { to: string; subject: string; html: string; text: string; tag?: string; idempotencyKey: string };
export type MailSendResult = { ok: true; id: string | null } | { ok: false; reason: 'disabled' | 'duplicate' | 'invalid' | 'http' | 'network'; status?: number; message?: string };
export type MailerOptions = { apiKey?: string | null; from?: string | null; apiUrl?: string | null; fetch?: typeof fetch; timeoutMs?: number; now?: () => number };
export type Mailer = { enabled: boolean; send(msg: MailMessage): Promise<MailSendResult> };

export const RESEND_API_URL_DEFAULT = 'https://api.resend.com';
/** 발신자 기본값 — Resend 에서 Verified 된 도메인 주소만 쓸 수 있다. MYR 도메인이 생기면 `MAIL_FROM` 환경변수로 교체(docs/deploy.md MYR 표) */
export const MAIL_FROM_FALLBACK = 'MYR <noreply@sellery.life>';
export const GUARD_TTL_MS = 24 * 60 * 60 * 1000;
const GUARD_MAX = 5000;
const DEFAULT_TIMEOUT_MS = 8_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAG_RE = /^[A-Za-z0-9_-]+$/;
const RESERVED_DOMAIN_RE = /(\.(example|test|invalid|localhost)|@(example\.(com|net|org)|sellery\.demo|myr\.test))$/i;

export const isReservedAddress = (v: string): boolean => RESERVED_DOMAIN_RE.test(v.trim());
export const isEmailAddress = (v: string | null | undefined): v is string => typeof v === 'string' && EMAIL_RE.test(v.trim()) && v.trim().length <= 254 && !isReservedAddress(v);
/** HTTP 헤더는 Latin-1 — 비ASCII·공백·제어 문자를 코드포인트 토큰(`_ac00_`)으로 결정적 치환 (멱등 키 전용) */
export const asciiToken = (s: string): string => s.replace(/[^\x21-\x7e]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`);

export function createMailer(opts: MailerOptions = {}): Mailer {
	const apiKey = typeof opts.apiKey === 'string' && opts.apiKey.trim() ? opts.apiKey.trim() : null;
	const from = typeof opts.from === 'string' && opts.from.trim() ? opts.from.trim() : MAIL_FROM_FALLBACK;
	const apiUrl = (typeof opts.apiUrl === 'string' && opts.apiUrl.trim() ? opts.apiUrl.trim() : RESEND_API_URL_DEFAULT).replace(/\/+$/, '');
	const fetchFn = opts.fetch ?? fetch;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const now = opts.now ?? Date.now;
	const guard = new Map<string, number>();
	let warnedDisabled = false;

	function seen(key: string): boolean {
		const t = now();
		const prev = guard.get(key);
		if (prev !== undefined && t - prev < GUARD_TTL_MS) return true;
		if (guard.size >= GUARD_MAX) {
			for (const [k, v] of guard) if (t - v >= GUARD_TTL_MS) guard.delete(k);
			if (guard.size >= GUARD_MAX) guard.delete(guard.keys().next().value as string);
		}
		guard.set(key, t);
		return false;
	}

	async function send(msg: MailMessage): Promise<MailSendResult> {
		if (!apiKey) {
			if (!warnedDisabled) {
				warnedDisabled = true;
				console.info('[mail] RESEND_API_KEY 가 없어 거래 메일을 보내지 않습니다 (이 프로세스에서 한 번만 안내) —', msg.subject);
			}
			return { ok: false, reason: 'disabled' };
		}
		const to = (msg.to ?? '').trim();
		if (!isEmailAddress(to)) return { ok: false, reason: 'invalid', message: 'recipient' };
		if (!msg.idempotencyKey) return { ok: false, reason: 'invalid', message: 'idempotencyKey' };
		const key = asciiToken(msg.idempotencyKey).slice(0, 200);
		if (seen(key)) return { ok: false, reason: 'duplicate' };
		const body: Record<string, unknown> = { from, to: [to], subject: msg.subject, html: msg.html, text: msg.text };
		if (msg.tag && TAG_RE.test(msg.tag)) body.tags = [{ name: 'event', value: msg.tag }];
		try {
			const res = await fetchFn(`${apiUrl}/emails`, {
				method: 'POST',
				headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': key },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs)
			});
			let json: unknown = null;
			try {
				json = await res.json();
			} catch {
				json = null;
			}
			if (!res.ok) {
				const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
				const message = typeof o.message === 'string' ? o.message : `HTTP ${res.status}`;
				if (res.status === 409) return { ok: false, reason: 'duplicate', status: 409, message };
				guard.delete(key);
				console.error('[mail] resend responded', res.status, message, '—', msg.subject);
				return { ok: false, reason: 'http', status: res.status, message };
			}
			const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
			return { ok: true, id: typeof o.id === 'string' ? o.id : null };
		} catch (e) {
			guard.delete(key);
			const message = e instanceof Error ? e.message : String(e);
			console.error('[mail] resend request failed:', message, '—', msg.subject);
			return { ok: false, reason: 'network', message };
		}
	}
	return { enabled: apiKey !== null, send };
}
