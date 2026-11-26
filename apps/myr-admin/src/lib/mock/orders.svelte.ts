/** 주문 · 배송 목 서버 — docs/myr-admin-screens.md §6 (주문 목록 · 상세 서랍 · 송장 일괄 입력 · 배송 완료 예외).
 *  UI 단계라 판정 · 문구 · 버튼 목록 · 건수를 여기서 만든다(메모리 · 새로고침하면 시드로). 기능 단계에서 RPC 로 바뀐다.
 *  화면(routes/orders · OrderDrawer · OrderModals)은 여기서 받은 칩 · 안내 · 버튼 · 건수만 그린다 — 화면에서 상태를 다시 판정하지 않는다.
 *  기준 시각은 seed.ts 의 NOW(11월 17일(화) 오전 10:20) · 시안(11월 12일 기준)의 날짜는 +5일 옮겼다. 크리에이터 · 상품은 catalog.ts 의 id 를 가리킨다 */
import { creatorOf, productOf } from './catalog';
import { ME, NOW } from './seed';
import type { Chip, LogEntry, Tone } from './types';

export type OrderStatus = 'paid' | 'wait' | 'shipping' | 'delivered' | 'refunded';
/** 주문 탭 — 상태 + 이벗 발주 실패(결제 완료 중 3번 다시 시도해도 실패한 주문 · 홈 할 일에서 바로 연다) */
export type OrderTab = OrderStatus | 'ebutFail' | 'all';
/** 서랍 아래 버튼 — 송장 입력(운영이 직접 · 평소엔 이벗 송장 자동 수집) · 송장 정정 · 배송 완료 · 예외 환불 */
export type OrderAction = 'ship' | 'fixShip' | 'delivered' | 'refund';
export type OrderSub = 'list' | 'bulk';
/** 배송 중 탭 안 필터 — 전체 · 배송 완료 예외(?ex=1) */
export type ShipFilter = 'all' | 'overdue';

export interface OrderLine {
	productId: string;
	qty: number;
	price: number;
}

export interface OrderRaw {
	id: string;
	/** 결제일(ISO) — 입금 대기는 주문일 */
	paidOn: string;
	status: OrderStatus;
	/** 주문자 · 연락처 · 주소 원문 — 가린 값은 서버가 만들고 원문은 [보기] 때만(열람 기록이 남는다) */
	raw: { name: string; phone: string; address: string };
	lines: OrderLine[];
	creatorId: string;
	amount: number;
	/** by — ebut = 이벗 발주 · 18시 송장 수집으로 들어온 송장(자동 배송 완료 대상) · ops = 운영이 직접 입력(자동 배송 완료 없음) */
	ship: { carrier: string; tracking: string; shippedOn: string; by: 'ebut' | 'ops' } | null;
	/** 이벗 발주 실패(결제 완료 주문 · 결정 13 — 3번 다시 시도 뒤) — 화면은 실패일 때만 안내한다 */
	ebut?: { state: 'failed'; at?: string };
	deliveredOn: string | null;
	refundedOn: string | null;
	/** 입금 대기 — "11월 18일까지 입금" */
	due: string | null;
	note: string | null;
	log: LogEntry[];
}

export interface OrderRow {
	id: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	meta: string;
	title: string;
	sub: string;
	right: string;
}

export interface BulkRow {
	key: string;
	/** 찾은 주문 — 없으면 null(줄은 저장 안 됨) */
	id: string | null;
	thumb: { tile: string; icon: string } | null;
	chips: Chip[];
	meta: string;
	title: string;
	sub: string;
}

export interface OrderView {
	id: string;
	status: OrderStatus;
	chip: Chip;
	/** "11월 17일 결제 · 강*아" */
	sub: string;
	title: string;
	thumb: { tile: string; icon: string };
	amount: number;
	lines: {
		productId: string;
		name: string;
		thumb: { tile: string; icon: string };
		qtyText: string;
		amountText: string;
	}[];
	/** 수취인 · 연락처 · 주소 — 가린 값 + 원문 */
	recipient: { k: string; masked: string; raw: string }[];
	payment: string;
	creator: { id: string; name: string; handle: string };
	note: string | null;
	ship: {
		carrier: string;
		tracking: string;
		shippedText: string;
		done: string;
		doneTone: Tone;
	} | null;
	/** 송장이 없을 때 한 줄 — 결제 완료면 주황 "아직 입력하지 않았어요" */
	noShip: { text: string; tone: Tone };
	/** 이벗 발주 실패 안내(송장 칸 위 · 빨강) + 이벗 관리자에서 찾을 상품코드 — 실패가 아니면 null */
	ebutFail: { text: string; codes: { name: string; code: string }[] } | null;
	/** 배송 완료 예외면 송장 칸 위 주황 안내(왜 자동으로 안 끝났는지 · 운영이 직접 기록) — 아니면 null */
	deliverNote: string | null;
	log: LogEntry[];
	actions: OrderAction[];
}

