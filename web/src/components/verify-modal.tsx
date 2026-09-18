"use client";

/**
 * 인증 확인 모달 (프로토타입 js/80-actions.js verifyStore · ux-spec §4.1). 소유: C.
 *   · <VerifyModal card open onClose> — campaign_card 데이터로 표를 렌더 (링크 페이지는 서버가 넘긴 card 를 그대로).
 *   · <VerifyLauncher code card?> — 클릭 시 열림. card 가 없으면(홈 카드) 브라우저 anon RPC 로 campaign_card(code) 를 받아 연다.
 * `유효` 판정 = RPC 응답이 null 이 아님 (SETTLED 도 유효). 링크 보호 필터 대상이 아니다.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { CEL, PlatIcon } from "@/components/icons";
import { GradeBox } from "@/components/grade-box";
import { StatusChip } from "@/components/status-chip";
import { useToast } from "@/components/toast";
import { createBrowserClient } from "@/lib/supabase/client";
import { displayStoreUrl, parseCampaignCard, type CampaignCard } from "@/lib/campaign";
import { md } from "@/lib/dates";

export function VerifyModal({ card, open, onClose }: { card: CampaignCard | null; open: boolean; onClose: () => void }) {
  if (!card) return null;
  const { campaign, seller, brand, channels, settings } = card;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          <CEL /> 셀러리 판매 인증
        </>
      }
      footer={
        <button type="button" className="pri" onClick={onClose}>
          닫기
        </button>
      }
    >
      <div className="notice" style={{ margin: "8px 0 12px" }}>
        이 판매 페이지는 셀러리가 발급한 정식 링크입니다. 사칭 링크는 이 인증 정보를 표시할 수 없습니다.
      </div>
      <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
        <tbody>
          <tr>
            <td>인증 링크</td>
            <td className="num" style={{ whiteSpace: "normal" }}>
              {displayStoreUrl(card)}{" "}
              <StatusChip tone="green" className="verify-chip">
                유효
              </StatusChip>
            </td>
          </tr>
          <tr>
            <td>판매 인플루언서</td>
            <td className="num" style={{ whiteSpace: "normal" }}>
              <PlatIcon platform={seller.platform} /> {seller.name} {seller.handle} · <GradeBox grade={seller.grade} sm />
            </td>
          </tr>
          <tr>
            <td>인증 채널</td>
            <td className="num" style={{ whiteSpace: "normal" }}>
              {channels.length
                ? channels.map((ch, i) => (
                    <span key={`${ch.platform}:${ch.handle}`}>
                      {i > 0 ? <br /> : null}
                      <PlatIcon platform={ch.platform} /> {ch.handle} ✓
                    </span>
                  ))
                : "—"}
            </td>
          </tr>
          <tr>
            <td>공급 브랜드</td>
            <td className="num" style={{ whiteSpace: "normal" }}>
              {brand.name} · <GradeBox grade={brand.grade} sm />
              {brand.biz_no ? ` · 사업자 ${brand.biz_no}` : " · 인증 브랜드"}
            </td>
          </tr>
          <tr>
            <td>판매 기간</td>
            <td className="num">{campaign.start_date && campaign.end_date ? `${md(campaign.start_date)} – ${md(campaign.end_date)}` : "—"}</td>
          </tr>
          <tr>
            <td>결제·정산</td>
            <td className="num" style={{ whiteSpace: "normal" }}>
              셀러리 에스크로 보관 · 종료 후 {settings.clear_days}일 환불 보호
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}

/**
 * 인증 확인 런처 — 버튼/띠 어디에나. `card` 가 있으면 즉시, 없으면 code 로 anon RPC 후 연다.
 * `as="div"` 면 클릭 가능한 div 로 렌더 (인증 띠 `.store-trust`).
 */
export function VerifyLauncher({
  code,
  card,
  className,
  children,
  as = "button",
}: {
  code: string;
  card?: CampaignCard | null;
  className?: string;
  children: ReactNode;
  as?: "button" | "div";
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<CampaignCard | null>(card ?? null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const launch = useCallback(async () => {
    if (loaded) {
      setOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await createBrowserClient().rpc("campaign_card", { p_code: code });
      const parsed = error ? null : parseCampaignCard(data);
      if (!parsed) {
        toast("인증 정보를 불러오지 못했어요");
        return;
      }
      setLoaded(parsed);
      setOpen(true);
    } catch {
      toast("인증 정보를 불러오지 못했어요");
    } finally {
      setBusy(false);
    }
  }, [busy, code, loaded, toast]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {as === "div" ? (
        <div
          className={className}
          role="button"
          tabIndex={0}
          onClick={launch}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void launch();
            }
          }}
        >
          {children}
        </div>
      ) : (
        <button type="button" className={className} onClick={launch} disabled={busy}>
          {children}
        </button>
      )}
      <VerifyModal card={loaded} open={open} onClose={close} />
    </>
  );
}
