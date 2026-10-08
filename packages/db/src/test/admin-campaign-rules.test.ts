import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_FLOW,
  CAMPAIGN_STATUS_LABELS,
  adminCampaignAction,
  adminCampaignIdleReason,
  adminSaleControl,
  campaignPeriodLabel,
  campaignStatusChip,
  parseCampaignStatusFilter,
  sortCampaignStatusCounts,
} from "../admin/campaign-rules";

/**
 * 데모 `packages/core/src/constants.ts` 의 `ST` 와 라벨·톤이 같아야 한다 —
 * 같은 상태를 관리자·인플루언서·브랜드가 다른 말로 부르면 안 된다.
 */
describe("campaignStatusChip — 데모 ST 와 같은 라벨·톤", () => {
  it("흐름 상태", () => {
    expect(campaignStatusChip("SAMPLE_REQUESTED")).toEqual({ label: "샘플 요청", tone: "blue" });
    expect(campaignStatusChip("INVITED")).toEqual({ label: "브랜드 제안 · 수락 대기", tone: "blue" });
    expect(campaignStatusChip("SAMPLE_APPROVED")).toEqual({ label: "샘플 발송 대기", tone: "blue" });
    expect(campaignStatusChip("SAMPLE_PURCHASED")).toEqual({ label: "샘플 구매 · 발송 대기", tone: "blue" });
    expect(campaignStatusChip("TESTING")).toEqual({ label: "테스트 중", tone: "amber" });
    expect(campaignStatusChip("SCHEDULE_PROPOSED")).toEqual({ label: "일정 승인 대기", tone: "amber" });
    expect(campaignStatusChip("SCHEDULE_CONFIRMED")).toEqual({ label: "일정 확정", tone: "green" });
    expect(campaignStatusChip("LIVE")).toEqual({ label: "판매 진행중", tone: "live" });
    expect(campaignStatusChip("CLEARING")).toEqual({ label: "교환·환불 기간", tone: "amber" });
    expect(campaignStatusChip("SETTLED")).toEqual({ label: "정산 완료", tone: "green" });
  });

  it("종결 상태", () => {
    expect(campaignStatusChip("DECLINED")).toEqual({ label: "제안 거절", tone: "gray" });
    expect(campaignStatusChip("REJECTED")).toEqual({ label: "거절됨", tone: "red" });
    expect(campaignStatusChip("PASSED")).toEqual({ label: "인플루언서 패스", tone: "gray" });
  });

  it("모르는 상태는 원문 그대로 회색 — DB 에 새 상태가 들어와도 화면이 깨지지 않는다", () => {
    expect(campaignStatusChip("NEW_THING")).toEqual({ label: "NEW_THING", tone: "gray" });
    expect(campaignStatusChip("")).toEqual({ label: "", tone: "gray" });
  });

  it("라벨 맵이 흐름 목록을 빠짐없이 덮는다", () => {
    for (const s of CAMPAIGN_FLOW) expect(CAMPAIGN_STATUS_LABELS[s]).toBeTruthy();
  });
});

describe("parseCampaignStatusFilter", () => {
  it("아는 상태만 통과", () => {
    expect(parseCampaignStatusFilter("LIVE")).toBe("LIVE");
    expect(parseCampaignStatusFilter("SETTLED")).toBe("SETTLED");
  });

  it("빈 값 · 모르는 값 · 소문자는 전체(null)", () => {
    expect(parseCampaignStatusFilter(null)).toBeNull();
    expect(parseCampaignStatusFilter(undefined)).toBeNull();
    expect(parseCampaignStatusFilter("")).toBeNull();
    expect(parseCampaignStatusFilter("all")).toBeNull();
    expect(parseCampaignStatusFilter("live")).toBeNull();
  });
});

describe("sortCampaignStatusCounts", () => {
  it("흐름 순서대로 정렬하고 0건은 뺀다", () => {
    const out = sortCampaignStatusCounts([
      { status: "SETTLED", n: 1 },
      { status: "SAMPLE_REQUESTED", n: 3 },
      { status: "LIVE", n: 4 },
      { status: "TESTING", n: 0 },
    ]);
    expect(out.map((x) => x.status)).toEqual(["SAMPLE_REQUESTED", "LIVE", "SETTLED"]);
    expect(out[0]).toEqual({ status: "SAMPLE_REQUESTED", n: 3, label: "샘플 요청", tone: "blue" });
  });

  it("모르는 상태는 뒤로 밀린다", () => {
    const out = sortCampaignStatusCounts([
      { status: "ZZZ", n: 2 },
      { status: "LIVE", n: 1 },
    ]);
    expect(out.map((x) => x.status)).toEqual(["LIVE", "ZZZ"]);
  });
});

describe("campaignPeriodLabel", () => {
  it("데모와 같은 M/D–M/D", () => {
    expect(campaignPeriodLabel("2026-09-21", "2026-09-25")).toBe("9/21–9/25");
    expect(campaignPeriodLabel("2026-10-05", "2026-10-09")).toBe("10/5–10/9");
  });

  it("일정이 없으면 —", () => {
    expect(campaignPeriodLabel(null, null)).toBe("—");
    expect(campaignPeriodLabel("2026-09-21", null)).toBe("—");
    expect(campaignPeriodLabel(null, "2026-09-25")).toBe("—");
  });
});

