/**
 * 공구 링크 — 순수 규칙(0086 · docs/myr.md §9-6 작업 순서 4). 샵 · 크리에이터 콘솔이 같이 쓴다. 테스트 src/test/groupbuy.test.ts.
 *   · 할인율 1~70%(정수) · 모든 옵션에 같은 비율 · 상품당 진행 중이거나 예정된 공구 하나(서버가 ALREADY_OPEN 으로 막는다).
 *   · 공구가 계산의 정답은 DB `myr_groupbuy_price`(장바구니 · 체크아웃이 쓰는 값). 여기 `groupbuyPrice` 는 콘솔이 할인율을 고를 때 미리 보여 주는 용도 —
 *     같은 식(10원 아래 버림)이고 테스트가 pgTAP 과 같은 사례를 고정한다.
 *   · 시각은 한국 시간으로 보여 준다(입력 'YYYY-MM-DDTHH:mm' 도 한국 시간).
 */

export const GB_PCT_MIN = 1;
export const GB_PCT_MAX = 70;
export const GB_CODE_RE = /^[a-z0-9]{6,16}$/;

export type GroupbuyState = 'scheduled' | 'active' | 'ended';
export const GB_STATE_META: Record<GroupbuyState, { label: string }> = {
	scheduled: { label: '예정' },
	active: { label: '진행 중' },
	ended: { label: '종료' }
};

/** 공구가 = 기본가 × (100 − pct)% 를 10원 아래 버림 (DB myr_groupbuy_price 와 같은 식) */
export const groupbuyPrice = (price: number, pct: number): number => Math.floor((price * (100 - pct)) / 1000) * 10;

export const groupbuyHref = (code: string): string => `/g/${code}`;

/** 샵 · 장바구니가 받는 모양(DB myr_groupbuy_json) */
export type Groupbuy = { code: string; state: GroupbuyState; discountPct: number; startsAt: string; endsAt: string; price: number };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isState = (v: unknown): v is GroupbuyState => v === 'scheduled' || v === 'active' || v === 'ended';
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function groupbuyFromJson(v: unknown): Groupbuy | null {
	const o = obj(v);
	if (!o || typeof o.code !== 'string' || !GB_CODE_RE.test(o.code) || !isState(o.state)) return null;
	if (!Number.isInteger(o.discount_pct) || !isTime(o.starts_at) || !isTime(o.ends_at) || !Number.isInteger(o.price)) return null;
	return { code: o.code, state: o.state, discountPct: o.discount_pct as number, startsAt: o.starts_at, endsAt: o.ends_at, price: o.price as number };
}

/** 지금 시각 기준 상태 — 서버가 준 state 가 ended 면 그대로(지금 종료), 아니면 시각으로 다시 판단(장바구니를 열어 둔 채 시간이 지난 경우) */
export function groupbuyStateAt(g: Pick<Groupbuy, 'state' | 'startsAt' | 'endsAt'>, now: number = Date.now()): GroupbuyState {
	if (g.state === 'ended' || now >= Date.parse(g.endsAt)) return 'ended';
	return now < Date.parse(g.startsAt) ? 'scheduled' : 'active';
}

/* ---------------- 한국 시간 표시 ---------------- */

const KST_MS = 9 * 60 * 60 * 1000;
const kst = (iso: string | number): Date => new Date((typeof iso === 'number' ? iso : Date.parse(iso)) + KST_MS);
const pad = (n: number) => String(n).padStart(2, '0');

