/**
 * 캠페인 상태 — 관리자 대시보드의 상태 칩 · 필터 칩. **순수 모듈**(DB 접근 없음).
 *
 * 라벨·톤은 데모 `packages/core/src/constants.ts` 의 `ST` 를 그대로 옮긴 것이다 — 같은 상태를
 * 관리자·인플루언서·브랜드가 다른 말로 부르면 안 된다. 톤 값(`blue` `amber` `green` `live` `red` `gray`)은
 * `packages/ui/css/site.css` 의 `.st.*` 클래스와 1:1 이다.
 *
 * `DECLINED` · `REJECTED` · `PASSED` 는 종결 상태라 흐름 순서에서 빠져 있고, 필터 칩에는
 * 실제로 존재하는 상태만 나온다(0건인 상태는 화면이 걸러낸다).
 */
export const CAMPAIGN_FLOW = [
  "SAMPLE_REQUESTED",
  "INVITED",
  "SAMPLE_APPROVED",
  "SAMPLE_PURCHASED",
  "SAMPLE_SHIPPED",
  "TESTING",
  "SCHEDULE_PROPOSED",
  "SCHEDULE_CONFIRMED",
  "LIVE",
  "CLEARING",
  "SETTLED",
  "DECLINED",
  "REJECTED",
  "PASSED",
] as const;

export type CampaignStatusKey = (typeof CAMPAIGN_FLOW)[number];

export type CampaignStatusTone = "blue" | "amber" | "green" | "live" | "red" | "gray";

/** 데모 `ST[k].l` */
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatusKey, string> = {
  SAMPLE_REQUESTED: "샘플 요청",
  INVITED: "브랜드 제안 · 수락 대기",
  DECLINED: "제안 거절",
  REJECTED: "거절됨",
  SAMPLE_APPROVED: "샘플 발송 대기",
  SAMPLE_PURCHASED: "샘플 구매 · 발송 대기",
  SAMPLE_SHIPPED: "샘플 배송중",
  TESTING: "테스트 중",
  PASSED: "인플루언서 패스",
  SCHEDULE_PROPOSED: "일정 승인 대기",
  SCHEDULE_CONFIRMED: "일정 확정",
  LIVE: "판매 진행중",
  CLEARING: "교환·환불 기간",
  SETTLED: "정산 완료",
};

/** 데모 `ST[k].c` */
export const CAMPAIGN_STATUS_TONES: Record<CampaignStatusKey, CampaignStatusTone> = {
  SAMPLE_REQUESTED: "blue",
  INVITED: "blue",
  DECLINED: "gray",
  REJECTED: "red",
  SAMPLE_APPROVED: "blue",
  SAMPLE_PURCHASED: "blue",
  SAMPLE_SHIPPED: "blue",
  TESTING: "amber",
  PASSED: "gray",
  SCHEDULE_PROPOSED: "amber",
  SCHEDULE_CONFIRMED: "green",
  LIVE: "live",
  CLEARING: "amber",
  SETTLED: "green",
};

/** 모르는 상태는 원문 그대로 회색 — DB 에 새 상태가 들어와도 화면이 깨지지 않게 한다 */
export function campaignStatusChip(status: string): { label: string; tone: CampaignStatusTone } {
  const s = status as CampaignStatusKey;
  return CAMPAIGN_FLOW.includes(s)
    ? { label: CAMPAIGN_STATUS_LABELS[s], tone: CAMPAIGN_STATUS_TONES[s] }
    : { label: status, tone: "gray" };
}

/** `?status=` — 대시보드 캠페인 필터. 빈 값·모르는 값은 null(전체) */
export function parseCampaignStatusFilter(raw: string | null | undefined): CampaignStatusKey | null {
  return CAMPAIGN_FLOW.includes(raw as CampaignStatusKey) ? (raw as CampaignStatusKey) : null;
}

/**
 * 필터 칩 정렬 — 흐름 순서(`CAMPAIGN_FLOW`)대로. 데모 `stCounts` 는 `Object.keys(ST)` 순서였는데 같은 순서다.
 * 0건인 상태는 넣지 않는다.
 */
export function sortCampaignStatusCounts(counts: { status: string; n: number }[]): { status: string; label: string; tone: CampaignStatusTone; n: number }[] {
  const order = new Map(CAMPAIGN_FLOW.map((s, i) => [s as string, i]));
  return counts
    .filter((c) => c.n > 0)
    .sort((a, b) => (order.get(a.status) ?? 999) - (order.get(b.status) ?? 999))
    .map((c) => ({ status: c.status, n: c.n, ...campaignStatusChip(c.status) }));
}

