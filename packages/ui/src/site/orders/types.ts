/**
 * 주문 화면 컴포넌트가 받는 주문 모양 — `@sellery/db/server/orders` 의 `MyOrder` 와 구조적으로 호환되는 부분집합.
 * 사이트 컴포넌트는 서버 모듈(`@sellery/db/server/*`)을 import 하지 않는다(docs/monorepo-migration.md §3.3) — 앱의 `+page.server.ts` 가
 * `fetchMyOrders()` 결과(MyOrder)를 그대로 props 로 넘기면 이 타입에 대입된다.
 */
import type { OrderStatus, Shipping } from '@sellery/db/types';

export type OrderView = {
	id: string;
	/** 고객에게 보이는 주문번호 (o2000~) — 화면은 대문자 */
	code: string;
	status: OrderStatus;
	qty: number;
	unit_price: number;
	amount: number;
	option_name: string | null;
	courier: string | null;
	tracking_no: string | null;
	shipped_at: string | null;
	paid_at: string;
	refunded_at: string | null;
	refund_amount: number | null;
	refund_reason: string | null;
	payment_method: string | null;
	is_sample: boolean;
	shipping: Shipping | null;
	campaign: { code: string; status: string; end_date: string | null };
	product: { name: string; thumb_url: string | null; emoji: string };
	seller: { name: string; handle: string };
	brand: { name: string };
};

export type OrderSettings = { clear_days: number };
