/**
 * 반려 · 수정 반려(0074 · 시안 "MYR Influencer Admin" · "… PC" 의 "심사 결과" · "반려 내용 고치기") — 순수 규칙. src/test/product-review.test.ts.
 *   - 운영팀 의견은 섹션별(step 1~7) · step 이 없으면 "전체". 의견이 없던 반려(사유 한 줄)는 전체 의견 1건으로 본다
 *   - 고치기 모드: 의견이 달린 섹션을 바꾸기 전까지 "수정 필요" — 남은 곳이 있으면 다시 요청 못 함
 */
import type { RejectItem } from '@sellery/myr-core/seller-products';
import { relativeTime } from './product-row';
import type { SectionKey } from './rules';

/** 에디터 단계 → 섹션 · 이름(심사 결과 "02 · 레시피 노트") */
export const STEP_SECTION: Record<number, { key: SectionKey; name: string }> = {
	1: { key: 'basics', name: '기본 정보' },
	2: { key: 'note', name: '레시피 노트' },
	3: { key: 'story', name: '왜 만들었나요' },
	4: { key: 'ingredients', name: '성분' },
	5: { key: 'howto', name: '섭취법' },
	6: { key: 'info', name: '제품 정보' },
	7: { key: 'faq', name: 'FAQ' }
};

/** 화면에 보일 의견 — 섹션 의견이 없으면 사유 한 줄을 전체 의견으로 */
export function rejectItemsOf(items: RejectItem[], reason: string | null): RejectItem[] {
	if (items.length) return items;
	return reason?.trim() ? [{ step: null, msg: reason.trim() }] : [];
}

/** 의견 머리 — "02 · 레시피 노트" · 전체 */
export const rejectItemLabel = (it: RejectItem) => (it.step && STEP_SECTION[it.step] ? `${String(it.step).padStart(2, '0')} · ${STEP_SECTION[it.step].name}` : '전체');

/** 의견이 달린 섹션 중 아직 안 바꾼 것 — 고치기 8단계 "수정 필요" 칩 */
export function flaggedSections(items: RejectItem[], changed: Record<SectionKey, boolean> | null): Partial<Record<SectionKey, boolean>> {
	const out: Partial<Record<SectionKey, boolean>> = {};
	for (const it of items) {
		const sec = it.step ? STEP_SECTION[it.step] : null;
		if (sec && !changed?.[sec.key]) out[sec.key] = true;
	}
	return out;
}

/** 남은 "수정 필요" 의견 수(시안 fixRemaining — 의견 단위) */
export const fixRemaining = (items: RejectItem[], changed: Record<SectionKey, boolean> | null) =>
	items.filter((it) => it.step && STEP_SECTION[it.step] && !changed?.[STEP_SECTION[it.step].key]).length;

/** 그 단계의 운영팀 의견(고치기 모드 단계 위 박스) · 8단계는 전체 의견 */
export const stepNotes = (items: RejectItem[], step: number) => items.filter((it) => (step >= 8 ? it.step === null : it.step === step)).map((it) => it.msg);

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 한국 시각(콘솔은 국내 서비스) — 서버 · 브라우저 시간대와 무관하게 같은 글자 */
const kst = (d: Date) => new Date(d.getTime() + 9 * 3_600_000);

/** 심사 결과 머리 시각 — "오늘 오후 2:10" · "어제 오전 9:05" · "11월 3일 오후 2:10" */
export function reviewWhen(iso: string | null | undefined, now: Date = new Date()): string {
	const t = iso ? new Date(iso) : null;
	if (!t || !Number.isFinite(t.getTime())) return '';
	const k = kst(t);
	const dayDiff = Math.round((Date.UTC(kst(now).getUTCFullYear(), kst(now).getUTCMonth(), kst(now).getUTCDate()) - Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())) / 86_400_000);
	const h = k.getUTCHours();
	const time = `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad2(k.getUTCMinutes())}`;
	const day = dayDiff === 0 ? '오늘' : dayDiff === 1 ? '어제' : `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
	return `${day} ${time}`;
}

/** 목록 보조 문구의 날 — "오늘" · "어제" · "3일 전" */
export function reviewDayWord(iso: string | null | undefined, now: Date = new Date()): string {
	const w = reviewWhen(iso, now);
	if (w.startsWith('오늘')) return '오늘';
	if (w.startsWith('어제')) return '어제';
	return relativeTime(iso, now);
}

/** 목록 보조 문구 — "오늘 반려 · 2건 수정 필요" · "어제 수정 반려 · 1건 수정 필요" */
export function rejectMeta(kind: 'new' | 'rev', reviewedAt: string | null, items: RejectItem[], reason: string | null, now: Date = new Date()): string {
	const day = reviewDayWord(reviewedAt, now);
	const n = rejectItemsOf(items, reason).length;
	return [`${day ? `${day} ` : ''}${kind === 'rev' ? '수정 반려' : '반려'}`, n ? `${n}건 수정 필요` : ''].filter(Boolean).join(' · ');
}

/** 심사 결과 화면 문구(시안 rjChip · rjTitle · rjDesc) */
export const REVIEW_COPY = {
	new: { chip: '반려', title: '심사에서 반려됐어요', desc: '아래 의견을 반영해 고치면 바로 다시 심사를 요청할 수 있어요.' },
	rev: { chip: '수정 반려', title: '수정 내용이 반려됐어요', desc: '고친 부분이 기준에 맞지 않았어요. 아래 의견을 반영해 다시 요청해 주세요.' }
} as const;
