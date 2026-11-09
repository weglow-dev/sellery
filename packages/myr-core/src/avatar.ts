/** 크리에이터 프로필 사진(9번 · 0085) — 순수. Storage 공개 버킷 myr-avatars 의 <seller id>/<uuid>.<ext> · 4MB · jpg/png/webp. 내 정보에서만 바꾼다 */
export const AVATAR_BUCKET = 'myr-avatars';
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
export const avatarPath = (sellerId: string, ext: string, rand: string = crypto.randomUUID()): string => `${sellerId}/${rand}.${ext}`;
/** 공개 URL → 버킷 안 경로(지울 때) · 우리 버킷이 아니면 null */
export function avatarPathOfUrl(url: string | null | undefined): string | null {
	const m = /\/storage\/v1\/object\/public\/myr-avatars\/([0-9a-f-]{36}\/[A-Za-z0-9-]{8,64}\.(?:jpg|png|webp))$/.exec(url ?? '');
	return m ? m[1] : null;
}
export const AVATAR_MESSAGES: Record<string, string> = {
	BAD_FILE: 'jpg · png · webp 사진만 올릴 수 있어요',
	TOO_LARGE: '사진은 4MB 까지 올릴 수 있어요',
	RATE_LIMITED: '잠시 후 다시 시도해 주세요',
	DB_ERROR: '사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요'
};
