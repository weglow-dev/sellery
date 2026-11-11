/** 샵 클라이언트 상태 — 장바구니 · 찜 · 주문자 정보 · (목) 주문 · 토스트.
 *  장바구니·찜의 **보관 위치**(docs/myr.md §6.2 · 0057):
 *    · 로그인 = 계정(서버 `/api/cart` `/api/likes`) — 폰에서 담고 PC 에서 본다. 화면은 먼저 바꾸고(낙관) 서버 응답의 전체 줄로 덮어쓴다(가격·available 도 서버 값).
 *    · 비회원 = 브라우저(localStorage · 상품 스냅샷) — 로그인하는 순간 hydrate() 가 계정에 합치고 브라우저 쪽은 비운다.
 *  줄 다루기는 lib/cart.ts(순수 · 테스트됨). **단가 · 공구 적용 · 합계 · 배송비는 서버 견적**(requote → POST /api/cart/quote · 체크아웃과 같은 함수) — 화면이 계산하지 않는다. 주문은 M4 에서 서버 주문으로 바뀌고 여기서는 "주문 완료" 화면용 목이다.
 *  상태 변경은 전부 이 모듈의 메서드로만. */
import { browser } from '$app/environment';
import type { Groupbuy } from '@sellery/myr-core/groupbuy';
import type { PriceChange } from '@sellery/myr-core/checkout-rules';
import {
	applyPriceChanges,
	canBuy,
	isProduct,
	mergeLine,
	mergePayload,
	nextGbBoundary,
	parseQuoteResponse,
	pruneUnselected,
	quoteKey,
	quoteRequest,
	removeLine,
	sanitizeLines,
	selectedLines,
	setAllSelected,
	setLineQty,
	setUnselected,
	totalsFromQuote,
	type CartLine,
	type CartQuote
} from './cart';
import type { Product } from './data';

const LS_KEY = 'myr-shop-v2';

export type { CartLine };
export type OrderLine = { code: string; name: string; qty: number; amount: number; tile: string; ic: string };
export type Order = { no: string; lines: OrderLine[]; subtotal: number; shipping: number; total: number; address: string; pay: string; at: string };
export type Buyer = { name: string; phone: string; address: string };

type Persisted = { cart: CartLine[]; likes: Product[]; buyer: Buyer; orders: Order[]; unselected: string[] };

function load(): Persisted {
	const empty: Persisted = { cart: [], likes: [], buyer: { name: '', phone: '', address: '' }, orders: [], unselected: [] };
	if (!browser) return empty;
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return empty;
		const v = JSON.parse(raw) as Partial<Persisted>;
		return {
			cart: sanitizeLines(v.cart),
			likes: (v.likes ?? []).filter(isProduct),
			buyer: { ...empty.buyer, ...(v.buyer ?? {}) },
			orders: v.orders ?? [],
			unselected: Array.isArray(v.unselected) ? v.unselected.filter((c): c is string => typeof c === 'string') : []
		};
	} catch {
		return empty;
	}
}

/** `/api/*` 호출 — 2xx 가 아니면 throw(호출부가 토스트 + 서버 상태 재조회) */
async function api<T>(path: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
	const res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
	return (await res.json()) as T;
}

class ShopState {
	cart = $state<CartLine[]>([]);
	likes = $state<Product[]>([]);
	buyer = $state<Buyer>({ name: '', phone: '', address: '' });
	orders = $state<Order[]>([]);
	toast = $state<string | null>(null);
	/** 마운트 뒤 localStorage(·서버)를 읽었는지 — 그 전에는 저장하지 않는다(서버 렌더 초기값으로 덮어쓰지 않게) */
	ready = $state(false);
	/** 장바구니·찜이 계정(서버)과 동기화 중인가 — true 면 브라우저에는 저장하지 않는다. 로그인했어도 서버를 못 읽으면 false(브라우저 보관으로 계속) */
	synced = $state(false);
	/** 주문에서 뺀 줄(code) — 체크박스 선택. 기본은 전부 선택. 브라우저에만 저장(로그인 여부 무관 · 기기별) */
	unselected = $state<string[]>([]);
	private toastTimer: ReturnType<typeof setTimeout> | undefined;
	private cartSeq = 0;
	private likesSeq = 0;

	/** 마운트 1회. 로그인(signedIn)이면 브라우저에 남은 비회원 장바구니·찜을 계정에 합친 뒤 서버 값으로 바꾸고 브라우저 쪽은 비운다. */
	async hydrate(signedIn: boolean) {
		const v = load();
		this.buyer = v.buyer;
		this.orders = v.orders;
		this.cart = v.cart;
		this.likes = v.likes;
		this.unselected = v.unselected;
		if (signedIn) {
			try {
				const [cart, likes] = await Promise.all([
					v.cart.length
						? api<{ lines: CartLine[] }>('/api/cart/merge', 'POST', { lines: mergePayload(v.cart) })
						: api<{ lines: CartLine[] }>('/api/cart', 'GET'),
					v.likes.length
						? api<{ products: Product[] }>('/api/likes', 'POST', { codes: v.likes.map((p) => p.code) })
						: api<{ products: Product[] }>('/api/likes', 'GET')
				]);
				this.cart = cart.lines ?? [];
				this.likes = likes.products ?? [];
				this.synced = true; // persist() 가 이제 장바구니·찜을 브라우저에 쓰지 않는다(빈 값으로 비운다)
			} catch (e) {
				console.warn('[shop] 계정 장바구니를 읽지 못해 브라우저 보관으로 계속합니다', e);
			}
		}
		this.ready = true;
	}

