/**
 * 인플루언서 콘솔 — 랭킹 · 추천 프로그램 (0026 `app_seller_ranking` · `app_seller_referral`).
 * 프로토타입 원본: `apps/influencer/src/routes/(demo)/rank/+page.svelte` · `(demo)/ref/+page.svelte`.
 *
 * 전부 service role + **`p_seller_id = <requireSeller 의 seller.id>`** — 클라이언트가 보낸 seller 는 믿지 않는다.
 *   getRanking(sellerId)    내 등급 카드 + 등급별 혜택 + 익명 리더보드
 *   getReferral(sellerId)   내 추천 코드 · 추천한 인플루언서별 진행/수익 · 피추천 부스트
 *
 * **익명은 DB 가 보장한다** — `app_seller_ranking` 은 내 행 외에는 이름·핸들·code 를 아예 담지 않는다.
 * 파서(`parseRanking`)가 한 번 더 덮는다. 순수 규칙·문구는 `../../partner/rank-rules.ts`.
 */
import { parseRanking, parseReferral, type Ranking, type Referral } from "../../partner/rank-rules";
import { createAdminClient, type Admin } from "../admin.server";

/** 랭킹. 인플루언서 행이 없으면 null (라우트 404). */
export async function getRanking(sellerId: string, admin: Admin = createAdminClient()): Promise<Ranking | null> {
  const { data, error } = await admin.rpc("app_seller_ranking", { p_seller_id: sellerId });
  if (error) throw new Error(`app_seller_ranking failed: ${error.message}`);
  return parseRanking(data);
}

/** 추천 프로그램. 인플루언서 행이 없으면 null. */
export async function getReferral(sellerId: string, admin: Admin = createAdminClient()): Promise<Referral | null> {
  const { data, error } = await admin.rpc("app_seller_referral", { p_seller_id: sellerId });
  if (error) throw new Error(`app_seller_referral failed: ${error.message}`);
  return parseReferral(data);
}
