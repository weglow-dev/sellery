/** 콘솔 화면 규칙 — 탭 필터 · CS 처리 방법 · 타임라인 · 상품 에디터 검증과 미리보기 요약.
 *  디자인(Claude Design "MYR Influencer Admin")의 renderVals 계산을 순수 함수로 옮겼다. $app · $env 를 import 하지 않는다 — src/test/rules.test.ts.
 *
 *  ⚠ 돈 숫자 두 개는 **디자인 값**이고 정책이 아니다 — 정산 정책이 정해지면(docs/myr.md §9-6) 서버 값으로 바꾼다.
 *    PLATFORM_FEE_RATE 10%(에디터 "예상 정산") · ROUND_TRIP_SHIPPING ₩6,000(부분 환불 · 단순 변심 왕복 배송비). */
import { myrCategoryName } from '@sellery/myr-core/categories';
import { type CsRequest, type CsStatus, type CsType, type Product, type ProductDraft, type ProductStatus, type Resolution, type TimelineEntry } from './data';

export const PLATFORM_FEE_RATE = 0.1;
export const ROUND_TRIP_SHIPPING = 6000;
export const MAX_IMAGES = 6;
export const EDITOR_STEPS = 8;

export const won = (n: number) => '₩' + Number(n || 0).toLocaleString('ko-KR');

/* ---------- CS ---------- */

/** 칩 색은 Tailwind 클래스로 (app.css 토큰 accent · lilac · mint) */
export const CS_TYPE_META: Record<CsType, { label: string; cls: string }> = {
	refund: { label: '환불', cls: 'bg-accent/16 text-accent' },
	exchange: { label: '교환', cls: 'bg-lilac/18 text-lilac' }
};

export const CS_STATUS_META: Record<CsStatus, { label: string; cls: string }> = {
	pending: { label: '처리 대기', cls: 'bg-white/8 text-white/85' },
	progress: { label: '진행 중', cls: 'bg-mint/16 text-mint' },
	done: { label: '완료', cls: 'bg-white/6 text-white/50' },
	rejected: { label: '반려', cls: 'bg-white/6 text-white/50' }
};

export type CsTab = 'pending' | 'progress' | 'done' | 'all';
const CS_TAB_MATCH: Record<CsTab, (c: CsRequest) => boolean> = {
	pending: (c) => c.status === 'pending',
	progress: (c) => c.status === 'progress',
	done: (c) => c.status === 'done' || c.status === 'rejected',
	all: () => true
};
export const CS_TABS: { id: CsTab; name: string }[] = [
	{ id: 'pending', name: '대기' },
	{ id: 'progress', name: '진행 중' },
	{ id: 'done', name: '완료' },
	{ id: 'all', name: '전체' }
];

export const filterCs = (list: CsRequest[], tab: CsTab) => list.filter(CS_TAB_MATCH[tab]);
export const csTabCounts = (list: CsRequest[]) => CS_TABS.map((t) => ({ ...t, count: filterCs(list, t.id).length }));

export const dueText = (c: CsRequest) => (c.due <= 1 ? '오늘 안에 답변해주세요' : `${c.due}일 안에 답변`);

/** 목록 카드의 강조 테두리 — 기한이 급한 처리 대기 요청만 */
export const isUrgentPending = (c: CsRequest) => c.urgent && c.status === 'pending';

/** 사유별 처리 기준 (상세 화면 "처리 기준") */
export const POLICY_BY_REASON: Record<string, string[]> = {
	'단순 변심': ['수령 후 7일 이내 · 미개봉만 가능', `왕복 배송비 ${won(ROUND_TRIP_SHIPPING)} 고객 부담`, '식품 특성상 개봉 제품은 교환·환불 불가'],
	'파손 · 누액': ['사진 확인 후 즉시 재발송 또는 전액 환불', '배송비 전액 MYR 부담', '회수 없이 처리 가능 (파손 사진 보관)'],
	오배송: ['배송비 전액 MYR 부담 · 즉시 재발송', '잘못 간 제품은 회수 기사 방문', '고객 귀책 없음']
};
export const policyOf = (c: CsRequest) => POLICY_BY_REASON[c.reason] ?? [];

export type ResolutionOption = { id: Exclude<Resolution, 'reject'>; title: string; desc: string };

