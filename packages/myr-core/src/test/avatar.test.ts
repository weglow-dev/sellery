// 프로필 사진(0085) — packages/myr-core/src/avatar.ts
import { describe, expect, it } from 'vitest';
import { AVATAR_MESSAGES, avatarPath, avatarPathOfUrl } from '../avatar';

const SID = '979b2e2d-24e4-402e-b0fb-371f57258d22';
describe('프로필 사진 경로', () => {
	it('내 폴더 · uuid · 확장자', () => {
		expect(avatarPath(SID, 'png', 'abcdef12-3456')).toBe(`${SID}/abcdef12-3456.png`);
	});
	it('공개 URL → 버킷 경로(지울 때) · 우리 버킷이 아니면 null', () => {
		expect(avatarPathOfUrl(`https://x.supabase.co/storage/v1/object/public/myr-avatars/${SID}/abcdef12-3456.png`)).toBe(`${SID}/abcdef12-3456.png`);
		expect(avatarPathOfUrl(`https://x.supabase.co/storage/v1/object/public/myr-products/${SID}/abcdef12.png`)).toBeNull();
		expect(avatarPathOfUrl(`https://x.supabase.co/storage/v1/object/public/myr-avatars/../${SID}/a.png`)).toBeNull();
		expect(avatarPathOfUrl(null)).toBeNull();
	});
	it('실패 문구', () => {
		expect(AVATAR_MESSAGES.TOO_LARGE).toContain('4MB');
	});
});
