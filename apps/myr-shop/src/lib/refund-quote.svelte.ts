/**
 * 신청 화면의 예상 환불 금액 — 서버(POST /api/refunds/quote · 실제 환불과 같은 refundQuote)에 묻는다. 화면은 금액을 계산하지 않는다.
 * 고른 줄 · 사유가 바뀔 때마다 `ask(body)` — 150ms 안에 또 바뀌면 앞 요청은 보내지 않고, 늦게 온 옛 응답은 버린다.
 * 줄이 없으면 `ask(null)` 로 비운다. 실패하면 quote = null · failed = true(화면은 "금액 확인 중" 대신 안내).
 */
import { parseRefundQuote, type RefundQuote, type RefundQuoteBody } from '@sellery/myr-core/refund-rules';

type QuoteRequest = Omit<RefundQuoteBody, 'items'> & { items: { itemId: string; qty: number }[] };

export class RefundQuoteState {
	quote = $state<RefundQuote | null>(null);
	loading = $state(false);
	failed = $state(false);
	#seq = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;

	ask(body: QuoteRequest | null): void {
		const seq = ++this.#seq;
		if (this.#timer) clearTimeout(this.#timer);
		this.failed = false;
		if (!body || body.items.length === 0) {
			this.quote = null;
			this.loading = false;
			return;
		}
		this.loading = true;
		this.#timer = setTimeout(async () => {
			let q: RefundQuote | null = null;
			try {
				const res = await fetch('/api/refunds/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
				q = parseRefundQuote(await res.json().catch(() => null));
			} catch {
				q = null;
			}
			if (seq !== this.#seq) return;
			this.quote = q;
			this.failed = q === null;
			this.loading = false;
		}, 150);
	}

	dispose(): void {
		this.#seq++;
		if (this.#timer) clearTimeout(this.#timer);
	}
}
