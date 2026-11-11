// 상품 에디터 ↔ 저장 본문 · 실패 문구 · 내 제품 메뉴 (0073 · docs/myr.md §4.2.1 4-1)
import { describe, expect, it } from 'vitest';
import type { SellerProductDetail } from '@sellery/myr-core/seller-products';
import { TILE_BG, TILE_ICON } from '../lib/data';
import { blankDraft } from '../lib/rules';
import { detailToDraft, draftToPayload, draftVisual, isEditableStatus, isRevisableStatus, joinFormPack, productMenu, saveFailure, savedImages, splitFormPack, tileKeyOf, opensReview } from '../lib/product-draft';

const IMG = 'https://x.supabase.co/storage/v1/object/public/myr-products/s1/0f8a1c2e.jpg';

describe('제형 / 포장', () => {
	it('나누기 · 합치기', () => {
		expect(splitFormPack(' 액상 / 스틱포 ')).toEqual({ form: '액상', pack: '스틱포' });
		expect(splitFormPack('젤리')).toEqual({ form: '젤리', pack: '' });
		expect(splitFormPack('a / b / c')).toEqual({ form: 'a', pack: 'b / c' });
		expect(joinFormPack('액상', '스틱포')).toBe('액상 / 스틱포');
		expect(joinFormPack('젤리', '')).toBe('젤리');
	});
});

describe('draftToPayload', () => {
	it('에디터 값 → 저장 본문(공백 정리 · 가격 숫자 · 타일 그라데이션/아이콘 · 업로드된 이미지만)', () => {
		const ed = { ...blankDraft(), name: ' 포도 젤리 ', price: '32,000', unit: '14포', cat: 'diet', tile: 'grape' as const, images: ['blob:http://x/1', IMG], formPack: '젤리 / 스틱포', shelfLife: ' 24개월 ', storageMethod: '서늘한 곳', note: ' 노트 ' };
		ed.steps[0] = { title: '식후', desc: '30분 안에' };
		const p = draftToPayload(ed);
		expect(p).toMatchObject({ name: '포도 젤리', price: 32000, unit: '14포', category: 'diet', tile: TILE_BG.grape, icon: TILE_ICON.grape, image_urls: [IMG], form: '젤리', pack: '스틱포', shelf_life: '24개월', storage_method: '서늘한 곳', note: '노트' });
		expect(p.howto_steps[0]).toEqual({ t: '식후', d: '30분 안에' });
	});
	it('업로드 중(blob:) 이미지는 빼고 저장', () => expect(savedImages(['blob:a', IMG, 'data:x'])).toEqual([IMG]));
});

describe('detailToDraft · tileKeyOf', () => {
	const d: SellerProductDetail = {
		id: 'p1', code: 'm101', status: 'rejected', rejectReason: '보완', rejectItems: [], reviewedAt: null, name: '포도 젤리', price: 32000, unit: '14포', category: 'diet', tile: TILE_BG.grape, icon: 'grape',
		image_urls: [IMG], chips: ['젤리'], note: '노트', story_title: '왜', story: '이야기', ingredient_rows: [{ name: '가르시니아', why: '', amount: '' }], howto_steps: [{ t: '식후', d: '' }],
		faq: [], form: '젤리', pack: '스틱포', shelf_life: '24개월', storage_method: '서늘한 곳'
	};
	it('저장된 상품 → 에디터(가격 콤마 · 칸 개수 채움 · 제형/포장 합침)', () => {
		const ed = detailToDraft(d);
		expect(ed).toMatchObject({ name: '포도 젤리', price: '32,000', cat: 'diet', tile: 'grape', formPack: '젤리 / 스틱포', shelfLife: '24개월', images: [IMG] });
		expect(ed.chips).toEqual(['젤리', '', '']);
		expect(ed.ingredients).toHaveLength(2);
		expect(ed.steps).toHaveLength(3);
		expect(ed.faq).toHaveLength(3);
		expect(ed.steps[0]).toEqual({ title: '식후', desc: '' });
	});
	it('왕복해도 같은 저장 본문', () => {
		const back = draftToPayload(detailToDraft(d));
		expect(back).toMatchObject({ name: d.name, price: d.price, form: d.form, pack: d.pack, shelf_life: d.shelf_life, storage_method: d.storage_method, tile: d.tile, icon: d.icon, image_urls: d.image_urls });
	});
	it('모르는 그라데이션은 아이콘으로 · 그래도 없으면 기본', () => {
		expect(tileKeyOf('linear-gradient(1deg,#000,#fff)', 'film')).toBe('peach');
		expect(tileKeyOf(null, 'liquid')).toBe('lemon');
	});
	it('운영팀이 넣은 비주얼(콘솔 색 밖)은 색을 안 바꾸면 그대로 · 바꾸면 콘솔 색(수정 심사가 샵 타일을 몰래 바꾸지 않게)', () => {
		const ops = { ...d, tile: 'linear-gradient(145deg,#4f7fe8,#1c2f6b)', icon: 'pill' };
		const ed = detailToDraft(ops);
		expect(draftToPayload(ed)).toMatchObject({ tile: ops.tile, icon: 'pill' });
		expect(draftVisual(ed)).toEqual({ tile: ops.tile, icon: 'pill' });
		expect(ed.tile).toBe('teal'); // pill 아이콘 → teal 키
		expect(draftToPayload({ ...ed, tile: 'grape' })).toMatchObject({ tile: TILE_BG.grape, icon: TILE_ICON.grape });
		expect(draftToPayload({ ...blankDraft(), tile: 'plum' })).toMatchObject({ tile: TILE_BG.plum, icon: TILE_ICON.plum }); // 새 상품은 콘솔 색
	});
});

