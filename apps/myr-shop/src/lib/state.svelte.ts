/** 샵 클라이언트 상태 — 장바구니 · 찜 · 주문자 정보 · (목) 주문 · 토스트.
 *  장바구니·찜의 **보관 위치**(docs/myr.md §6.2 · 0057):
 *    · 로그인 = 계정(서버 `/api/cart` `/api/likes`) — 폰에서 담고 PC 에서 본다. 화면은 먼저 바꾸고(낙관) 서버 응답의 전체 줄로 덮어쓴다(가격·available 도 서버 값).
 *    · 비회원 = 브라우저(localStorage · 상품 스냅샷) — 로그인하는 순간 hydrate() 가 계정에 합치고 브라우저 쪽은 비운다.
 *  계산은 전부 lib/cart.ts(순수 · 테스트됨). 주문은 M4 에서 서버 주문으로 바뀌고 여기서는 "주문 완료" 화면용 목이다.
 *  상태 변경은 전부 이 모듈의 메서드로만. */
import { browser } from '$app/environment';
import { canBuy, cartTotals, isProduct, mergeLine, mergePayload, removeLine, sanitizeLines, setLineQty, type CartLine } from './cart';
import type { Product } from './data';

const LS_KEY = 'myr-shop-v2';

export type { CartLine };
export type OrderLine = { code: string; name: string; qty: number; amount: number; tile: string; ic: string };
export type Order = { no: string; lines: OrderLine[]; subtotal: number; shipping: number; total: number; address: string; pay: string; at: string };
export type Buyer = { name: string; phone: string; address: string };

type Persisted = { cart: CartLine[]; likes: Product[]; buyer: Buyer; orders: Order[] };

function load(): Persisted {
	const empty: Persisted = { cart: [], likes: [], buyer: { name: '', phone: '', address: '' }, orders: [] };
	if (!browser) return empty;
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return empty;
		const v = JSON.parse(raw) as Partial<Persisted>;
		return {
			cart: sanitizeLines(v.cart),
			likes: (v.likes ?? []).filter(isProduct),
			buyer: { ...empty.buyer, ...(v.buyer ?? {}) },
			orders: v.orders ?? []
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
			const v: Persisted = { cart: this.synced ? [] : this.cart, likes: this.synced ? [] : this.likes, buyer: this.buyer, orders: this.orders };
			localStorage.setItem(LS_KEY, JSON.stringify(v));
		} catch {
			/* 사생활 모드 등 — 저장 실패는 조용히 */
		}
	}

	// ---- 장바구니 (계산은 전부 lib/cart.ts — 테스트 src/test/cart.test.ts) ----
	cartItems = $derived(this.cart.map((l) => ({ ...l.product, qty: l.qty, available: canBuy(l), lineAmount: l.product.price * l.qty })));
	totals = $derived(cartTotals(this.cart));
	cartCount = $derived(this.totals.count);
	subtotal = $derived(this.totals.subtotal);
	shipping = $derived(this.totals.shipping);
	total = $derived(this.totals.total);
	shippingMsg = $derived(this.totals.shippingMsg);

	/** 서버에 반영하고 응답의 전체 줄로 덮어쓴다. 빠른 연속 클릭은 마지막 응답만 적용(seq). 실패하면 토스트 + 서버 값으로 되돌린다. */
	private syncCart(body: { code: string; qty: number; add?: boolean }) {
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
	add(product: Product, qty: number) {
		this.cart = mergeLine(this.cart, product, qty); // 같은 상품이면 합산 + 최신 가격·이름 스냅샷으로
		this.showToast(`${product.name} ${qty}개를 담았어요`);
		this.syncCart({ code: product.code, qty, add: true });
	}
	setQty(code: string, qty: number) {
		this.cart = setLineQty(this.cart, code, qty);
		this.syncCart({ code, qty });
	}
	remove(code: string) {
		this.cart = removeLine(this.cart, code);
		this.syncCart({ code, qty: 0 });
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

	// ---- 주문(목) ----
	/** M4 에서 /api/checkout → 토스 → confirm 으로 바뀐다. 지금은 주문번호를 만들고 장바구니를 비우는 것까지(살 수 없는 줄은 주문에 넣지 않는다). */
	placeOrder(payName: string): Order {
		const no = 'MYR-' + String(Date.now()).slice(-6);
		const order: Order = {
			no,
			lines: this.cartItems
				.filter((it) => it.available)
				.map((it) => ({ code: it.code, name: it.name, qty: it.qty, amount: it.lineAmount, tile: it.tile, ic: it.ic })),
			subtotal: this.subtotal,
			shipping: this.shipping,
			total: this.total,
			address: this.buyer.address,
			pay: payName,
			at: new Date().toISOString()
		};
		this.orders = [order, ...this.orders];
		this.cart = [];
		if (this.synced) {
			++this.cartSeq;
			api('/api/cart', 'DELETE').catch(() => this.showToast('장바구니를 비우지 못했어요'));
		}
		return order;
	}
	lastOrder = $derived(this.orders[0] ?? null);

	// ---- 토스트 ----
	showToast(msg: string) {
		clearTimeout(this.toastTimer);
		this.toast = msg;
		this.toastTimer = setTimeout(() => (this.toast = null), 2400);
	}
}

export const shop = new ShopState();
