/**
 * 관리자 콘솔 "파트너 관리 — 인플루언서" (docs/admin-console-plan.md "파트너 관리" · docs/inf-console-plan.md §4.7).
 * `packages/db/scripts/partner-admin.mjs` 의 `list` · `channels [--pending]` · `verify-channel` · `unverify-channel` ·
 * `suspend` · `reactivate` 를 화면용으로 옮긴 것 — 스크립트와 **같은 쿼리·같은 patch** 를 쓴다(그쪽은 운영 백업 경로로 남는다).
 *
 * **마이그레이션 없음.** 컬럼이 전부 있다: `sellers.active` · `sellers.hidden`(0001 — "관리자만 토글") ·
 * `seller_channels.verified` · `vcode` · `vcode_confirmed_at`(0001 · 0010). 새 RPC 도 없다 — service role 의 `.update()`.
 * `sellers.hidden` 은 읽기 경로만 있었다(`seller_is_public()` · 공개 조인) — **쓰기는 여기가 처음**이다.
 *
 * 전부 service role + 화면의 `requireAdmin()` 뒤에서만. 쓰기는 스크립트와 같은 순서를 지킨다:
 * **대상을 먼저 조회(`findSeller`/`findChannel`)한 뒤 그 `id` 로 update** — 클라이언트가 보낸 ref 를 그대로 믿지 않는다.
 *
 *   listSellers({ filter, q, limit })        목록 + 카운트(전체·정지·비공개·채널 인증 대기)
 *   getSeller(ref)                           상세 1건 + 채널 전부 (ref: code('s1') 또는 uuid)
 *   listPendingChannels(limit)               승인 큐 — verified=false and vcode_confirmed_at is not null
 *   setSellerActive(ref, active, reason)     정지 · 복귀 (Slack 한 줄)
 *   setSellerHidden(ref, hidden)             프로필 공개 · 비공개 (신규 쓰기 경로)
 *   setChannelVerified(ref, verified)        인증 완료(verified=true·vcode=null) · 해제(verified=false·vcode_confirmed_at=null)
 * 순수 규칙(필터·칩·검색)은 `../../admin/seller-rules.ts`.
 */
import { isChannelPending, type SellerFilter } from "../../admin/seller-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type {
  SellerFilter,
} from "../../admin/seller-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 목록 · 검색이 읽는 컬럼. 이메일·정산 정보는 상세에서만(목록 응답을 가볍게 · 민감 컬럼 노출 최소화) */
const LIST_COLUMNS =
  "id, code, name, handle, email, platform, followers, category, grade, active, hidden, user_id, created_at";
const CHANNEL_COLUMNS =
  "id, code, seller_id, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, created_at";

export type AdminSellerRow = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  email: string | null;
  platform: string;
  followers: number;
  category: string | null;
  grade: string | null;
  active: boolean;
  hidden: boolean;
  user_id: string | null;
  created_at: string;
};

export type AdminChannelRow = {
  id: string;
  code: string | null;
  seller_id: string;
  platform: string;
  handle: string;
  url: string | null;
  followers: number;
  verified: boolean;
  is_primary: boolean;
  vcode: string | null;
  vcode_confirmed_at: string | null;
  created_at: string;
};

/** 승인 큐 한 줄 — 채널 + 어느 인플루언서인지 */
export type AdminPendingChannel = AdminChannelRow & {
  seller: { id: string; code: string | null; name: string; handle: string } | null;
};

export type AdminSellerList = {
  rows: AdminSellerRow[];
  counts: { all: number; suspended: number; hidden: number; pendingChannel: number };
};

export type AdminSellerDetail = {
  seller: AdminSellerRow;
  channels: AdminChannelRow[];
};

/** 쓰기 결과 — 화면이 `?msg=` 로 바꿔 띄운다. `code` 는 seller-rules 의 SELLER_ACTION_MESSAGES 키 */
export type AdminSellerActionResult =
  | { ok: true; code: string }
  | { ok: false; code: "err_not_found" | "err" };

/* ------------------------------------------------------------ 조회 ------------------------------------------------------------ */

/** code('s1') 또는 uuid → 행. 없으면 null · 읽기 실패 'error' (orders.server.ts `orderIdOf` 와 같은 계약) */
async function findSeller(admin: Admin, ref: string): Promise<AdminSellerRow | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  const q = admin.from("sellers").select(LIST_COLUMNS);
  const { data, error } = UUID_RE.test(r)
    ? await q.eq("id", r).maybeSingle()
    : await q.eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/sellers] seller lookup failed:", error.message);
    return "error";
  }
  return (data as AdminSellerRow | null) ?? null;
}

