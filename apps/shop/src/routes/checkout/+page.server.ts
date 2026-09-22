import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';
import { canonicalStoreUrl, isBuyable } from '@sellery/db/campaign';
import { checkoutHref, EMPTY_DRAFT, isGuestParam, parseCheckoutParams, TOSS_ANONYMOUS_CUSTOMER_KEY, type ShippingDraft } from '@sellery/payments/checkout-rules';
import { fetchCampaignCard } from '$lib/server/db';

/**
 * /checkout?c={code}&o={optIdx}&q={qty}[&g=1] — 서버 검증 후 CheckoutClient (app-plan §6.1 · ux-spec §3.4 · web checkout/page.tsx 1:1 · docs/monorepo-migration.md §4.1).
 *   · 파라미터 결측/형식 불일치 → 홈(코드 없음) 또는 판매 페이지(/c/<c> 가 정식 URL 로 308)로 redirect
 *   · anon campaign_card(code) → null 이면 404
 *   · optionIndex 범위 밖 → 판매 페이지로 · isBuyable(card, qty) 실패(LIVE 아님 · today 범위 밖 · 재고 부족) → { blocked } (.notice(danger) + 돌아가기, 위젯 렌더 안 함)
 *   · **미로그인 (owner 결정 2026-09-22 비회원 구매)**: `g=1` 이 없으면 선택 카드 { choose } — [카카오로 로그인하고 구매](/login?next=) · [비회원으로 구매](&g=1).
 *     `g=1` 이면 비회원 폼(주문자 이름·연락처·이메일(선택)·동의 + 배송지) — customerKey 는 토스 ANONYMOUS. 로그인 상태면 `g` 는 무시.
 *   · 로그인: user 클라이언트로 customers(address, phone) 읽어 배송지 프리필 (RLS customers_select_own)
 */

/** customers.address jsonb + phone → 폼 초기값 (키가 문자열이 아니면 빈 문자열) */
function draftFrom(address: unknown, phone: string | null, name: string): ShippingDraft {
	const o = address && typeof address === 'object' && !Array.isArray(address) ? (address as Record<string, unknown>) : {};
	const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
	return {
		recipient: s('recipient') || name,
		phone: s('phone') || phone || '',
		postcode: s('postcode'),
		address1: s('address1'),
		address2: s('address2'),
		memo: s('memo')
	};
}

export const load: PageServerLoad = async (event) => {
	const { url, locals, setHeaders } = event;
	setHeaders({ 'cache-control': 'private, no-store' });
	const sp = Object.fromEntries(url.searchParams) as Record<string, string | undefined>;
	const params = parseCheckoutParams(sp);
	if (!params) {
		// 코드가 있으면 그 판매 페이지로(짧은 주소 /c/ 가 정식 URL 로 308), 없으면 홈
		const c = (sp.c ?? '').trim().toLowerCase();
		redirect(303, /^[a-z0-9_-]{1,32}$/.test(c) ? `/c/${encodeURIComponent(c)}` : '/');
	}
	const { code, optionIndex, qty } = params;

	const { user } = await locals.safeGetSession();
	const guest = !user && isGuestParam(sp);

	const card = await fetchCampaignCard(event, code);
	if (!card) error(404, { message: '판매 페이지를 찾을 수 없습니다' });
	const storeUrl = canonicalStoreUrl(card);
	if (optionIndex >= card.product.options.length) redirect(303, storeUrl);

	const buyable = isBuyable(card, qty);
	if (!buyable.ok) return { blocked: buyable.message, storeUrl, checkout: null, choose: null };

	if (!user && !guest) {
		// 로그인 여부 선택 — 둘 다 같은 판매·옵션·수량으로 이어진다
		const retry = checkoutHref(code, optionIndex, qty);
		return {
			blocked: null,
			storeUrl,
			checkout: null,
			choose: {
				loginHref: `/login?next=${encodeURIComponent(retry)}`,
				guestHref: checkoutHref(code, optionIndex, qty, true),
				product: card.product.name,
				option: card.product.options[optionIndex].n,
				qty
			}
		};
	}

	if (!user) {
		return {
			blocked: null,
			storeUrl,
			checkout: { card, optionIndex, qty, guest: true, customerKey: TOSS_ANONYMOUS_CUSTOMER_KEY, email: null, defaults: { ...EMPTY_DRAFT } },
			choose: null
		};
	}

	// 기본 배송지 프리필 — user 클라이언트 (RLS 본인 행). 실패해도 빈 폼으로 진행.
	const name = displayName(user);
	let defaults: ShippingDraft = { ...EMPTY_DRAFT, recipient: name };
	try {
		const { data } = await locals.supabase!.from('customers').select('address, phone').eq('user_id', user.id).maybeSingle();
		if (data) defaults = draftFrom(data.address, data.phone, name);
	} catch (e) {
		console.error('[checkout] customers prefill failed', e instanceof Error ? e.message : e);
	}

	return {
		blocked: null,
		storeUrl,
		checkout: { card, optionIndex, qty, guest: false, customerKey: user.id, email: user.email ?? null, defaults },
		choose: null
	};
};
