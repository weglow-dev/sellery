/**
 * 관리자 콘솔 "파트너 관리 — 인플루언서" (docs/admin-console-plan.md "파트너 관리" · docs/inf-console-plan.md §4.7).
 * `packages/db/scripts/partner-admin.mjs` 의 `list` · `channels [--pending]` · `verify-channel` · `unverify-channel` ·
 * `suspend` · `reactivate` 를 화면용으로 옮긴 것 — 스크립트와 **같은 쿼리·같은 patch** 를 쓴다(그쪽은 운영 백업 경로로 남는다).
 * 목록의 열 구성은 데모 `apps/admin/src/routes/(demo)/influencers/+page.svelte`(프로토타입 `vAdminSellers`) 를 따른다:
 * 아바타·소개 · 등급 · 팔로워 · 3개월 매출 · 판매 n/m · 채널 인증 n/m · 🥬 · 상태 · 관리.
 *
 * **마이그레이션 없음.** 컬럼이 전부 있다: `sellers.active` · `sellers.hidden`(0001 — "관리자만 토글") ·
 * `seller_channels.verified` · `vcode` · `vcode_confirmed_at`(0001 · 0010) · `celery_ledger.reason='admin_grant'`(0005).
 * 새 RPC 도 없다 — service role 의 `.update()` · `.insert()`.
 * `sellers.hidden` 은 읽기 경로만 있었다(`seller_is_public()` · 공개 조인) — **쓰기는 여기가 처음**이다.
 *
 * 전부 service role + 화면의 `requireAdmin()` 뒤에서만. 쓰기는 스크립트와 같은 순서를 지킨다:
 * **대상을 먼저 조회(`findSeller`/`findChannel`)한 뒤 그 `id` 로 update** — 클라이언트가 보낸 ref 를 그대로 믿지 않는다.
 *
 *   listSellers({ filter, grade, q, limit })  목록 + 카운트(전체·정지·비공개·인증 대기) + 등급별 카운트. 3개월 매출 내림차순
 *   getSeller(ref)                           상세 1건 + 채널 전부 + 🥬 잔액 (ref: code('s1') 또는 uuid)
 *   listPendingChannels(limit)               승인 큐 — verified=false and vcode_confirmed_at is not null
 *   countPendingChannels()                   홈 위젯용 건수
 *   setSellerActive(ref, active, reason)     정지 · 복귀 (Slack 한 줄)
 *   setSellerHidden(ref, hidden)             프로필 공개 · 비공개 (신규 쓰기 경로)
 *   setChannelVerified(ref, verified)        인증 완료(verified=true·vcode=null) · 해제(verified=false·vcode_confirmed_at=null)
 *   grantCelery(ref, delta?)                 🥬 관리자 이벤트 지급 — celery_ledger(reason 'admin_grant' · 기본값 platform_settings.admin_grant_cel)
 * 순수 규칙(필터·칩·검색)은 `../../admin/seller-rules.ts`.
 */
import { DONE_STATES } from "@sellery/core/constants";
import { isChannelPending, type SellerFilter } from "../../admin/seller-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { notifySlack } from "../partner/slack.server";

export type { SellerFilter } from "../../admin/seller-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 정산 정보(계좌 · 주민번호 · 사업자번호)는 읽지 않는다 — 파트너 관리에 필요 없고 열람 로그 대상이다(계획서 M6). */
const LIST_COLUMNS =
  "id, code, name, handle, email, platform, avatar_url, followers, category, intro, grade, m3_sales, active, hidden, user_id, created_at";
const CHANNEL_COLUMNS =
  "id, code, seller_id, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, created_at";

/** `sellers` 행 그대로 */
export type AdminSellerBase = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  email: string | null;
  platform: string;
  avatar_url: string | null;
  followers: number;
  category: string | null;
  intro: string | null;
  grade: string | null;
  m3_sales: number;
  active: boolean;
  hidden: boolean;
  user_id: string | null;
  created_at: string;
};

/** 목록 한 줄 = 행 + 표시용 집계(채널 · 캠페인 · 🥬) */
export type AdminSellerRow = AdminSellerBase & {
  channels_total: number;
  channels_verified: number;
  channels_pending: number;
  campaigns_total: number;
  campaigns_done: number;
  celery: number;
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
  /** 등급명 → 명수 (등급 필터 칩) */
  grades: Record<string, number>;
};

export type AdminSellerDetail = {
  seller: AdminSellerBase;
  channels: AdminChannelRow[];
  celery: number;
};

/** 쓰기 결과 — 화면이 `?msg=` 로 바꿔 띄운다. `code` 는 seller-rules 의 SELLER_ACTION_MESSAGES 키 */
export type AdminSellerActionResult =
  | { ok: true; code: string }
  | { ok: false; code: "err_not_found" | "err" };

/* ------------------------------------------------------------ 조회 ------------------------------------------------------------ */

