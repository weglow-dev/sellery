/**
 * 공구 링크 — 순수 규칙(0086 · docs/myr.md §9-6 작업 순서 4). 샵 · 크리에이터 콘솔이 같이 쓴다. 테스트 src/test/groupbuy.test.ts.
 *   · 할인율은 정수 · 모든 옵션에 같은 비율 · 상품당 진행 중이거나 예정된 공구 하나(서버가 ALREADY_OPEN 으로 막는다).
 *   · 할인율 범위는 여기 없다 — DB `myr_groupbuy_pct_ok` 한 곳(표 CHECK · 만들기 · 미리보기 · 0099). 콘솔 폼은 서버가 준 범위(pct_min · pct_max)를 보여 주고, 범위 밖이면 서버 거절(BAD_PCT · min · max)을 그대로 안내한다.
 *   · 공구가 · 공구 상태(예정 · 진행 · 종료)는 여기서 계산하지 않는다 — DB `myr_groupbuy_price` · `myr_groupbuy_state` 한 곳(장바구니 견적 · 체크아웃 · 콘솔 미리보기가 같이 쓴다 · 0092).
 *     화면은 서버가 준 price · state 를 그대로 쓰고, 시작 · 끝 시각이 오면 서버에 다시 묻는다.
 *   · 시각은 한국 시간으로 보여 준다(입력 'YYYY-MM-DDTHH:mm' 도 한국 시간).
 */
import { QTY_INT_MAX } from './constants';

/** 할인율 범위 — 서버 값(0099 myr_groupbuy_pct_min · max). 화면에 숫자를 두지 않는다 */
export type GroupbuyPctRange = { min: number; max: number };
export function pctRangeFromJson(min: unknown, max: unknown): GroupbuyPctRange | null {
	return Number.isInteger(min) && Number.isInteger(max) ? { min: min as number, max: max as number } : null;
}
export const GB_CODE_RE = /^[a-z0-9]{6,16}$/;

export type GroupbuyState = 'scheduled' | 'active' | 'ended';
export const GB_STATE_META: Record<GroupbuyState, { label: string }> = {
	scheduled: { label: '예정' },
	active: { label: '진행 중' },
	ended: { label: '종료' }
};

export const groupbuyHref = (code: string): string => `/g/${code}`;

/** 옵션별 가격(DB myr_groupbuy_product_json options) — 옵션 고르는 화면이 생기면 고른 옵션의 groupbuyPrice 를 보여 준다(장바구니 · 체크아웃과 같은 단가) */
export type GroupbuyOption = { index: number; name: string; price: number; groupbuyPrice: number };
/** 샵 · 장바구니가 받는 모양(DB myr_groupbuy_json) — price = 옵션 0번(옵션 없으면 대표가)의 공구가 · options 는 링크 · 콘솔 응답에만(장바구니 줄은 그 줄 옵션의 price 하나라 []) */
export type Groupbuy = { code: string; state: GroupbuyState; discountPct: number; startsAt: string; endsAt: string; price: number; options: GroupbuyOption[] };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isState = (v: unknown): v is GroupbuyState => v === 'scheduled' || v === 'active' || v === 'ended';
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function groupbuyFromJson(v: unknown): Groupbuy | null {
	const o = obj(v);
	if (!o || typeof o.code !== 'string' || !GB_CODE_RE.test(o.code) || !isState(o.state)) return null;
	if (!Number.isInteger(o.discount_pct) || !isTime(o.starts_at) || !isTime(o.ends_at) || !Number.isInteger(o.price)) return null;
	const options = (Array.isArray(o.options) ? o.options : [])
		.map(obj)
		.filter((x): x is Record<string, unknown> => !!x && Number.isInteger(x.index) && Number.isInteger(x.price) && Number.isInteger(x.groupbuy_price))
		.map((x) => ({ index: x.index as number, name: typeof x.name === 'string' ? x.name : '', price: x.price as number, groupbuyPrice: x.groupbuy_price as number }));
	return { code: o.code, state: o.state, discountPct: o.discount_pct as number, startsAt: o.starts_at, endsAt: o.ends_at, price: o.price as number, options };
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

/** '11.15(20:00)' — 목록 · 기간 */
export function kstShort(iso: string): string {
	const d = kst(iso);
	return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())})`;
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

/** 칸별 오류(입력 형식 · 기간 앞뒤) — 빈 객체면 통과. 시작이 지났으면 서버가 지금으로 당긴다(오류 아님).
 *  할인율은 숫자 형식만 본다 — 범위는 서버가 정한다(미리보기 · 만들기의 BAD_PCT) */
export function groupbuyErrors(d: GroupbuyDraft, now: number = Date.now()): Partial<Record<GroupbuyField, string>> {
	const e: Partial<Record<GroupbuyField, string>> = {};
	if (!/^\d{1,2}$/.test(d.pct.trim())) e.pct = '할인율을 숫자로 넣어주세요';
	const s = kstInputToIso(d.startsAt);
	const en = kstInputToIso(d.endsAt);
	if (!s) e.startsAt = '시작 일시를 골라주세요';
	if (!en) e.endsAt = '종료 일시를 골라주세요';
	else if (Date.parse(en) <= now) e.endsAt = '종료 일시는 지금 이후여야 해요';
	else if (s && Date.parse(en) <= Math.max(Date.parse(s), now)) e.endsAt = '종료 일시는 시작 일시 뒤여야 해요';
	return e;
}

/** POST 본문 { pct, startsAt, endsAt(ISO) } → 값 · 형식이 틀리면 null. 할인율은 정수인지만 본다(전송 형식) — 범위 · 기간 판정은 서버(BAD_PCT · BAD_PERIOD) */
export function parseGroupbuyBody(v: unknown): GroupbuyBody | null {
	const o = obj(v);
	if (!o || !Number.isInteger(o.pct) || Math.abs(o.pct as number) > QTY_INT_MAX) return null;
	if (!isTime(o.startsAt) || !isTime(o.endsAt)) return null;
	return { pct: o.pct as number, startsAt: new Date(o.startsAt).toISOString(), endsAt: new Date(o.endsAt).toISOString() };
}

export const GB_ERROR_MESSAGES: Record<string, string> = {
	NOT_FOUND: '제품을 찾을 수 없어요',
	NOT_LISTED: '판매 중인 제품만 공구 링크를 만들 수 있어요',
	SOLD_OUT: '품절된 제품은 공구 링크를 만들 수 없어요. 재고가 들어오면 만들 수 있어요',
	BAD_PCT: '할인율을 다시 확인해주세요',
	BAD_PERIOD: '기간을 다시 확인해주세요 — 종료는 시작 뒤, 지금 이후여야 해요',
	ALREADY_OPEN: '이미 진행 중이거나 예정된 공구가 있어요. 그 공구가 끝난 뒤 새로 만들 수 있어요',
	ALREADY_ENDED: '이미 끝난 공구예요'
};
/** 서버 거절 → 안내 문구. BAD_PCT 는 서버가 같이 준 범위(min · max)로 — 범위를 못 받았으면 숫자 없이 */
export const groupbuyErrorMessage = (code: string | undefined, range?: GroupbuyPctRange | null): string =>
	code === 'BAD_PCT' && range ? `할인율은 ${range.min}~${range.max}% 사이로 넣어주세요` : (code && GB_ERROR_MESSAGES[code]) || '처리하지 못했어요. 잠시 후 다시 시도해주세요';

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
