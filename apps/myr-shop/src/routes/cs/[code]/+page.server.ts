import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CS_CODE_RE, CS_DONE_MESSAGES, csStatusChip, csTokenCookieName } from '$lib/cs-rules';
import { hasAdmin } from '$lib/server/admin';
import { getCsThread } from '$lib/server/cs';

/**
 * `/cs/[code]` — 고객 문의 스레드 **읽기 전용** (0063 myr_app_cs_thread · apps/shop cs/[code] 복사 · 이어 묻는 폼은 없다 — 더 궁금하면 주문 상세·상품 페이지의 문의 시트로 새 문의).
 * 인증: HttpOnly 쿠키 `myr_cs_<code>`(비회원 · 접수 기기) 또는 회원 세션(user_id). 둘 다 없거나 안 맞으면 404(코드·토큰 불일치를 구분하지 않는다). client_token 은 어디에도 렌더하지 않는다.
 */
const keyOf = (cookies: { get(name: string): string | undefined }, code: string, userId: string | null) => ({ clientToken: cookies.get(csTokenCookieName(code)) ?? null, userId });

export const load: PageServerLoad = async (event) => {
	const code = event.params.code.trim().toLowerCase();
	if (!CS_CODE_RE.test(code)) error(404, { message: '문의를 찾을 수 없습니다' });
	if (!hasAdmin()) error(503, { message: '문의 조회가 아직 설정되지 않았어요' });
	const { user } = await event.locals.safeGetSession();
	const t = await getCsThread(code, keyOf(event.cookies, code, user?.id ?? null));
	if (!t) error(404, { message: '문의를 찾을 수 없습니다' });
	const c = t.conversation;
	let msg: { tone: 'ok' | 'danger'; text: string } | null = null;
	if (event.url.searchParams.get('opened') === '1') msg = { tone: 'ok', text: CS_DONE_MESSAGES.opened(c.seller?.name ?? null) };
	return { msg, conversation: c, chip: csStatusChip(c.status), messages: t.messages, sellerName: c.seller?.name ?? '크리에이터', signedIn: user !== null };
};
