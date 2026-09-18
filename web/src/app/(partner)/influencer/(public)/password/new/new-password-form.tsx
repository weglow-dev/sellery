"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { PASSWORD_RE } from "@/lib/partner/signup-rules";

/**
 * New password form: updateUser({ password }) then full navigation to the console home.
 * Password rule is the same as signup (letters + digits, 8+ chars) — Turbopack's code-frame highlighter panics on
 * non-ASCII text in the first line of a diagnostic frame (Vercel build, Next 16.2.9), so this header stays ASCII.
 */
export function NewPasswordForm({ homePath }: { homePath: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!PASSWORD_RE.test(password)) return setError("비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.");
    if (password !== confirm) return setError("비밀번호 확인이 일치하지 않아요.");
    setBusy(true);
    setError(null);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(
        error.code === "same_password"
          ? "이전과 다른 비밀번호를 입력해주세요."
          : error.code === "weak_password"
            ? "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요."
            : "비밀번호를 바꾸지 못했어요 — 링크가 만료됐다면 재설정 메일을 다시 요청해주세요.",
      );
      setBusy(false);
      return;
    }
    window.location.assign(homePath);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="fld">
        <label htmlFor="password">새 비밀번호</label>
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
        <label htmlFor="confirm">새 비밀번호 확인</label>
        <input
          id="confirm"
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <p className="console-err" role="alert">
        {error ?? ""}
      </p>
      <button type="submit" className="pri" disabled={busy} style={{ width: "100%" }}>
        {busy ? "저장 중…" : "비밀번호 저장 → 콘솔로"}
      </button>
    </form>
  );
}