/** code('s1') 또는 uuid → 행. 없으면 null · 읽기 실패 'error' (orders.server.ts `orderIdOf` 와 같은 계약) */
async function findSeller(admin: Admin, ref: string): Promise<AdminSellerBase | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  const q = admin.from("sellers").select(LIST_COLUMNS);
  const { data, error } = UUID_RE.test(r) ? await q.eq("id", r).maybeSingle() : await q.eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/sellers] seller lookup failed:", error.message);
    return "error";
  }
  return (data as AdminSellerBase | null) ?? null;
}

async function findChannel(admin: Admin, ref: string): Promise<AdminChannelRow | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  const q = admin.from("seller_channels").select(CHANNEL_COLUMNS);
  const { data, error } = UUID_RE.test(r) ? await q.eq("id", r).maybeSingle() : await q.eq("code", r).maybeSingle();
  if (error) {
    console.error("[admin/sellers] channel lookup failed:", error.message);
    return "error";
  }
  return (data as AdminChannelRow | null) ?? null;
}

/** 🥬 잔액 — `celery_balances` 뷰(0005). 행이 없으면 0 */
async function celeryBalances(admin: Admin): Promise<Map<string, number>> {
  const { data, error } = await admin.from("celery_balances").select("seller_id, balance").eq("owner_type", "seller");
  if (error) {
    console.error("[admin/sellers] celery_balances failed:", error.message);
    return new Map();
  }
  return new Map((data ?? []).filter((r) => r.seller_id).map((r) => [r.seller_id as string, Number(r.balance ?? 0)]));
}

/**
 * 목록 — 데모 `vAdminSellers` 의 열 구성 + 상태 필터. 정렬은 데모와 같이 **3개월 매출 내림차순**.
 * `filter='pending_channel'` 은 대기 채널의 `seller_id` 를 먼저 모아 `in()` 으로 좁힌다
 * (조인 필터로는 "채널 중 하나라도 대기" 를 표현할 수 없다). 채널·캠페인·🥬 집계는 목록 전체를 한 번에 읽어 메모리에서 묶는다
 * (인플루언서 수가 수천 단위를 넘지 않는 전제 — 넘으면 집계 뷰나 RPC 로 옮긴다).
 * 실패해도 화면이 죽지 않게 빈 목록을 돌려준다.
 */
