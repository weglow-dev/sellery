import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { brandPath, requireBrand } from '$lib/server/brand';

/**
 * 브랜드 콘솔 홈 — 1단계 최소판 (docs/brand-console-plan.md §3 "가입 직후 홈의 지금 할 일 3장" · §6 1단계 "/home 준비 중 카드").
 * `requireBrand()` 컨텍스트(요약 · 잔액)만 — 대기 큐 · 상품 상태 카드는 2단계(`/brand/requests` · `/brand/products`), 장부 4 KPI · 등급 카드는 5단계.
 * ok 가 아니면 location 으로 redirect(anon → /login · foreign → /login?switch=1 · guest → /apply · suspended → /suspended).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/home' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance } = r.ctx;
	return {
		brand,
		balance,
		/** "다음 할 일" — 단계가 열리면 href 가 실제 화면으로 바뀐다 (지금은 안내만) */
		todos: [
			{ kind: 'first_product', icon: '🛍', title: '첫 상품 등록', desc: '등록한 상품은 운영팀 검수(pending) 뒤 인플루언서에게 공개돼요', stage: '2단계에서 열립니다', href: brandPath('/products') },
			{ kind: 'biz_doc', icon: '📄', title: '사업자등록증 업로드', desc: brand.has_biz_doc ? '업로드 완료' : '정산 · 세금계산서에 필요해요 — 정산 정보에서 올립니다', stage: '5단계에서 열립니다', href: brandPath('/settle') },
			{ kind: 'bank_info', icon: '🏦', title: '정산 계좌 등록', desc: brand.has_bank_info ? '등록 완료' : '계좌 · 사업자번호 · 통신판매업 신고번호 — 판매 종료 D+21 지급', stage: '5단계에서 열립니다', href: brandPath('/settle') }
		]
	};
};
