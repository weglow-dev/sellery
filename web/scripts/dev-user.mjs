// 개발용 이메일/비밀번호 사용자 생성 (service role — 서버·개발 PC 전용). 소유: B.
//
//   cd web && node --env-file=.env.local scripts/dev-user.mjs <email> <password>
//
// - .env.local 의 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 를 쓴다 (값을 출력하지 않는다).
// - 이미 같은 이메일이 있으면 만들지 않고 skip 한다.
// - email_confirm: true 라 확인 메일 없이 바로 /login 의 개발용 폼(NEXT_PUBLIC_DEV_LOGIN=1)에서 로그인할 수 있다.
// - 첫 로그인의 profiles(role='customer') 행은 0001 트리거(handle_new_user)가 만든다. customers 행은
//   콜백을 거치지 않으므로 /api/checkout 의 ensureCustomer 가 처음 결제 때 만든다.

import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("usage: node --env-file=.env.local scripts/dev-user.mjs <email> <password>");
  process.exit(2);
}
if (password.length < 6) {
  console.error("[dev-user] 비밀번호는 6자 이상 (Supabase 기본 규칙)");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "[dev-user] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 — `node --env-file=.env.local …` 로 실행하세요.",
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("[dev-user] production 환경에서는 실행하지 않습니다.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const wanted = email.trim().toLowerCase();

// 이미 있으면 skip — listUsers 는 페이지 단위라 끝까지 훑는다 (개발 프로젝트라 사용자 수가 적다).
async function findExisting() {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existing = await findExisting();
if (existing) {
  console.log(`[dev-user] skip — 이미 존재: ${wanted} (id ${existing.id})`);
  process.exit(0);
}

const { data, error } = await admin.auth.admin.createUser({
  email: wanted,
  password,
  email_confirm: true,
  user_metadata: { nickname: "개발자", dev_login: true },
});

if (error) {
  // 경합(동시에 만들어진 경우)도 skip 으로 취급한다.
  if (error.code === "email_exists" || /already|exists/i.test(error.message)) {
    console.log(`[dev-user] skip — 이미 존재: ${wanted}`);
    process.exit(0);
  }
  console.error(`[dev-user] createUser failed: ${error.message}`);
  process.exit(1);
}

console.log(`[dev-user] created: ${data.user.email} (id ${data.user.id})`);