export async function listSellers(
  opts: { filter?: SellerFilter; grade?: string | null; q?: string | null; limit?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<AdminSellerList> {
  const { filter = "all", grade = null, q = null, limit = 500 } = opts;
  const empty: AdminSellerList = {
    rows: [],
    counts: { all: 0, suspended: 0, hidden: 0, pendingChannel: 0 },
    grades: {},
  };

  const [channels, campaigns, celery, allRows] = await Promise.all([
    admin.from("seller_channels").select("seller_id, verified, vcode_confirmed_at"),
    admin.from("campaigns").select("seller_id, status"),
    celeryBalances(admin),
    admin.from("sellers").select("grade, active, hidden"),
  ]);
  if (channels.error || campaigns.error || allRows.error) {
    console.error(
      "[admin/sellers] list aggregates failed:",
      channels.error?.message ?? campaigns.error?.message ?? allRows.error?.message,
    );
    return empty;
  }

  type Agg = { total: number; verified: number; pending: number };
  const chAgg = new Map<string, Agg>();
  for (const c of channels.data ?? []) {
    const a = chAgg.get(c.seller_id as string) ?? { total: 0, verified: 0, pending: 0 };
    a.total += 1;
    if (c.verified) a.verified += 1;
    if (isChannelPending({ verified: c.verified as boolean, vcode_confirmed_at: (c.vcode_confirmed_at as string) ?? null })) a.pending += 1;
    chAgg.set(c.seller_id as string, a);
  }
  const cpAgg = new Map<string, { total: number; done: number }>();
  for (const c of campaigns.data ?? []) {
    if (!c.seller_id) continue;
    const a = cpAgg.get(c.seller_id as string) ?? { total: 0, done: 0 };
    a.total += 1;
    if (DONE_STATES.includes(c.status as never)) a.done += 1;
    cpAgg.set(c.seller_id as string, a);
  }
  const pendingSellerIds = [...chAgg.entries()].filter(([, a]) => a.pending > 0).map(([id]) => id);

  // 카운트·등급 칩은 필터와 무관하게 전체 기준
  const counts = {
    all: (allRows.data ?? []).length,
    suspended: (allRows.data ?? []).filter((r) => !r.active).length,
    hidden: (allRows.data ?? []).filter((r) => r.hidden).length,
    pendingChannel: pendingSellerIds.length,
  };
  const grades: Record<string, number> = {};
  for (const r of allRows.data ?? []) {
    const g = (r.grade as string | null) ?? "스타터";
    grades[g] = (grades[g] ?? 0) + 1;
  }

  let sel = admin.from("sellers").select(LIST_COLUMNS).order("m3_sales", { ascending: false }).limit(limit);
  if (filter === "active") sel = sel.eq("active", true).eq("hidden", false);
  if (filter === "suspended") sel = sel.eq("active", false);
  if (filter === "hidden") sel = sel.eq("hidden", true);
  if (filter === "pending_channel") {
    if (pendingSellerIds.length === 0) sel = sel.eq("id", "00000000-0000-0000-0000-000000000000");
    else sel = sel.in("id", pendingSellerIds);
  }
  if (grade) sel = sel.eq("grade", grade);
  const term = (q ?? "").trim();
  if (term) {
    const like = `%${term.replace(/[%,]/g, "")}%`;
    sel = sel.or(`name.ilike.${like},handle.ilike.${like},code.ilike.${like},email.ilike.${like},category.ilike.${like},intro.ilike.${like}`);
  }

  const { data, error } = await sel;
  if (error) {
    console.error("[admin/sellers] list failed:", error.message);
    return { ...empty, counts, grades };
  }
  const rows: AdminSellerRow[] = ((data ?? []) as AdminSellerBase[]).map((s) => {
    const ch = chAgg.get(s.id) ?? { total: 0, verified: 0, pending: 0 };
    const cp = cpAgg.get(s.id) ?? { total: 0, done: 0 };
    return {
      ...s,
      channels_total: ch.total,
      channels_verified: ch.verified,
      channels_pending: ch.pending,
      campaigns_total: cp.total,
      campaigns_done: cp.done,
      celery: celery.get(s.id) ?? 0,
    };
  });
  return { rows, counts, grades };
}

/** 상세 — 인플루언서 1명 + 채널 전부(가입일 오름차순) + 🥬 잔액. 없으면 null */
export async function getSeller(ref: string, admin: Admin = createAdminClient()): Promise<AdminSellerDetail | null> {
  const seller = await findSeller(admin, ref);
  if (!seller || seller === "error") return null;
  const [ch, cel] = await Promise.all([
    admin.from("seller_channels").select(CHANNEL_COLUMNS).eq("seller_id", seller.id).order("created_at", { ascending: true }),
    celeryBalances(admin),
  ]);
  if (ch.error) {
    console.error("[admin/sellers] channels failed:", ch.error.message);
    return { seller, channels: [], celery: cel.get(seller.id) ?? 0 };
  }
  return { seller, channels: (ch.data ?? []) as AdminChannelRow[], celery: cel.get(seller.id) ?? 0 };
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

/* ------------------------------------------------------------ 쓰기 ------------------------------------------------------------ */

/**
 * 정지 · 복귀 — `partner-admin.mjs cmdSuspend` 와 같은 patch(`{ active }`).
 * 정지하면 다음 요청부터 `requireSeller()` 가 `/influencer/suspended` 로 보낸다(0001 · inf-console-plan 결정 6).
 * 사유는 저장하지 않는다 — 스크립트와 같이 Slack 한 줄만(테이블에 컬럼이 없다).
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

/** `platform_settings.admin_grant_cel` — 없으면 3 (프로토타입 admGrant 와 같은 기본값) */
async function adminGrantCel(admin: Admin): Promise<number> {
  const { data, error } = await admin.from("platform_settings").select("value").eq("key", "admin_grant_cel").maybeSingle();
  if (error) {
    console.error("[admin/sellers] admin_grant_cel read failed:", error.message);
    return 3;
  }
  const n = Number(data?.value ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/**
 * 🥬 관리자 이벤트 지급 — 데모 `act.admGrant`(원장에 `delta:3, memo:'관리자 이벤트 지급'` push) 의 DB 판.
 * `celery_ledger` 에 `reason='admin_grant'` 행 1건을 적재한다(0005 — 잔액은 `celery_balances` 뷰가 합산).
 * **회수(음수)는 여기서 하지 않는다** — 운영 조정은 `reason='adjust'` 이고 원장 정책상 정산·돈 쪽 범위다(계획서 M7).
 * 금액은 `platform_settings.admin_grant_cel`(기본 3). 멱등이 아니다 — 누를 때마다 지급되므로 화면에서 confirm 을 건다.
 */
export async function grantCelery(
  ref: string,
  delta?: number,
  admin: Admin = createAdminClient(),
): Promise<AdminSellerActionResult> {
  const s = await findSeller(admin, ref);
  if (s === "error") return { ok: false, code: "err" };
  if (!s) return { ok: false, code: "err_not_found" };

  const amount = delta && delta > 0 ? Math.floor(delta) : await adminGrantCel(admin);
  const { error } = await admin.from("celery_ledger").insert({
    owner_type: "seller",
    seller_id: s.id,
    delta: amount,
    reason: "admin_grant",
    memo: "관리자 이벤트 지급",
    ref_type: "seller",
    ref_id: s.id,
  });
  if (error) {
    console.error("[admin/sellers] grantCelery failed:", error.message);
    return { ok: false, code: "err" };
  }
  await notifySlack(`[셀러리] 🥬 ${amount} 지급 · ${s.code ?? s.id} · ${s.name}`);
  return { ok: true, code: "celery_granted" };
}

export { isChannelPending };
