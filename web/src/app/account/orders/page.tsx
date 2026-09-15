/**
 * /account/orders — 내 주문 (프로토타입 js/60-customer.js vCustOrders · ux-spec §3.6 · app-plan §6.1). 소유: F.
 *   · 미로그인: 리다이렉트 대신 "카카오 로그인하면 …" 카드 (프로토타입 동일)
 *   · 로그인: service role 조인 fetchMyOrders(user.id) — SETTLED 캠페인 주문도 상품명이 비지 않는다
 *   · 계정 카드: 이름 · 이메일 · 카카오 계정 · {md(customers.created_at)} 가입 · [로그아웃](B SignOutButton)
 * force-dynamic — 쿠키 세션·주문 상태(환불 후 router.refresh) 를 매번 읽는다.
 */
import Link from "next/link";
import { KAKAO_ICON } from "@/components/icons";
import { OrderRow } from "@/components/orders/order-row";
import { SignOutButton } from "@/app/account/sign-out-button";
import { displayName, getSessionUser } from "@/lib/auth";
import { md } from "@/lib/dates";
import { fetchMyAccount, fetchMyOrders, fetchOrderSettings } from "@/lib/orders-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 주문" };

const LOGIN_HREF = `/login?next=${encodeURIComponent("/account/orders")}`;

export default async function OrdersPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <h2 className="pg">내 주문</h2>
        <div className="card static" style={{ textAlign: "center", padding: 34 }}>
          <b>카카오 로그인</b>하면 주문·배송·환불을 한곳에서 볼 수 있어요
          <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link href={LOGIN_HREF} className="btn sm kakao">
              <KAKAO_ICON /> 카카오 로그인
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [orders, settings, account] = await Promise.all([
    fetchMyOrders(user.id),
    fetchOrderSettings(),
    fetchMyAccount(user.id),
  ]);
  const name = displayName(user);
  const email = user.email ?? account?.email ?? "";
  const joined = account?.created_at ?? user.created_at;

  return (
    <>
      <h2 className="pg">
        내 주문{" "}
        <small>
          {name}님 · {orders.length}건
        </small>
      </h2>

      {orders.length ? (
        <div className="listcard">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} settings={settings} />
          ))}
        </div>
      ) : (
        <div className="card static" style={{ padding: 30, textAlign: "center", color: "var(--color-mute)" }}>
          아직 주문이 없어요 —{" "}
          <Link href="/" className="btn sm ghost">
            진행 중인 판매 보기
          </Link>
        </div>
      )}

      <div
        className="card static"
        style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="kv-av" style={{ width: 34, height: 34, fontSize: 14 }} aria-hidden="true">
            {name.slice(0, 1)}
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{name}</b>
            <div className="meta">
              {email}
              {email ? " · " : ""}카카오 계정{joined ? ` · ${md(joined)} 가입` : ""}
            </div>
          </div>
        </div>
        <SignOutButton className="sm ghost" />
      </div>
    </>
  );
}
