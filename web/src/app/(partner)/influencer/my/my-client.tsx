"use client";

import { useState } from "react";
import { deleteChannel } from "./actions";

/** [복사] — navigator.clipboard, 실패하면 코드를 그대로 보여 준다 (프로토타입 copyVcode/copyRef) */
export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState<null | "ok" | "fail">(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone("ok");
    } catch {
      setDone("fail");
    }
    window.setTimeout(() => setDone(null), 1800);
  }
  return (
    <button type="button" className="ghost sm" onClick={copy} aria-live="polite">
      {done === "ok" ? "복사됨 ✓" : done === "fail" ? `복사 실패 — ${text}` : label}
    </button>
  );
}

/** [삭제] — confirm 뒤 서버 액션 (메인 채널은 서버가 거절한다) */
export function DeleteChannelForm({ id, handle }: { id: string; handle: string }) {
  return (
    <form
      action={deleteChannel}
      onSubmit={(e) => {
        if (!window.confirm(`${handle} 채널을 삭제할까요?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="danger sm">
        삭제
      </button>
    </form>
  );
}
