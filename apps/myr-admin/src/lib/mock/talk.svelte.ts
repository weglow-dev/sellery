/** 파트너팀 톡 서버 흉내(0125 · docs/myr-admin-screens.md §7-2) — 크리에이터마다 방 하나 · 글만 · 실시간 아님(열 때 · 보낼 때 새로 읽는다).
 *  답할 차례 = 마지막 메시지를 크리에이터가 보낸 방. 읽음은 운영 공용(한 사람이 열면 모두 읽음). 수정 · 삭제 · 대화 종료는 없다.
 *  화면은 여기서 받은 줄 · 말풍선 묶음 · 칩 · 안내 · 건수만 그린다 — 기능 단계에서 RPC(0125 myr_talk_*)로 바뀐다 */
import { creatorOf, type CreatorBrief } from './catalog';
import { ME, NOW } from './seed';

export type TalkTab = 'wait' | 'all';
export type TalkWho = 'cr' | 'op';

export interface TalkMsg {
	who: TalkWho;
	text: string;
	/** "11월 16일(월)" */
	day: string;
	/** "오전 9:54" */
	time: string;
	/** 답한 운영자 — 크리에이터에게는 안 보인다(MYR 파트너팀) */
	opName?: string;
}
export interface TalkRoomRaw {
	creatorId: string;
	/** 운영이 안 읽은 메시지 수 */
	unread: number;
	/** 마지막 메시지부터 지난 분 */
	mins: number;
	msgs: TalkMsg[];
}

/** 대화방 목록 한 줄 */
export interface TalkRoomRow {
	id: string;
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	/** 마지막 메시지 첫 줄 80자 · 운영이면 "운영: " 앞에 */
	preview: string;
	/** 오늘이면 "오전 9:54", 아니면 "11월 16일" */
	time: string;
	waiting: boolean;
	/** 답할 차례면 기다린 시간("3시간째") */
	wait: string;
	unread: number;
}

/** 대화 말풍선 하나(묶음 · 날짜 칩 판정 포함) */
export interface TalkBubble {
	key: number;
	/** 날짜가 바뀌는 첫 메시지 — 위에 날짜 칩 */
	isDay: boolean;
	day: string;
	/** 대화의 첫 메시지(날짜 칩 위 여백이 작다) */
	top: boolean;
	mine: boolean;
	text: string;
	time: string;
	/** 운영 말풍선 아래 "운영 김지수 · 오후 4:05" */
	by: string;
	/** 같은 쪽이 이어 보낸 묶음의 첫 말풍선(아바타 · 이름 · 14px 여백) */
	first: boolean;
	showName: boolean;
}

export interface TalkConv {
	id: string;
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	waiting: boolean;
	wait: string;
	/** 머리 아래 한 줄 — "크리에이터가 마지막으로 보냈어요 · 3시간째" · "운영이 마지막으로 답했어요" · "아직 나눈 대화가 없어요" */
	sub: string;
	hasMsgs: boolean;
	msgs: TalkBubble[];
}

const TODAY = NOW.date;
const MAX = 2000;

