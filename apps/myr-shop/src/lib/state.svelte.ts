/** 샵 클라이언트 상태 — 장바구니 · 찜 · 주문자 정보 · (목) 주문 · 토스트.
 *  장바구니와 찜은 브라우저(localStorage)에만 둔다(docs/myr.md §6.2 · §9-12) — 상품은 **스냅샷**(이름·가격·타일·크리에이터) 으로 저장하고
 *  체크아웃 때 서버가 code 로 다시 검증한다(M4). 주문은 M4 에서 서버 주문으로 바뀌고 여기서는 "주문 완료" 화면용 목이다.
 *  상태 변경은 전부 이 모듈의 메서드로만. */
import { browser } from '$app/environment';
import { cartTotals, isProduct, mergeLine, removeLine, sanitizeLines, setLineQty, type CartLine } from './cart';
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

class ShopState {
	cart = $state<CartLine[]>([]);
	likes = $state<Product[]>([]);
	buyer = $state<Buyer>({ name: '', phone: '', address: '' });
	orders = $state<Order[]>([]);
	toast = $state<string | null>(null);
	/** 마운트 뒤 localStorage 를 읽었는지 — 그 전에는 저장하지 않는다(서버 렌더 초기값으로 덮어쓰지 않게) */
	ready = $state(false);
	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	hydrate() {
		const v = load();
		this.cart = v.cart;
		this.likes = v.likes;
		this.buyer = v.buyer;
		this.orders = v.orders;
		this.ready = true;
	}

	persist() {
		if (!browser || !this.ready) return;
		try {
			const v: Persisted = { cart: this.cart, likes: this.likes, buyer: this.buyer, orders: this.orders };
			localStorage.setItem(LS_KEY, JSON.stringify(v));
		} catch {
			/* 사생활 모드 등 — 저장 실패는 조용히 */
		}
	}

	// ---- 장바구니 (계산은 전부 lib/cart.ts — 테스트 src/test/cart.test.ts) ----
	cartItems = $derived(this.cart.map((l) => ({ ...l.product, qty: l.qty, lineAmount: l.product.price * l.qty })));
	totals = $derived(cartTotals(this.cart));
	cartCount = $derived(this.totals.count);
	subtotal = $derived(this.totals.subtotal);
	shipping = $derived(this.totals.shipping);
	total = $derived(this.totals.total);
	shippingMsg = $derived(this.totals.shippingMsg);

	add(product: Product, qty: number) {
		this.cart = mergeLine(this.cart, product, qty); // 같은 상품이면 합산 + 최신 가격·이름 스냅샷으로
		this.showToast(`${product.name} ${qty}개를 담았어요`);
	}
	setQty(code: string, qty: number) {
		this.cart = setLineQty(this.cart, code, qty);
	}
	remove(code: string) {
		this.cart = removeLine(this.cart, code);
	}

	// ---- 찜 ----
	liked(code: string) {
		return this.likes.some((p) => p.code === code);
	}
	toggleLike(product: Product) {
		this.likes = this.liked(product.code) ? this.likes.filter((p) => p.code !== product.code) : [...this.likes, product];
	}

	// ---- 주문(목) ----
	/** M4 에서 /api/checkout → 토스 → confirm 으로 바뀐다. 지금은 주문번호를 만들고 장바구니를 비우는 것까지. */
	placeOrder(payName: string): Order {
		const no = 'MYR-' + String(Date.now()).slice(-6);
		const order: Order = {
			no,
			lines: this.cartItems.map((it) => ({ code: it.code, name: it.name, qty: it.qty, amount: it.lineAmount, tile: it.tile, ic: it.ic })),
			subtotal: this.subtotal,
			shipping: this.shipping,
			total: this.total,
			address: this.buyer.address,
			pay: payName,
			at: new Date().toISOString()
		};
		this.orders = [order, ...this.orders];
		this.cart = [];
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