/** '11월 15일 오후 8시' · '11월 15일 오전 9시 30분' */
export function kstLabel(iso: string): string {
	const d = kst(iso);
	const h = d.getUTCHours();
	const m = d.getUTCMinutes();
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${h < 12 ? '오전' : '오후'} ${h12}시${m ? ` ${m}분` : ''}`;
}

/** '11.15 20:00' — 목록 · 표 */
export function kstShort(iso: string): string {
	const d = kst(iso);
	return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 남은 시간 — '2일 23시간 남음' · '3일 남음' · '5시간 남음' · '12분 남음' (끝났으면 '종료') — 넘치게 말하지 않게 내림 */
export function remainLabel(endsAt: string, now: number = Date.now()): string {
	const ms = Date.parse(endsAt) - now;
	if (ms <= 0) return '종료';
	const min = Math.floor(ms / 60000);
	if (min >= 24 * 60) {
		const d = Math.floor(min / (24 * 60));
		const h = Math.floor((min % (24 * 60)) / 60);
		return `${d}일${h ? ` ${h}시간` : ''} 남음`;
	}
	if (min >= 60) return `${Math.floor(min / 60)}시간 남음`;
	return `${Math.max(1, min)}분 남음`;
}

/** 입력 칸 값(한국 시간 'YYYY-MM-DDTHH:mm') → ISO · 틀리면 null */
export function kstInputToIso(v: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
	const t = Date.parse(`${v}:00+09:00`);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** ISO → 입력 칸 값(한국 시간 · 분 단위) */
export function isoToKstInput(iso: string | number): string {
	const d = kst(iso);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* ---------------- 콘솔 — 만들기 ---------------- */

export type GroupbuyDraft = { pct: string; startsAt: string; endsAt: string };
export type GroupbuyField = keyof GroupbuyDraft;
export type GroupbuyBody = { pct: number; startsAt: string; endsAt: string };

/** 칸별 오류 — 빈 객체면 통과. 시작이 지났으면 서버가 지금으로 당긴다(오류 아님) */
export function groupbuyErrors(d: GroupbuyDraft, now: number = Date.now()): Partial<Record<GroupbuyField, string>> {
	const e: Partial<Record<GroupbuyField, string>> = {};
	const pct = Number(d.pct);
	if (!/^\d{1,2}$/.test(d.pct.trim()) || pct < GB_PCT_MIN || pct > GB_PCT_MAX) e.pct = `할인율은 ${GB_PCT_MIN}~${GB_PCT_MAX}% 사이 정수로 넣어주세요`;
	const s = kstInputToIso(d.startsAt);
	const en = kstInputToIso(d.endsAt);
	if (!s) e.startsAt = '시작 일시를 골라주세요';
	if (!en) e.endsAt = '종료 일시를 골라주세요';
	else if (Date.parse(en) <= now) e.endsAt = '종료 일시는 지금 이후여야 해요';
	else if (s && Date.parse(en) <= Math.max(Date.parse(s), now)) e.endsAt = '종료 일시는 시작 일시 뒤여야 해요';
	return e;
}

/** POST 본문 { pct, startsAt, endsAt(ISO) } → 값 · 틀리면 null (서버가 같은 규칙으로 다시 막는다) */
export function parseGroupbuyBody(v: unknown): GroupbuyBody | null {
	const o = obj(v);
	if (!o || !Number.isInteger(o.pct) || (o.pct as number) < GB_PCT_MIN || (o.pct as number) > GB_PCT_MAX) return null;
	if (!isTime(o.startsAt) || !isTime(o.endsAt)) return null;
	return { pct: o.pct as number, startsAt: new Date(o.startsAt).toISOString(), endsAt: new Date(o.endsAt).toISOString() };
}

export const GB_ERROR_MESSAGES: Record<string, string> = {
	NOT_FOUND: '제품을 찾을 수 없어요',
	NOT_LISTED: '판매 중인 제품만 공구 링크를 만들 수 있어요',
	SOLD_OUT: '품절된 제품은 공구 링크를 만들 수 없어요. 재고가 들어오면 만들 수 있어요',
	BAD_PCT: `할인율은 ${GB_PCT_MIN}~${GB_PCT_MAX}% 사이로 넣어주세요`,
	BAD_PERIOD: '기간을 다시 확인해주세요 — 종료는 시작 뒤, 지금 이후여야 해요',
	ALREADY_OPEN: '이미 진행 중이거나 예정된 공구가 있어요. 그 공구가 끝난 뒤 새로 만들 수 있어요',
	ALREADY_ENDED: '이미 끝난 공구예요'
};
export const groupbuyErrorMessage = (code: string | undefined): string => (code && GB_ERROR_MESSAGES[code]) || '처리하지 못했어요. 잠시 후 다시 시도해주세요';

/** 콘솔 목록 줄(DB myr_groupbuy_seller_json) — 공구 + 실적(0076 홈 실적과 같은 줄 기준: 결제된 주문 · 환불 뺀 값) */
export type SellerGroupbuy = Groupbuy & {
	plannedEndsAt: string;
	closedAt: string | null;
	createdAt: string;
	stats: { orders: number; units: number; net: number };
};
const int = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
export function sellerGroupbuyFromJson(v: unknown): SellerGroupbuy | null {
	const g = groupbuyFromJson(v);
	const o = obj(v);
	if (!g || !o || !isTime(o.planned_ends_at) || !isTime(o.created_at)) return null;
	const st = obj(o.stats) ?? {};
	return {
		...g,
		plannedEndsAt: o.planned_ends_at,
		closedAt: isTime(o.closed_at) ? o.closed_at : null,
		createdAt: o.created_at,
		stats: { orders: int(st.orders), units: int(st.units), net: int(st.net) }
	};
}