/** 시안 예시 대화 5개(2026-11-24 · 11월 12일 기준)를 NOW(11월 17일(화) 오전 10:20)로 옮긴 것 — 답할 차례 3(토스 본인인증 문자 · 세금계산서 승인번호 · 사업자 정보 확인) · 운영이 답함 2(공구 링크 할인율 · 샘플) */
const M = (who: TalkWho, text: string, day: string, time: string, opName?: string): TalkMsg => ({ who, text, day, time, opName });
const seedTalks = (): TalkRoomRaw[] => [
	// 다인 — 토스 본인인증 전(APPROVAL_REQUIRED)
	{
		creatorId: 'c20',
		unread: 2,
		mins: 25,
		msgs: [M('cr', '토스 본인인증 문자를 못 받았어요.', '11월 17일(화)', '오전 9:54'), M('cr', '대표자 휴대폰 번호는 맞게 적었고, 스팸 문자함에도 없어요.', '11월 17일(화)', '오전 9:55')]
	},
	// 민지 — 세금계산서 승인번호
	{
		creatorId: 'c1',
		unread: 1,
		mins: 180,
		msgs: [
			M('cr', '판매 중인 상품 사진을 바꾸고 싶은데 지금 바꿔도 되나요?', '11월 15일(일)', '오후 3:12'),
			M('op', '네, 내 제품에서 고치면 수정본으로 심사해요. 승인 전까지 샵에는 지금 사진이 그대로 보여요.', '11월 15일(일)', '오후 4:05', '운영 박서연'),
			M('cr', '감사해요!', '11월 15일(일)', '오후 4:07'),
			M('cr', '세금계산서 승인번호를 잘못 적은 것 같아요.\n확인 전이면 고쳐서 다시 내도 될까요?', '11월 17일(화)', '오전 7:20')
		]
	},
	// 혜린 — 사업자 · 정산 정보 확인 대기
	{
		creatorId: 'c13',
		unread: 0,
		mins: 1490,
		msgs: [M('cr', '사업자 정보를 제출했는데 확인까지 얼마나 걸릴까요? 이번 달 정산을 받을 수 있는지 궁금해요.', '11월 16일(월)', '오전 9:30')]
	},
	// 준 — 공구 링크 할인율(운영이 답함)
	{
		creatorId: 'c3',
		unread: 0,
		mins: 1270,
		msgs: [M('cr', '공구 링크 할인율을 바꾸고 싶어요.', '11월 16일(월)', '오전 11:02'), M('op', '공구 링크는 만든 뒤에는 할인율을 바꿀 수 없어요. 새 링크를 만들고 지금 링크를 끝내 주세요.', '11월 16일(월)', '오후 1:10', '운영 김지수')]
	},
	// 온유 — 샘플(운영이 답함)
	{
		creatorId: 'c5',
		unread: 0,
		mins: 5225,
		msgs: [M('cr', '샘플을 한 번 더 받아 볼 수 있을까요?', '11월 13일(금)', '오후 6:40'), M('op', '네, 이번 주 안에 보내 드릴게요. 받으시면 톡으로 알려 주세요.', '11월 13일(금)', '오후 7:15', '운영 김지수')]
	}
];

/** 기다린 시간 — "25분째" · "3시간째" · "2일째" */
const ago = (mins: number) => (mins >= 1440 ? `${Math.floor(mins / 1440)}일째` : mins >= 60 ? `${Math.floor(mins / 60)}시간째` : `${Math.max(1, mins)}분째`);
const shortDay = (d: string) => d.replace(/\(.\)$/, '');
const waiting = (t: TalkRoomRaw) => t.msgs.length > 0 && t.msgs[t.msgs.length - 1].who === 'cr';
const brief = (id: string) => creatorOf(id) as CreatorBrief | undefined;

class TalkServer {
	roomsRaw = $state<TalkRoomRaw[]>(seedTalks());

	private raw(creatorId: string) {
		return this.roomsRaw.find((t) => t.creatorId === creatorId);
	}
	/** 메시지가 있는 방만(크리에이터 요약 · 답할 차례 판정 붙여서) — 답할 차례 먼저, 그 안에서 최근 메시지 순 */
	private get sorted() {
		return this.roomsRaw
			.filter((t) => t.msgs.length && brief(t.creatorId))
			.map((t) => ({ t, x: brief(t.creatorId)!, w: waiting(t) }))
			.sort((a, b) => Number(b.w) - Number(a.w) || a.t.mins - b.t.mins);
	}

	// ───────── 건수(홈 · 메뉴 배지 · 요약) ─────────

	/** waiting = 답할 차례 방 수 · waitingOldest = 가장 오래 기다린 방("2일째" · 없으면 "") */
	get counts() {
		const w = this.sorted.filter((a) => a.w);
		return {
			waiting: w.length,
			waitingOldest: w.length ? ago(Math.max(...w.map((a) => a.t.mins))) : ''
		};
	}

	/** 요약 한 줄 — "답할 차례 3 · 전체 5" */
	get sum() {
		return `답할 차례 ${this.counts.waiting} · 전체 ${this.sorted.length}`;
	}

