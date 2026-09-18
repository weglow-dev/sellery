"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

/**
 * [메일 다시 보내기] — `supabase.auth.resend({ type:'signup' })` · 60초 쿨다운(Supabase 도 같은 주소로 60초에 1회만 보낸다).
 * 존재하지 않는 이메일이어도 결과를 구분해 보여 주지 않는다(계정 존재 여부 비노출).
 */
const COOLDOWN_S = 60;

export function ResendButton({ email, nextPath }: { email: string; nextPath: string }) {
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  async function resend() {
    if (busy || left > 0) return;
    setBusy(true);
    setMsg(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}` },
    });
    setBusy(false);
    setLeft(COOLDOWN_S);
    if (error && (error.code === "over_email_send_rate_limit" || /rate limit/i.test(error.message))) {
      setMsg("메일 발송이 잠시 제한됐어요 — 1분 뒤 다시 시도해주세요.");
      return;
    }
    setMsg("다시 보냈어요 ✓ 가입된 이메일이라면 잠시 후 도착합니다.");
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="ghost sm" onClick={resend} disabled={busy || left > 0}>
        {busy ? "보내는 중…" : left > 0 ? `메일 다시 보내기 (${left}초)` : "메일 다시 보내기"}
      </button>
      {msg ? (
        <p className="console-ok" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
