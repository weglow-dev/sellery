/** 샵 클라이언트 상태 — 장바구니 · 찜 · 주문자 정보 · (목) 주문 · 토스트.
 *  장바구니와 찜은 브라우저(localStorage)에만 둔다(docs/myr.md §6.2 · §9-12) — 상품은 **스냅샷**(이름·가격·타일·크리에이터) 으로 저장하고
 *  체크아웃 때 서버가 code 로 다시 검증한다(M4). 주문은 M4 에서 서버 주문으로 바뀌고 여기서는 "주문 완료" 화면용 목이다.
 *  상태 변경은 전부 이 모듈의 메서드로만. */
import { browser } from '$app/environment';
import { FREE_SHIPPING, MAX_QTY, SHIPPING_FEE, won, type Product } from './data';

const LS_KEY = 'myr-shop-v2';

export type CartLine = { product: Product; qty: number };
export type OrderLine = { code: string; name: string; qty: number; amount: number; tile: string; ic: string };
export type Order = { no: string; lines: OrderLine[]; subtotal: number; shipping: number; total: number; address: string; pay: string; at: string };
export type Buyer = { name: string; phone: string; address: string };

type Persisted = { cart: CartLine[]; likes: Product[]; buyer: Buyer; orders: Order[] };

const isProduct = (p: unknown): p is Product => !!p && typeof p === 'object' && typeof (p as Product).code === 'string' && typeof (p as Product).price === 'number';

function load(): Persisted {
	const empty: Persisted = { cart: [], likes: [], buyer: { name: '', phone: '', address: '' }, orders: [] };
	if (!browser) return empty;
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return empty;
		const v = JSON.parse(raw) as Partial<Persisted>;
		return {
			cart: (v.cart ?? []).filter((l) => isProduct(l?.product) && Number.isInteger(l.qty) && l.qty > 0),
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

	// ---- 장바구니 ----
	cartCount = $derived(this.cart.reduce((n, l) => n + l.qty, 0));
	cartItems = $derived(this.cart.map((l) => ({ ...l.product, qty: l.qty, lineAmount: l.product.price * l.qty })));
	subtotal = $derived(this.cartItems.reduce((n, it) => n + it.lineAmount, 0));
	shipping = $derived(this.subtotal === 0 || this.subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE);
	total = $derived(this.subtotal + this.shipping);
	shippingMsg = $derived(this.shipping ? `${won(FREE_SHIPPING - this.subtotal)} 더 담으면 무료배송이에요` : '무료배송으로 보내드려요');

	add(product: Product, qty: number) {
		const line = this.cart.find((l) => l.product.code === product.code);
		if (line) {
			line.qty = Math.min(MAX_QTY, line.qty + qty);
			line.product = product; // 최신 가격·이름 스냅샷으로
		} else this.cart.push({ product, qty: Math.min(MAX_QTY, qty) });
		this.showToast(`${product.name} ${qty}개를 담았어요`);
	}
	setQty(code: string, qty: number) {
		const line = this.cart.find((l) => l.product.code === code);
		if (line) line.qty = Math.max(1, Math.min(MAX_QTY, qty));
	}
	remove(code: string) {
		this.cart = this.cart.filter((l) => l.product.code !== code);
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