	tabs(): { id: TalkTab; name: string; count: number }[] {
		return [
			{ id: 'wait', name: '답할 차례', count: this.counts.waiting },
			{ id: 'all', name: '전체', count: this.sorted.length }
		];
	}

	empty(tab: TalkTab) {
		return tab === 'wait' ? '답할 대화가 없어요' : '아직 크리에이터와 나눈 대화가 없어요';
	}

	// ───────── 대화방 목록 ─────────

	rooms(tab: TalkTab): TalkRoomRow[] {
		return this.sorted
			.filter((a) => tab === 'all' || a.w)
			.map(({ t, x, w }) => {
				const last = t.msgs[t.msgs.length - 1];
				return {
					id: t.creatorId,
					name: x.name,
					handle: x.handle,
					initial: x.initial,
					avatarBg: x.avatarBg,
					preview: `${last.who === 'op' ? '운영: ' : ''}${last.text.split('\n')[0].slice(0, 80)}`,
					time: last.day === TODAY ? last.time : shortDay(last.day),
					waiting: w,
					wait: ago(t.mins),
					unread: t.unread
				};
			});
	}

	/** PC 에서 고른 방이 없을 때 오른쪽에 여는 첫 방 */
	firstRoomId(tab: TalkTab): string | null {
		return this.rooms(tab)[0]?.id ?? null;
	}

	// ───────── 대화 ─────────

	/** 방이 없는 크리에이터도 연다(크리에이터 상세 [파트너팀 톡 열기] — 운영이 먼저 말을 건다 · 방은 답장 때 생긴다). 크리에이터가 없으면 null */
	room(creatorId: string): TalkConv | null {
		const x = brief(creatorId);
		if (!x) return null;
		const t = this.raw(creatorId) ?? {
			creatorId,
			unread: 0,
			mins: 0,
			msgs: []
		};
		const w = waiting(t);
		const msgs = t.msgs.map((m, i, a): TalkBubble => {
			const prev = a[i - 1];
			const isDay = !prev || prev.day !== m.day;
			const first = isDay || prev.who !== m.who;
			return {
				key: i,
				isDay,
				day: m.day,
				top: i === 0,
				mine: m.who === 'op',
				text: m.text,
				time: m.time,
				by: `${m.opName ?? '운영'} · ${m.time}`,
				first,
				showName: m.who === 'cr' && first
			};
		});
		return {
			id: creatorId,
			name: x.name,
			handle: x.handle,
			initial: x.initial,
			avatarBg: x.avatarBg,
			waiting: w,
			wait: ago(t.mins),
			sub: w ? `크리에이터가 마지막으로 보냈어요 · ${ago(t.mins)}` : t.msgs.length ? '운영이 마지막으로 답했어요' : '아직 나눈 대화가 없어요',
			hasMsgs: t.msgs.length > 0,
			msgs
		};
	}

	/** 열면 운영 읽음(공용) — 목록 배지가 사라진다 */
	open(creatorId: string) {
		const t = this.raw(creatorId);
		if (t && t.unread) t.unread = 0;
	}

	/** 답장 — 1~2,000자. 보내면 그 방은 답할 차례에서 빠지고 크리에이터 콘솔 톡 아이콘에 점이 붙는다. 방이 없으면 만든다 */
	send(creatorId: string, text: string): { ok: boolean; msg: string } {
		const x = brief(creatorId);
		if (!x) return { ok: false, msg: '크리에이터를 찾을 수 없어요' };
		const body = text.trim();
		if (!body || body.length > MAX) return { ok: false, msg: '메시지는 1~2,000자로 써 주세요' };
		const msg = M('op', body, TODAY, NOW.time, `${ME.role} ${ME.name}`);
		const t = this.raw(creatorId);
		if (t) {
			t.msgs.push(msg);
			t.mins = 0;
			t.unread = 0;
		} else {
			this.roomsRaw.push({ creatorId, unread: 0, mins: 0, msgs: [msg] });
		}
		return {
			ok: true,
			msg: `${x.name}에게 답장을 보냈어요 · 크리에이터 콘솔 톡 아이콘에 점이 붙어요`
		};
	}
}

export const talk = new TalkServer();
