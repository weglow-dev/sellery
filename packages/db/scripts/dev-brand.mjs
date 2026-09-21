// 개발용 브랜드 계정 — 확인된(email_confirm) 계정 생성 + 시드 brands 행 연결을 한 번에 (docs/brand-console-plan.md §3 "시드 브랜드 연결" · §7). production 거부.
//
//   node packages/db/scripts/dev-brand.mjs --email dev-brand@sellery.test --brand b1 [--password sellery2026]
//
// - auth.admin.createUser(email_confirm:true, user_metadata.partner_role='brand', app_metadata.link_brand_id=<brand uuid>)
//   + create_brand_from_signup(p_link_id=<brand>) — 연결 경로라 입점 🥬 는 건너뛴다(시드 b1·b2 에는 이미 있다, 0014 8단계 not-exists 가드).
// - 같은 이메일이 이미 있으면 그 계정을 재사용하고(app_metadata 만 갱신) 두 번 실행해도 {already:true}.
// - 저장소 루트 .env.local 을 자동으로 읽는다(값 미출력 — PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY). 비밀번호는 --password 또는 기본값 sellery2026(프로토타입 데모 버튼과 동일) — 키·시크릿은 출력하지 않는다.
// - 로그인: 콘솔 /brand/login 에 이메일·비밀번호. 시드 b1·b2 의 이메일(*.example)은 실제 메일을 못 받으므로 로컬·Preview 는 이 스크립트, production 은 partner-admin.mjs invite-brand.
// - dev-seller.mjs 의 브랜드 판 — 표준 테스트 계정은 dev-brand@sellery.test ← b1 바인허브(§7).

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  if ((process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const p = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env.local"); // 저장소 루트 (4 앱 공용, 결정 11)
  if (!existsSync(p) || typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(p);
  } catch {
    /* 아래에서 누락 안내 */
  }
}
loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error("[dev-brand] production 환경에서는 실행하지 않습니다 — partner-admin.mjs invite-brand 를 쓰세요.");
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else flags[a.slice(2)] = true;
  }
}
const email = typeof flags.email === "string" ? flags.email.trim().toLowerCase() : "";
const brandRef = typeof flags.brand === "string" ? flags.brand.trim() : "";
const password = typeof flags.password === "string" ? flags.password : "sellery2026";
if (!email || !email.includes("@") || !brandRef) {
  console.error("usage: node packages/db/scripts/dev-brand.mjs --email <email> --brand <b1|uuid> [--password <pw>]");
  process.exit(2);
}
if (password.length < 8) {
  console.error("[dev-brand] 비밀번호는 8자 이상 (Supabase 최소 길이 설정과 동일)");
  process.exit(2);
}

const url = process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[dev-brand] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — 루트 .env.local 을 확인하세요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bq = admin.from("brands").select("id, code, name, user_id");
const { data: brand, error: bErr } = UUID_RE.test(brandRef) ? await bq.eq("id", brandRef).maybeSingle() : await bq.eq("code", brandRef).maybeSingle();
if (bErr) {
  console.error("[dev-brand] brands read failed:", bErr.message);
  process.exit(1);
}
if (!brand) {
  console.error(`[dev-brand] 브랜드 없음: ${brandRef}`);
  process.exit(1);
}

// 같은 이메일이 있으면 재사용 (dev-seller.mjs 와 같은 페이지 스캔)
async function findExisting() {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findExisting();
if (user) {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), link_brand_id: brand.id },
    user_metadata: { ...(user.user_metadata ?? {}), partner_role: "brand" },
  });
  if (error) {
    console.error("[dev-brand] updateUserById failed:", error.message);
    process.exit(1);
  }
  console.log(`[dev-brand] 기존 계정 재사용: ${email} (id ${user.id})`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { partner_role: "brand", dev_login: true },
    app_metadata: { link_brand_id: brand.id },
  });
  if (error) {
    console.error("[dev-brand] createUser failed:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`[dev-brand] 계정 생성: ${email} (id ${user.id}) · 비밀번호 ${flags.password ? "(지정값)" : "sellery2026(기본값)"}`);
}

const { data: result, error: rpcErr } = await admin.rpc("create_brand_from_signup", {
  p_user_id: user.id,
  p_name: "",
  p_biz_no: "",
  p_manager_name: "",
  p_manager_phone: "",
  p_category: "",
  p_link_id: brand.id,
});
if (rpcErr) {
  console.error("[dev-brand] create_brand_from_signup failed:", rpcErr.message);
  process.exit(1);
}
console.log(`[dev-brand] ${brand.code ?? brand.id} ${brand.name} ← ${email}:`, JSON.stringify(result));
if (result && result.ok === false) process.exit(1);
