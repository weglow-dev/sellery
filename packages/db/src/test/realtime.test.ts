import { describe, expect, it } from "vitest";
import { broadcastMessages, CAMPAIGN_CHANGED_EVENT, campaignChangedPayload, campaignTopic, parseCampaignChangedPayload } from "../realtime";

const ID = "7d8f9a10-1b2c-4d3e-8f9a-0b1c2d3e4f5a";

describe("campaignTopic", () => {
  it("uuid → campaign:<id> (소문자)", () => {
    expect(campaignTopic(ID.toUpperCase())).toBe(`campaign:${ID}`);
  });
  it("uuid 가 아니면 null — code · 빈 값 · null", () => {
    expect(campaignTopic("c1")).toBeNull();
    expect(campaignTopic("")).toBeNull();
    expect(campaignTopic(null)).toBeNull();
    expect(campaignTopic(undefined)).toBeNull();
  });
});

describe("payload", () => {
  it("kind · at(ISO) 만 싣는다", () => {
    const at = new Date("2026-10-08T01:02:03.000Z");
    expect(campaignChangedPayload("chat", at)).toEqual({ kind: "chat", at: "2026-10-08T01:02:03.000Z" });
  });
  it("parse — 모양이 맞으면 kind · at, 아니면 null", () => {
    expect(parseCampaignChangedPayload({ kind: "status", at: "x" })).toEqual({ kind: "status", at: "x" });
    expect(parseCampaignChangedPayload({ kind: "status" })).toBeNull();
    expect(parseCampaignChangedPayload("chat")).toBeNull();
    expect(parseCampaignChangedPayload(null)).toBeNull();
    expect(parseCampaignChangedPayload([])).toBeNull();
  });
});

describe("broadcastMessages", () => {
  it("공개 채널 · changed 이벤트 · 중복·비uuid 제거", () => {
    const at = new Date("2026-10-08T00:00:00.000Z");
    const other = "11111111-2222-4333-8444-555555555555";
    const m = broadcastMessages([ID, "c1", ID, other, ""], "tick", at);
    expect(m).toEqual([
      { topic: `campaign:${ID}`, event: CAMPAIGN_CHANGED_EVENT, payload: { kind: "tick", at: at.toISOString() }, private: false },
      { topic: `campaign:${other}`, event: CAMPAIGN_CHANGED_EVENT, payload: { kind: "tick", at: at.toISOString() }, private: false },
    ]);
  });
  it("보낼 것이 없으면 빈 배열", () => {
    expect(broadcastMessages([], "chat")).toEqual([]);
    expect(broadcastMessages(["nope"], "chat")).toEqual([]);
  });
});
