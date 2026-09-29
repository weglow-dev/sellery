/**
 * 독점권 신청 · 승인 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은
 * `../server/partner/exclusive.server.ts`(인플루언서) · `../server/brand/exclusive.server.ts`(브랜드).
 *
 * 판정은 **DB 가 한다**(0025 `seller_exclusive_eligible` — 등급 순위는 `grade_tiers.sort_order`,
 * 0 = 블랙이라 "이상" = `sort_order <=`). 여기서는 그 jsonb 를 타입으로 좁히고(`parse*`),
 * 버튼·배지 문구로 바꾼다 — 프로토타입 `ProductDetailModal`(독점권 블록) · `DM.svelte`(브랜드 승인 행) 의
 * 문구를 그대로 쓴다.
 *
 * 프로토타입과 다른 점 하나: 승인 시 **같은 상품의 남은 대기 신청을 자동 거절**한다(0025
 * `app_brand_decide_exclusive`). 프로토타입은 `approveExcl` 이 다른 신청을 그대로 둬서 PENDING 이
 * 남았고, 그 상태에서 다시 승인을 누르면 독점 인플루언서가 덮어써졌다. 독점권은 1명이므로 닫았다.
 */

/* ---------------- 신청 자격 (seller_exclusive_eligible) ---------------- */

/** 신청을 막는 사유. `OK` 만 신청 가능. */
export type ExclusiveReason =
  | "OK"
  | "NO_OFFER" // 이 상품에 독점권 오퍼가 없다
  | "LOCKED" // 이미 독점 인플루언서가 확정됐다
  | "GRADE" // 내 등급이 오퍼 기준에 못 미친다
  | "NOT_LISTED" // 판매 중 상품이 아니다
  | "BAD_OFFER" // 오퍼 등급이 등급표에 없다 (데이터 오류)
  | "NO_SELLER";

export type ExclusiveEligibility = {
  eligible: boolean;
  /** 내 등급. 판정 전에 막힌 경우(NO_OFFER · NOT_LISTED · LOCKED) null 일 수 있다. */
  grade: string | null;
  /** 오퍼가 요구하는 등급. */
  needGrade: string | null;
  reason: ExclusiveReason;
};

const REASONS: readonly ExclusiveReason[] = [
  "OK",
  "NO_OFFER",
  "LOCKED",
  "GRADE",
  "NOT_LISTED",
  "BAD_OFFER",
  "NO_SELLER",
];

function asReason(v: unknown): ExclusiveReason {
  return REASONS.includes(v as ExclusiveReason) ? (v as ExclusiveReason) : "NO_OFFER";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** `seller_exclusive_eligible` 한 행. */
export function parseEligibility(row: unknown): ExclusiveEligibility {
  const o = (row ?? {}) as Record<string, unknown>;
  return {
    eligible: o.eligible === true,
    grade: str(o.grade),
    needGrade: str(o.need_grade),
    reason: asReason(o.reason),
  };
}

/* ---------------- 신청 상태 ---------------- */

export type ExclusiveStatus = "PENDING" | "APPROVED" | "REJECTED";

export function asExclusiveStatus(v: unknown): ExclusiveStatus | null {
  return v === "PENDING" || v === "APPROVED" || v === "REJECTED" ? v : null;
}

/** 인플루언서가 보는 내 신청 (`app_seller_exclusive_requests`). */
export type MyExclusiveRequest = {
  id: string;
  status: ExclusiveStatus;
  productCode: string | null;
  productName: string | null;
  label: string | null;
  needGrade: string | null;
  /** 이 상품이 나로 확정됐나. */
  lockedByMe: boolean;
  createdAt: string | null;
  decidedAt: string | null;
};

/** 브랜드가 보는 들어온 신청 (`app_brand_exclusive_requests`). 신청 시 프로필이 공개된다. */
export type BrandExclusiveRequest = {
  id: string;
  status: ExclusiveStatus;
  productCode: string | null;
  productName: string | null;
  label: string | null;
  needGrade: string | null;
  /** 이 상품이 이미 누군가로 확정됐나 — true 면 승인 버튼을 막는다. */
  locked: boolean;
  sellerCode: string | null;
  sellerName: string | null;
  sellerHandle: string | null;
  sellerGrade: string | null;
  sellerFollowers: number | null;
  sellerM3Sales: number | null;
  createdAt: string | null;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rows(payload: unknown): Record<string, unknown>[] {
  const o = (payload ?? {}) as Record<string, unknown>;
  return Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]) : [];
}

export function parseMyExclusiveRequests(payload: unknown): MyExclusiveRequest[] {
  return rows(payload).flatMap((o) => {
    const status = asExclusiveStatus(o.status);
    const id = str(o.id);
    if (!status || !id) return [];
    return [
      {
        id,
        status,
        productCode: str(o.product_code),
        productName: str(o.product_name),
        label: str(o.exclusive_label),
        needGrade: str(o.exclusive_grade),
        lockedByMe: o.locked_by_me === true,
        createdAt: str(o.created_at),
        decidedAt: str(o.decided_at),
      },
    ];
  });
}