/** 요청 종류별 처리 방법 — 같은 id 라도 요청 종류에 따라 이름이 다르다(환불 요청의 reship = "교환으로 전환") */
export function resolutionOptions(c: CsRequest): ResolutionOption[] {
	if (c.type === 'refund') {
		return [
			{ id: 'refund', title: '전액 환불', desc: `${won(c.amount)} · 원결제수단으로 3영업일 내` },
			{ id: 'partial', title: '부분 환불 (배송비 차감)', desc: `${won(Math.max(0, c.amount - ROUND_TRIP_SHIPPING))} · 단순 변심 시` },
			{ id: 'reship', title: '교환으로 전환', desc: '새 제품 재발송 후 회수' }
		];
	}
	return [
		{ id: 'reship', title: '새 제품 재발송', desc: '회수 없이 바로 출고 · 배송비 MYR 부담' },
		{ id: 'reship_collect', title: '회수 후 재발송', desc: '기사 방문 회수 → 출고' },
		{ id: 'refund', title: '환불로 전환', desc: `${won(c.amount)} 전액 환불` }
	];
}

/** 처리된 요청의 "처리 방법" 표시 이름 — PC 상세의 처리 결과 패널 (디자인 PC resolutionNames).
 *  선택지 이름(resolutionOptions 의 "교환으로 전환" 등)과 달리 결과는 한 가지 이름으로 보여 준다 */
export const RESOLUTION_NAMES: Record<Resolution, string> = {
	refund: '전액 환불',
	partial: '부분 환불 (배송비 차감)',
	reship: '새 제품 재발송',
	reship_collect: '회수 후 재발송',
	reject: '반려'
};
export const resolutionName = (c: CsRequest) => (c.resolution ? RESOLUTION_NAMES[c.resolution] : '—');

/** 고객에게 보낼 메시지 템플릿 (상세 화면 칩) */
export const REPLY_TEMPLATES: Record<Exclude<Resolution, 'reject'>, string> = {
	refund: '불편을 드려 죄송해요. 환불 승인되었고, 3영업일 안에 결제수단으로 돌려드릴게요.',
	reship: '사진 확인했어요. 새 제품을 오늘 바로 보내드릴게요. 받으신 제품은 폐기하셔도 괜찮아요.',
	partial: '미개봉 확인 후 왕복 배송비를 제외한 금액으로 환불 진행할게요.',
	reship_collect: '회수 기사가 1~2일 내 방문해요. 회수 확인 후 바로 새 제품을 보내드릴게요.'
};
export const REPLY_CHIPS: { name: string; text: string }[] = [
	{ name: '환불 안내', text: REPLY_TEMPLATES.refund },
	{ name: '재발송 안내', text: REPLY_TEMPLATES.reship },
	{ name: '회수 안내', text: REPLY_TEMPLATES.reship_collect }
];

/** 승인 버튼 활성 — 처리 방법을 고르고 메시지를 적어야 한다 */
export const canApprove = (resolution: Resolution | null, reply: string) => !!resolution && resolution !== 'reject' && reply.trim().length > 0;

export function approveLabel(c: CsRequest, resolution: Resolution | null): string {
	const opt = resolutionOptions(c).find((o) => o.id === resolution);
	return opt ? `${opt.title} 승인` : '처리 방법을 선택하세요';
}

/** 처리 결과를 요청에 반영 — 승인은 progress(진행 중) · 반려는 rejected. 타임라인을 새로 쓴다. actorName = 처리한 크리에이터(로그인한 sellers 행의 활동명) */
export function resolveCs(c: CsRequest, status: 'progress' | 'rejected', resolution: Resolution, actorName: string): CsRequest {
	const title = status === 'rejected' ? '반려' : approveLabel(c, resolution);
	const timeline: TimelineEntry[] = [
		{ title: '요청 접수', when: c.ago },
		{ title, when: actorName.trim() ? `방금 · ${actorName.trim()}` : '방금' },
		...(status === 'progress' ? [{ title: '처리 진행', when: '대기 중' }] : [])
	];
	return { ...c, status, resolution, urgent: false, timeline };
}

/** 처리 내역 점 — 진행 중인 요청의 마지막 줄만 "아직" (빈 점) */
export function timelineRows(c: CsRequest) {
	const rows = c.timeline ?? [];
	return rows.map((r, i) => {
		const last = i === rows.length - 1;
		return { ...r, done: !(last && c.status === 'progress'), last };
	});
}

/* ---------- 내 제품 ---------- */