async function findChannel(admin: Admin, ref: string): Promise<AdminChannelRow | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  const q = admin.from("seller_channels").select(CHANNEL_COLUMNS);
  const { data, error } = UUID_RE.test(r)
    ? await q.eq("id", r).maybeSingle()
    : await q.eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/sellers] channel lookup failed:", error.message);
    return "error";
  }
  return (data as AdminChannelRow | null) ?? null;
}

/**
 * 목록 — `partner-admin.mjs cmdList` 의 확장(정렬은 가입일 오름차순 그대로).
 * `filter='pending_channel'` 은 승인 큐에 걸린 인플루언서만: 먼저 대기 채널의 `seller_id` 를 모아 `in()` 으로 좁힌다
 * (조인 필터로는 "채널 중 하나라도 대기" 를 표현할 수 없다). 카운트 4개는 head 쿼리로 따로 센다.
 * 실패해도 화면이 죽지 않게 빈 목록을 돌려준다.
 */
export async function listSellers(
  opts: { filter?: SellerFilter; q?: string | null; limit?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<AdminSellerList> {
  const { filter = "all", q = null, limit = 200 } = opts;
  const empty: AdminSellerList = { rows: [], counts: { all: 0, suspended: 0, hidden: 0, pendingChannel: 0 } };

  const pendingSellerIds = await pendingChannelSellerIds(admin);
  if (pendingSellerIds === "error") return empty;

  let sel = admin.from("sellers").select(LIST_COLUMNS).order("created_at", { ascending: true }).limit(limit);
  if (filter === "active") sel = sel.eq("active", true).eq("hidden", false);
  if (filter === "suspended") sel = sel.eq("active", false);
  if (filter === "hidden") sel = sel.eq("hidden", true);
  if (filter === "pending_channel") {
    if (pendingSellerIds.length === 0) sel = sel.eq("id", "00000000-0000-0000-0000-000000000000");
    else sel = sel.in("id", pendingSellerIds);
  }
  const term = (q ?? "").trim();
  if (term) {
    const like = `%${term.replace(/[%,]/g, "")}%`;
    sel = sel.or(`name.ilike.${like},handle.ilike.${like},code.ilike.${like},email.ilike.${like}`);
  }

  const [list, all, suspended, hidden] = await Promise.all([
    sel,
    admin.from("sellers").select("id", { count: "exact", head: true }),
    admin.from("sellers").select("id", { count: "exact", head: true }).eq("active", false),
    admin.from("sellers").select("id", { count: "exact", head: true }).eq("hidden", true),
  ]);
  if (list.error) {
    console.error("[admin/sellers] list failed:", list.error.message);
    return empty;
  }
  return {
    rows: (list.data ?? []) as AdminSellerRow[],
    counts: {
      all: all.count ?? 0,
      suspended: suspended.count ?? 0,
      hidden: hidden.count ?? 0,
      pendingChannel: pendingSellerIds.length,
    },
  };
}

/** 대기 채널을 가진 인플루언서 id 목록 (중복 제거) */
async function pendingChannelSellerIds(admin: Admin): Promise<string[] | "error"> {
  const { data, error } = await admin
    .from("seller_channels")
    .select("seller_id")
    .eq("verified", false)
    .not("vcode_confirmed_at", "is", null);
  if (error) {
    console.error("[admin/sellers] pending channel ids failed:", error.message);
    return "error";
  }
  return [...new Set((data ?? []).map((r) => r.seller_id as string))];
}

/** 상세 — 인플루언서 1명 + 채널 전부(가입일 오름차순). 없으면 null */
export async function getSeller(ref: string, admin: Admin = createAdminClient()): Promise<AdminSellerDetail | null> {
  const seller = await findSeller(admin, ref);
  if (!seller || seller === "error") return null;
  const { data, error } = await admin
    .from("seller_channels")
    .select(CHANNEL_COLUMNS)
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[admin/sellers] channels failed:", error.message);
    return { seller, channels: [] };
  }
  return { seller, channels: (data ?? []) as AdminChannelRow[] };
}

/**
 * 채널 인증 승인 큐 — `partner-admin.mjs channels --pending` 과 같은 조건.
 * 오래 기다린 건이 앞에 오도록 `vcode_confirmed_at` 오름차순.
 */
export async function listPendingChannels(
  limit = 100,
  admin: Admin = createAdminClient(),
): Promise<AdminPendingChannel[]> {
  const { data, error } = await admin
    .from("seller_channels")
    .select(`${CHANNEL_COLUMNS}, sellers(id, code, name, handle)`)
    .eq("verified", false)
    .not("vcode_confirmed_at", "is", null)
    .order("vcode_confirmed_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[admin/sellers] pending channels failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const { sellers, ...ch } = row as AdminChannelRow & {
      sellers: { id: string; code: string | null; name: string; handle: string } | null;
    };
    return { ...ch, seller: sellers ?? null };
  });
}

