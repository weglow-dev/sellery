/**
 * 판매 중 상품 수정(수정 심사 · docs/myr.md §4.2.1 4-2) — 시안 "MYR Influencer Admin" · "… PC" 의 수정 모드 규칙. 순수 — src/test/product-edit.test.ts.
 *   - 수정 모드는 8단계(수정 내용 확인)에서 시작 → 섹션 [수정] 으로 그 단계에 갔다가 "수정 완료" 로 8단계로 돌아온다
 *   - 바꾼 섹션에 "변경됨" · 바꾼 게 없으면 "변경된 내용이 없어요"(요청 못 함) · 보조 버튼은 "취소"(임시저장 없음)
 *   - 비교는 저장 본문 기준(draftToPayload) — 공백 · 빈 줄 · 칸 개수 차이는 바꾼 걸로 치지 않는다
 */
import type { SellerProductPayload } from '@sellery/myr-core/seller-products';
import type { ProductDraft } from './data';
import { draftToPayload } from './product-draft';
import { EDITOR_STEPS, nextLabel, type SectionKey } from './rules';

export type EditorMode = 'new' | 'edit';

/** 섹션 → 비교할 저장 본문 키(내용량 unit 은 1단계 구매 패널) */
const SECTION_KEYS: Record<SectionKey, (keyof SellerProductPayload)[]> = {
	basics: ['image_urls', 'name', 'price', 'unit', 'category', 'tile', 'icon', 'chips'],
	note: ['note'],
	story: ['story_title', 'story'],
	ingredients: ['ingredient_rows'],
	howto: ['howto_steps'],
	info: ['form', 'pack', 'shelf_life', 'storage_method'],
	faq: ['faq']
};

/** 비교용 — 빈 태그 · 이름 없는 성분 · 제목 없는 섭취 단계 · 질문/답 빈 FAQ 를 뺀다(저장 RPC 0073 이 버리는 것과 같다) */
function comparable(ed: ProductDraft): SellerProductPayload {
	const p = draftToPayload(ed);
	return {
		...p,
		chips: p.chips.filter(Boolean),
		ingredient_rows: p.ingredient_rows.filter((r) => r.name),
		howto_steps: p.howto_steps.filter((s) => s.t),
		faq: p.faq.filter((f) => f.q && f.a)
	};
}

export function changedSections(ed: ProductDraft, orig: ProductDraft): Record<SectionKey, boolean> {
	const a = comparable(ed);
	const b = comparable(orig);
	return Object.fromEntries(
		(Object.keys(SECTION_KEYS) as SectionKey[]).map((k) => [k, SECTION_KEYS[k].some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]))])
	) as Record<SectionKey, boolean>;
}
export const anyChanged = (c: Record<SectionKey, boolean>) => Object.values(c).some(Boolean);

/** 하단 주 버튼 문구 */
export function primaryLabel(mode: EditorMode, step: number, ed: ProductDraft, changed: boolean): string {
	if (mode === 'new') return nextLabel(step, ed);
	if (step < EDITOR_STEPS) return '수정 완료';
	return changed ? '수정 심사 요청하기' : '변경된 내용이 없어요';
}
/** 주 버튼을 누를 수 있나 — 수정 모드 마지막 단계는 바꾼 게 있어야 */
export const primaryEnabled = (mode: EditorMode, step: number, valid: boolean, changed: boolean) => valid && !(mode === 'edit' && step >= EDITOR_STEPS && !changed);

/** 8단계 · 예시 패널 · 완료 화면 문구 — 시안의 isEdit 분기 그대로 */
export const MODE_COPY = {
	new: {
		trailPrefix: '',
		step8Name: '미리보기 · 제출',
		step8Title: '팔로워에게\n이렇게 보여요',
		step8Desc: '샵 상세페이지 순서 그대로예요. 비어 있는 섹션은 샵에서 숨겨져요.',
		step8Notice: '제출하면 MYR 운영팀이 표시·광고 문구를 검토해요. 보통 영업일 1~2일 안에 승인되고, 수정이 필요하면 알림으로 알려드려요.',
		secondary: '임시저장',
		doneTitle: '심사 요청했어요',
		doneDesc: '영업일 1~2일 안에 검토 결과를 알려드려요.',
		doneSteps: [
			{ title: '제출 완료', desc: '방금 상세페이지가 전달됐어요' },
			{ title: '운영팀 검토', desc: '표시·광고 문구와 성분 표기를 확인해요' },
			{ title: 'MYR Shop 오픈', desc: '승인되면 바로 판매가 시작돼요' }
		]
	},
	edit: {
		trailPrefix: '수정 중  ·  ',
		step8Name: '수정 내용 확인',
		step8Title: '바꾼 내용을\n확인해 주세요',
		step8Desc: '바꾼 섹션에는 ‘변경됨’이 표시돼요. 섹션 옆 수정을 눌러 고칠 수 있어요.',
		step8Notice: '수정 심사 중에도 지금 상세페이지로 판매는 계속돼요. 승인되면 샵에 바로 반영돼요',
		secondary: '취소',
		doneTitle: '수정 심사 요청했어요',
		doneDesc: '심사 중에도 지금 상세페이지로 판매는 계속돼요.',
		doneSteps: [
			{ title: '제출 완료', desc: '방금 수정 내용이 전달됐어요' },
			{ title: '운영팀 검토', desc: '표시·광고 문구와 성분 표기를 확인해요' },
			{ title: '샵에 반영', desc: '승인되면 상세페이지가 바로 바뀌어요' }
		]
	}
} as const satisfies Record<EditorMode, unknown>;

/** 수정 심사 중 안내(목록 · 메뉴) */
export const REVISION_PENDING_TOAST = '수정 심사 중이에요 · 승인되면 바로 반영돼요';