	persist() {
		if (!browser || !this.ready) return;
		try {
			const v: Persisted = {
				cart: this.synced ? [] : this.cart,
				likes: this.synced ? [] : this.likes,
				buyer: this.buyer,
				orders: this.orders,
				unselected: pruneUnselected(this.unselected, this.cart)
			};
			localStorage.setItem(LS_KEY, JSON.stringify(v));
		} catch {
			/* 사생활 모드 등 — 저장 실패는 조용히 */
		}
	}

	// ---- 장바구니 (줄 다루기는 lib/cart.ts — 테스트 src/test/cart.test.ts · 금액은 서버 견적) ----
	/** 서버 견적 — all = 살 수 있는 줄 전부(줄 단가 · 공구) · selected = 주문에 들어갈 줄(합계 · 배송비). 받기 전 · 실패면 null(화면은 "확인 중") */
	quoteAll = $state<CartQuote | null>(null);
	quoteSel = $state<CartQuote | null>(null);
	quoteFailed = $state(false);
	private quoteSeq = 0;
	/** 견적이 바뀌어야 하는 지문(줄 · 수량 · 공구 · 선택) — 레이아웃이 바뀔 때마다 requote() */
	quoteKeyNow = $derived(`${quoteKey(this.cart)}#${this.unselected.join(',')}`);
	/** 다음 공구 시작 · 끝 시각 — 그때 견적을 다시 받는다(판정은 서버) */
	nextQuoteAt = $derived(nextGbBoundary(this.cart));

	/** 줄 보기 — unitPrice · lineAmount · gbState 는 서버 견적 값(받기 전 null) · gbCode = 결제에 싣는 공구 코드(서버가 끝났다고 한 공구는 빼고) */
	cartItems = $derived(
		this.cart.map((l) => {
			const q = this.quoteAll?.lines.find((x) => x.code === l.product.code) ?? null;
			return {
				...l.product,
				qty: l.qty,
				available: canBuy(l) && (q === null || q.unitPrice !== null),
				selected: canBuy(l) && !this.unselected.includes(l.product.code),
				unitPrice: q?.unitPrice ?? null,
				gb: l.gb ?? null,
				gbState: q?.gbState ?? null,
				gbCode: l.gb && q?.gbState !== 'ended' ? l.gb.code : undefined,
				lineAmount: q?.lineAmount ?? null,
				baseAmount: q?.baseAmount ?? null
			};
		})
	);
	/** 주문에 들어갈 줄(선택 + 살 수 있음) — 합계·배송비·체크아웃은 전부 이 줄 기준 */
	orderLines = $derived(selectedLines(this.cart, this.unselected));
	selectedItems = $derived(this.cartItems.filter((it) => it.selected));
	allSelected = $derived(this.cartItems.filter((it) => it.available).every((it) => it.selected));
	/** 합계 — 서버 견적 그대로(받기 전 null) */
	totals = $derived(this.quoteSel ? totalsFromQuote(this.quoteSel) : null);
	/** 수량 합(주문 줄) */
	orderQty = $derived(this.orderLines.reduce((n, l) => n + l.qty, 0));
	/** 뱃지·"N개" 는 **상품 종류 수**(줄 수) — 같은 상품 수량을 올려도 늘지 않는다(2026-10-30 대표 결정). 수량 합은 orderQty */
	cartCount = $derived(this.cart.length);
	/** 뱃지 글자 — 9 를 넘으면 '9+' (두 자리가 들어가면 아이콘 버튼 위에서 알약이 아이콘을 가린다) */
	cartBadge = $derived(this.cartCount > 9 ? '9+' : String(this.cartCount));
	subtotal = $derived(this.totals?.subtotal ?? null);
	shipping = $derived(this.totals?.shipping ?? null);
	total = $derived(this.totals?.total ?? null);
	shippingMsg = $derived(this.totals?.shippingMsg ?? '');