/**
 * 긴급 판매 중단·재개(0040) — 운영 고유 레버다. 브랜드 대행 액션(`adminCampaignAction`)과
 * 같은 상태에서 동시에 뜨면 안 된다. 실제 성공 여부는 RPC 가 정하고(정산 전 · 기간 내 · 상품 listed),
 * 여기서는 "어느 상태에서 버튼을 보여줄지" 만 본다.
 */
describe("adminSaleControl", () => {
  it("LIVE 는 중단, CLEARING 은 재개", () => {
    expect(adminSaleControl("LIVE").kind).toBe("end");
    expect(adminSaleControl("CLEARING").kind).toBe("resume");
  });

  it("판매가 시작되기 전·정산 뒤에는 레버가 없다", () => {
    for (const s of ["SAMPLE_REQUESTED", "INVITED", "SAMPLE_APPROVED", "TESTING", "SCHEDULE_PROPOSED", "SCHEDULE_CONFIRMED", "SETTLED"]) {
      expect(adminSaleControl(s).kind, s).toBe("none");
    }
  });

  it("모르는 상태에도 터지지 않는다", () => {
    expect(adminSaleControl("").kind).toBe("none");
    expect(adminSaleControl("WAT").kind).toBe("none");
  });

  it("레버가 있는 상태는 문구가 비어 있지 않다", () => {
    for (const s of ["LIVE", "CLEARING"]) {
      const r = adminSaleControl(s);
      expect(r.label, s).not.toBe("");
      expect(r.hint, s).not.toBe("");
    }
  });

  it("브랜드 대행 액션과 같은 상태에서 동시에 뜨지 않는다 — 버튼 두 줄이 섞이면 운영이 헷갈린다", () => {
    for (const s of CAMPAIGN_FLOW) {
      const both = adminSaleControl(s).kind !== "none" && adminCampaignAction(s).kind !== "none";
      expect(both, s).toBe(false);
    }
  });
});

/**
 * 대행 액션이 뜨는 상태는 **그 RPC 가 실제로 받는 상태**여야 한다 (2026-10-08 회귀).
 *
 * `INVITED` 가 `approve_sample` 에 묶여 있어 관리자 [샘플 요청 검토] 승인·거절이 항상
 * `WRONG_STATUS` 로 실패했다 — `INVITED` 는 인플루언서가 수락·거절하는 상태이고
 * (`app_accept_invite` · `app_decline_invite` · 0016) 브랜드 RPC `app_brand_approve_sample` 은
 * `SAMPLE_REQUESTED` 만 통과시킨다(0015:563).
 */
describe("adminCampaignAction — RPC 가 받는 상태와 일치하는가", () => {
  /** 각 대행 액션이 부르는 브랜드 RPC 가 통과시키는 상태(마이그레이션 가드와 같은 목록) */
  const RPC_ACCEPTS: Record<Exclude<ReturnType<typeof adminCampaignAction>["kind"], "none">, string[]> = {
    // app_brand_approve_sample / app_brand_reject_sample (0015) — SAMPLE_REQUESTED 만
    approve_sample: ["SAMPLE_REQUESTED"],
    // app_brand_ship_sample (0015) — 승인·구매 뒤
    ship_sample: ["SAMPLE_APPROVED", "SAMPLE_PURCHASED"],
    // app_brand_confirm_schedule / reject (0016)
    confirm_schedule: ["SCHEDULE_PROPOSED"],
  };

  it("버튼이 뜨는 상태는 전부 그 RPC 가 받는 상태다", () => {
    for (const s of CAMPAIGN_FLOW) {
      const a = adminCampaignAction(s);
      if (a.kind === "none") continue;
      expect(RPC_ACCEPTS[a.kind], `${s} → ${a.kind}`).toContain(s);
    }
  });

  it("INVITED 에는 대행 액션을 주지 않는다 — 인플루언서가 수락할 상태다", () => {
    expect(adminCampaignAction("INVITED").kind).toBe("none");
  });

  it("SAMPLE_REQUESTED 는 그대로 샘플 검토다", () => {
    expect(adminCampaignAction("SAMPLE_REQUESTED").kind).toBe("approve_sample");
  });
});

describe("adminCampaignIdleReason", () => {
  it("액션이 없는 모든 상태에 설명이 있다", () => {
    for (const s of CAMPAIGN_FLOW) {
      if (adminCampaignAction(s).kind !== "none") continue;
      const r = adminCampaignIdleReason(s);
      expect(r.what, s).not.toBe("");
      expect(r.who, s).not.toBe("");
    }
  });

  it("INVITED 는 인플루언서를 기다린다고 알려준다", () => {
    const r = adminCampaignIdleReason("INVITED");
    expect(r.who).toBe("인플루언서");
    expect(r.what).toMatch(/수락/);
  });

  it("모르는 상태에도 터지지 않는다", () => {
    expect(adminCampaignIdleReason("WAT").what).not.toBe("");
  });
});
