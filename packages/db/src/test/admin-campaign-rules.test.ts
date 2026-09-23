import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_FLOW,
  CAMPAIGN_STATUS_LABELS,
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
