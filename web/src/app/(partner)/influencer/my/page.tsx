import type { Metadata } from "next";
import Link from "next/link";
import { GradeBox } from "@/components/grade-box";
import { PlatIcon } from "@/components/icons";
import { PlatformHandle } from "@/components/platform-handle";
import { StatusChip } from "@/components/status-chip";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSeller, sellerPath } from "@/lib/partner/seller";
import { PLATFORMS, PLATFORM_LABELS, isPlatform } from "@/lib/partner/signup-rules";
import { confirmVerify, issueVerifyCode, saveChannel, setPrimaryCh } from "./actions";
import { CopyButton, DeleteChannelForm } from "./my-client";

/**
 * `/my` — 마이페이지 2단계: 프로필(활동명·핸들·등급·🥬·추천 코드) + 채널 목록 3칩(✓ 인증됨 / 인증 대기 / 미인증) + 채널 인증 패널
 * (프로토타입 js/20-seller.js vMy · channelModal · verifyModal). 정산 정보 폼·배송지는 3·5단계.
 *   ?verify=<id>  인증 패널(코드 + 방법 1 프로필 bio · 방법 2 @sellery.official DM) — vcode 가 있는 본인 채널만
 *   ?edit=<id> | ?add=1  채널 폼   ?msg=<code>  안내 문구
 * 칩 규칙(§4.7): verified → "✓ 인증됨", vcode_confirmed_at → "인증 대기"(운영자 확인 중), 그 외 → "미인증".
 * 인증된 채널만 [메인 SNS로 설정]. 메인 채널은 삭제 불가. 읽기는 service role + seller_id 필터, 쓰기는 actions.ts.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "내 정보" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const MY_MESSAGES: Record<string, { tone: "ok" | "danger" | "info"; text: string }> = {
  confirmed: { tone: "ok", text: "인증 확인을 요청했어요 — 운영팀이 프로필 또는 DM 에서 코드를 확인하면 ✓ 인증됨 으로 바뀝니다 (보통 1영업일 이내)." },
  already_verified: { tone: "info", text: "이미 인증된 채널이에요." },
  primary: { tone: "ok", text: "메인 SNS 를 바꿨어요 — 갤러리·필터에 이 채널 기준으로 노출됩니다." },
  primary_nosync: { tone: "info", text: "메인 SNS 는 바뀌었지만 프로필 핸들 동기화는 건너뛰었어요 — 같은 핸들을 다른 인플루언서가 쓰고 있어요." },
  saved: { tone: "ok", text: "채널을 수정했어요." },
  saved_reverify: { tone: "info", text: "채널을 수정했어요 — 사칭 방지를 위해 재인증이 필요합니다." },
  added: { tone: "ok", text: "채널을 추가했어요 — 인증을 진행해주세요." },
  deleted: { tone: "ok", text: "채널을 삭제했어요." },
  err_primary_delete: { tone: "danger", text: "메인 SNS 채널은 삭제할 수 없어요 — 먼저 다른 채널을 메인으로 설정하세요." },
  err_not_verified: { tone: "danger", text: "인증된 채널만 메인 SNS 로 설정할 수 있어요." },
  err_handle_taken: { tone: "danger", text: "같은 플랫폼에 이미 등록된 핸들이에요." },
  err_input: { tone: "danger", text: "입력값을 확인해주세요." },
  err_rate: { tone: "danger", text: "요청이 너무 많아요 — 잠시 후 다시 시도해주세요." },
  err_db: { tone: "danger", text: "저장 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요." },
};

const CHANNEL_COLS = "id, code, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, created_at";

export default async function MyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireSeller({ next: "/my" });
  const { seller, balance } = ctx;
  const sp = await searchParams;

  const admin = createAdminClient();
  const { data: channels, error } = await admin
    .from("seller_channels")
    .select(CHANNEL_COLS)
    .eq("seller_id", seller.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`seller_channels read failed: ${error.message}`);
  const list = channels ?? [];

  const msg = MY_MESSAGES[first(sp.msg) ?? ""];
  const verifyId = first(sp.verify);
  const verifying = verifyId ? list.find((c) => c.id === verifyId && c.vcode && !c.verified) : undefined;
  const editId = first(sp.edit);
  const editing = editId ? list.find((c) => c.id === editId) : undefined;
  const adding = first(sp.add) === "1";
  const myPath = sellerPath(ctx, "/my");

  return (
    <>
      <div className="console-head">
        <h2>내 정보</h2>
        <span className="cel" title="셀러리 포인트 잔액">
          🥬 {balance}
        </span>
      </div>

      {msg ? (
        <p className={`notice ${msg.tone === "ok" ? "ok" : msg.tone === "danger" ? "danger" : ""}`} role="status">
          {msg.text}
        </p>
      ) : null}

      <section className="card static">
        <div className="lbl-sm">프로필</div>
        <p style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 700 }}>
          {seller.name}{" "}
          <span style={{ fontWeight: 400 }}>
            <PlatformHandle platform={seller.platform} handle={seller.handle} />
          </span>
        </p>
        <p className="meta">
          팔로워 {seller.followers.toLocaleString("ko-KR")} · 등급 <GradeBox grade={seller.grade} sm />
          {seller.code ? <> · 코드 {seller.code}</> : null}
        </p>
        {seller.ref_code ? (
          <>
            <div className="lbl-sm" style={{ marginTop: 16 }}>
              내 추천 코드
            </div>
            <div className="console-inline">
              <span className="console-code">{seller.ref_code}</span>
              <CopyButton text={seller.ref_code} />
            </div>
            <p className="meta" style={{ marginTop: 8 }}>
              가입 폼에 이 코드를 넣은 인플루언서의 첫 5회 판매 확정 매출의 2% 를 받아요 (그 인플루언서는 같은 5회 수수료 +1%p).
            </p>
          </>
        ) : null}
      </section>

      {verifying ? (
        <section className="card static" id="verify">
          <div className="lbl-sm">채널 인증 — {verifying.handle}</div>
          <p className="meta" style={{ marginTop: 6 }}>
            본인 계정임을 확인해 사칭을 방지합니다. 아래 <b>1회용 코드</b>를 사용해 두 방법 중 하나로 인증하세요.
          </p>
          <div style={{ textAlign: "center", margin: "16px 0 4px" }}>
            <span className="console-code lg">{verifying.vcode}</span>
            <div style={{ marginTop: 10 }}>
              <CopyButton text={verifying.vcode ?? ""} label="코드 복사" />
            </div>
          </div>
          <div className="console-methods">
            <div className="card static">
              <div className="lbl-sm">방법 1 · 프로필 인증</div>
              <p>
                {PLATFORM_LABELS[isPlatform(verifying.platform) ? verifying.platform : "instagram"]} 프로필 소개글(bio)에 코드를 붙여넣은 뒤 아래
                확인 버튼을 누르세요. 확인 후 소개글에서 지워도 됩니다.
              </p>
            </div>
            <div className="card static">
              <div className="lbl-sm">방법 2 · DM 인증</div>
              <p>
                해당 계정에서 셀러리 공식 계정 <b>@sellery.official</b> 로 코드를 DM 으로 보낸 뒤 확인 버튼을 누르세요.
              </p>
            </div>
          </div>
          <p className="meta" style={{ marginTop: 12 }}>
            확인 버튼을 누르면 운영팀이 프로필 또는 DM 수신함에서 코드를 대조한 뒤 인증을 완료합니다(&quot;인증 대기&quot; 표시). 채널 인증은 샘플
            요청·구매의 전제 조건이 아니에요.
          </p>
          <div className="btnrow" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <Link href={myPath} className="btn ghost sm" prefetch={false}>
              나중에
            </Link>
            <form action={confirmVerify}>
              <input type="hidden" name="id" value={verifying.id} />
              <button type="submit" className="pri sm">
                인증 확인
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {editing || adding ? (
        <section className="card static" id="channel-form">
          <div className="lbl-sm">{editing ? "채널 수정" : "채널 추가"}</div>
          <form action={saveChannel} style={{ marginTop: 10 }}>
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="fld">
              <label htmlFor="ch-platform">플랫폼</label>
              <select id="ch-platform" name="platform" defaultValue={editing?.platform ?? "instagram"}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="ch-handle">계정 핸들 / 채널명</label>
              <input id="ch-handle" name="handle" defaultValue={editing?.handle ?? ""} placeholder="@my_account" maxLength={60} required />
            </div>
            <div className="fld">
              <label htmlFor="ch-url">채널 URL</label>
              <input id="ch-url" name="url" defaultValue={editing?.url ?? ""} placeholder="instagram.com/my_account" maxLength={200} />
            </div>
            <div className="fld">
              <label htmlFor="ch-followers">팔로워 수</label>
              <input id="ch-followers" name="followers" inputMode="numeric" defaultValue={editing ? String(editing.followers) : ""} placeholder="0" />
            </div>
            <p className="meta">
              저장 후 <b>인증 절차</b>를 거쳐야 브랜드에 노출됩니다. 핸들·플랫폼을 수정하면 인증이 초기화됩니다(사칭 방지).
            </p>
            <div className="btnrow" style={{ marginTop: 10, justifyContent: "flex-end" }}>
              <Link href={myPath} className="btn ghost sm" prefetch={false}>
                취소
              </Link>
              <button type="submit" className="pri sm">
                저장
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="sec" style={{ marginTop: 22 }}>
        내 채널 <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--color-mute)" }}>— 인증된 채널만 브랜드에 노출됩니다</span>
      </div>
      <div className="listcard console-rows">
        {list.length === 0 ? <div className="empty">등록된 채널이 없습니다</div> : null}
        {list.map((ch) => (
          <div className="rowitem" key={ch.id}>
            <span className="plat">
              <PlatIcon platform={ch.platform} />
            </span>
            <div className="grow">
              <div className="nm">
                {ch.handle}
                {ch.is_primary ? <StatusChip tone="green">메인 SNS</StatusChip> : null}
                {ch.verified ? (
                  <StatusChip tone="green">✓ 인증됨</StatusChip>
                ) : ch.vcode_confirmed_at ? (
                  <StatusChip tone="amber" title="운영팀이 코드를 확인하는 중이에요">
                    인증 대기
                  </StatusChip>
                ) : (
                  <StatusChip tone="red">미인증</StatusChip>
                )}
              </div>
              <div className="sub">
                {PLATFORM_LABELS[isPlatform(ch.platform) ? ch.platform : "instagram"]}
                {ch.url ? ` · ${ch.url}` : ""} · 팔로워 {ch.followers.toLocaleString("ko-KR")}
              </div>
            </div>
            <div className="rowacts">
              {!ch.verified && !ch.vcode_confirmed_at ? (
                <form action={issueVerifyCode}>
                  <input type="hidden" name="id" value={ch.id} />
                  <button type="submit" className="pri sm">
                    인증하기
                  </button>
                </form>
              ) : null}
              {!ch.verified && ch.vcode_confirmed_at ? (
                <form action={issueVerifyCode}>
                  <input type="hidden" name="id" value={ch.id} />
                  <button type="submit" className="ghost sm">
                    코드 보기
                  </button>
                </form>
              ) : null}
              {ch.verified && !ch.is_primary ? (
                <form action={setPrimaryCh}>
                  <input type="hidden" name="id" value={ch.id} />
                  <button type="submit" className="sm">
                    메인 SNS로 설정
                  </button>
                </form>
              ) : null}
              <Link href={`${myPath}?edit=${ch.id}#channel-form`} className="btn ghost sm" prefetch={false}>
                수정
              </Link>
              {!ch.is_primary ? <DeleteChannelForm id={ch.id} handle={ch.handle} /> : null}
            </div>
          </div>
        ))}
        <div className="console-addrow">
          <Link href={`${myPath}?add=1#channel-form`} className="btn sm" prefetch={false}>
            + 채널 추가
          </Link>
        </div>
      </div>

      <div className="sec" style={{ marginTop: 22 }}>
        정산 정보 <StatusChip tone={seller.has_bank_info ? "green" : "red"}>{seller.has_bank_info ? "등록 완료" : "미등록 — 등록 전까지 정산 지급 보류"}</StatusChip>
      </div>
      <section className="card static">
        <p className="meta">계좌·원천징수 자료 입력은 <b>5단계</b>에서 열립니다. 그 전까지는 운영팀이 이메일로 안내드려요.</p>
      </section>
    </>
  );
}
