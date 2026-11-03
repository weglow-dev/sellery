/**
 * 환불 신청 사진 — Storage 비공개 버킷 `myr-refunds`(0068) · 서버(service role)만 올리고, 읽기는 단기 서명 URL.
 *   uploadRefundPhoto(orderId, itemId, file)   본인 줄(라우트가 확인) 아래 `<order>/<item>/<uuid>.<ext>` 로 · 줄당 REFUND_PHOTO_MAX 장 · 매직 바이트로 형식 확인
 *   removeRefundPhoto(orderId, path)            그 주문 아래 경로만 지운다(신청 전 되돌리기)
 *   signRefundPhotos(paths)                     셀러 메일·콘솔용 서명 URL(7일) — 실패하면 그 경로는 뺀다(메일을 막지 않는다)
 * 고아 파일(올렸지만 신청 안 함)은 비공개 버킷에 남는다 — 정리는 운영 스크립트(추후). 경로 규칙은 refund-rules.ts(순수).
 */
import { isRefundPhotoPath, REFUND_PHOTO_MAX, REFUND_PHOTO_MAX_BYTES, refundPhotoPath, sniffImageType } from '$lib/refund-rules';
import { admin } from './admin';

export const REFUND_PHOTO_BUCKET = 'myr-refunds';
const SIGNED_TTL_SEC = 7 * 24 * 60 * 60;

export type UploadRefundPhotoResult = { ok: true; path: string } | { ok: false; code: 'BAD_FILE' | 'TOO_MANY' | 'DB_ERROR' };

export async function uploadRefundPhoto(orderId: string, itemId: string, file: { bytes: Uint8Array; size: number }): Promise<UploadRefundPhotoResult> {
	if (file.size <= 0 || file.size > REFUND_PHOTO_MAX_BYTES || file.bytes.byteLength !== file.size) return { ok: false, code: 'BAD_FILE' };
	const kind = sniffImageType(file.bytes);
	if (!kind) return { ok: false, code: 'BAD_FILE' };
	const store = admin().storage.from(REFUND_PHOTO_BUCKET);
	const { data: existing, error: listError } = await store.list(`${orderId}/${itemId}`, { limit: REFUND_PHOTO_MAX + 1 });
	if (listError) {
		console.error('[refund-photos] list failed:', listError.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	if ((existing?.length ?? 0) >= REFUND_PHOTO_MAX) return { ok: false, code: 'TOO_MANY' };
	const path = refundPhotoPath(orderId, itemId, kind.ext);
	const { error } = await store.upload(path, file.bytes, { contentType: kind.type, upsert: false, cacheControl: '3600' });
	if (error) {
		console.error('[refund-photos] upload failed:', error.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	return { ok: true, path };
}

export async function removeRefundPhoto(orderId: string, path: string): Promise<boolean> {
	if (!isRefundPhotoPath(path, orderId)) return false;
	const { error } = await admin().storage.from(REFUND_PHOTO_BUCKET).remove([path]);
	if (error) {
		console.error('[refund-photos] remove failed:', error.message);
		return false;
	}
	return true;
}

export async function signRefundPhotos(paths: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (!paths.length) return out;
	try {
		const { data, error } = await admin().storage.from(REFUND_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_TTL_SEC);
		if (error) {
			console.error('[refund-photos] sign failed:', error.message);
			return out;
		}
		for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
	} catch (e) {
		console.error('[refund-photos] sign failed:', e instanceof Error ? e.message : e);
	}
	return out;
}
