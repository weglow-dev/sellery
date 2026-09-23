import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { PRODUCT_ACTION_MESSAGES } from '@sellery/db/admin/product-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { SITE_URL } from '$lib/server/db';
import { RATE_LIMIT_MESSAGE, getAdminProduct, rateLimit, reviewProduct } from '$lib/server/partners';

/**
 * `/products/[code]` — 상품 상세 · 검수 (데모의 [실적] 모달 `openModal('productDetail')` 을 화면으로 옮긴 것).
 * load: `requireAdmin` → `getAdminProduct(code)`(상품 + 브랜드 + 캠페인 목록 + 확정 매출). 없으면 404.
 * 액션 `?/review` — 0015 `app_admin_review_product`. 반려는 사유 필수(≤200자). **대상은 URL 파라미터만 신뢰**.
 *
 * 데모의 [상세페이지] 버튼은 없다 — `storeCamp()` 가 가짜 LIVE 캠페인을 만들어 열던 데모 전용 동작이고,
 * 실서비스 판매 페이지는 캠페인 단위다. 대신 캠페인 목록에서 판매가 열린 건만 `store_url` 로 링크한다.
 */
const RATE = 60;

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const product = await getAdminProduct(event.params.code);
	if (!product) error(404, { message: '상품을 찾을 수 없습니다' });

	const msgKey = event.url.searchParams.get('msg') ?? '';
	const errText = event.url.searchParams.get('err');
	const msg = errText
		? errText
		: msgKey === 'err_rate'
			? RATE_LIMIT_MESSAGE
			: msgKey
				? (PRODUCT_ACTION_MESSAGES[msgKey] ?? null)
				: null;

	return {
		product,
		msg,
		msgTone: errText || msgKey.startsWith('err') ? ('danger' as const) : ('ok' as const),
		self: `${adminPath('/products')}/${encodeURIComponent(event.params.code)}`,
		listPath: adminPath('/products'),
		previewPath: `${adminPath('/products')}/${encodeURIComponent(event.params.code)}/preview`,
		brandsPath: adminPath('/brands'),
		sellersPath: adminPath('/sellers'),
		// 판매 페이지는 **shop 앱**에 있다 — 로컬은 포트가 다르고(관리자 5175 · shop 5176) 프로덕션은 같은 오리진이다.
		// `event.url.origin` 을 쓰면 로컬에서 관리자 오리진으로 열려 404 가 된다. 다른 콘솔과 같이 `PUBLIC_SITE_URL`(`SITE_URL`) 을 쓴다.
		siteUrl: SITE_URL
	};
};

async function guard(event: RequestEvent, bucket: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	const self = `${adminPath('/products')}/${encodeURIComponent(event.params.code)}`;
	if (!rateLimit(`${bucket}:${gate.ctx.user.id}`, RATE)) redirect(303, `${self}?msg=err_rate`);
	return self;
}

export const actions: Actions = {
	review: async (event) => {
		const self = await guard(event, 'admin-product-review');
		const form = await event.request.formData();
		const decisionRaw = String(form.get('decision') ?? '').trim();
		const reason = String(form.get('reason') ?? '').trim().slice(0, 200);
		if (!['approve', 'reject', 'pause'].includes(decisionRaw)) redirect(303, `${self}?msg=err_input`);
		const decision = decisionRaw as 'approve' | 'reject' | 'pause';
		if (decision === 'reject' && !reason) redirect(303, `${self}?err=${encodeURIComponent('반려 사유를 입력해주세요 (200자 이내).')}`);

		const res = await reviewProduct(event.params.code, decision, decision === 'reject' ? reason : null);
		redirect(303, res.ok ? `${self}?msg=${res.code}` : `${self}?err=${encodeURIComponent(res.message)}`);
	}
};