	/** 서버 견적 다시 받기 — 빠른 연속 변경은 마지막 응답만 적용(seq). 실패하면 견적을 비우고 quoteFailed(결제 버튼은 막힌다) */
	async requote() {
		const seq = ++this.quoteSeq;
		const buyable = this.cart.filter(canBuy);
		if (!buyable.length) {
			const empty: CartQuote = { lines: [], itemsAmount: 0, shippingFee: 0, freeOver: 0, freeShippingLeft: 0 };
			this.quoteAll = empty;
			this.quoteSel = empty;
			this.quoteFailed = false;
			return;
		}
		try {
			const r = parseQuoteResponse(await api<unknown>('/api/cart/quote', 'POST', { all: quoteRequest(buyable), selected: quoteRequest(this.orderLines) }));
			if (seq !== this.quoteSeq) return;
			this.quoteAll = r?.all ?? null;
			this.quoteSel = r?.selected ?? null;
			this.quoteFailed = !r;
		} catch {
			if (seq !== this.quoteSeq) return;
			this.quoteAll = null;
			this.quoteSel = null;
			this.quoteFailed = true;
		}
	}

	/** 서버에 반영하고 응답의 전체 줄로 덮어쓴다. 빠른 연속 클릭은 마지막 응답만 적용(seq). 실패하면 토스트 + 서버 값으로 되돌린다. */
	private syncCart(body: { code: string; qty: number; add?: boolean; gb?: string }) {
		if (!this.synced) return;
		const seq = ++this.cartSeq;
		api<{ lines: CartLine[] }>('/api/cart', 'PUT', body)
			.then((r) => {
				if (seq === this.cartSeq) this.cart = r.lines;
			})
			.catch(async () => {
				this.showToast('장바구니를 저장하지 못했어요');
				try {
					const r = await api<{ lines: CartLine[] }>('/api/cart', 'GET');
					if (seq === this.cartSeq) this.cart = r.lines;
				} catch {
					/* 서버가 계속 안 되면 화면 값 유지 */
				}
			});
	}
	/** gb = 공구 링크로 들어와 담을 때의 공구(0086 · 끝나지 않은 것만) */
	add(product: Product, qty: number, gb?: Groupbuy) {
		this.cart = mergeLine(this.cart, product, qty, gb); // 같은 상품이면 합산 + 최신 가격·이름 스냅샷으로
		this.showToast(`${product.name} ${qty}개를 담았어요`);
		this.syncCart({ code: product.code, qty, add: true, ...(gb ? { gb: gb.code } : {}) });
	}
	/** 결제 직전 서버 단가로 맞추기(0086 PRICE_CHANGED) — 줄의 공구 · 가격 스냅샷을 서버 값으로 바꾸고(견적이 다시 돈다), 로그인이면 계정 장바구니를 다시 읽는다 */
	async applyPriceChanges(changes: PriceChange[]) {
		const seq = ++this.cartSeq;
		this.cart = applyPriceChanges(this.cart, changes);
		if (!this.synced) return;
		try {
			const r = await api<{ lines: CartLine[] }>('/api/cart', 'GET');
			if (seq === this.cartSeq) this.cart = applyPriceChanges(r.lines, changes);
		} catch {
			/* 화면 값 유지 — 결제 때 서버가 다시 확인한다 */
		}
	}
	setQty(code: string, qty: number) {
		this.cart = setLineQty(this.cart, code, qty);
		this.syncCart({ code, qty });
	}
	remove(code: string) {
		this.cart = removeLine(this.cart, code);
		this.syncCart({ code, qty: 0 });
	}
	/** 선택 토글 — 브라우저에만 기억(서버 장바구니에는 선택 개념이 없다) */
	select(code: string, on: boolean) {
		this.unselected = setUnselected(this.unselected, code, on);
	}
	selectAll(on: boolean) {
		this.unselected = setAllSelected(this.cart, on);
	}
	/** 선택한 줄 삭제 */
	removeSelected() {
		for (const l of this.orderLines) this.remove(l.product.code);
	}

	// ---- 찜 ----
	liked(code: string) {
		return this.likes.some((p) => p.code === code);
	}
	toggleLike(product: Product) {
		const liked = !this.liked(product.code);
		this.likes = liked ? [product, ...this.likes.filter((p) => p.code !== product.code)] : this.likes.filter((p) => p.code !== product.code);
		if (!this.synced) return;
		const seq = ++this.likesSeq;
		api<{ products: Product[] }>('/api/likes', 'PUT', { code: product.code, liked })
			.then((r) => {
				if (seq === this.likesSeq) this.likes = r.products;
			})
			.catch(() => this.showToast('찜을 저장하지 못했어요'));
	}

	// ---- 주문 ----
	/** 결제 확정(/checkout/success) 뒤 — 주문된 상품(codes)만 장바구니에서 뺀다(선택 안 한 줄은 남는다). 계정 장바구니는 /api/payments/confirm 이 같은 code 들을 서버에서 뺐다.
	 *  codes 가 없으면(옛 응답) 전부 비운다. 주문 목록은 서버(myr_orders)가 진실 — `orders` 는 옛 목 데이터 자리. */
	afterOrder(codes?: string[]) {
		++this.cartSeq;
		this.cart = codes ? this.cart.filter((l) => !codes.includes(l.product.code)) : [];
	}

	// ---- 토스트 ----
	showToast(msg: string) {
		clearTimeout(this.toastTimer);
		this.toast = msg;
		this.toastTimer = setTimeout(() => (this.toast = null), 2400);
	}
}

export const shop = new ShopState();
