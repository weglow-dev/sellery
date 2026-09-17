"use client";

/**
 * 환불 신청 버튼 + 모달 (프로토타입 js/80-actions.js custRefund/custRefundGo · ux-spec §4.3 · app-plan §6.2 · §7.4). 소유: F.
 *   · 버튼은 호출자가 isRefundable() 통과 주문에만 렌더한다 (PAID · 비샘플 · 비SETTLED · 미발송). 서버 precheck 가 최종 가드.
 *   · 모달: {product} · {option} × {qty} · ₩{amount} · .notice(§0-8 문구) · 사유 선택(단순 변심/상품 하자/오배송/기타) + 상세(합쳐 200자)
 *   · POST /api/payments/cancel { code, reason } → 토스트 "환불 신청 완료 — 결제수단으로 3영업일 내 환급" → router.refresh() (칩 '환불 완료')
 *   · 실패: 서버 { ok:false, code, message } 의 message 를 토스트로 — SETTLED/SHIPPED/REFUNDED 는 화면이 낡은 것이므로 새로고침
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { REFUND_NOTICE, REFUND_REASONS, REFUND_REASON_MAX, won, type RefundReason } from "@/lib/order-status";

/** ux-spec §5 원문 */
const REFUND_DONE_TOAST = "환불 신청 완료 — 결제수단으로 3영업일 내 환급";

type CancelResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  already?: boolean;
  afterShip?: boolean;
};

/** 선택지 + 상세 → 토스 cancelReason (≤200자). 상세는 남는 길이만큼만. */
function composeRefundReason(reason: RefundReason, detail: string): string {
  const d = detail.replace(/\s+/g, " ").trim();
  if (!d) return reason;
  return `${reason} — ${d}`.slice(0, REFUND_REASON_MAX);
}

export function RefundButton({
  code,
  productName,
  optionName,
  qty,
  amount,
  className = "sm ghost",
}: {
  code: string;
  productName: string;
  optionName: string | null;
  qty: number;
  amount: number;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<RefundReason>(REFUND_REASONS[0]);
  const [detail, setDetail] = useState("");
  const detailMax = Math.max(0, REFUND_REASON_MAX - reason.length - 3); // ' — ' 3자

  const close = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, reason: composeRefundReason(reason, detail) }),
      });
      const data = (await res.json().catch(() => null)) as CancelResponse | null;

      if (res.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (res.ok && data?.ok) {
        if (data.already) toast("이미 환불 처리된 주문이에요");
        else if (data.afterShip) toast(`${REFUND_DONE_TOAST} · 이미 발송된 상품은 회수 후 처리돼요`);
        else toast(REFUND_DONE_TOAST);
        setOpen(false);
        router.refresh();
        return;
      }
      const codeOut = data?.code ?? "";
      toast(data?.message || "환불 신청에 실패했어요 — 잠시 후 다시 시도해주세요");
      // 화면이 낡은 경우(정산 완료·발송·이미 환불) — 버튼 조건이 바뀌었으니 새로고침
      if (codeOut === "SETTLED" || codeOut === "SHIPPED" || codeOut === "REFUNDED" || codeOut === "CANCELED" || codeOut === "NOT_FOUND") {
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast("환불 신청에 실패했어요 — 네트워크를 확인하고 다시 시도해주세요");
    } finally {
      setBusy(false);
    }
  }, [busy, code, detail, reason, router, toast]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        환불 신청
      </button>
      <Modal
        open={open}
        onClose={close}
        title="환불 신청"
        footer={
          <>
            <button type="button" onClick={close} disabled={busy}>
              취소
            </button>
            <button type="button" className="pri" onClick={submit} disabled={busy}>
              {busy ? "처리 중…" : "환불 신청"}
            </button>
          </>
        }
      >
        <div style={{ fontSize: 13.5, marginBottom: 10 }}>
          <b>{productName}</b> · {optionName || "기본"} × {qty} · <b>{won(amount)}</b>
        </div>
        <div className="notice" style={{ margin: "0 0 12px" }}>
          결제 대금은 <b>셀러리</b>가 보관 중이라 브랜드 확인을 기다리지 않고 바로 환불됩니다. {REFUND_NOTICE}.
        </div>
        <div className="fld">
          <label htmlFor="refund-reason">환불 사유</label>
          <select id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value as RefundReason)} disabled={busy}>
            {REFUND_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="refund-detail">
            상세 사유 <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(선택)</span>
          </label>
          <textarea
            id="refund-detail"
            rows={3}
            maxLength={detailMax}
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, detailMax))}
            placeholder="하자·오배송이면 상태를 간단히 적어주세요"
            disabled={busy}
          />
          <div className="hint">
            {detail.length}/{detailMax}자 · 전액 환불만 가능 (부분 환불 없음)
          </div>
        </div>
      </Modal>
    </>
  );
}
