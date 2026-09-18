"use client";

/**
 * 문의하기 모달 (프로토타입 js/40-brand.js csModal · ux-spec §4.2). 소유: F.
 *
 * 슬라이스 1 은 `/api/cs`(cs_conversations 저장)가 없다 — app-plan §6.2 "cs-modal.tsx 는 고객센터 채널 안내만 렌더".
 * 그래서 문의 유형·내용 입력 대신 주문번호(복사)·문의 유형 안내와 고객센터 채널 링크(COMPANY.csUrl)를 보여 준다.
 * 원문 유지: 제목 `문의하기 — {pIcon} {product.name}` · .notice "이 문의는 {brand}(공급 브랜드)에 바로 전달됩니다 …" · CS_TYPES.
 */
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { COMPANY } from "@/lib/company";

/** 프로토타입 CS_TYPES 원문 (js/02-state.js L341) */
export const CS_TYPES = ["배송 문의", "교환·반품", "상품 문의", "기타"] as const;

function thumbSrc(url: string | null): string | null {
  if (!url) return null;
  if (/^(data:|https?:\/\/|\/)/.test(url)) return url;
  return `/${url.replace(/^\.?\//, "")}`;
}

function PIcon({ thumbUrl, emoji, size = 24 }: { thumbUrl: string | null; emoji: string; size?: number }) {
  const src = thumbSrc(thumbUrl);
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.62) };
  return (
    <span className="picon" style={style} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- 시드 썸네일은 data: URI·정적 webp */}
      {src ? <img src={src} alt="" /> : emoji}
    </span>
  );
}

export type CsModalProps = {
  open: boolean;
  onClose: () => void;
  productName: string;
  thumbUrl: string | null;
  emoji: string;
  brandName: string;
  /** 주문에서 열면 주문번호 프리필 (대문자 표기) */
  orderCode?: string | null;
};

export function CsModal({ open, onClose, productName, thumbUrl, emoji, brandName, orderCode }: CsModalProps) {
  const toast = useToast();
  const code = orderCode ? orderCode.toUpperCase() : "";
  const external = /^https?:\/\//.test(COMPANY.csUrl);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast("주문번호 복사됨");
    } catch {
      toast("복사 실패 — 수동으로 복사해주세요");
    }
  }, [code, toast]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          문의하기 — <PIcon thumbUrl={thumbUrl} emoji={emoji} /> {productName}
        </>
      }
      footer={
        <>
          <button type="button" onClick={onClose}>
            닫기
          </button>
          <a
            href={COMPANY.csUrl}
            className="btn pri"
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            ✉️ {COMPANY.csLabel}
          </a>
        </>
      }
    >
      <div className="notice" style={{ margin: "-4px 0 13px" }}>
        이 문의는 <b>{brandName}</b>(공급 브랜드)에 바로 전달됩니다. 배송·교환·반품은 브랜드가 직접 처리하고, 결제·정산 문제는
        셀러리가 함께 확인합니다.
      </div>
      {code ? (
        <div className="fld">
          <label htmlFor="cs-order-code">주문번호</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input id="cs-order-code" value={code} readOnly style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="sm ghost" onClick={copy}>
              복사
            </button>
          </div>
          <div className="hint">문의할 때 주문번호를 함께 남겨 주시면 빠르게 확인됩니다.</div>
        </div>
      ) : null}
      <div className="fld">
        <label>문의 유형</label>
        <div style={{ fontSize: 13 }}>{CS_TYPES.join(" / ")}</div>
      </div>
      <p style={{ fontSize: 12.5 }}>
        문의 접수는 셀러리 고객센터(이메일)에서 받고 있어요 — 인플루언서 DM이 아닌 셀러리로 접수해주세요. 메일:{" "}
        <a href={`mailto:${COMPANY.email}`} style={{ textDecoration: "underline" }}>
          {COMPANY.email}
        </a>
      </p>
    </Modal>
  );
}

/** 문의 버튼 — 클릭하면 모달. 주문 행 `문의` · 주문 상세 `문의하기`. */
export function CsModalButton({
  className,
  children = "문의",
  ...props
}: Omit<CsModalProps, "open" | "onClose"> & { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <CsModal open={open} onClose={close} {...props} />
    </>
  );
}
