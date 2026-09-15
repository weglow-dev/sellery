"use client";

/**
 * 토스트 — 계약 docs/app-plan.md §10.0 `useToast(): (msg: string) => void`. 소유: A.
 *
 * 구현: window CustomEvent 버스. `useToast()` 가 돌려주는 함수는 어디서든(다른 트리, 이벤트 핸들러) 호출할 수 있고
 * <ToastHost/>(app/layout.tsx 에 1개) 가 받아서 하단 중앙에 2.6초 동안 세로로 쌓아 보여 준다 (프로토타입 toast()).
 * ToastHost 가 없으면 조용히 무시된다 (스텁 커밋 0 과 같은 동작).
 *
 * 1회성 URL 플래그 (콜백/로그아웃이 붙인다 — app-plan §4.1):
 *   `?welcome=1` → GET /api/me 로 이름을 받아 "{name}님, 카카오로 로그인했어요"
 *   `?bye=1`     → "로그아웃했어요"
 * 표시 후 history.replaceState 로 파라미터를 지운다 (새로고침 시 재표시 방지).
 */
import { useCallback, useEffect, useRef, useState } from "react";

const EVENT = "slry:toast";
const DURATION_MS = 2600;

export function showToast(msg: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: msg }));
}

export function useToast(): (msg: string) => void {
  return useCallback((msg: string) => showToast(msg), []);
}

type ToastItem = { id: number; msg: string };

function stripParams(names: string[]) {
  const url = new URL(window.location.href);
  let changed = false;
  for (const n of names) {
    if (url.searchParams.has(n)) {
      url.searchParams.delete(n);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const push = (msg: string) => {
      const id = ++seq.current;
      setItems((cur) => [...cur, { id, msg }]);
      const t = window.setTimeout(() => {
        setItems((cur) => cur.filter((i) => i.id !== id));
      }, DURATION_MS);
      timers.current.push(t);
    };
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      if (typeof msg === "string" && msg) push(msg);
    };
    window.addEventListener(EVENT, onToast);

    const sp = new URLSearchParams(window.location.search);
    if (sp.get("welcome") === "1") {
      stripParams(["welcome"]);
      fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { user?: { name?: string } | null } | null) => {
          const name = d?.user?.name;
          push(name ? `${name}님, 카카오로 로그인했어요` : "카카오로 로그인했어요");
        })
        .catch(() => push("카카오로 로그인했어요"));
    }
    if (sp.get("bye") === "1") {
      stripParams(["bye"]);
      push("로그아웃했어요");
    }

    const pending = timers.current;
    return () => {
      window.removeEventListener(EVENT, onToast);
      pending.forEach((t) => window.clearTimeout(t));
      pending.length = 0;
    };
  }, []);

  return (
    <div id="toasts" role="status" aria-live="polite" aria-atomic="false">
      {items.map((i) => (
        <div key={i.id} className="toast">
          {i.msg}
        </div>
      ))}
    </div>
  );
}
