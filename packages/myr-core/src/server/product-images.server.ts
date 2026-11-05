/**
 * 버려진 상품 이미지 정리(서버 전용 · 0073) — 에디터에서 지운 사진 · 올리고 저장하지 않은 사진.
 * `myr_product_image_orphans`(24시간 지난 · 어느 상품 행에도 없는 것 · 100개)를 Storage API 로 지운다. 환불 사진 정리(refund-photos)와 같은 방식 ·
 * 샵 크론 /api/cron/reconcile(10분마다)이 부른다. 실패해도 throw 하지 않는다(다음 턴에 다시 본다).
 */
import { PRODUCT_IMAGE_BUCKET, isProductImagePath } from '../product-images';
import { admin } from './admin.server';

export async function pruneProductImages(): Promise<{ found: number; removed: number; error?: string }> {
	const db = admin();
	const { data, error } = await db.rpc('myr_product_image_orphans', { p_age: '24 hours', p_limit: 100 });
	if (error) {
		console.error('[product-images] orphans failed:', error.message);
		return { found: 0, removed: 0, error: error.message };
	}
	const paths = (Array.isArray(data) ? data : []).filter((p): p is string => typeof p === 'string' && isProductImagePath(p));
	if (!paths.length) return { found: 0, removed: 0 };
	const { data: removed, error: rmError } = await db.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);
	if (rmError) {
		console.error('[product-images] prune remove failed:', rmError.message);
		return { found: paths.length, removed: 0, error: rmError.message };
	}
	return { found: paths.length, removed: removed?.length ?? 0 };
}
