// 토스 라이브 키 전환 계획 — packages/db/scripts/lib/toss-live-switch-plan.mjs (launch-prep 2026-10-08). 값은 요약에 절대 나오지 않는다.
import { describe, expect, it } from "vitest";
import { buildPlan, describeValue, KEY_MAP, parseDotenv, prefixOk, PROJECTS, summarizePlan, summarizeVercelEnvs } from "../../scripts/lib/toss-live-switch-plan.mjs";

const hex64 = "0123456789abcdef".repeat(4);
const LIVE = {
  TOSS_LIVE_WIDGET_CLIENT_KEY: "live_gck_ABCDEFGHIJKLMNOPQRSTUV",
  TOSS_LIVE_WIDGET_SECRET_KEY: "live_gsk_ABCDEFGHIJKLMNOPQRSTUV",
  TOSS_LIVE_PAYOUT_SECRET_KEY: "live_sk_ABCDEFGHIJKLMNOPQRSTUVW",
  TOSS_LIVE_PAYOUT_SECURITY_KEY: hex64,
};
const TEST = {
  PUBLIC_TOSS_CLIENT_KEY: "test_gck_ABCDEFGHIJKLMNOPQRSTUV",
  TOSS_SECRET_KEY: "test_gsk_ABCDEFGHIJKLMNOPQRSTUV",
  TOSS_PEER_SECRET_KEY: "test_sk_ABCDEFGHIJKLMNOPQRSTUVW",
  TOSS_PEER_PAYOUT_SECURITY_KEY: hex64,
};

describe("parseDotenv · prefixOk · describeValue", () => {
  it("parseDotenv — 따옴표 · 주석 · export · CRLF", () => {
    const env = parseDotenv('# c\r\nA=1\r\nexport B="two words"\nC=\'x\' \nD=val # trailing\n\nBAD LINE\n');
    expect(env).toEqual({ A: "1", B: "two words", C: "x", D: "val" });
  });
  it("prefixOk — 접두 + 충분한 길이 · hex64", () => {
    expect(prefixOk("live_gck_ABCDEFGHIJ", "live_gck_")).toBe(true);
    expect(prefixOk("live_gck_", "live_gck_")).toBe(false);
    expect(prefixOk("test_gck_ABCDEFGHIJ", "live_gck_")).toBe(false);
    expect(prefixOk("live_ck_ABCDEFGHIJKL", "live_gck_")).toBe(false); // API 개별연동 ck 를 위젯 자리에
    expect(prefixOk(hex64, "hex64")).toBe(true);
    expect(prefixOk(hex64.slice(1), "hex64")).toBe(false);
  });
  it("describeValue — 접두와 길이만(값 노출 없음)", () => {
    expect(describeValue("live_gsk_ABCDEFGHIJKLMNOPQRSTUV")).toBe("live_gsk_ · 31자");
    expect(describeValue(hex64)).toBe("hex64");
    expect(describeValue("")).toBe("(없음)");
    expect(describeValue("zzzzzzzz")).toBe("zzzz… · 8자");
    expect(describeValue("live_gsk_ABCDEFGHIJKLMNOPQRSTUV")).not.toContain("ABCDEFGHIJKLMNOPQRSTUV");
  });
});

describe("buildPlan — live", () => {
  it("4 이름 → shop·influencer 2 + 4·4·4 = 14건 · Production 만 · PUBLIC_ 은 plain", () => {
    const plan = buildPlan("live", LIVE);
    expect(plan.errors).toEqual([]);
    expect(plan.items).toHaveLength(14);
    const client = plan.items.filter((i) => i.key === "PUBLIC_TOSS_CLIENT_KEY");
    expect(client.map((i) => i.project).sort()).toEqual(["sellery-influencer", "sellery-shop"]);
    expect(client.every((i) => i.type === "plain" && i.target.join() === "production")).toBe(true);
    for (const key of ["TOSS_SECRET_KEY", "TOSS_PAYOUT_SECRET_KEY", "TOSS_PAYOUT_SECURITY_KEY"]) {
      const rows = plan.items.filter((i) => i.key === key);
      expect(rows.map((i) => i.project).sort()).toEqual([...PROJECTS].sort());
      expect(rows.every((i) => i.type === "encrypted")).toBe(true);
    }
    expect(plan.items.find((i) => i.key === "TOSS_PAYOUT_SECRET_KEY")?.value).toBe(LIVE.TOSS_LIVE_PAYOUT_SECRET_KEY);
  });
  it("하나라도 없거나 형식이 틀리면 errors — 호출자는 아무것도 적지 않는다", () => {
    const missing = buildPlan("live", { ...LIVE, TOSS_LIVE_PAYOUT_SECURITY_KEY: "" });
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]).toContain("TOSS_LIVE_PAYOUT_SECURITY_KEY");
    const wrong = buildPlan("live", { ...LIVE, TOSS_LIVE_WIDGET_SECRET_KEY: TEST.TOSS_SECRET_KEY });
    expect(wrong.errors).toHaveLength(1);
    expect(wrong.errors[0]).toContain("test_gsk_");
    expect(wrong.errors[0]).not.toContain("ABCDEFGHIJKLMNOPQRSTUV");
    const mixed = buildPlan("live", { ...LIVE, TOSS_LIVE_WIDGET_CLIENT_KEY: "live_ck_ABCDEFGHIJKLMNOPQRS" });
    expect(mixed.errors[0]).toContain("live_gck_");
  });
  it("알 수 없는 mode", () => {
    expect(buildPlan("prod", LIVE).errors[0]).toContain("mode");
  });
});