/** 목의 오늘 — server.svelte.ts TODAY 와 같다(순환 import 를 피하려고 따로 적었다) */
export const TODAY = '2026-11-17';
/** 다음 정산 — 12월 1일(화) 오후 1시(seed OTHER_COUNTS.settle.nextAt) */
const NEXT_SETTLE = '12월 1일';
/** 배송 완료 예외(§6-4) — 운영이 직접 입력한 송장은 자동 배송 완료가 없어 발송 5일째부터 */
const OVERDUE_DAYS = 5;
/** 이벗 송장은 택배사 완료('91') 또는 발송 10일 뒤 자동 배송 완료(0118 · 바인허브와 같음) — 10일이 지나도 배송 중이면 예외 */
const AUTO_DELIVER_DAYS = 10;
export const CARRIERS = ['CJ대한통운', '한진택배', '롯데택배', '우체국택배'];
const TRACKING_RE = /^[\d-]{8,}$/;

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const fd = (iso: string) => {
	const [, m, d] = iso.split('-').map(Number);
	return `${m}월 ${d}일`;
};
const daysSince = (iso: string) => Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(iso)) / 86400000));
const ageText = (d: number) => (d ? `${d}일째` : '오늘');
const stamp = () => `11월 17일 ${NOW.time}`;
const me = () => `${ME.role} ${ME.name}`;
const maskName = (n: string) => (n.length < 2 ? n : `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`);
const maskPhone = (p: string) => `010-****-${p.slice(-4)}`;
const maskAddr = (a: string) => `${a.split(' ').slice(0, 2).join(' ')} ****`;

const STATUS_CHIP: Record<OrderStatus, Chip> = {
	paid: { label: '결제 완료', tone: 'orange' },
	wait: { label: '입금 대기', tone: 'grey' },
	shipping: { label: '배송 중', tone: 'mint' },
	delivered: { label: '배송 완료', tone: 'grey' },
	refunded: { label: '환불', tone: 'red' }
};
const TAB_NAME: Record<OrderTab, string> = {
	paid: '결제 완료',
	ebutFail: '이벗 발주 실패',
	wait: '입금 대기',
	shipping: '발송(배송 중)',
	delivered: '배송 완료',
	refunded: '환불',
	all: '전체'
};
const TAB_ORDER: OrderTab[] = ['paid', 'ebutFail', 'wait', 'shipping', 'delivered', 'refunded', 'all'];

// ───────── 시드(시안 orders 12건 · +5일) ─────────

const O = (id: string, paidOn: string, status: OrderStatus, creatorId: string, raw: [string, string, string], lines: [string, number, number][], x: Partial<OrderRaw> = {}): OrderRaw => ({
	id,
	paidOn,
	status,
	creatorId,
	raw: { name: raw[0], phone: raw[1], address: raw[2] },
	lines: lines.map(([productId, qty, price]) => ({ productId, qty, price })),
	amount: lines.reduce((a, [, q, p]) => a + q * p, 0),
	ship: null,
	deliveredOn: null,
	refundedOn: null,
	due: null,
	note: null,
	log: [],
	...x
});
const shipped = (carrier: string, tracking: string, shippedOn: string, by: 'ebut' | 'ops' = 'ops') => ({
	carrier,
	tracking,
	shippedOn,
	by
});
const L = (at: string, text: string, who = '크리에이터'): LogEntry => ({
	at,
	text,
	who
});

