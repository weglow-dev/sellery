/** 공구 링크 서버 흉내(docs/myr-admin-screens.md §9 · 시안 "MYR Admin PC" 상품 › 공구 링크 · 2026-11-27) — 크리에이터가 만든 공구 링크 · 기간 · 링크로 팔린 수량 · 매출.
 *  운영이 하는 일은 [강제 종료]뿐(잘못된 가격 · 기간). 만든 뒤 할인율은 못 바꾼다(새 링크를 만들고 지금 링크를 끝낸다).
 *  링크 = 샵 주소 + /g/<코드>(코드는 서버가 만드는 소문자 · 숫자 8자리 — 0086 `^[a-z0-9]{6,16}$`). 상품당 진행 중 · 예정 공구는 하나뿐.
 *  상태 칩 · 기간 · 공구가 문구 · 링크 주소 · 건수 · 빈 상태 · 버튼 표시 조건은 여기서 — 화면은 그린다. 상품 · 크리에이터는 catalog.ts 를 가리킨다 */
import { won } from '$lib/format';
import { creatorOf, productOf } from './catalog';
import { NOW } from './seed';
import type { Chip, Tone } from './types';

export type GroupbuyStatus = 'on' | 'soon' | 'end';
export type GroupbuyTab = GroupbuyStatus;

export interface GroupbuyRaw {
	id: string;
	creatorId: string;
	productId: string;
	/** 공구가(서버 값 · 화면에서 계산하지 않는다) · 기본가 대비 할인율 % */
	price: number;
	off: number;
	from: string;
	to: string;
	/** 링크 코드 — 서버가 만든 소문자 · 숫자 8자리 */
	code: string;
	sold: number;
	status: GroupbuyStatus;
	/** 운영이 강제 종료한 링크 */
	forced: boolean;
}

export interface GroupbuyRow {
	id: string;
	/** 줄을 누르면 공구 링크 상세 */
	href: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	/** "11월 15일 ~ 11월 21일" */
	meta: string;
	title: string;
	/** "민지 · 공구가 ₩25,600 (20% 할인)" */
	sub: string;
	/** 링크 매출(팔린 수량 × 공구가) */
	right: string;
	rightSub: string;
	/** 종료된 링크는 [강제 종료] 없음 */
	canEnd: boolean;
	/** 강제 종료 창 설명 — "민지 · 포도 글루타치온 젤리" */
	desc: string;
}

/** 공구 링크 상세(시안 detail kind 'link') */
export interface GroupbuyView {
	id: string;
	/** 목록 탭(뒤로가기) */
	tab: GroupbuyTab;
	crumb: string;
	title: string;
	/** "민지 @minji.daily" */
	sub: string;
	thumb: { tile: string; icon: string };
	/** 상태 칩 + 강제 종료 */
	chips: Chip[];
	stats: { k: string; v: string; tone?: Tone }[];
	info: { k: string; v: string }[];
	url: string;
	/** 링크 칸 아래 회색 안내(종료 · 예정) — 진행 중이면 빈 문자열 */
	note: string;
	/** [링크 열기] — 진행 중만 */
	canOpen: boolean;
	canEnd: boolean;
	desc: string;
}

/** 샵 주소(기능 단계에서는 PUBLIC_MYR_SHOP_URL — 크리에이터 콘솔 공구 화면과 같은 값) */
const SHOP_ORIGIN = 'https://myr-shop.vercel.app';
const urlOf = (code: string) => `${SHOP_ORIGIN}/g/${code}`;

const G = (id: string, creatorId: string, productId: string, price: number, off: number, from: string, to: string, code: string, sold: number, status: GroupbuyStatus, forced = false): GroupbuyRaw => ({
	id,
	creatorId,
	productId,
	price,
	off,
	from,
	to,
	code,
	sold,
	status,
	forced
});

/** 시안 공구 5개(11월 12일 기준)를 NOW(11월 17일)로 옮긴 것 — 진행 중 2 · 예정 1 · 종료 2.
 *  공구가 = 기본가 × (1 − 할인율) 를 서버가 보낸 값 */
const seedGroupbuys = (): GroupbuyRaw[] => [
	G('g1', 'c1', 'p1', 25600, 20, '11월 15일', '11월 21일', '7f3a9c21', 132, 'on'),
	G('g2', 'c2', 'p5', 23800, 15, '11월 13일', '11월 19일', 'b40e6d18', 58, 'on'),
	G('g3', 'c3', 'p7', 33150, 15, '11월 23일', '11월 29일', '2c9f5e07', 0, 'soon'),
	G('g4', 'c4', 'p10', 28900, 15, '10월 25일', '10월 31일', 'e81d4a6b', 94, 'end'),
	G('g5', 'c5', 'p12', 24000, 20, '10월 11일', '10월 17일', '5a0c7f93', 200, 'end')
];