/** 기간 표기 "9/21–9/25" — 날짜가 없으면 "—"(데모와 같다) */
export function campaignPeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const md = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  return `${md(start)}–${md(end)}`;
}

/* ---------------------------------------------------------------- 흐름 스테퍼 ---------------------------------------------------------------- */

/**
 * 데모 `FLOW` · `FLOW_L`(`packages/core/src/constants.ts`) 이식 — 캠페인 상세 상단의 9단계 띠.
 * 종결 상태(DECLINED · REJECTED · PASSED)는 흐름에서 벗어난 것이라 단계가 없다.
 */
export const CAMPAIGN_FLOW_STEPS = [
  { status: "SAMPLE_REQUESTED", label: "샘플요청" },
  { status: "SAMPLE_APPROVED", label: "샘플승인" },
  { status: "SAMPLE_SHIPPED", label: "배송" },
  { status: "TESTING", label: "테스트" },
  { status: "SCHEDULE_PROPOSED", label: "일정제안" },
  { status: "SCHEDULE_CONFIRMED", label: "일정확정" },
  { status: "LIVE", label: "판매 LIVE" },
  { status: "CLEARING", label: "환불기간" },
  { status: "SETTLED", label: "정산" },
] as const;

/**
 * 현재 상태를 흐름 위에 놓는다. `INVITED`(브랜드 제안)·`SAMPLE_PURCHASED`(샘플 구매)는 흐름 목록에 없지만
 * 각각 샘플요청·샘플승인 자리에 해당하므로 그 단계로 접어 보여준다(데모 스테퍼와 같은 위치).
 */
export function campaignFlowSteps(status: string): { status: string; label: string; state: "done" | "current" | "todo" }[] {
  const folded = status === "INVITED" ? "SAMPLE_REQUESTED" : status === "SAMPLE_PURCHASED" ? "SAMPLE_APPROVED" : status;
  const at = CAMPAIGN_FLOW_STEPS.findIndex((s) => s.status === folded);
  return CAMPAIGN_FLOW_STEPS.map((s, i) => ({
    status: s.status,
    label: s.label,
    // 흐름을 벗어난 상태(거절·패스)는 at === -1 이라 전부 todo 로 둔다 — 진행한 척하지 않는다
    state: at < 0 ? "todo" : i < at ? "done" : i === at ? "current" : "todo",
  }));
}

/* ---------------------------------------------------------------- 관리자 대행 액션 ---------------------------------------------------------------- */

export const REJECT_REASON_MAX = 200;

export type AdminCampaignActionKind = "approve_sample" | "ship_sample" | "confirm_schedule" | "none";

/**
 * 관리자가 **브랜드를 대신해** 할 수 있는 일. 데모 캠페인 상세의 "브랜드 액션" 칸과 같은 분기다.
 * 브랜드가 응답하지 않아 흐름이 멈출 때 운영이 대신 진행시키는 용도이고, 쓰기는 브랜드 RPC
 * (`app_brand_*`)를 그대로 부른다 — 상태 전이·이벤트 문구를 두 번 구현하지 않는다.
 *
 * 인플루언서 차례(샘플 배송중 · 테스트 중 · **브랜드 제안 수락 대기**)나 이미 끝난 단계에는 아무 것도
 * 주지 않는다 — 관리자가 인플루언서를 대행하지는 않는다(샘플 수령·일정 제안·제안 수락은 본인만).
 *
 * ⚠ `INVITED` 를 `approve_sample` 에 묶어 두면 **버튼이 항상 실패한다**(2026-10-08 수정).
 * `INVITED` 는 브랜드가 제안하고 **인플루언서의 수락을 기다리는** 상태라 그 상태를 받는 RPC 는
 * `app_accept_invite` · `app_decline_invite`(둘 다 `p_seller_id` · 0016)뿐이고, 브랜드 RPC
 * `app_brand_approve_sample` 은 `SAMPLE_REQUESTED` 만 통과시킨다(0015:563 → `WRONG_STATUS`).
 * 라우트는 그 코드를 "현재 상태에서는 할 수 없는 동작입니다 — 화면을 새로 고쳐주세요" 로 바꿔
 * 일시적 충돌처럼 보이게 했다. 상태가 바뀌지 않으니 새로 고쳐도 같다.
 */
export function adminCampaignAction(status: string): { kind: AdminCampaignActionKind; label: string; hint: string } {
  switch (status) {
    case "SAMPLE_REQUESTED":
      return { kind: "approve_sample", label: "샘플 요청 검토", hint: "승인 시 배송지가 브랜드에 전달됩니다" };
    case "SAMPLE_APPROVED":
    case "SAMPLE_PURCHASED":
      return { kind: "ship_sample", label: "샘플 발송 등록", hint: "택배사 · 운송장 번호를 넣으면 인플루언서에게 전달됩니다" };
    case "SCHEDULE_PROPOSED":
      return { kind: "confirm_schedule", label: "판매 일정 승인", hint: "확정하면 판매 링크가 만들어집니다" };
    default:
      return { kind: "none", label: "", hint: "" };
  }
}

