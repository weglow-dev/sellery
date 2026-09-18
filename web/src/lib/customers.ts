/**
 * customers 행 보장 — 계약 docs/app-plan.md §10.0 · §4.1. 소유: B.
 *
 * 트리거가 customers 를 만들지 않으므로 앱이 upsert 한다:
 *   admin.from("customers").upsert({ user_id, name: displayName(user), email: user.email ?? null },
 *     { onConflict: "user_id", ignoreDuplicates: true }) 후 select id, address, phone.
 * 콜백(best-effort) + /api/checkout(필수 — 여기서 얻은 id 를 세션에 저장).
 *
 * `user.email` 은 null 일 수 있다(카카오 이메일 선택 동의) — optional 로 다룬다. 기존 행은 덮어쓰지 않는다
 * (ignoreDuplicates — 고객이 체크아웃에서 저장한 phone/address 를 로그인 때마다 지우지 않기 위해).
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Shipping } from "@/lib/types";
import { displayName } from "@/lib/auth";

export type CustomerRef = {
  id: string;
  /** 기본 배송지 (customers.address jsonb — Shipping 과 같은 키) */
  address: Shipping | null;
  phone: string | null;
};

/** customers.address jsonb → Shipping (필수 키가 문자열이면 통과, 아니면 null). */
function parseShipping(json: unknown): Shipping | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const recipient = str("recipient");
  const phone = str("phone");
  const postcode = str("postcode");
  const address1 = str("address1");
  if (recipient === undefined || phone === undefined || postcode === undefined || address1 === undefined) {
    return null;
  }
  const out: Shipping = { recipient, phone, postcode, address1 };
  const address2 = str("address2");
  const memo = str("memo");
  if (address2 !== undefined) out.address2 = address2;
  if (memo !== undefined) out.memo = memo;
  return out;
}

export async function ensureCustomer(
  admin: SupabaseClient<Database>,
  user: User,
): Promise<CustomerRef> {
  const { error: upsertError } = await admin.from("customers").upsert(
    { user_id: user.id, name: displayName(user), email: user.email ?? null },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(`customers upsert failed: ${upsertError.message}`);

  // ignoreDuplicates 는 기존 행을 돌려주지 않으므로 항상 다시 읽는다.
  const { data, error } = await admin
    .from("customers")
    .select("id, address, phone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`customers select failed: ${error.message}`);
  if (!data) throw new Error("customers row missing after upsert");

  return { id: data.id, address: parseShipping(data.address), phone: data.phone ?? null };
}