export const PRODUCT_STATUS_META: Record<ProductStatus, { label: string; cls: string }> = {
	live: { label: '판매 중', cls: 'bg-mint/16 text-mint' },
	paused: { label: '일시중지', cls: 'bg-white/10 text-white/75' },
	review: { label: '심사 중', cls: 'bg-accent/16 text-accent' },
	rejected: { label: '반려', cls: 'bg-[#ff6b6b]/16 text-[#ff8a8a]' },
	draft: { label: '임시저장', cls: 'bg-white/8 text-white/75' },
	ended: { label: '종료', cls: 'bg-white/6 text-white/45' }
};

/** 탭 — 시안의 판매 중 · 심사 중 · 임시저장 · 종료. 일시중지는 "판매 중"(다시 켤 수 있다), 반려는 "심사 중"(고쳐서 다시 제출)에 함께 둔다(2026-11-05) */
export type ProductTab = 'all' | 'live' | 'review' | 'draft' | 'ended';
export const PRODUCT_TABS: { id: ProductTab; name: string }[] = [
	{ id: 'all', name: '전체' },
	{ id: 'live', name: '판매 중' },
	{ id: 'review', name: '심사 중' },
	{ id: 'draft', name: '임시저장' },
	{ id: 'ended', name: '종료' }
];
const PRODUCT_TAB_STATUSES: Record<Exclude<ProductTab, 'all'>, ProductStatus[]> = {
	live: ['live', 'paused'],
	review: ['review', 'rejected'],
	draft: ['draft'],
	ended: ['ended']
};
export const filterProducts = (list: Product[], tab: ProductTab) => (tab === 'all' ? list : list.filter((p) => PRODUCT_TAB_STATUSES[tab].includes(p.status)));
/** 재고를 보여줄 상태 — 샵에서 팔리는 중이거나 잠깐 멈춘 것만(나머지는 "—") */
export const showsStock = (s: ProductStatus) => s === 'live' || s === 'paused';
export const productTabCounts = (list: Product[]) => PRODUCT_TABS.map((t) => ({ ...t, count: filterProducts(list, t.id).length }));

/** 홈 "이번 달 정산 예정"(목) — 디자인 계산 그대로: 판매 중 제품의 누적 매출 × 0.62. 실적 RPC 를 붙이면 서버 값으로 바뀐다 */
export const mockMonthRevenue = (list: Product[]) => Math.round(list.filter((p) => p.status === 'live').reduce((n, p) => n + p.sold * p.price, 0) * 0.62);

/* ---------- 상품 등록 에디터 ---------- */

export function blankDraft(): ProductDraft {
	return {
		images: [],
		name: '',
		price: '',
		unit: '',
		cat: null,
		tile: 'lemon',
		chips: ['', '', ''],
		note: '',
		storyTitle: '',
		story: '',
		ingredients: [
			{ name: '', why: '', amount: '' },
			{ name: '', why: '', amount: '' }
		],
		steps: [
			{ title: '', desc: '' },
			{ title: '', desc: '' },
			{ title: '', desc: '' }
		],
		formPack: '',
		shelfLife: '',
		storageMethod: '',
		faq: [
			{ q: '', a: '' },
			{ q: '', a: '' },
			{ q: '', a: '' }
		]
	};
}

const has = (v: string | null | undefined) => !!(v && v.trim());

/** "36,000" · "₩36000" · "36000원" → 36000 */
export const parsePrice = (v: string) => Number(String(v).replace(/\D/g, '')) || 0;
/** 입력 중인 가격 칸 — 숫자만 남기고 천 단위 콤마 */
export const formatPriceInput = (v: string) => {
	const n = parsePrice(v);
	return n ? n.toLocaleString('ko-KR') : '';
};
export const marginText = (price: number) => (price ? `${won(price - Math.round(price * PLATFORM_FEE_RATE))} / 개` : '—');

export type SectionKey = 'basics' | 'note' | 'story' | 'ingredients' | 'howto' | 'info' | 'faq';

export function filledSections(ed: ProductDraft): Record<SectionKey, boolean> {
	return {
		basics: has(ed.name) && parsePrice(ed.price) > 0 && !!ed.cat,
		note: has(ed.note),
		story: has(ed.storyTitle) && has(ed.story),
		ingredients: ed.ingredients.some((r) => has(r.name)),
		howto: ed.steps.some((s) => has(s.title)),
		info: has(ed.formPack) || has(ed.shelfLife) || has(ed.storageMethod),
		faq: ed.faq.some((f) => has(f.q) && has(f.a))
	};
}

