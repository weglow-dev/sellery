import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { displayName } from '$lib/auth';
import { EMPTY_DRAFT, TOSS_ANONYMOUS_CUSTOMER_KEY, type ShippingDraft } from '$lib/checkout-rules';

/**
 * /checkout — 주문 상품은 브라우저 상태(장바구니 · 로그인이면 계정 장바구니를 이미 읽어 둠)에서 오고, 서버는 세션·프리필·위젯 키만 준다.
 *   · 로그인: customers(address, phone) 로 받는 분 프리필(RLS 본인 행) · customerKey = user.id
 *   · 비로그인: 비회원 모드(주문자 이메일(선택)·동의 추가) · customerKey = ANONYMOUS · 로그인 링크는 화면에
 *   · PUBLIC_TOSS_CLIENT_KEY 는 `$env/dynamic/public` — 없어도 빌드는 통과, 위젯이 "설정 없음" 을 보여준다
 */
function draftFrom(address: unknown, phone: string | null, name: string): ShippingDraft {
	const o = address && typeof address === 'object' && !Array.isArray(address) ? (address as Record<string, unknown>) : {};
	const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
	return {
		recipient: s('recipient') || name,
		phone: s('phone') || phone || '',
		address1: s('address1'),
		address2: s('address2'),
		postcode: s('postcode'),
		memo: s('memo')
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const clientKey = env.PUBLIC_TOSS_CLIENT_KEY ?? '';
	const variantKey = env.PUBLIC_TOSS_WIDGET_VARIANT || 'DEFAULT';
	const { user } = await locals.safeGetSession();
	if (!user) return { guest: true, customerKey: TOSS_ANONYMOUS_CUSTOMER_KEY, email: null, defaults: { ...EMPTY_DRAFT }, clientKey, variantKey };
	const name = displayName(user);
	let defaults: ShippingDraft = { ...EMPTY_DRAFT, recipient: name };
	try {
		const { data } = await locals.supabase!.from('customers').select('address, phone').eq('user_id', user.id).maybeSingle();
		if (data) defaults = draftFrom((data as { address: unknown }).address, (data as { phone: string | null }).phone, name);
	} catch (e) {
		console.error('[checkout] prefill failed', e instanceof Error ? e.message : e);
	}
	return { guest: false, customerKey: user.id, email: user.email ?? null, defaults, clientKey, variantKey };
};
