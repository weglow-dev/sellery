// 시드 정리(purge-seed.mjs) 순수 부분 — 인자 해석 · 스토리지 접두 · 호스트 판정. 테스트: src/test/purge-plan.test.ts

/** 대표 실계정(launch-checklist §2 · §9 결정 2) — `--keep-owner` 가 `--keep-email` 에 더하는 목록. 바뀌면 여기 한 곳. */
export const OWNER_EMAILS = ["shingoonk@weglow.biz", "orangebear851011@gmail.com", "chrisneeds@daum.net"];

/** 항상 남는 표(정책 마스터) — 함수도 건드리지 않지만 후검사에서 "남은 행" 표에 같이 보여준다 */
export const MASTER_TABLES = ["platform_settings", "grade_tiers", "brand_grade_tiers", "categories"];

/** admin_purge_demo_data 가 지우는 표(0043 v_steps 순서) */
export const PURGE_TABLES = [
  "payout_events", "payouts", "referral_earnings", "settlements", "partner_payments", "payment_events", "cs_messages", "cs_conversations", "orders", "checkout_sessions",
  "campaign_events", "campaigns", "product_views", "exclusive_requests", "celery_purchases", "data_views", "seller_external_sales", "celery_ledger", "products", "seller_channels",
  "sensitive_access_log", "sellers", "brands", "customers", "profiles",
];

/** "a@b, C@D ,," → ['a@b','c@d'] (소문자 · 공백 제거 · 중복 제거) */
export function parseList(v) {
  if (v === undefined || v === null || v === true) return [];
  return [...new Set(String(v).split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

/** 코드 목록은 대소문자 유지(s104 · B101 → b101 로 정규화하지 않는다 — DB 코드가 소문자라 소문자로) */
export function parseCodes(v) {
  return parseList(v);
}

export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  }
  const keepEmails = parseList(flags["keep-email"]);
  if (flags["keep-owner"]) for (const e of OWNER_EMAILS) if (!keepEmails.includes(e)) keepEmails.push(e);
  return {
    confirm: flags.confirm === "PURGE",
    confirmRaw: typeof flags.confirm === "string" ? flags.confirm : flags.confirm === true ? "(값 없음)" : null,
    keepEmails,
    keepCodes: parseCodes(flags.keep),
    resetSeq: flags["reset-seq"] === true,
    skipStorage: flags["skip-storage"] === true,
    json: flags.json === true,
    help: flags.help === true || flags.h === true,
  };
}

/**
 * 지워지는 파트너의 스토리지 경로 접두 — 코드가 올리는 경로 그대로(packages/db/src/server/{partner,brand}/settle.server.ts · brand/products.server.ts · brand/profile.server.ts)
 *   partner-docs/sellers/<sellerId>/   partner-docs/brands/<brandId>/   public-assets/brands/<brandId>/   public-assets/products/<brandId>/
 */
export function storagePrefixesFor(purged) {
  const out = [];
  for (const id of purged?.seller_ids ?? []) out.push({ bucket: "partner-docs", prefix: `sellers/${id}` });
  for (const id of purged?.brand_ids ?? []) {
    out.push({ bucket: "partner-docs", prefix: `brands/${id}` });
    out.push({ bucket: "public-assets", prefix: `brands/${id}` });
    out.push({ bucket: "public-assets", prefix: `products/${id}` });
  }
  return out;
}

/** URL 의 호스트만(키 없음) · 로컬 판정 */
export function hostLabel(url) {
  try {
    return new URL(String(url)).host;
  } catch {
    return "(?)";
  }
}
export function isLocalHost(url) {
  try {
    const h = new URL(String(url)).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}
