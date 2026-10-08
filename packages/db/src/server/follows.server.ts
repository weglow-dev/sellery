/**
 * 인플루언서 팔로우 — 서버 (0045). 팔로우·해제·내 팔로우 목록.
 *
 * 메일은 보내지 않는다 — 하는 일은 홈 정렬 우대 하나다(`/about` 약속 · `../follows.ts` 주석).
 * 순수 규칙(버튼 상태·정렬 키·문구)은 `../follows.ts` 가 갖는다.
 */
import { createAdminClient, type Admin } from "./admin.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export type FollowResult = { ok: true; already: boolean } | { ok: false; code: "NOT_FOUND" | "DB_ERROR" };

/** 셀러 code → id. 형식이 어긋나면 null(라우트 404). */
async function sellerIdOf(admin: Admin, code: string): Promise<string | null | "error"> {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return null;
  const { data, error } = await admin.from("sellers").select("id").eq("code", code).maybeSingle();
  if (error) {
    console.error("[follows] seller lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 팔로우 — 공개·활동 중인 인플루언서만(0045 `app_follow_seller`). */
export async function followSeller(sellerCode: string, userId: string, admin: Admin = createAdminClient()): Promise<FollowResult> {
  const id = await sellerIdOf(admin, sellerCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_follow_seller", { p_seller_id: id, p_user_id: userId });
  if (error) {
    console.error("[follows] follow failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: o.code === "NOT_FOUND" ? "NOT_FOUND" : "DB_ERROR" };
  return { ok: true, already: o.already === true };
}

/** 팔로우 해제 — 비공개로 바뀐 인플루언서도 해제할 수 있다. */
export async function unfollowSeller(sellerCode: string, userId: string, admin: Admin = createAdminClient()): Promise<FollowResult> {
  const id = await sellerIdOf(admin, sellerCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_unfollow_seller", { p_seller_id: id, p_user_id: userId });
  if (error) {
    console.error("[follows] unfollow failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  return { ok: true, already: o.already === true };
}

/**
 * 내가 팔로우한 셀러 id 집합 — 홈 정렬과 `/influencers` 버튼 상태가 같은 호출을 쓴다(요청당 1회).
 * 비로그인·실패는 빈 집합이다(정렬이 기본 순서로 돌아가고 화면은 죽지 않는다).
 */
export async function followedSellerIds(userId: string | null, admin: Admin = createAdminClient()): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await admin.rpc("app_followed_seller_ids", { p_user_id: userId });
  if (error) {
    console.error("[follows] followed ids failed:", error.message);
    return new Set();
  }
  const o = obj(data);
  const ids = Array.isArray(o?.ids) ? o.ids : [];
  return new Set(ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)));
}
