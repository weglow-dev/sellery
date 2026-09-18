"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { EMAIL_RE } from "@/lib/partner/signup-rules";

/**
 * 재설정 메일 요청 폼. `redirectTo` = 현재 오리진 + `/auth/confirm?next=<콘솔 /password/new>` (§4.1).
 * 성공·미가입 모두 같은 문구("가입된 이메일이라면 보냈어요") — 존재 여부 비노출. 레이트리밋만 따로 안내.
 */
export function PasswordResetForm({ newPasswordPath }: { newPasswordPath: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return setError("이메일 형식을 확인해주세요.");
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(newPasswordPath)}`,
    });
    setBusy(false);
    if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || /rate limit/i.test(error.message))) {
      setError("메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.");
      return;
    }
    // 그 밖의 오류(미가입 등)는 구분해 보여 주지 않는다
    setDone(true);
  }

  if (done) {
    return (
      <p className="console-ok" role="status" style={{ marginTop: 12 }}>
        ✓ 가입된 이메일이라면 재설정 링크를 보냈어요. 계정 존재 여부는 보안상 표시하지 않습니다.
      </p>
    );
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
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <p className="console-err" role="alert">
        {error ?? ""}
      </p>
      <button type="submit" className="pri" disabled={busy} style={{ width: "100%" }}>
        {busy ? "보내는 중…" : "재설정 링크 보내기"}
      </button>
    </form>
  );
}
