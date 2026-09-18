"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  EMAIL_RE,
  HANDLE_RE,
  NAME_MAX,
  PASSWORD_RE,
  PLATFORMS,
  PLATFORM_LABELS,
  SIGNUP_FIELD_MESSAGES,
  normalizeHandleInput,
  normalizeReferralInput,
  type Platform,
} from "@/lib/partner/signup-rules";
import { cleanText } from "@/lib/text";

/**
 * 가입 폼 (클라이언트) — 검증은 `signup-rules.ts` 와 동일(서버 `parseSignupMeta` 가 다시 검사).
 * signUp 의 `options.data` 에 `partner_role:'seller'` 와 가입 메타를 실어 두면 `/auth/confirm` 이 그 값으로 `sellers` 행을 만든다.
 * `emailRedirectTo` 는 현재 오리진 + `/auth/confirm?next=<콘솔 홈>` — `/auth/*` 는 리라이트 제외라 접두 없이, `next` 는 서버가 준 상대 경로.
 *   - Confirm email ON(기본): 세션 없이 user 만 돌아온다 → /verify-sent. `identities` 가 빈 배열이면 이미 가입된 이메일(Supabase 가 존재 여부를
 *     숨기려 가짜 user 를 돌려준다) → 로그인·재설정 안내.
 *   - Confirm email OFF(대시보드 설정이 다를 때): 세션이 곧바로 생긴다 → /apply 가 행을 만들고 /home 으로 보낸다.
 */
const GENERIC = "가입 처리에 실패했어요. 잠시 후 다시 시도해주세요.";
const ALREADY = "이미 가입된 이메일이에요 — 로그인하거나 비밀번호를 재설정해주세요.";

function messageFor(code: string | undefined, message: string): string {
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(message)) return ALREADY;
  if (code === "weak_password") return "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit/i.test(message))
    return "메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.";
  if (code === "email_address_invalid" || /invalid.*email/i.test(message)) return "이메일 형식을 확인해주세요.";
  return GENERIC;
}

export function SignupForm({
  nextPath,
  applyPath,
  verifySentPath,
  termsUrl,
  privacyUrl,
}: {
  nextPath: string;
  applyPath: string;
  verifySentPath: string;
  termsUrl: string;
  privacyUrl: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [handle, setHandle] = useState("");
  const [referral, setReferral] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nm = cleanText(name);
    const em = email.trim().toLowerCase();
    const hd = handle.trim();
    if (!nm || nm.length > NAME_MAX) return setError(SIGNUP_FIELD_MESSAGES.name);
    if (!EMAIL_RE.test(em)) return setError("이메일 형식을 확인해주세요.");
    if (!PASSWORD_RE.test(password)) return setError("비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.");
    if (!HANDLE_RE.test(hd)) return setError(SIGNUP_FIELD_MESSAGES.handle);
    if (!agree) return setError(SIGNUP_FIELD_MESSAGES.terms);

    setBusy(true);
    setError(null);
    const supabase = createBrowserClient();
    const referralCode = normalizeReferralInput(referral);
    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
        data: {
          partner_role: "seller",
          display_name: nm,
          platform,
          handle: normalizeHandleInput(hd),
          ...(referralCode ? { referral_code: referralCode } : {}),
          terms_agreed_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      setError(messageFor(error.code, error.message));
      setBusy(false);
      return;
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError(ALREADY);
      setBusy(false);
      return;
    }
    if (data.session) {
      // 인증 메일 없이 세션이 생긴 경우 — /apply 가 행을 만들고 /home 으로
      window.location.assign(applyPath);
      return;
    }
    window.location.assign(`${verifySentPath}?email=${encodeURIComponent(em)}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="fld">
        <label htmlFor="name">활동명</label>
        <input id="name" name="name" placeholder="예: 지유" maxLength={NAME_MAX} required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="fld">
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="fld">
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="8자 이상, 영문+숫자"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="fld">
        <label htmlFor="platform">메인 SNS 플랫폼</label>
        <select id="platform" name="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor="handle">계정 핸들</label>
        <input
          id="handle"
          name="handle"
          autoComplete="off"
          autoCapitalize="none"
          placeholder="@my_account"
          maxLength={31}
          required
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <div className="hint">영문·숫자·점(.)·밑줄(_) 2~30자. 판매 링크 주소와 첫 채널에 쓰여요 — 가입 뒤 마이페이지에서 인증합니다.</div>
      </div>
      <div className="fld">
        <label htmlFor="referral">
          추천 코드 <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(선택)</span>
        </label>
        <input
          id="referral"
          name="referral"
          autoComplete="off"
          placeholder="예: JIYU10 — 첫 5회 판매 수수료 +1%p"
          style={{ textTransform: "uppercase" }}
          maxLength={20}
          value={referral}
          onChange={(e) => setReferral(e.target.value)}
        />
      </div>
      <label className="console-check">
        <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          <a href={termsUrl} target="_blank" rel="noopener noreferrer">
            이용약관
          </a>
          ·
          <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
            개인정보처리방침
          </a>
          에 동의합니다. 셀러리는 건강·웰니스 상품만 취급하며, 플랫폼 밖 직거래는 정산·분쟁 보호를 받지 못합니다.
        </span>
      </label>
      <p className="console-err" role="alert">
        {error ?? ""}
      </p>
      <button type="submit" className="pri" disabled={busy} style={{ width: "100%" }}>
        {busy ? "처리 중…" : "가입하고 인증 메일 받기 →"}
      </button>
    </form>
  );
}