export const seedOrders = (): OrderRaw[] => [
	O(
		'MYR1534',
		'2026-11-17',
		'paid',
		'c2',
		['강수아', '010-3312-7780', '서울 마포구 월드컵북로 21, 804호'],
		[
			['p5', 1, 28000],
			['p6', 1, 26000]
		],
		{ log: [L('11월 17일 오전 9:48', '카드 결제 완료 · ₩54,000', '자동')] }
	),
	O('MYR1533', '2026-11-16', 'wait', 'c3', ['문재호', '010-7720-1145', '부산 해운대구 센텀중앙로 55, 1203호'], [['p7', 1, 39000]], {
		due: '11월 18일까지 입금',
		log: [L('11월 16일 오후 8:12', '무통장 입금 주문 · 가상계좌 발급', '자동')]
	}),
	O(
		'MYR1531',
		'2026-11-15',
		'paid',
		'c1',
		['한민지', '010-5521-9034', '경기 성남시 분당구 판교역로 14, 502호'],
		[
			['p1', 1, 32000],
			['p2', 1, 36000]
		],
		{
			ebut: { state: 'failed', at: '11월 16일 오전 11:00' },
			log: [L('11월 15일 오후 3:21', '카드 결제 완료 · ₩68,000', '자동'), L('11월 16일 오전 11:00', '이벗 발주 실패 · 3번 다시 시도했지만 실패(상품코드 없음)', '자동')]
		}
	),
	O('MYR1529', '2026-11-14', 'shipping', 'c1', ['오지수', '010-2290-4417', '서울 송파구 올림픽로 300, 2104호'], [['p1', 1, 32000]], {
		ship: shipped('CJ대한통운', '5612-3344-9087', '2026-11-15', 'ebut'),
		log: [L('11월 14일 오전 11:02', '카드 결제 완료 · ₩32,000', '자동'), L('11월 14일 오전 11:00', '이벗 발주 · 배송준비중', '자동'), L('11월 15일 오후 6:00', '이벗 송장 수집 · CJ대한통운 5612-3344-9087', '자동')]
	}),
	O('MYR1527', '2026-11-14', 'paid', 'c1', ['윤서원', '010-6634-2208', '대전 유성구 대학로 99, 301호'], [['p1', 1, 32000]], { log: [L('11월 14일 오전 9:35', '카드 결제 완료 · ₩32,000', '자동')] }),
	O('MYR1524', '2026-11-11', 'delivered', 'c1', ['이하늘', '010-8102-5563', '인천 연수구 송도과학로 32, 1502호'], [['p2', 3, 36000]], {
		ship: shipped('CJ대한통운', '5612-3301-2245', '2026-11-12'),
		deliveredOn: '2026-11-14',
		note: '1개 환불 ₩36,000',
		log: [L('11월 12일 오전 10:40', '송장 직접 입력 · CJ대한통운 5612-3301-2245'), L('11월 14일 오후 4:20', '배송 완료 · 택배사 연동', '자동'), L('11월 16일 오후 1:05', '1개 환불 ₩36,000 · 고객 요청', '운영 박서연')]
	}),
	O('MYR1521', '2026-11-10', 'shipping', 'c4', ['장서윤', '010-4471-3390', '광주 서구 상무중앙로 7, 905호'], [['p10', 1, 34000]], {
		ship: shipped('한진택배', '4410-2231-7765', '2026-11-10'),
		log: [L('11월 10일 오후 5:30', '송장 직접 입력 · 한진택배 4410-2231-7765')]
	}),
	O('MYR1520', '2026-11-10', 'delivered', 'c1', ['정다은', '010-9011-6672', '서울 강서구 마곡중앙로 161, 1107호'], [['p1', 2, 32000]], {
		ship: shipped('CJ대한통운', '5612-3290-1180', '2026-11-11'),
		deliveredOn: '2026-11-13',
		log: [L('11월 11일 오전 10:15', '송장 직접 입력 · CJ대한통운 5612-3290-1180'), L('11월 13일 오후 2:48', '배송 완료 · 택배사 연동', '자동')]
	}),
	O('MYR1519', '2026-11-06', 'shipping', 'c3', ['배현준', '010-3345-8126', '대구 수성구 달구벌대로 2450, 702호'], [['p7', 2, 39000]], {
		ship: shipped('롯데택배', '2380-7714-5502', '2026-11-07', 'ebut'),
		log: [L('11월 6일 오후 7:40', '카드 결제 완료 · ₩78,000', '자동'), L('11월 7일 오전 11:00', '이벗 발주 · 배송준비중', '자동'), L('11월 7일 오후 6:00', '이벗 송장 수집 · 롯데택배 2380-7714-5502', '자동')]
	}),
	O('MYR1512', '2026-11-07', 'delivered', 'c1', ['박지훈', '010-2217-9045', '서울 성동구 왕십리로 83, 1401호'], [['p2', 2, 36000]], {
		ship: shipped('CJ대한통운', '5612-3255-7741', '2026-11-08'),
		deliveredOn: '2026-11-10',
		note: '교환 요청 R-0314',
		log: [L('11월 8일 오전 9:50', '송장 직접 입력 · CJ대한통운 5612-3255-7741'), L('11월 10일 오후 3:12', '배송 완료 · 택배사 연동', '자동'), L('11월 12일 오전 11:30', '교환 요청 R-0314 접수', '자동')]
	}),
	O('MYR1509', '2026-11-05', 'delivered', 'c1', ['김서연', '010-5580-3321', '경기 고양시 일산동구 중앙로 1275, 603호'], [['p1', 1, 32000]], {
		ship: shipped('CJ대한통운', '5612-3240-6619', '2026-11-06'),
		deliveredOn: '2026-11-08',
		note: '환불 요청 R-0312',
		log: [L('11월 6일 오후 1:20', '송장 직접 입력 · CJ대한통운 5612-3240-6619'), L('11월 8일 오후 5:40', '배송 완료 · 택배사 연동', '자동'), L('11월 10일 오후 2:15', '환불 요청 R-0312 접수', '자동')]
	}),
	O('MYR1498', '2026-11-02', 'refunded', 'c1', ['서예린', '010-7719-2284', '서울 관악구 남부순환로 1820, 407호'], [['p1', 1, 32000]], {
		ship: shipped('CJ대한통운', '5612-3198-4403', '2026-11-03'),
		refundedOn: '2026-11-06',
		note: '전액 환불',
		log: [L('11월 3일 오전 10:05', '송장 직접 입력 · CJ대한통운 5612-3198-4403'), L('11월 6일 오후 4:30', '전액 환불 ₩32,000 · 파손 접수', '운영 박서연')]
	})
];

