/**
 * 상품 이미지(순수) — Storage 공개 버킷 `myr-products`(0073) · 경로 `<seller id>/<uuid>.<ext>` · 최대 6장 · 장당 4MB(Vercel 요청 4.5MB 한도).
 * 형식은 매직 바이트로 본다(환불 사진과 같은 `sniffImageType`). 저장 때 DB(0073 save_product)가 "그 크리에이터 폴더의 공개 URL" 인지 다시 본다.
 */
export const PRODUCT_IMAGE_BUCKET = 'myr-products';
export const PRODUCT_IMAGE_MAX = 6;
export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const productImagePath = (sellerId: string, ext: string, rand: string = crypto.randomUUID()): string => `${sellerId}/${rand}.${ext}`;
