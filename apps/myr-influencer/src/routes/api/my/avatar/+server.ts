import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AVATAR_MAX_BYTES } from '@sellery/myr-core/avatar';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import { removeAvatarOfUser, uploadAvatarOfUser } from '$lib/server/avatar';
import { apiSeller } from '$lib/server/seller';

/**
 * 프로필 사진(9번 · 0085 · 공개 버킷 myr-avatars) — 내 정보에서만.
 *   POST multipart `file` → { ok, url } · DELETE → { ok, url: null } · 실패 { ok:false, code: BAD_FILE | TOO_LARGE | RATE_LIMITED | DB_ERROR }
 * 크리에이터 폴더(<seller id>/)에만 올린다 · 형식은 매직 바이트로 · 4MB. 이전 사진 파일은 지운다.
 */
async function gate(event: Parameters<RequestHandler>[0]) {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	if (!rateLimit(`avatar:${seller.id}`, 20, 10 * 60 * 1000)) return json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
	return { seller, user };
}

export const POST: RequestHandler = async (event) => {
	const g = await gate(event);
	if (g instanceof Response) return g;
	const fd = await event.request.formData().catch(() => null);
	const file = fd?.get('file');
	if (!(file instanceof File)) return json({ ok: false, code: 'BAD_FILE' }, { status: 400 });
	if (file.size > AVATAR_MAX_BYTES) return json({ ok: false, code: 'TOO_LARGE' }, { status: 413 });
	const r = await uploadAvatarOfUser(g.user.id, g.seller.id, { bytes: new Uint8Array(await file.arrayBuffer()), size: file.size });
	return json(r, { status: r.ok ? 200 : r.code === 'BAD_FILE' ? 400 : 500 });
};

export const DELETE: RequestHandler = async (event) => {
	const g = await gate(event);
	if (g instanceof Response) return g;
	const r = await removeAvatarOfUser(g.user.id);
	return json(r, { status: r.ok ? 200 : 500 });
};
