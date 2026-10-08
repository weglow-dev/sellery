// 토스 라이브 키 전환 계획 — 순수(네트워크 · 파일 없음). `../toss-live-switch.mjs` 가 쓰고 `src/test/toss-live-switch.test.ts` 가 검증한다.
// 값은 밖으로 내보내지 않는다 — summarize* 는 접두(`live_gck_` …)와 길이만 만든다. (docs/deploy.md §1.2 · §5.3 · §5.3.1 · launch-checklist §1)

/** Vercel 프로젝트(team weglow-team · deploy.md §1.1) */
export const PROJECTS = ["sellery-shop", "sellery-influencer", "sellery-brand", "sellery-admin"];
const ALL = PROJECTS;
const SHOP_INF = ["sellery-shop", "sellery-influencer"];

/**
 * 어떤 Vercel 이름에 어떤 .env.cloud.local 이름을 넣는가.
 *   live     라이브 짝(`TOSS_LIVE_*` — 실판매 전환일에 발급해 .env.cloud.local 에 적어 둔 값)
 *   rollback 테스트 짝(`PUBLIC_TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` = 결제 테스트 상점 · `TOSS_PEER_*` = 지급대행 테스트 상점 peerkeamf5)
 * prefix 는 값 검증 — 잘못된 짝(ck_/sk_ 섞임 · test↔live)을 Vercel 에 넣기 전에 거른다. hex64 = 지급대행 보안 키(접두 없음 · 64자 16진수).
 */
export const KEY_MAP = {
  live: [
    { key: "PUBLIC_TOSS_CLIENT_KEY", source: "TOSS_LIVE_WIDGET_CLIENT_KEY", projects: SHOP_INF, type: "plain", prefix: "live_gck_" },
    { key: "TOSS_SECRET_KEY", source: "TOSS_LIVE_WIDGET_SECRET_KEY", projects: ALL, type: "encrypted", prefix: "live_gsk_" },
    { key: "TOSS_PAYOUT_SECRET_KEY", source: "TOSS_LIVE_PAYOUT_SECRET_KEY", projects: ALL, type: "encrypted", prefix: "live_sk_" },
    { key: "TOSS_PAYOUT_SECURITY_KEY", source: "TOSS_LIVE_PAYOUT_SECURITY_KEY", projects: ALL, type: "encrypted", prefix: "hex64" },
  ],
  rollback: [
    { key: "PUBLIC_TOSS_CLIENT_KEY", source: "PUBLIC_TOSS_CLIENT_KEY", projects: SHOP_INF, type: "plain", prefix: "test_gck_" },
    { key: "TOSS_SECRET_KEY", source: "TOSS_SECRET_KEY", projects: ALL, type: "encrypted", prefix: "test_gsk_" },
    { key: "TOSS_PAYOUT_SECRET_KEY", source: "TOSS_PEER_SECRET_KEY", projects: ALL, type: "encrypted", prefix: "test_sk_" },
    { key: "TOSS_PAYOUT_SECURITY_KEY", source: "TOSS_PEER_PAYOUT_SECURITY_KEY", projects: ALL, type: "encrypted", prefix: "hex64" },
  ],
};

export const TARGET = ["production"];

/** `.env` 텍스트 → { 이름: 값 } (따옴표 제거 · 주석/빈 줄 무시 · export 접두 허용). 값은 호출자가 접두/길이만 쓴다. */
export function parseDotenv(text) {
  const out = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else {
      const hash = v.indexOf(" #");
      if (hash >= 0) v = v.slice(0, hash).trim();
    }
    out[m[1]] = v;
  }
  return out;
}

/** 값이 기대 접두를 만족하는가 (hex64 = /^[0-9a-f]{64}$/i) */
export function prefixOk(value, prefix) {
  const v = String(value ?? "");
  if (prefix === "hex64") return /^[0-9a-f]{64}$/i.test(v);
  return v.startsWith(prefix) && v.length > prefix.length + 8;
}

/** 값의 안전한 요약 — 접두(test_/live_ + 종류) 와 길이만. hex 는 'hex64' 또는 'hex?' */
export function describeValue(value) {
  const v = String(value ?? "");
  if (!v) return "(없음)";
  if (/^[0-9a-f]{64}$/i.test(v)) return "hex64";
  if (/^[0-9a-f]+$/i.test(v)) return `hex${v.length}`;
  const m = /^(live|test)_(gck|gsk|ck|sk)_/.exec(v);
  return m ? `${m[0]} · ${v.length}자` : `${v.slice(0, 4)}… · ${v.length}자`;
}

/**
 * 계획 — { mode, items:[{ project, key, source, type, target, value }], errors:[string] }
 * errors 가 있으면 호출자는 아무것도 적지 않는다(한 프로젝트만 라이브가 되는 상태를 막는다).
 */
export function buildPlan(mode, env) {
  const map = KEY_MAP[mode];
  if (!map) return { mode, items: [], errors: [`알 수 없는 mode: ${mode}`] };
  const items = [];
  const errors = [];
  for (const m of map) {
    const value = env?.[m.source];
    if (!value) {
      errors.push(`${m.source} 가 .env 파일에 없거나 비어 있어요 (→ ${m.key})`);
      continue;
    }
    if (!prefixOk(value, m.prefix)) {
      errors.push(`${m.source} 값이 기대 형식(${m.prefix === "hex64" ? "64자 16진수" : `${m.prefix}…`})이 아니에요 — 지금 값은 ${describeValue(value)} (→ ${m.key})`);
      continue;
    }
    for (const project of m.projects) items.push({ project, key: m.key, source: m.source, type: m.type, target: TARGET, value });
  }
  return { mode, items, errors };
}

/** 사람용 요약 행(값 없음) — [{ project, key, source, type, value: describeValue }] */
export function summarizePlan(plan) {
  return plan.items.map((it) => ({ project: it.project, key: it.key, source: it.source, type: it.type, target: it.target.join(","), value: describeValue(it.value) }));
}

/** Vercel env 목록 → 프로젝트별 4개 키의 현재 상태(접두 · 길이 · 환경). value 가 없으면(sensitive) '(sensitive · 확인 불가)'. */
export function summarizeVercelEnvs(envs) {
  const want = new Set(["PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "TOSS_PAYOUT_SECRET_KEY", "TOSS_PAYOUT_SECURITY_KEY"]);
  return (envs ?? [])
    .filter((e) => want.has(e.key) && Array.isArray(e.target) && e.target.includes("production"))
    .map((e) => ({ key: e.key, type: e.type, value: e.type === "sensitive" || e.value === undefined || e.value === null ? "(sensitive · 확인 불가)" : describeValue(e.value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