/* ------------------------------------------------------------ 쓰기 ------------------------------------------------------------ */

/**
 * 정지 · 복귀 — `partner-admin.mjs cmdSuspend` 와 같은 patch(`{ active }`).
 * 정지하면 다음 요청부터 `requireSeller()` 가 `/influencer/suspended` 로 보낸다(0001 · inf-console-plan 결정 6).
 * 사유는 저장하지 않는다 — 스크립트와 같이 stdout · Slack 한 줄만(테이블에 컬럼이 없다).
 */
export async function setSellerActive(
  ref: string,
  active: boolean,
  reason = "",
  admin: Admin = createAdminClient(),
): Promise<AdminSellerActionResult> {
  const s = await findSeller(admin, ref);
  if (s === "error") return { ok: false, code: "err" };
  if (!s) return { ok: false, code: "err_not_found" };
  if (s.active === active) return { ok: true, code: active ? "reactivated" : "suspended" };

  const { error } = await admin.from("sellers").update({ active }).eq("id", s.id);
  if (error) {
    console.error("[admin/sellers] setSellerActive failed:", error.message);
    return { ok: false, code: "err" };
  }
  const verb = active ? "복귀" : "정지";
  await notifySlack(`[셀러리] 인플루언서 ${verb} · ${s.code ?? s.id} · ${s.name}${reason ? ` · ${reason}` : ""}`);
  return { ok: true, code: active ? "reactivated" : "suspended" };
}

/**
 * 프로필 공개 · 비공개 — **새 쓰기 경로**. 0001 헤더가 "비공개 프로필 (관리자만 토글)" 이라 적어 둔 컬럼인데
 * 읽기(`seller_is_public()` · 공개 조인)만 있었고 바꾸는 경로가 저장소에 없었다.
 * `hidden=true` 면 갤러리·리더보드·판매 카드에서 사라진다(로그인은 그대로 — 그건 `active`).
 */
export async function setSellerHidden(
  ref: string,
  hidden: boolean,
  admin: Admin = createAdminClient(),
): Promise<AdminSellerActionResult> {
  const s = await findSeller(admin, ref);
  if (s === "error") return { ok: false, code: "err" };
  if (!s) return { ok: false, code: "err_not_found" };
  if (s.hidden === hidden) return { ok: true, code: hidden ? "hidden" : "shown" };

  const { error } = await admin.from("sellers").update({ hidden }).eq("id", s.id);
  if (error) {
    console.error("[admin/sellers] setSellerHidden failed:", error.message);
    return { ok: false, code: "err" };
  }
  await notifySlack(`[셀러리] 인플루언서 ${hidden ? "비공개" : "공개"} · ${s.code ?? s.id} · ${s.name}`);
  return { ok: true, code: hidden ? "hidden" : "shown" };
}

/**
 * 채널 인증 완료 · 해제 — `partner-admin.mjs cmdVerify` 와 같은 patch.
 *   완료: `{ verified: true, vcode: null }`   — 코드를 지워 재사용을 막는다
 *   해제: `{ verified: false, vcode_confirmed_at: null }` — 사칭 발견 시. 메인 채널(`is_primary`)은 유지한다(0010)
 * 클라이언트 요청으로 `verified` 가 되는 경로는 이 함수(관리자 게이트 뒤)뿐이다 — inf-console-plan §4.9.
 */
export async function setChannelVerified(
  ref: string,
  verified: boolean,
  admin: Admin = createAdminClient(),
): Promise<AdminSellerActionResult> {
  const c = await findChannel(admin, ref);
  if (c === "error") return { ok: false, code: "err" };
  if (!c) return { ok: false, code: "err_not_found" };

  const patch = verified ? { verified: true, vcode: null } : { verified: false, vcode_confirmed_at: null };
  const { error } = await admin.from("seller_channels").update(patch).eq("id", c.id);
  if (error) {
    console.error("[admin/sellers] setChannelVerified failed:", error.message);
    return { ok: false, code: "err" };
  }
  await notifySlack(`[셀러리] 채널 ${verified ? "인증 완료" : "인증 해제"} · ${c.code ?? c.id} · ${c.platform}`);
  return { ok: true, code: verified ? "channel_verified" : "channel_unverified" };
}

/** 홈 위젯용 — 승인 대기 건수만 (목록을 받지 않는다) */
export async function countPendingChannels(admin: Admin = createAdminClient()): Promise<number> {
  const { count, error } = await admin
    .from("seller_channels")
    .select("id", { count: "exact", head: true })
    .eq("verified", false)
    .not("vcode_confirmed_at", "is", null);
  if (error) {
    console.error("[admin/sellers] countPendingChannels failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export { isChannelPending };