describe('saveFailure · 메뉴', () => {
	it('필수 칸 → 그 단계로', () => {
		expect(saveFailure('INVALID_INPUT', 'name')).toEqual({ message: '제품명을 입력해주세요', step: 1 });
		// 서버(0073 · 0074)는 판매가 1,000만 원 초과를 field price 로 거절 — 빈 판매가는 화면이 [다음]에서 먼저 막아 여기까지 오지 않는다
		expect(saveFailure('INVALID_INPUT', 'price')).toEqual({ message: '판매가는 1,000만 원까지 입력할 수 있어요', step: 1 });
		expect(saveFailure('INVALID_INPUT', 'category').step).toBe(1);
		expect(saveFailure('INVALID_INPUT', 'note')).toEqual({ message: '레시피 노트를 써주세요', step: 2 });
		expect(saveFailure('BAD_IMAGE').step).toBe(1);
		expect(saveFailure('NOT_EDITABLE').step).toBeUndefined();
		expect(saveFailure('???').message).toContain('잠시 후');
	});
	it('에디터로 바로 고치는 건 임시저장 · 반려 · 수정 심사로 고치는 건 판매 중 · 일시중지', () => {
		expect((['draft', 'rejected', 'review', 'live', 'paused', 'ended'] as const).filter(isEditableStatus)).toEqual(['draft', 'rejected']);
		expect((['draft', 'rejected', 'review', 'live', 'paused', 'ended'] as const).filter(isRevisableStatus)).toEqual(['live', 'paused']);
	});
	it('상태별 메뉴 — 판매 종료 · 삭제는 확인을 받는다', () => {
		expect(productMenu('draft').map((m) => m.kind)).toEqual(['edit', 'delete']);
		expect(productMenu('rejected').map((m) => m.kind)).toEqual(['review']); // 반려는 심사 결과로
		expect(productMenu('live').map((m) => m.kind)).toEqual(['edit', 'groupbuy']); // 일시중지 · 다시 판매 · 판매 종료는 운영만(0082 · 0083) · 공구 링크(0086)
		expect(productMenu('paused').map((m) => m.kind)).toEqual(['edit']);
		expect(productMenu('live')[0].label).toBe('내용 수정');
		// 수정 심사 중이면 "내용 수정" 이 빠지고, 수정 반려면 "심사 결과 보기"(운영팀 의견 → 고치기)
		expect(productMenu('live', 'review').map((m) => m.kind)).toEqual(['groupbuy']); // 수정 심사 중이면 내용 수정은 빠지고 공구 링크만
		expect(productMenu('paused', 'rejected').map((m) => [m.kind, m.label])).toEqual([['review', '심사 결과 보기']]);
		expect(productMenu('review')).toEqual([]);
		expect(productMenu('ended')).toEqual([]);
		expect(productMenu('live').some((m) => (m.kind as string) === 'end')).toBe(false);
		expect(productMenu('draft').find((m) => m.kind === 'delete')?.confirm).toBeTruthy();
	});
});

describe('목록에서 바로 심사 결과로', () => {
	it('반려 · 수정 반려는 메뉴 없이 심사 결과 — 수정 심사 중 · 판매 중은 아님', () => {
		expect(opensReview('rejected')).toBe(true);
		expect(opensReview('live', 'rejected')).toBe(false); // 판매 중 수정 반려는 메뉴(심사 결과 보기 · 공구 링크)
		expect(productMenu('live', 'rejected').map((m) => m.kind)).toEqual(['review', 'groupbuy']);
		expect(opensReview('paused', 'rejected')).toBe(true);
		expect(opensReview('live', 'review')).toBe(false);
		expect(opensReview('live')).toBe(false);
	});
});
