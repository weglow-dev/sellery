// 개발용 인플루언서 계정 — 확인된(email_confirm) 계정 생성 + 시드 sellers 행 연결을 한 번에 (docs/inf-console-plan.md §4.7). production 거부.
//
//   node packages/db/scripts/dev-seller.mjs --email dev-seller@sellery.test --seller s1 [--password sellery2026]
//
// - auth.admin.createUser(email_confirm:true, user_metadata.partner_role='seller', app_metadata.link_seller_id=<seller uuid>)
//   + create_seller_from_signup(p_link_id=<seller>) — 연결 경로라 채널·축하 🥬 는 건너뛴다(시드 행에는 둘 다 이미 있다, 0010 5단계).
// - 같은 이메일이 이미 있으면 그 계정을 재사용하고(app_metadata 만 갱신) 두 번 실행해도 {already:true}.
// - 저장소 루트 .env.local 을 자동으로 읽는다(값 미출력 — PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY). 비밀번호는 --password 또는 기본값 sellery2026(프로토타입 데모 버튼과 동일) — 키·시크릿은 출력하지 않는다.
// - 로그인: 콘솔 /login 에 이메일·비밀번호. 시드 8명은 실제 메일을 못 받으므로 로컬·Preview 는 이 스크립트, production 은 partner-admin.mjs invite.

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
  console.error("[dev-seller] production 환경에서는 실행하지 않습니다 — partner-admin.mjs invite 를 쓰세요.");
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
const sellerRef = typeof flags.seller === "string" ? flags.seller.trim() : "";
const password = typeof flags.password === "string" ? flags.password : "sellery2026";
if (!email || !email.includes("@") || !sellerRef) {
  console.error("usage: node packages/db/scripts/dev-seller.mjs --email <email> --seller <s1|uuid> [--password <pw>]");
  process.exit(2);
}
if (password.length < 8) {
  console.error("[dev-seller] 비밀번호는 8자 이상 (Supabase 최소 길이 설정과 동일)");
  process.exit(2);
}

const url = process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[dev-seller] PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — 루트 .env.local 을 확인하세요.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sq = admin.from("sellers").select("id, code, name, user_id");
const { data: seller, error: sErr } = UUID_RE.test(sellerRef)
  ? await sq.eq("id", sellerRef).maybeSingle()
  : await sq.eq("code", sellerRef).maybeSingle();
if (sErr) {
  console.error("[dev-seller] sellers read failed:", sErr.message);
  process.exit(1);
}
if (!seller) {
  console.error(`[dev-seller] 인플루언서 없음: ${sellerRef}`);
  process.exit(1);
}

// 같은 이메일이 있으면 재사용 (dev-user.mjs 와 같은 페이지 스캔)
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
    app_metadata: { ...(user.app_metadata ?? {}), link_seller_id: seller.id },
    user_metadata: { ...(user.user_metadata ?? {}), partner_role: "seller" },
  });
  if (error) {
    console.error("[dev-seller] updateUserById failed:", error.message);
    process.exit(1);
  }
  console.log(`[dev-seller] 기존 계정 재사용: ${email} (id ${user.id})`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { partner_role: "seller", dev_login: true },
    app_metadata: { link_seller_id: seller.id },
  });
  if (error) {
    console.error("[dev-seller] createUser failed:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`[dev-seller] 계정 생성: ${email} (id ${user.id}) · 비밀번호 ${flags.password ? "(지정값)" : "sellery2026(기본값)"}`);
}

const { data: result, error: rpcErr } = await admin.rpc("create_seller_from_signup", {
  p_user_id: user.id,
  p_name: "",
  p_platform: "",
  p_handle: "",
  p_link_id: seller.id,
});
if (rpcErr) {
  console.error("[dev-seller] create_seller_from_signup failed:", rpcErr.message);
  process.exit(1);
}
console.log(`[dev-seller] ${seller.code ?? seller.id} ${seller.name} ← ${email}:`, JSON.stringify(result));
if (result && result.ok === false) process.exit(1);