const STATUS_CHIP: Record<GroupbuyStatus, Chip> = {
	on: { label: '진행 중', tone: 'mint' },
	soon: { label: '예정', tone: 'orange' },
	end: { label: '종료', tone: 'grey' }
};
const FORCED_CHIP: Chip = { label: '강제 종료', tone: 'red' };
const EMPTY: Record<GroupbuyTab, string> = {
	on: '진행 중인 공구가 없어요',
	soon: '예정된 공구가 없어요',
	end: '종료한 공구가 없어요'
};
/** 목의 오늘 — 강제 종료한 링크의 끝 날짜 */
const TODAY_SHORT = NOW.date.replace(/\(.\)$/, '');

class GroupbuysServer {
	linksRaw = $state<GroupbuyRaw[]>(seedGroupbuys());

	private raw(id: string) {
		return this.linksRaw.find((g) => g.id === id);
	}
	private n(st: GroupbuyStatus) {
		return this.linksRaw.filter((g) => g.status === st).length;
	}
	private chips(g: GroupbuyRaw) {
		return [STATUS_CHIP[g.status], ...(g.forced ? [FORCED_CHIP] : [])];
	}
	private desc(g: GroupbuyRaw) {
		return `${creatorOf(g.creatorId).name} · ${productOf(g.productId).name}`;
	}

	// ───────── 건수(요약) ─────────

	get counts() {
		return { on: this.n('on'), soon: this.n('soon'), ended: this.n('end') };
	}

	/** 요약 한 줄 — "진행 중 2건" */
	get sum() {
		return `진행 중 ${this.counts.on}건`;
	}

	tabs(): { id: GroupbuyTab; name: string; count: number }[] {
		return [
			{ id: 'on', name: '진행 중', count: this.n('on') },
			{ id: 'soon', name: '예정', count: this.n('soon') },
			{ id: 'end', name: '종료', count: this.n('end') }
		];
	}

	// ───────── 목록 ─────────

	/** 탭별 줄 — 줄 값은 서버가 만든 문구(시안처럼 검색 없음) */
	list(tab: GroupbuyTab): { rows: GroupbuyRow[]; empty: string } {
		const rows = this.linksRaw
			.filter((g) => g.status === tab)
			.map((g): GroupbuyRow => {
				const p = productOf(g.productId);
				const x = creatorOf(g.creatorId);
				return {
					id: g.id,
					href: `/products/groupbuys/${g.id}`,
					thumb: { tile: p.tile, icon: p.icon },
					chips: this.chips(g),
					meta: `${g.from} ~ ${g.to}`,
					title: p.name,
					sub: `${x.name} · 공구가 ${won(g.price)} (${g.off}% 할인)`,
					right: won(g.sold * g.price),
					rightSub: `${g.sold.toLocaleString('ko-KR')}개 판매`,
					canEnd: g.status !== 'end',
					desc: this.desc(g)
				};
			});
		return { rows, empty: EMPTY[tab] };
	}

	// ───────── 상세 ─────────

	/** 공구 링크 상세 — 판매 수량 · 판매 금액 · 공구 정보 · 발행된 링크(복사) · [링크 열기](진행 중) · [강제 종료](종료 전) */
	view(id: string): GroupbuyView | null {
		const g = this.raw(id);
		if (!g) return null;
		const p = productOf(g.productId);
		const x = creatorOf(g.creatorId);
		return {
			id: g.id,
			tab: g.status,
			crumb: '상품 · 공구 링크',
			title: p.name,
			sub: `${x.name} ${x.handle}`,
			thumb: { tile: p.tile, icon: p.icon },
			chips: this.chips(g),
			stats: [
				{ k: '판매 수량', v: `${g.sold.toLocaleString('ko-KR')}개` },
				{ k: '판매 금액', v: won(g.sold * g.price), tone: 'orange' }
			],
			info: [
				{ k: '상품', v: p.name },
				{ k: '크리에이터', v: `${x.name} ${x.handle}` },
				{ k: '기간', v: `${g.from} ~ ${g.to}` },
				{ k: '공구가', v: `${won(g.price)} (${g.off}% 할인)` }
			],
			url: urlOf(g.code),
			note: g.status === 'end' ? '종료한 공구라 링크가 닫혀 있어요' : g.status === 'soon' ? `${g.from}부터 링크가 열려요` : '',
			canOpen: g.status === 'on',
			canEnd: g.status !== 'end',
			desc: this.desc(g)
		};
	}

	// ───────── 상품 목록 칩(§4-1) ─────────

	/** 공구가 진행 중인 상품이면 "공구 중 15%"(민트) · 아니면 null */
	chipOf(productId: string): Chip | null {
		const g = this.linksRaw.find((x) => x.productId === productId && x.status === 'on');
		return g ? { label: `공구 중 ${g.off}%`, tone: 'mint' } : null;
	}

	// ───────── 동작 ─────────

	/** [강제 종료] — 링크가 바로 닫히고 다시 열 수 없다 */
	forceEnd(id: string): { ok: boolean; msg: string } {
		const g = this.raw(id);
		if (!g) return { ok: false, msg: '공구 링크를 찾을 수 없어요' };
		if (g.status === 'end') return { ok: false, msg: '이미 종료된 공구 링크예요' };
		g.status = 'end';
		g.to = TODAY_SHORT;
		g.forced = true;
		return { ok: true, msg: '공구 링크를 강제 종료했어요' };
	}
}

export const groupbuys = new GroupbuysServer();