// ───────── 서버 ─────────

class OrdersServer {
	raw = $state<OrderRaw[]>(seedOrders());
	/** 송장 일괄 입력 — 마지막 [N건 저장]으로 저장한 주문(미리보기 칩 "저장했어요") · [새로 입력]으로 비운다 */
	private bulkSaved = $state<string[] | null>(null);

	private find(id: string) {
		return this.raw.find((o) => o.id === id);
	}
	private patch(id: string, fn: (o: OrderRaw) => Partial<OrderRaw>, text: string) {
		this.raw = this.raw.map((o) => (o.id === id ? { ...o, ...fn(o), log: [...o.log, { at: stamp(), text, who: me() }] } : o));
	}
	private shipDays(o: OrderRaw) {
		return o.ship ? daysSince(o.ship.shippedOn) : 0;
	}
	/** 배송 완료 예외(§6-4 · 2026-11-26) — 배송 중인데 자동으로 끝나지 않는 주문: 직접 입력 송장은 발송 5일째부터 · 이벗 송장은 10일이 지나도 배송 중일 때 */
	private isOverdue(o: OrderRaw) {
		if (o.status !== 'shipping' || !o.ship) return false;
		return this.shipDays(o) >= (o.ship.by === 'ebut' ? AUTO_DELIVER_DAYS : OVERDUE_DAYS);
	}
	/** 왜 자동으로 안 끝났는지 — 목록 둘째 줄 · 서랍 안내 */
	private overdueWhy(o: OrderRaw) {
		return o.ship?.by === 'ebut' ? '이벗에서 취소됐거나 18시 송장 수집이 실패했어요' : '운영이 직접 입력한 송장이에요';
	}
	private first(o: OrderRaw) {
		return productOf(o.lines[0].productId);
	}
	private thumb(o: OrderRaw) {
		const p = this.first(o);
		return { tile: p.tile, icon: p.icon };
	}
	/** 제목 — 첫 상품 + "× n" 또는 "외 N개" */
	private title(o: OrderRaw) {
		return this.first(o).name + (o.lines.length > 1 ? ` 외 ${o.lines.length - 1}개` : ` × ${o.lines[0].qty}`);
	}
	private who(o: OrderRaw) {
		return maskName(o.raw.name);
	}

