/** 샵 클라이언트 상태 — 장바구니 · 찜 · 주문자 정보 · (목) 주문 · 토스트.
 *  장바구니와 찜은 브라우저(localStorage)에만 둔다(docs/myr.md §6.2 · §9-12). 주문은 M4 에서 서버 주문으로 바뀌고
 *  여기서는 "주문 완료" 화면을 보여주기 위한 목이다. 상태 변경은 전부 이 모듈의 메서드로만. */
import { browser } from '$app/environment';
import { FREE_SHIPPING, MAX_QTY, PRODUCTS, SHIPPING_FEE, productOf, won } from './data';

const LS_KEY = 'myr-shop-v1';

export type CartLine = { id: string; qty: number };
export type OrderLine = {
	id: string;
	name: string;
	qty: number;
	amount: number;
	tile: string;
	ic: string;
};
export type Order = {
	no: string;
	lines: OrderLine[];
	subtotal: number;
	shipping: number;
	total: number;
	address: string;
	pay: string;
	at: string;
};
export type Buyer = { name: string; phone: string; address: string };

type Persisted = {
	cart: CartLine[];
	likes: string[];
	buyer: Buyer;
	orders: Order[];
};

function load(): Persisted {
	const empty: Persisted = {
		cart: [],
		likes: [],
		buyer: { name: '', phone: '', address: '' },
		orders: []
	};
	if (!browser) return empty;
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return empty;
		const v = JSON.parse(raw) as Partial<Persisted>;
		return {
			cart: (v.cart ?? []).filter((l) => productOf(l.id)),
			likes: (v.likes ?? []).filter((id) => productOf(id)),
			buyer: { ...empty.buyer, ...(v.buyer ?? {}) },
			orders: v.orders ?? []
		};
	} catch {
		return empty;
	}
}

class ShopState {
	cart = $state<CartLine[]>([]);
	likes = $state<string[]>([]);
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
			const v: Persisted = {
				cart: this.cart,
				likes: this.likes,
				buyer: this.buyer,
				orders: this.orders
			};
			localStorage.setItem(LS_KEY, JSON.stringify(v));
		} catch {
			/* 사생활 모드 등 — 저장 실패는 조용히 */
		}
	}

	// ---- 장바구니 ----
	cartCount = $derived(this.cart.reduce((n, l) => n + l.qty, 0));
	cartItems = $derived(
		this.cart.flatMap((l) => {
			const p = productOf(l.id);
			return p ? [{ ...p, qty: l.qty, lineAmount: p.price * l.qty }] : [];
		})
	);
	subtotal = $derived(this.cartItems.reduce((n, it) => n + it.lineAmount, 0));
	shipping = $derived(this.subtotal === 0 || this.subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE);
	total = $derived(this.subtotal + this.shipping);
	shippingMsg = $derived(this.shipping ? `${won(FREE_SHIPPING - this.subtotal)} 더 담으면 무료배송이에요` : '무료배송으로 보내드려요');

	add(id: string, qty: number) {
		const p = productOf(id);
		if (!p) return;
		const line = this.cart.find((l) => l.id === id);
		if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
		else this.cart.push({ id, qty: Math.min(MAX_QTY, qty) });
		this.showToast(`${p.name} ${qty}개를 담았어요`);
	}
	setQty(id: string, qty: number) {
		const line = this.cart.find((l) => l.id === id);
		if (line) line.qty = Math.max(1, Math.min(MAX_QTY, qty));
	}
	remove(id: string) {
		this.cart = this.cart.filter((l) => l.id !== id);
	}

	// ---- 찜 ----
	liked(id: string) {
		return this.likes.includes(id);
	}
	toggleLike(id: string) {
		this.likes = this.liked(id) ? this.likes.filter((x) => x !== id) : [...this.likes, id];
	}
	likedProducts = $derived(PRODUCTS.filter((p) => this.likes.includes(p.id)));

	// ---- 주문(목) ----
	/** M4 에서 /api/checkout → 토스 → confirm 으로 바뀐다. 지금은 주문번호를 만들고 장바구니를 비우는 것까지. */
	placeOrder(payName: string): Order {
		const no = 'MYR-' + String(Date.now()).slice(-6);
		const order: Order = {
			no,
			lines: this.cartItems.map((it) => ({
				id: it.id,
				name: it.name,
				qty: it.qty,
				amount: it.lineAmount,
				tile: it.tile,
				ic: it.ic
			})),
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
