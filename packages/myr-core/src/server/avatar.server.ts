/**
 * 크리에이터 프로필 사진(서버 전용 · 0085) — 올리고(내 폴더) → avatar_url 저장(RPC 가 폴더 · 버킷을 다시 본다) → 이전 사진 파일 지우기.
 * 계정 · 크리에이터 id 는 호출자가 서버 세션에서 정해 넘긴다(결정 3). 이전 파일 지우기가 실패해도 저장은 성공(로그만).
 */
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarPath, avatarPathOfUrl } from '../avatar';
import { sniffImageType } from '../refund-rules';
import { admin } from './admin.server';

export type AvatarResult = { ok: true; url: string | null } | { ok: false; code: 'BAD_FILE' | 'DB_ERROR' | 'NOT_FOUND' };

async function setAvatar(userId: string, url: string | null): Promise<{ ok: true; previous: string | null } | { ok: false; code: 'DB_ERROR' | 'NOT_FOUND' }> {
	const { data, error } = await admin().rpc('myr_app_seller_avatar_set', { p_user: userId, p_url: url });
	if (error) {
		console.error('[avatar] set failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const r = data as { ok?: boolean; code?: string; previous?: string | null } | null;
	if (!r?.ok) return { ok: false, code: r?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'DB_ERROR' };
	return { ok: true, previous: r.previous ?? null };
}

async function removeFile(url: string | null): Promise<void> {
	const path = avatarPathOfUrl(url);
	if (!path) return;
	const { error } = await admin().storage.from(AVATAR_BUCKET).remove([path]);
	if (error) console.error('[avatar] old file remove failed:', error.message);
}

export async function uploadAvatarOfUser(userId: string, sellerId: string, file: { bytes: Uint8Array; size: number }): Promise<AvatarResult> {
	if (file.size <= 0 || file.size > AVATAR_MAX_BYTES || file.bytes.byteLength !== file.size) return { ok: false, code: 'BAD_FILE' };
	const kind = sniffImageType(file.bytes);
	if (!kind) return { ok: false, code: 'BAD_FILE' };
	const store = admin().storage.from(AVATAR_BUCKET);
	const path = avatarPath(sellerId, kind.ext);
	const { error } = await store.upload(path, file.bytes, { contentType: kind.type, upsert: false, cacheControl: '31536000' });
	if (error) {
		console.error('[avatar] upload failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const url = store.getPublicUrl(path).data.publicUrl;
	const r = await setAvatar(userId, url);
	if (!r.ok) {
		await store.remove([path]);
		return r;
	}
	await removeFile(r.previous);
	return { ok: true, url };
}

export async function removeAvatarOfUser(userId: string): Promise<AvatarResult> {
	const r = await setAvatar(userId, null);
	if (!r.ok) return r;
	await removeFile(r.previous);
	return { ok: true, url: null };
}
