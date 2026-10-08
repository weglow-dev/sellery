/**
 * 인플루언서 팔로우 — 순수 규칙 (0045). DB 접근 없음.
 *
 * 하는 일은 **홈 정렬 우대 하나**다(`/about` 이 약속한 것). 메일은 보내지 않는다 —
 * 셀러 단위 상시 메일 동의는 건별 오픈 알림(0044)보다 광고성 정보 요건이 무거워 법률 검토 뒤에 다룬다.
 */

/** 팔로우 버튼 상태 */
export type FollowButtonView =
  | { kind: "follow"; label: string; title: string }
  | { kind: "unfollow"; label: string; title: string }
  | { kind: "login"; label: string; title: string };

/**
 * `/influencers` 목록의 팔로우 토글. 비로그인은 로그인으로 보낸다 —
 * 팔로우는 회원 전용이고(0045) 저장할 곳이 `user_id` 다.
 */
export function followButtonView(state: { signedIn: boolean; following: boolean }): FollowButtonView {
  if (!state.signedIn) {
    return { kind: "login", label: "☆ 팔로우", title: "로그인하면 팔로우한 인플루언서의 판매가 홈 위쪽에 보여요" };
  }
  if (state.following) {
    return { kind: "unfollow", label: "★ 팔로잉", title: "팔로우를 해제합니다" };
  }
  return { kind: "follow", label: "☆ 팔로우", title: "이 인플루언서의 판매가 홈 위쪽에 보여요" };
}

/**
 * 홈 정렬의 팔로우 키 — 1 이면 위로 올린다.
 *
 * **★ 추천(유료) 다음** 순위다. 인플루언서 제안서 p.8 이 "고객 홈 상단 노출(7일)을 셀러리 포인트로
 * 신청하시면, 진행 중인 판매가 **가장 먼저** 보입니다" 로 유료 노출에 최상단을 약속했다
 * (docs/points-policy.md:148) — 팔로우를 그 위에 두면 돈 받고 한 약속을 깬다.
 *
 * `allowed` 는 링크 유입 보호의 `allowFeat` 와 같은 가드다. 보호 중(인플루언서 링크로 들어온 상태)에는
 * **그 인플루언서의 판매만** 우대한다 — 팔로우한 다른 셀러의 판매가 위로 오면 보호의 뜻이 사라진다.
 */
export function followRank(sellerId: string, followedIds: ReadonlySet<string>, allowed: boolean): 0 | 1 {
  return allowed && followedIds.has(sellerId) ? 1 : 0;
}

/** 신청·해제 결과 문구 — 라우트가 `?follow=` 로 옮긴다 */
export const FOLLOW_MESSAGES: Record<string, string> = {
  on: "팔로우했어요 — 이 인플루언서의 다음 판매가 홈 위쪽에 보여요.",
  on_already: "이미 팔로우하고 있어요.",
  off: "팔로우를 해제했어요.",
  off_already: "팔로우하지 않은 인플루언서예요.",
  err_NOT_FOUND: "인플루언서를 찾을 수 없어요.",
  err_DB_ERROR: "잠시 후 다시 시도해주세요.",
};

export function followMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  return FOLLOW_MESSAGES[key] ?? null;
}
