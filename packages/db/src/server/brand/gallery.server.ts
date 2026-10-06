/**
 * 브랜드 콘솔 — 인플루언서 갤러리 · 🥬 데이터 열람 (0035 `app_brand_gallery` · `app_brand_unlock_data`).
 * 프로토타입 원본: `apps/brand/src/routes/(demo)/gallery/+page.svelte` · `packages/ui/SellerCard.svelte` ·
 * `actions.ts` `unlockSellerData`/`unlockRef`/`spendData`.
 *
 * 전부 service role + **`p_brand_id = <requireBrand 의 brand.id>`** — 클라이언트가 보낸 brand 는 믿지 않는다.
 *   getBrandGallery(brandId)                   추천 · 공개 인플루언서 · 익명 스카우트 + 무료 잔여
 *   unlockSellerData(brandId, sellerId, kind)  'data'(공개 성과) | 'ref'(익명 레퍼런스)
 *
 * **익명은 DB 가 보장한다** — `app_brand_gallery` 는 비공개 인플루언서의 이름·핸들·아바타를 열람 전에
 * 담지 않고, 잠긴 카드의 지표도 `null` 로 보낸다. 파서(`parseGallery`)가 한 번 더 덮는다.
 * 가격(등급별)·무료 판정(함께 판매 · 등급 월 한도)·멱등도 전부 DB 안에 있다.
 * 순수 규칙·문구는 `../../brand/gallery-rules.ts`.
 */
import {
  parseGallery,
  parseUnlockResult,
  type Gallery,
  type UnlockResult,
} from "../../brand/gallery-rules";
import { createAdminClient, type Admin } from "../admin.server";

/** 갤러리 한 번에. 브랜드 행이 없으면 null (라우트 404). */
export async function getBrandGallery(brandId: string, admin: Admin = createAdminClient()): Promise<Gallery | null> {
  const { data, error } = await admin.rpc("app_brand_gallery", { p_brand_id: brandId });
  if (error) throw new Error(`app_brand_gallery failed: ${error.message}`);
  return parseGallery(data);
}

/**
 * 🥬 로 인플루언서 데이터를 연다. 무료 사유(이미 열람 · 함께 판매 · 등급 한도)가 있으면 과금하지 않는다.
 * `kind` 는 인플루언서의 공개 여부와 맞아야 한다 — 어긋나면 RPC 가 `KIND_MISMATCH`
 * (익명 카드에서 'data' 를 보내 신원을 캐는 걸 막는다).
 */
export async function unlockSellerData(
  brandId: string,
  sellerId: string,
  kind: "data" | "ref",
  admin: Admin = createAdminClient(),
): Promise<UnlockResult> {
  const { data, error } = await admin.rpc("app_brand_unlock_data", {
    p_brand_id: brandId,
    p_seller_id: sellerId,
    p_kind: kind,
  });
  if (error) throw new Error(`app_brand_unlock_data failed: ${error.message}`);
  return parseUnlockResult(data);
}