	// ───────── 건수 · 탭 · 하위 화면 ─────────

	/** 이벗 발주 실패 — 결제 완료인데 11시 발주가 3번 다시 시도해도 실패(서버 판정 자리 · 기능 단계에서 실패 판정 · 기록 — myr-admin-plan §4) */
	private ebutFailed = (o: OrderRaw) => o.status === 'paid' && o.ebut?.state === 'failed';

	/** 홈 · 메뉴 배지용(server.svelte.ts 에 연결) — 이벗 발주 실패 · 발송 대기 = 결제 완료 · 배송 완료 예외(noDelivered) = 자동으로 끝나지 않는 배송 중 */
	get counts() {
		const toShip = this.raw.filter((o) => o.status === 'paid');
		const over = this.raw.filter((o) => this.isOverdue(o));
		return {
			ebutFail: this.raw.filter(this.ebutFailed).length,
			toShip: toShip.length,
			toShipOldest: ageText(Math.max(0, ...toShip.map((o) => daysSince(o.paidOn)))),
			noDelivered: over.length,
			noDeliveredOldest: ageText(Math.max(0, ...over.map((o) => this.shipDays(o)))),
			shipping: this.raw.filter((o) => o.status === 'shipping').length
		};
	}

	/** 메뉴 안 화면(시안 subs) — SubNav 항목. 배송 완료 예외는 하위 화면 대신 배송 중 탭 안 필터(2026-11-26) */
	get subs(): { key: OrderSub; label: string; href: string; n?: number }[] {
		return [
			{ key: 'list', label: '주문 목록', href: '/orders' },
			{ key: 'bulk', label: '송장 일괄 입력', href: '/orders/bulk' }
		];
	}

	/** 배송 중 탭 안 필터 — 배송 완료 예외는 주황 숫자(hot) */
	shipFilters(): { id: ShipFilter; name: string; count: number; hot?: boolean }[] {
		return [
			{ id: 'all', name: '전체', count: this.counts.shipping },
			{ id: 'overdue', name: '배송 완료 예외', count: this.counts.noDelivered, hot: true }
		];
	}

	/** 탭 — 이벗 발주 실패는 빨간 숫자(hot) */
	tabs(): { id: OrderTab; name: string; count: number; hot?: boolean }[] {
		return TAB_ORDER.map((id) => ({
			id,
			name: TAB_NAME[id],
			count: id === 'all' ? this.raw.length : id === 'ebutFail' ? this.raw.filter(this.ebutFailed).length : this.raw.filter((o) => o.status === id).length,
			hot: id === 'ebutFail'
		}));
	}
	readonly defaultTab: OrderTab = 'paid';
	readonly listEmpty = '해당하는 주문이 없어요';
	readonly bulkEmpty = 'CSV를 붙여 넣으면 여기에서 미리 볼 수 있어요';
	readonly bulkSum = 'CSV 한 줄 = 주문번호,택배사,운송장';
	readonly overdueEmpty = '자동으로 끝나지 않은 배송이 없어요';
	readonly overdueBand = `자동으로 배송 완료되지 않는 주문이에요 — 운영이 직접 입력한 송장(발송 ${OVERDUE_DAYS}일째부터) · 이벗에서 취소됐거나 18시 송장 수집이 실패한 송장(발송 ${AUTO_DELIVER_DAYS}일이 지나도 배송 중) · 택배 조회로 도착을 확인하고 [배송 완료]로 기록해 주세요 · 기록이 없으면 정산에 들어가지 않아요(다음 정산 ${NEXT_SETTLE} 오후 1시)`;

	get listSum() {
		const c = this.counts;
		return `${c.ebutFail ? `이벗 발주 실패 ${c.ebutFail}건 · ` : ''}발송 대기 ${c.toShip}건 · 배송 중 ${c.shipping}건`;
	}

	// ───────── 목록 ─────────

