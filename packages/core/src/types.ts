/* ============ 데이터 모델 (localStorage 시드 = supabase/ 스키마와 1:1) ============ */
export type Status =
	| 'SAMPLE_REQUESTED' | 'INVITED' | 'DECLINED' | 'REJECTED' | 'SAMPLE_APPROVED' | 'SAMPLE_PURCHASED'
	| 'SAMPLE_SHIPPED' | 'TESTING' | 'PASSED' | 'SCHEDULE_PROPOSED' | 'SCHEDULE_CONFIRMED' | 'LIVE' | 'CLEARING' | 'SETTLED';

export type Platform = 'instagram' | 'youtube' | 'naver' | 'tiktok';
export type Grade = '스타터' | '브론즈' | '실버' | '골드' | '플래티넘' | '다이아' | '블랙';

export interface SettleInfo {
	type?: 'personal' | 'biz';
	bank?: string; account?: string; holder?: string; bizNo?: string; bizDoc?: string; mailOrder?: string;
}
export interface Channel {
	id: string; platform: Platform; handle: string; url?: string; followers?: number;
	verified?: boolean; primary?: boolean; vcode?: string;
}
export interface Brand {
	id: string; name: string; cat: string; manager: string; email?: string;
	settleInfo?: SettleInfo; gmvBase?: number; logo?: string; refCode?: string; referredBy?: string;
	autoPropose?: boolean; celeryItems?: Record<string, string>; freeRefUsed?: Record<string, number>;
	sampleExtra?: number;
}
export interface Seller {
	id: string; name: string; handle: string; email?: string; platform: Platform;
	settleInfo?: SettleInfo; img?: string; followers: number; cat: string; likesAvg: number;
	recentLikes?: number[]; m3Sales: number; refCode: string; referredBy?: string; intro: string;
	hidden?: boolean; channels?: Channel[]; celeryItems?: Record<string, string>; sampleExtra?: number;
}
export interface Option { n: string; price: number }
export interface SamplePolicy { freeGrade: Grade; buyMode: 'auto' | 'fixed'; fixedPrice: number; refund: boolean }
export interface Product {
	id: string; brandId: string; name: string; desc: string; em: string; thumb?: string | null; imgs?: string[];
	cat: string; cp: number; gp: number; rate: number; sample: string; stock: number;
	status: 'listed' | 'pending' | 'paused' | 'rejected'; rejectReason?: string;
	t?: { g: string; note: string }; exclusive?: { grade?: Grade; min?: number; label: string }; exclusiveSellerId?: string;
	samplePolicy?: SamplePolicy; options?: Option[]; boosted?: boolean; celeryItems?: Record<string, string>;
}
export interface SamplePaid { price: number; cel: number; cash: number; method: 'cash' | 'cel' }
export interface Campaign {
	id: string; sellerId: string; productId: string; status: Status; createdAt: string;
	start?: string; end?: string; qty?: number; propStart?: string; propEnd?: string; propQty?: number;
	testDue?: string; tracking?: string; settledAt?: string; purchased?: boolean; samplePaid?: SamplePaid;
	sampleRefunded?: boolean; invited?: boolean; auto?: boolean; celUsed?: number; celRefunded?: number;
	regongu?: boolean; homeFeatured?: string;
}
export interface Order {
	id: string; campaignId: string; buyer: string; buyerId?: string | null; qty: number; unit: number; opt?: string;
	status: 'PAID' | 'REFUNDED' | 'CANCELED'; at: string; sample?: boolean; tracking?: string; courier?: string;
}
export interface Message { type: 'sys' | 'chat' | 'warn'; txt: string; at: string; role?: 'seller' | 'brand' | 'admin' }
export interface CS {
	id: string; cid: string; orderId: string | null; buyer: string; type: string; msg: string;
	status: 'OPEN' | 'ANSWERED' | 'CLOSED'; at: string; reply?: string; repliedAt?: string;
}
export interface LedgerEntry { who: string; at: string; delta: number; memo: string; won?: number }
export interface Settlement {
	at: string; cid: string; title: string; net: number; brandPay: number; sellerPay: number;
	platFee: number; pfNet: number; holdS: boolean; holdB: boolean;
}
export interface ExclusiveReq { id: string; productId: string; sellerId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; at: string }
export interface ExternalSale { name: string; brand: string; src: Platform; at: string; price: number }

export interface Data {
	brands: Brand[]; sellers: Seller[]; products: Product[]; campaigns: Campaign[]; orders: Order[];
	cs: CS[]; messages: Record<string, Message[]>; settlements: Settlement[]; seq: number;
	celeryLedger: LedgerEntry[]; brandRefEarnings: { at: string; referrerId: string; fromBrandId: string; campaignId: string; amt: number }[];
	refEarnings: { at: string; referrerId: string; fromSellerId: string; campaignId: string; amt: number }[];
	productViews: { sellerId: string; productId: string; ago: string }[];
	unlockedRefs: string[]; brandDataUnlocks: Record<string, string[]>;
	external: Record<string, ExternalSale[]>; exclusiveReqs: ExclusiveReq[];
	autoPO?: { on: boolean; email: string }; opex?: Record<string, number>;
}

/** 고객(카카오) 세션 · 장바구니 — 시드와 분리 저장 */
export interface Cust { id: string; name: string; email: string; kakao: true; at: string }
export interface CartItem { cid: string; oi: number; qty: number }
/** 파트너 세션 (login) */
export interface Session { role: 'seller' | 'brand' | 'admin'; id: string; name?: string; email?: string; google?: boolean }