export function parseBrandExclusiveRequests(payload: unknown): BrandExclusiveRequest[] {
  return rows(payload).flatMap((o) => {
    const status = asExclusiveStatus(o.status);
    const id = str(o.id);
    if (!status || !id) return [];
    return [
      {
        id,
        status,
        productCode: str(o.product_code),
        productName: str(o.product_name),
        label: str(o.exclusive_label),
        needGrade: str(o.exclusive_grade),
        locked: o.locked === true,
        sellerCode: str(o.seller_code),
        sellerName: str(o.seller_name),
        sellerHandle: str(o.seller_handle),
        sellerGrade: str(o.seller_grade),
        sellerFollowers: num(o.seller_followers),
        sellerM3Sales: num(o.seller_m3_sales),
        createdAt: str(o.created_at),
      },
    ];
  });
}

/* ---------------- RPC 결과 ---------------- */

export type ExclusiveActionResult =
  | { ok: true; already: boolean; status: ExclusiveStatus; sellerName: string | null; autoRejected: number }
  | { ok: false; code: string; grade: string | null; needGrade: string | null };

export function parseRequestResult(payload: unknown): ExclusiveActionResult {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, code: str(o.code) ?? "ERROR", grade: str(o.grade), needGrade: str(o.need_grade) };
  }
  return {
    ok: true,
    already: o.already === true,
    status: asExclusiveStatus(o.status) ?? "PENDING",
    sellerName: str(o.seller_name),
    autoRejected: num(o.auto_rejected) ?? 0,
  };
}

/* ---------------- 화면 문구 ---------------- */

/** 인플루언서 상품 상세의 독점권 버튼. 프로토타입 `ProductDetailModal` 분기 순서 그대로. */
export type ExclusiveButton = {
  kind: "request" | "pending" | "mine" | "rejected" | "disabled";
  label: string;
  /** 버튼을 누를 수 있나. */
  enabled: boolean;
  /** 버튼 밑/툴팁 안내. */
  hint: string | null;
};

export function exclusiveButton(
  e: ExclusiveEligibility,
  mine: MyExclusiveRequest | null,
): ExclusiveButton {
  // 내 신청이 살아있으면 자격보다 그 상태를 먼저 보여준다
  if (mine?.status === "APPROVED" || mine?.lockedByMe) {
    return { kind: "mine", label: "독점권 확정 — 나 🎉", enabled: false, hint: "이 상품은 나만 진행할 수 있습니다." };
  }
  if (mine?.status === "PENDING") {
    return {
      kind: "pending",
      label: "독점권 신청 완료 — 브랜드 승인 대기",
      enabled: false,
      hint: "브랜드에 내 프로필(이름·채널·지표)이 공개된 상태입니다.",
    };
  }

  if (e.reason === "LOCKED") {
    return {
      kind: "disabled",
      label: "독점 인플루언서 확정됨 (○○○ 인플루언서)",
      enabled: false,
      hint: "이 상품의 샘플 요청은 제한됩니다.",
    };
  }
  if (e.reason === "GRADE") {
    return {
      kind: "disabled",
      label: `등급 미달 — 내 등급 ${e.grade ?? "-"} / 필요 ${e.needGrade ?? "-"} 이상`,
      enabled: false,
      hint: null,
    };
  }
  if (!e.eligible) {
    // NO_OFFER · NOT_LISTED · BAD_OFFER — 화면이 블록 자체를 숨기므로 여기까지 오면 데이터 문제다
    return { kind: "disabled", label: "독점권 신청을 받지 않는 상품입니다", enabled: false, hint: null };
  }

  const again = mine?.status === "REJECTED";
  return {
    kind: again ? "rejected" : "request",
    label: again
      ? `독점권 다시 신청 — 내 등급 ${e.grade ?? "-"} 충족 ✓`
      : `독점권 신청 — 내 등급 ${e.grade ?? "-"} 충족 ✓`,
    enabled: true,
    hint: "신청 시 브랜드에 프로필(이름·채널·지표)이 공개됩니다.",
  };
}

/** 신청/결정 뒤 303 `?msg=` 에 붙는 문구. */
export const EXCLUSIVE_MESSAGES: Record<string, string> = {
  requested: "독점권 신청 완료 — 브랜드에 내 프로필이 공개되고 승인 대기 상태가 됩니다",
  already: "이미 신청한 상품입니다",
  approved: "독점권 승인 — 이 인플루언서만 상품을 진행할 수 있습니다",
  rejected: "독점권 신청을 거절했습니다",
};

/** 실패 코드 → 사람이 읽는 문구. */
export const EXCLUSIVE_FAIL_MESSAGES: Record<string, string> = {
  GRADE: "등급이 오퍼 기준에 못 미쳐 신청할 수 없습니다",
  LOCKED: "이미 다른 인플루언서로 독점권이 확정된 상품입니다",
  NO_OFFER: "이 상품에는 독점권 오퍼가 없습니다",
  NOT_LISTED: "판매 중인 상품이 아닙니다",
  BAD_OFFER: "오퍼 등급 설정이 잘못됐습니다 — 브랜드에 문의해주세요",
  NOT_FOUND: "신청을 찾을 수 없습니다",
  ERROR: "처리하지 못했습니다. 잠시 후 다시 시도해주세요",
};

export function exclusiveFailMessage(code: string): string {
  return EXCLUSIVE_FAIL_MESSAGES[code] ?? EXCLUSIVE_FAIL_MESSAGES.ERROR;
}
