/**
 * 링크 유입 쿠키 읽기 — web/src/lib/linkctx.ts readLinkCtx() 의 이식 (docs/monorepo-migration.md §2.5).
 * 쿠키 설정은 apps/shop `hooks.server.ts` 의 linkCtx 핸들(resolve 전에 `event.cookies.set`) — 여기서는 읽기만.
 *
 * `event.cookies.get(LINKCTX_COOKIE)` → 형식 검사 → anon `campaign_card(code)` RPC → 최소 필드(linkCtxFromCard).
 * null 이거나 보호 기간이 지났으면 null (무효 쿠키는 무시, 삭제 안 함). RPC 오류·supabase 없음도 null (홈은 필터 없이 렌더).
 * `parseCampaignCard`(campaign.server) 에 의존하지 않는다 — 파티션 의존 방향(app-plan §10.0) 그대로.
 */
import { LINKCTX_COOKIE, LINK_CODE_RE, linkCtxFromCard, type LinkCtx } from "../linkctx";
import type { DbEvent } from "./event.server";

export async function readLinkCtx(event: DbEvent): Promise<LinkCtx | null> {
  const raw = event.cookies.get(LINKCTX_COOKIE);
  if (!raw || !LINK_CODE_RE.test(raw)) return null;
  const supabase = event.locals.supabase;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("campaign_card", { p_code: raw });
    if (error || data === null || data === undefined) return null;
    return linkCtxFromCard(data, raw);
  } catch {
    return null;
  }
}
