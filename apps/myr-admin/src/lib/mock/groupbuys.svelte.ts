/** 공구 링크 서버 흉내(docs/myr-admin-screens.md §9) — 크리에이터가 만든 공구 링크 · 기간 · 링크로 팔린 수량 · 매출.
 *  운영이 하는 일은 [강제 종료]뿐(잘못된 가격 · 기간 · 사유 필수 · 한 번 더 확인). 만든 뒤 할인율은 못 바꾼다(새 링크를 만들고 지금 링크를 끝낸다).
 *  상태 칩 · 기간 · 공구가 문구 · 건수 · 빈 상태는 여기서 — 화면은 그린다. 상품 · 크리에이터는 catalog.ts 를 가리킨다 */
import { won } from '$lib/format';
import { creatorOf, productOf } from './catalog';
import { NOW } from './seed';
import type { Chip } from './types';

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
	code: string;
	sold: number;
	cap: number;
	status: GroupbuyStatus;
	/** 강제 종료 사유(있으면 운영이 끝낸 링크) */
	why: string | null;
}

export interface GroupbuyRow {
	id: string;
	thumb: { tile: string; icon: string };
	chips: Chip[];
	/** "11월 15일 ~ 11월 21일 · 사유" */
	meta: string;
	title: string;
	/** "민지 · 공구가 ₩25,600 (20% 할인) · MINJI-GRAPE-11" */
	sub: string;
	copy: { text: string; what: string };
	/** 링크 매출(팔린 수량 × 공구가) */
	right: string;
	rightSub: string;
	/** 종료된 링크는 [강제 종료] 없음 */
	canEnd: boolean;
	/** 모달 설명 — "민지 · 포도 글루타치온 젤리 · MINJI-GRAPE-11" */
	desc: string;
}

const G = (id: string, creatorId: string, productId: string, price: number, off: number, from: string, to: string, code: string, sold: number, cap: number, status: GroupbuyStatus): GroupbuyRaw => ({
	id,
	creatorId,
	productId,
	price,
	off,
	from,
	to,
	code,
	sold,
	cap,
	status,
	why: null
});

/** 시안 공구 5개(11월 12일 기준)를 NOW(11월 17일)로 옮긴 것 — 진행 중 2 · 예정 1 · 종료 2. 공구가 = 기본가 × (1 − 할인율) 를 서버가 보낸 값 */
const seedGroupbuys = (): GroupbuyRaw[] => [
	G('g1', 'c1', 'p1', 25600, 20, '11월 15일', '11월 21일', 'MINJI-GRAPE-11', 132, 300, 'on'),
	G('g2', 'c2', 'p5', 23800, 15, '11월 13일', '11월 19일', 'HARU-FILM-11', 58, 200, 'on'),
	G('g3', 'c3', 'p7', 33150, 15, '11월 23일', '11월 29일', 'JUN-PROTEIN-11', 0, 150, 'soon'),
	G('g4', 'c4', 'p10', 28900, 15, '10월 25일', '10월 31일', 'SOY-AMPLE-10', 94, 100, 'end'),
	G('g5', 'c5', 'p12', 24000, 20, '10월 11일', '10월 17일', 'ONYU-PROBIO-10', 200, 200, 'end')
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

	// ───────── 건수(홈 · 메뉴 배지 · 요약) ─────────

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

	/** 탭 + 검색(상품 이름 · 링크 코드 · 크리에이터 이름) — 줄 값은 서버가 만든 문구 */
	list({ tab, q = '' }: { tab: GroupbuyTab; q?: string }): {
		rows: GroupbuyRow[];
		empty: string;
	} {
		const needle = q.trim().toLowerCase();
		const rows = this.linksRaw
			.filter((g) => g.status === tab)
			.map((g): GroupbuyRow & { txt: string } => {
				const p = productOf(g.productId);
				const x = creatorOf(g.creatorId);
				return {
					id: g.id,
					thumb: { tile: p.tile, icon: p.icon },
					chips: [STATUS_CHIP[g.status], ...(g.why ? [FORCED_CHIP] : [])],
					meta: `${g.from} ~ ${g.to}${g.why ? ` · ${g.why}` : ''}`,
					title: p.name,
					sub: `${x.name} · 공구가 ${won(g.price)} (${g.off}% 할인) · ${g.code}`,
					copy: { text: g.code, what: '링크 코드' },
					right: won(g.sold * g.price),
					rightSub: `${g.sold} / ${g.cap}개 판매`,
					canEnd: g.status !== 'end',
					desc: `${x.name} · ${p.name} · ${g.code}`,
					txt: `${p.name} ${g.code} ${x.name}`.toLowerCase()
				};
			})
			.filter((r) => !needle || r.txt.includes(needle));
		return { rows, empty: needle ? '검색 결과가 없어요' : EMPTY[tab] };
	}

	// ───────── 동작 ─────────

	/** [강제 종료] — 사유 필수 · 링크가 바로 닫히고 다시 열 수 없다 · 크리에이터에게 사유와 함께 알림 */
	forceEnd(id: string, why: string): { ok: boolean; msg: string } {
		const g = this.raw(id);
		if (!g) return { ok: false, msg: '공구 링크를 찾을 수 없어요' };
		const w = why.trim();
		if (!w) return { ok: false, msg: '사유를 적어 주세요' };
		if (g.status === 'end') return { ok: false, msg: '이미 종료된 공구 링크예요' };
		g.status = 'end';
		g.to = TODAY_SHORT;
		g.why = w;
		return { ok: true, msg: '공구 링크를 강제 종료했어요' };
	}
}

export const groupbuys = new GroupbuysServer();
