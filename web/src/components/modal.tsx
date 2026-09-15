"use client";

/**
 * 모달 — 프로토타입 `.modal-bg` + `.modal` (ux-spec §1.4 · §4). 소유: A.
 * 배경 클릭·Esc 로 닫힘, 열려 있는 동안 body 스크롤 잠금, 열릴 때 다이얼로그로 포커스.
 * URL 은 바꾸지 않는다. 헤더(h3)·본문·`.foot`(우측 정렬 버튼) 슬롯.
 *
 *   <Modal open={open} onClose={() => setOpen(false)} title={<><CEL /> 셀러리 판매 인증</>}
 *          footer={<button className="pri" onClick={…}>닫기</button>}>…</Modal>
 */
import { useEffect, useId, useRef, type ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** `.modal` 에 추가할 클래스 (예: "kwin") */
  className?: string;
};

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title ? <h3 id={titleId}>{title}</h3> : null}
        {children}
        {footer ? <div className="foot">{footer}</div> : null}
      </div>
    </div>
  );
}
