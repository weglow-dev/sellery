/**
 * 관리자 파트너 관리 — 인플루언서 규칙. 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/admin/sellers.server.ts`.
 *
 * 데모 원본: `packages/core/src/actions.ts` 의 관리자 인플루언서 화면(`vAdminSellers`) · 운영 스크립트
 * `packages/db/scripts/partner-admin.mjs` 의 `list` · `channels --pending` · `verify-channel` · `unverify-channel` · `suspend` · `reactivate`.
 * 그 스크립트가 지금까지 하던 일을 화면으로 옮긴다(docs/admin-console-plan.md "파트너 관리" · docs/inf-console-plan.md §4.7).
 *
 * 마이그레이션 없음 — 컬럼이 전부 있다: `sellers.active`(정지) · `sellers.hidden`(프로필 비공개, 0001) ·
 * `seller_channels.verified` · `vcode` · `vcode_confirmed_at`(0001 · 0010). 쓰기는 service role 의 `.update()`.
 *
 *   SELLER_FILTERS · parseSellerFilter — 목록 필터(전체 · 정지 · 비공개 · 인증 대기)
 *   sellerStatusChip · channelStatusChip — 상태 칩 문구·색
 *   accountLinkLabel — `user_id` 연결 여부 문구
 *   channelPendingSince · isChannelPending — "인증 확인" 누른 채널 판정(verified=false and vcode_confirmed_at is not null)
 *   sellerSearchHit — 검색(활동명 · 핸들 · code · 이메일) 클라이언트측 판정. 서버는 같은 조건을 `or()` 로 건다
 *   HIDDEN_LABELS · SELLER_ACTION_MESSAGES — 토글·액션 결과 문구
 */
import type { StatusTone } from "../order-status";

/** 목록 상단 필터 — 스크립트의 `--inactive` 를 넓힌 것. `all` 은 정지·비공개까지 전부 */
export const SELLER_FILTERS = ["all", "active", "suspended", "hidden", "pending_channel"] as const;
export type SellerFilter = (typeof SELLER_FILTERS)[number];

export const SELLER_FILTER_LABELS: Record<SellerFilter, string> = {
  all: "전체",
  active: "활동 중",
  suspended: "정지",
  hidden: "비공개",
  pending_channel: "채널 인증 대기",
};

export function parseSellerFilter(raw: string | null | undefined): SellerFilter {
  return SELLER_FILTERS.includes(raw as SellerFilter) ? (raw as SellerFilter) : "all";
}

/** 인플루언서 한 명의 표시 상태 — 정지가 비공개보다 우선(정지는 로그인 자체가 막힌다) */
export function sellerStatusChip(s: { active: boolean; hidden: boolean }): { label: string; tone: StatusTone } {
  if (!s.active) return { label: "정지", tone: "red" };
  if (s.hidden) return { label: "비공개", tone: "amber" };
  return { label: "활동 중", tone: "green" };
}

/** 채널 인증 상태 — 0010 계약: [인증 확인] 은 `vcode_confirmed_at` 만 기록하고 `verified` 는 운영자만 올린다 */
export function channelStatusChip(c: {
  verified: boolean;
  vcode_confirmed_at: string | null;
}): { label: string; tone: StatusTone } {
  if (c.verified) return { label: "✓ 인증됨", tone: "green" };
  if (c.vcode_confirmed_at) return { label: "인증 대기", tone: "amber" };
  return { label: "미인증", tone: "gray" };
}

/** 승인 큐에 올라온 채널인가 — 서버 목록 필터와 같은 조건 */
export function isChannelPending(c: { verified: boolean; vcode_confirmed_at: string | null }): boolean {
  return !c.verified && c.vcode_confirmed_at !== null;
}

/** 인증 확인을 누른 뒤 지난 일수 — 오래 방치된 건을 목록에서 앞으로 올리는 데 쓴다. 대기가 아니면 null */
export function channelPendingSince(
  c: { verified: boolean; vcode_confirmed_at: string | null },
  now: Date = new Date(),
): number | null {
  if (!isChannelPending(c)) return null;
  const at = Date.parse(c.vcode_confirmed_at as string);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now.getTime() - at) / 86_400_000));
}

/** `sellers.user_id` 연결 여부 — 미연결은 초대(`partner-admin.mjs invite`)가 필요한 시드·계약 행 */
export function accountLinkLabel(userId: string | null | undefined): string {
  return userId ? `연결 (${userId.slice(0, 8)}…)` : "미연결";
}

export const HIDDEN_LABELS = {
  hide: "비공개로 전환",
  show: "공개로 전환",
  hidden: "갤러리·리더보드·판매 카드에서 숨겨집니다. 로그인은 그대로 됩니다.",
  shown: "공개 상태입니다.",
} as const;

/** 폼 액션 결과 문구 — 화면이 `?msg=` 로 받아 띄운다 */
export const SELLER_ACTION_MESSAGES: Record<string, string> = {
  suspended: "정지했습니다. 다음 요청부터 콘솔에 들어올 수 없습니다.",
  reactivated: "정지를 풀었습니다.",
  hidden: "비공개로 전환했습니다.",
  shown: "공개로 전환했습니다.",
  channel_verified: "채널을 인증 완료로 바꿨습니다.",
  channel_unverified: "채널 인증을 해제했습니다. 메인 채널 설정은 그대로입니다.",
  err_not_found: "대상을 찾지 못했습니다.",
  err_input: "입력값을 확인해주세요.",
  err: "처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

/**
 * 검색 판정 — 활동명 · 핸들 · code · 이메일. 서버는 같은 컬럼에 `ilike` `or()` 를 건다(`sellers.server.ts` `SEARCH_COLUMNS`).
 * 화면에서 이미 받아 둔 목록을 다시 거를 때 쓴다(재조회 없이 즉시 반응).
 */
export function sellerSearchHit(
  s: { name: string; handle: string; code: string | null; email: string | null },
  q: string,
): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [s.name, s.handle, s.code, s.email].some((v) => (v ?? "").toLowerCase().includes(t));
}