	private row(r: OrderRaw): OrderRow {
		const c = creatorOf(r.creatorId);
		const over = this.isOverdue(r);
		return {
			id: r.id,
			thumb: this.thumb(r),
			chips: this.ebutFailed(r) ? [STATUS_CHIP[r.status], { label: '이벗 발주 실패', tone: 'red' }] : over ? [STATUS_CHIP[r.status], { label: `배송 완료 예외 · 발송 ${this.shipDays(r)}일째`, tone: 'orange' }] : [STATUS_CHIP[r.status]],
			meta: `${r.id} · ${fd(r.paidOn)} 결제 · ${this.who(r)}`,
			title: this.title(r),
			sub: `${c.name} · ${r.ship ? `${r.ship.carrier} ${r.ship.tracking}${over ? ` · ${this.overdueWhy(r)}` : ''}` : r.status === 'paid' ? (r.ebut?.state === 'failed' ? '이벗 발주 실패 · 확인 필요' : '송장 입력 전') : (r.due ?? '송장 없음')}`,
			right: won(r.amount)
		};
	}

	/** 주문 목록 — 탭(상태) · 배송 중 탭 안 필터(배송 완료 예외) · 검색(주문번호 · 주문자 · 상품 · 크리에이터) */
	list({ tab, q, ship = 'all' }: { tab: OrderTab; q: string; ship?: ShipFilter }): OrderRow[] {
		const needle = q.trim().toLowerCase();
		return this.raw
			.filter((o) => (tab === 'all' ? true : tab === 'ebutFail' ? this.ebutFailed(o) : o.status === tab))
			.filter((o) => tab !== 'shipping' || ship === 'all' || this.isOverdue(o))
			.filter((o) => !needle || `${o.id} ${this.who(o)} ${o.raw.name} ${o.lines.map((l) => productOf(l.productId).name).join(' ')} ${creatorOf(o.creatorId).name}`.toLowerCase().includes(needle))
			.map((o) => this.row(o));
	}

	// ───────── 이벗 발주 실패(결정 13 · myr-shop 크론 ebut-prepare 평일 11시 · 주문마다 3번 다시 시도) ─────────

	/** 발주 실패 안내 — 주문 등록은 우리 상품코드로 나가므로(이벗 확인 2026-11-25) 이벗 관리자에서 그 코드로 찾게 줄마다 코드를 준다.
	 *  해결하면 다음 영업일 11시에 다시 발주된다. 실패가 아니면 null */
	private ebutFailNote(o: OrderRaw): { text: string; codes: { name: string; code: string }[] } | null {
		if (o.status !== 'paid' || o.ebut?.state !== 'failed') return null;
		return {
			text: `이벗 발주가 3번 실패했어요${o.ebut.at ? `(${o.ebut.at})` : ''} · 이벗 관리자에서 아래 상품코드로 상품이 등록돼 있는지 확인해 주세요 · 해결하면 다음 영업일 11시에 다시 발주돼요`,
			codes: o.lines.map((l) => {
				const p = productOf(l.productId);
				return { name: p.name, code: p.code };
			})
		};
	}

	// ───────── 상세(서랍) ─────────