/**
 * 대행 액션이 **없는** 이유 — 화면의 "지금 할 일 없음" 카드가 상태별로 설명한다.
 *
 * 뭉뚱그려 "인플루언서 차례이거나 이미 끝난 단계" 라고만 하면, 운영자는 `INVITED` 처럼
 * 기다림이 길어지는 상태에서 "내가 밀어줄 수 있나" 를 다시 찾아보게 된다. 누가 무엇을
 * 기다리는지 적어 둔다.
 */
export function adminCampaignIdleReason(status: string): { who: string; what: string } {
  switch (status) {
    case "INVITED":
      return {
        who: "인플루언서",
        what: "브랜드 제안을 수락·거절하기를 기다립니다. 수락은 본인만 할 수 있어 운영이 대행하지 않습니다 — 응답이 없으면 스레드로 연락하세요.",
      };
    case "SAMPLE_SHIPPED":
      return { who: "인플루언서", what: "샘플 수령을 확인하기를 기다립니다. 수령 확인은 본인만 할 수 있습니다." };
    case "TESTING":
      return { who: "인플루언서", what: "테스트를 마치고 판매 일정을 제안하기를 기다립니다. 일정 제안은 본인만 할 수 있습니다." };
    case "LIVE":
      return { who: "고객", what: "판매가 진행 중입니다. 당장 멈춰야 하면 아래 [판매 중단] 을 쓰세요." };
    case "CLEARING":
      return { who: "운영", what: "교환·환불 기간입니다. 지급 기일이 되면 정산 화면에서 실행합니다." };
    case "SETTLED":
      return { who: "—", what: "정산까지 끝난 캠페인입니다." };
    case "DECLINED":
      return { who: "—", what: "인플루언서가 제안을 거절해 종결됐습니다." };
    case "REJECTED":
      return { who: "—", what: "브랜드가 거절해 종결됐습니다." };
    case "PASSED":
      return { who: "—", what: "인플루언서가 패스해 종결됐습니다." };
    default:
      return { who: "—", what: "이 단계에는 브랜드 대행 액션이 없습니다." };
  }
}

/** 반려·거절 사유 — 공백 정리 후 200자. 비면 null(브랜드 RPC 와 같은 규칙) */export function normalizeRejectReason(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, REJECT_REASON_MAX);
  return v === "" ? null : v;
}

/* ---------------------------------------------------------------- 긴급 판매 중단 · 재개 (0040) ---------------------------------------------------------------- */

export type AdminSaleControlKind = "end" | "resume" | "none";

/**
 * 진행 중인 판매를 멈추는 레버(0040). 브랜드 대행 액션과 **별개**다 —
 * 브랜드가 할 수 있는 일을 대신하는 게 아니라, 운영만 할 수 있는 일이다.
 *
 *   LIVE     → 중단 가능 (`app_admin_end_sale`: LIVE → CLEARING)
 *   CLEARING → 재개 가능 (`app_admin_resume_sale`: CLEARING → LIVE)
 *              — 실제 성공 여부는 RPC 가 정한다(정산 전 · 기간 내 · 상품 listed).
 *                기간이 지난 건은 눌러도 `PERIOD_OVER` 라서, 화면은 버튼을 주되 안내를 함께 띄운다.
 *   그 외     → 없음 (판매가 시작되기 전이거나 이미 정산됐다)
 *
 * 상품 검수의 [노출 중단]과 혼동하지 않게 문구를 분리한다 — 그쪽은 새 제안만 막고
 * 진행 중인 판매에는 영향이 없다(0015 `app_admin_review_product`).
 */
export function adminSaleControl(status: string): { kind: AdminSaleControlKind; label: string; hint: string } {
  switch (status) {
    case "LIVE":
      return {
        kind: "end",
        label: "판매 중단",
        hint: "지금 바로 구매를 막습니다. 판매 링크는 '판매 종료'로 남고 이미 결제된 주문과 정산 예정일은 그대로입니다.",
      };
    case "CLEARING":
      return {
        kind: "resume",
        label: "판매 재개",
        hint: "중단을 되돌립니다. 정산 전이고 판매 기간이 남아 있고 상품이 노출 중일 때만 됩니다.",
      };
    default:
      return { kind: "none", label: "", hint: "" };
  }
}
