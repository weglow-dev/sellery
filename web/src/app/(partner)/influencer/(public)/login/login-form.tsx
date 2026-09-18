"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { EMAIL_RE } from "@/lib/partner/signup-rules";

/**
 * 이메일/비밀번호 로그인 폼 — 고객 `login-client.tsx` 의 개발용 폼을 콘솔용으로 정식화 (docs/inf-console-plan.md §4.1).
 * `next` 는 서버 페이지가 `consoleNextOf` 로 정규화한 값 — 여기서 lib/auth 를 import 하지 않는다(next/headers 가 클라이언트 번들로 끌려온다).
 * 성공하면 전체 이동(`window.location.assign`) — 서버 컴포넌트가 쿠키 세션을 보게 한다. 실패 잠금은 Supabase Auth 레이트리밋에 맡긴다.
 */
const GENERIC = "로그인에 실패했어요. 잠시 후 다시 시도해주세요.";

function messageFor(code: string | undefined, message: string): string {
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (code === "email_not_confirmed" || /not confirmed/i.test(message))
    return "이메일 인증이 아직 끝나지 않았어요 — 받은 메일의 인증 링크를 눌러주세요.";
  if (code === "over_request_rate_limit" || /rate limit/i.test(message)) return "시도가 너무 많아요 — 잠시 후 다시 시도해주세요.";
  return GENERIC;
}

export function LoginForm({
  next,
  initialError,
  passwordHref,
}: {
  next: string;
  initialError: string | null;
  passwordHref: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setError("이메일 형식을 확인해주세요.");
    if (password.length < 8) return setError("비밀번호는 8자 이상이에요.");
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: em, password });
    if (error) {
      setError(messageFor(error.code, error.message));
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="fld">
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          placeholder="name@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="fld">
        <label htmlFor="password">비밀번호</label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            id="password"
            type={showPw ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="8자 이상"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="ghost sm" onClick={() => setShowPw((v) => !v)} aria-label="비밀번호 표시 전환">
            {showPw ? "숨김" : "표시"}
          </button>
        </div>
      </div>
      <p className="console-err" role="alert">
        {error ?? ""}
      </p>
      <button type="submit" className="pri" disabled={busy} style={{ width: "100%" }}>
        {busy ? "로그인 중…" : "로그인 →"}
      </button>
      <p className="meta" style={{ marginTop: 10, textAlign: "right" }}>
        <Link href={passwordHref} style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
          비밀번호를 잊으셨나요?
        </Link>
      </p>
    </form>
  );
}