	view(id: string): OrderView | undefined {
		const o = this.find(id);
		if (!o) return undefined;
		const c = creatorOf(o.creatorId);
		const over = this.isOverdue(o);
		const actions: OrderAction[] = [];
		if (o.status === 'paid') actions.push('ship');
		if (o.status === 'shipping') actions.push('fixShip', 'delivered');
		if (o.status === 'paid' || o.status === 'shipping' || o.status === 'delivered') actions.push('refund');
		return {
			id: o.id,
			status: o.status,
			chip: STATUS_CHIP[o.status],
			sub: `${fd(o.paidOn)} 결제 · ${this.who(o)}`,
			title: this.title(o),
			thumb: this.thumb(o),
			amount: o.amount,
			lines: o.lines.map((l) => {
				const p = productOf(l.productId);
				return {
					productId: l.productId,
					name: p.name,
					thumb: { tile: p.tile, icon: p.icon },
					qtyText: `${l.qty}개`,
					amountText: won(l.qty * l.price)
				};
			}),
			recipient: [
				{ k: '수취인', masked: this.who(o), raw: o.raw.name },
				{ k: '연락처', masked: maskPhone(o.raw.phone), raw: o.raw.phone },
				{ k: '주소', masked: maskAddr(o.raw.address), raw: o.raw.address }
			],
			payment: `${o.status === 'wait' ? `무통장 입금 · ${o.due}` : `카드 · ${fd(o.paidOn)}`} · ${won(o.amount)}`,
			creator: { id: c.id, name: c.name, handle: c.handle },
			note: o.note,
			ship: o.ship
				? {
						carrier: o.ship.carrier,
						tracking: o.ship.tracking,
						shippedText: fd(o.ship.shippedOn),
						done: o.deliveredOn ? fd(o.deliveredOn) : o.refundedOn ? `${fd(o.refundedOn)} 환불` : over ? `기록 없음 · 발송 ${this.shipDays(o)}일째` : '배송 중',
						doneTone: over && !o.deliveredOn && !o.refundedOn ? 'red' : 'plain'
					}
				: null,
			noShip: o.status === 'paid' ? { text: '아직 입력하지 않았어요', tone: 'orange' } : { text: '—', tone: 'plain' },
			ebutFail: this.ebutFailNote(o),
			deliverNote: over ? `자동으로 배송 완료되지 않는 주문이에요(운영이 직접 입력한 송장 · 이벗에서 취소된 주문 · 18시 송장 수집이 실패한 경우) · 이 주문은 ${this.overdueWhy(o)} · 택배 조회로 도착을 확인한 뒤 [배송 완료]로 기록해 주세요` : null,
			log: o.log,
			actions
		};
	}

	// ───────── 동작 — 거절은 { ok: false, msg } 로 돌려주고 화면이 모달 안 · 토스트로 보여 준다 ─────────

	/** 송장 입력(운영이 직접) · 정정 — 택배사는 목록에서 · 운송장은 숫자와 - 8자리 이상. 저장하면 배송 중 · 고객에게 알림(기능 단계) */
	ship(id: string, carrier: string, tracking: string): { ok: boolean; msg: string } {
		const o = this.find(id);
		if (!o) return { ok: false, msg: '주문을 찾을 수 없어요' };
		if (!CARRIERS.includes(carrier)) return { ok: false, msg: '택배사를 골라 주세요' };
		const tr = tracking.trim();
		if (!TRACKING_RE.test(tr))
			return {
				ok: false,
				msg: '운송장 번호를 확인해 주세요 — 숫자 8자리 이상'
			};
		if (o.status !== 'paid' && o.status !== 'shipping')
			return {
				ok: false,
				msg: `${STATUS_CHIP[o.status].label} 주문에는 송장을 넣을 수 없어요`
			};
		const fix = !!o.ship;
		this.patch(
			id,
			(x) => ({
				status: 'shipping',
				ship: { carrier, tracking: tr, shippedOn: x.ship?.shippedOn ?? TODAY, by: x.ship?.by ?? 'ops' }
			}),
			`${fix ? '송장 정정' : '송장 직접 입력'} · ${carrier} ${tr}`
		);
		return {
			ok: true,
			msg: fix ? '송장을 정정했어요' : '송장을 입력했어요 · 배송 중으로 바뀌었어요'
		};
	}

	/** 배송 완료 기록(§6-4) — 실제 배송일은 오늘 이전 · 발송일 이후. 기록해야 그달 정산에 들어간다 */
	markDelivered(id: string, isoDate: string): { ok: boolean; msg: string } {
		const o = this.find(id);
		if (!o) return { ok: false, msg: '주문을 찾을 수 없어요' };
		if (!o.ship || o.status !== 'shipping')
			return {
				ok: false,
				msg: '배송 중인 주문만 배송 완료로 기록할 수 있어요'
			};
		if (!isoDate) return { ok: false, msg: '실제 배송일을 골라 주세요' };
		if (isoDate > TODAY) return { ok: false, msg: '배송일은 오늘보다 뒤일 수 없어요' };
		if (isoDate < o.ship.shippedOn)
			return {
				ok: false,
				msg: `배송일이 발송일(${fd(o.ship.shippedOn)}) 전이에요`
			};
		this.patch(id, () => ({ status: 'delivered', deliveredOn: isoDate }), `배송 완료 기록 (${fd(isoDate)})`);
		return { ok: true, msg: `${o.id}을 ${fd(isoDate)} 배송 완료로 기록했어요` };
	}