describe("buildPlan — rollback", () => {
  it("테스트 짝 — PUBLIC_TOSS_CLIENT_KEY · TOSS_SECRET_KEY 는 같은 이름, 지급대행은 TOSS_PEER_* 에서", () => {
    const plan = buildPlan("rollback", TEST);
    expect(plan.errors).toEqual([]);
    expect(plan.items).toHaveLength(14);
    expect(plan.items.find((i) => i.key === "TOSS_PAYOUT_SECRET_KEY")?.source).toBe("TOSS_PEER_SECRET_KEY");
    expect(plan.items.find((i) => i.key === "TOSS_PAYOUT_SECURITY_KEY")?.source).toBe("TOSS_PEER_PAYOUT_SECURITY_KEY");
    expect(plan.items.every((i) => i.value.startsWith("test_") || i.value === hex64)).toBe(true);
  });
  it("라이브 값을 롤백 자리에 넣으면 거절", () => {
    const plan = buildPlan("rollback", { ...TEST, TOSS_SECRET_KEY: LIVE.TOSS_LIVE_WIDGET_SECRET_KEY });
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain("test_gsk_");
  });
  it("KEY_MAP 의 두 모드는 같은 Vercel 이름 4개를 같은 프로젝트에", () => {
    const names = (m: "live" | "rollback") => KEY_MAP[m].map((e) => `${e.key}:${e.projects.join("+")}:${e.type}`).sort();
    expect(names("live")).toEqual(names("rollback"));
  });
});

describe("summarizePlan · summarizeVercelEnvs", () => {
  it("요약에는 값이 없다", () => {
    const rows = summarizePlan(buildPlan("live", LIVE));
    expect(rows).toHaveLength(14);
    expect(JSON.stringify(rows)).not.toContain("ABCDEFGHIJKLMNOPQRSTUV");
    expect(rows.find((r) => r.key === "TOSS_SECRET_KEY")?.value).toBe("live_gsk_ · 31자");
  });
  it("Vercel env 목록 → production 의 토스 4키 접두만 · sensitive 는 확인 불가", () => {
    const rows = summarizeVercelEnvs([
      { key: "TOSS_SECRET_KEY", type: "encrypted", target: ["production"], value: TEST.TOSS_SECRET_KEY },
      { key: "TOSS_SECRET_KEY", type: "encrypted", target: ["preview"], value: TEST.TOSS_SECRET_KEY },
      { key: "TOSS_PAYOUT_SECURITY_KEY", type: "sensitive", target: ["production"] },
      { key: "PUBLIC_TOSS_CLIENT_KEY", type: "plain", target: ["production", "preview"], value: LIVE.TOSS_LIVE_WIDGET_CLIENT_KEY },
      { key: "RESEND_API_KEY", type: "encrypted", target: ["production"], value: "re_x" },
    ]);
    expect(rows).toEqual([
      { key: "PUBLIC_TOSS_CLIENT_KEY", type: "plain", value: "live_gck_ · 31자" },
      { key: "TOSS_PAYOUT_SECURITY_KEY", type: "sensitive", value: "(sensitive · 확인 불가)" },
      { key: "TOSS_SECRET_KEY", type: "encrypted", value: "test_gsk_ · 31자" },
    ]);
  });
});