/** 단계별 필수 — 1단계(제품명 · 가격 · 카테고리) · 2단계(레시피 노트)만 필수, 3~7 은 비워도 된다(샵에서 숨김) */
export function stepValid(step: number, ed: ProductDraft): boolean {
	const f = filledSections(ed);
	if (step === 1) return f.basics;
	if (step === 2) return f.note;
	return true;
}

const OPTIONAL_STEP_KEY: Record<number, SectionKey> = { 3: 'story', 4: 'ingredients', 5: 'howto', 6: 'info', 7: 'faq' };

/** 하단 버튼 — 마지막은 "심사 요청하기", 선택 단계가 비어 있으면 "건너뛰기" */
export function nextLabel(step: number, ed: ProductDraft): string {
	if (step >= EDITOR_STEPS) return '심사 요청하기';
	const key = OPTIONAL_STEP_KEY[step];
	if (key && !filledSections(ed)[key]) return '건너뛰기';
	return '다음';
}

export const STEP_NAMES = ['기본 정보', '레시피 노트', '왜 만들었나요', '성분', '섭취법', '제품 정보', 'FAQ', '미리보기'];

/** 에디터 헤더 아래 한 줄 — "제품명 · ₩가격 · 카테고리" (비면 "새 상품 등록") · 카테고리는 MYR 6개(@sellery/myr-core/categories) */
export function editorTrail(ed: ProductDraft): string {
	const price = parsePrice(ed.price);
	return [ed.name.trim(), price ? won(price) : '', myrCategoryName(ed.cat)].filter(Boolean).join('  ·  ') || '새 상품 등록';
}

/** 8단계 미리보기의 섹션 목록 — 비어 있는 섹션은 샵에서 숨긴다 */
export function previewSections(ed: ProductDraft) {
	const f = filledSections(ed);
	const price = parsePrice(ed.price);
	const hidden = '비어 있음 (샵에서 숨김)';
	return [
		{ key: 'basics', name: '구매 패널', step: 1, filled: f.basics, summary: f.basics ? `${ed.name.trim()} · ${won(price)}` : '제품명 · 가격 · 카테고리' },
		{ key: 'note', name: '레시피 노트', step: 2, filled: f.note, summary: has(ed.note) ? ed.note.trim() : '비어 있음' },
		{ key: 'story', name: '01 · 왜 만들었나요', step: 3, filled: f.story, summary: has(ed.storyTitle) ? ed.storyTitle.trim() : hidden },
		{ key: 'ingredients', name: '02 · 성분', step: 4, filled: f.ingredients, summary: f.ingredients ? ed.ingredients.filter((r) => has(r.name)).map((r) => r.name.trim()).join(', ') : hidden },
		{ key: 'howto', name: '03 · 섭취법', step: 5, filled: f.howto, summary: f.howto ? `${ed.steps.filter((s) => has(s.title)).length}스텝` : hidden },
		{ key: 'info', name: '04 · 제품 정보', step: 6, filled: f.info, summary: f.info ? `${[ed.formPack, ed.unit, ed.shelfLife, ed.storageMethod].filter(has).length + 1}개 항목` : hidden },
		{ key: 'faq', name: '05 · FAQ', step: 7, filled: f.faq, summary: f.faq ? `${ed.faq.filter((x) => has(x.q)).length}개 질문` : hidden }
	] satisfies { key: SectionKey; name: string; step: number; filled: boolean; summary: string }[];
}

/** 이미지 도움말 — 장수에 따라 */
export function imageHelp(count: number): string {
	if (count > 1) return '첫 번째가 대표 이미지예요. 사진을 탭하면 대표로 바뀌고, 나머지는 샵에서 옆으로 넘겨볼 수 있어요.';
	if (count === 1) return `사진을 더 올리면 샵에서 옆으로 넘겨볼 수 있어요. (최대 ${MAX_IMAGES}장)`;
	return '정사각형 또는 16:10 이미지를 권장해요. 여러 장 올릴 수 있고, 첫 번째가 대표 이미지예요.';
}

/** 홈 "판매 중 제품" 카드 — 판매 중 수 · 심사 중(반려 포함) + 임시저장 수 */
export function homeProductCounts(list: Product[]): { live: number; pending: number } {
	return {
		live: list.filter((p) => p.status === 'live').length,
		pending: list.filter((p) => p.status === 'review' || p.status === 'rejected' || p.status === 'draft').length
	};
}