	/** 예외 환불 — 교환 · 환불 요청 없이 운영이 바로 환불(사유 필수 · 되돌릴 수 없음) */
	refundException(id: string, why: string): { ok: boolean; msg: string } {
		const o = this.find(id);
		if (!o) return { ok: false, msg: '주문을 찾을 수 없어요' };
		const reason = why.trim();
		if (!reason) return { ok: false, msg: '사유를 적어 주세요' };
		if (o.status === 'wait' || o.status === 'refunded')
			return {
				ok: false,
				msg: `${STATUS_CHIP[o.status].label} 주문은 환불할 수 없어요`
			};
		this.patch(
			id,
			() => ({
				status: 'refunded',
				refundedOn: TODAY,
				note: `예외 환불 · ${reason}`
			}),
			`예외 환불 · ${reason}`
		);
		return { ok: true, msg: `${won(o.amount)} 환불했어요` };
	}

	// ───────── 송장 일괄 입력(CSV) ─────────

	private parseCsv(csv: string) {
		return csv
			.split('\n')
			.map((x) => x.trim())
			.filter(Boolean)
			.map((line, i) => {
				const [no = '', co = '', tr = ''] = line.split(',').map((x) => x.trim());
				const o = this.find(no);
				const saved = !!o && !!this.bulkSaved?.includes(no);
				const why = !o
					? '주문번호를 찾을 수 없어요'
					: !co || !tr
						? '택배사 · 운송장이 비어 있어요'
						: !CARRIERS.includes(co)
							? `모르는 택배사예요 — ${CARRIERS.join(' · ')}`
							: !TRACKING_RE.test(tr)
								? '운송장 번호를 확인해 주세요 — 숫자 8자리 이상'
								: saved || o.status === 'paid'
									? ''
									: o.status === 'wait'
										? '입금 대기 주문이에요'
										: o.status === 'refunded'
											? '환불된 주문이에요'
											: '이미 발송한 주문이에요';
				return { i, no, co, tr, o, saved, ok: !why, why };
			});
	}

	/** 미리보기 — 줄마다 저장할 수 있어요(민트) · 저장 안 됨(빨강 + 이유) · 저장했어요(회색) */
	bulkPreview(csv: string): {
		rows: BulkRow[];
		okN: number;
		n: number;
		saved: boolean;
	} {
		const parsed = this.parseCsv(csv);
		const saved = this.bulkSaved !== null;
		return {
			rows: parsed.map((x) => ({
				key: `${x.i}-${x.no}`,
				id: x.o?.id ?? null,
				thumb: x.o ? this.thumb(x.o) : null,
				chips: [x.ok ? (x.saved ? { label: '저장했어요', tone: 'grey' } : { label: '저장할 수 있어요', tone: 'mint' }) : { label: '저장 안 됨', tone: 'red' }],
				meta: x.why,
				title: x.no || '주문번호 없음',
				sub: `${x.co || '택배사 없음'} · ${x.tr || '운송장 없음'}`
			})),
			okN: parsed.filter((x) => x.ok && !x.saved).length,
			n: parsed.length,
			saved
		};
	}

	/** [N건 저장] — 저장할 수 있는 줄만 송장 저장(배송 중) · 결과 한 줄 */
	bulkSave(csv: string): { ok: boolean; msg: string } {
		const parsed = this.parseCsv(csv);
		const good = parsed.filter((x) => x.ok && !x.saved);
		if (!good.length) return { ok: false, msg: '저장할 수 있는 줄이 없어요' };
		for (const x of good)
			this.patch(
				x.no,
				() => ({
					status: 'shipping',
					ship: { carrier: x.co, tracking: x.tr, shippedOn: TODAY, by: 'ops' }
				}),
				`송장 일괄 입력 · ${x.co} ${x.tr}`
			);
		this.bulkSaved = good.map((x) => x.no);
		const failN = parsed.length - good.length;
		return {
			ok: true,
			msg: `${good.length}건 저장했어요${failN ? ` · ${failN}건은 저장하지 못했어요` : ''}`
		};
	}

	/** [새로 입력] — 저장 결과를 비운다(화면은 CSV 칸도 비운다) */
	bulkReset() {
		this.bulkSaved = null;
	}
}

export const orders = new OrdersServer();
