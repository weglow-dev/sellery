/**
 * 교환·환불 요청(승인형 CS · 0078) — RPC 를 service role 로. 판정 · 상태 전이는 전부 DB(백엔드 원칙 1) · 돈은 refundItems 한 곳.
 *   고객(샵):     openClaims(orderId, actorId, body)          요청 남기기(줄마다 1건) → 셀러 메일
 *                claimsForOrder(orderId)                     주문 상세 · 신청 페이지(소유는 라우트가 이미 확인)
 *   크리에이터:   listSellerClaimsOfUser(userId) · sellerClaimsWaitingOfUser(userId) · getSellerClaimOfUser(userId, code)(사진 서명 URL 포함)
 *                decideClaim(userId, code, body)             승인/반려 → 고객 메일(환불은 하지 않는다 — 샵 크론)
 *   운영 · 크론:  adminClaims(openOnly) · collectClaim(code)(회수 확인 → 환불 차례면 바로 환불 · actor admin) · reshipClaim(code, courier, tracking)(→ 고객 메일)
 *                retryClaimRefunds()                         환불 차례인 요청(1분 지남) — 샵 크론 reconcile. 승인 뒤 바로 환불(파손)도 여기서 나간다 — 결제 키는 샵에만(2026-11-06 대표 결정)
 * 환불은 `refundItems`(토스 부분 취소 · 줄 기록 · 환불 메일) 뒤 `myr_app_claim_refunded` 로 요청에 기록한다. 토스 키는 요청 코드(tag)로 멱등.
 * actor 와 그 id 는 세션에서만(원칙 6) — 이 모듈은 라우트가 넘긴 값을 그대로 쓴다.
 */
import { CLAIM_CODE_RE, claimFromJson, claimsFromJson, type Claim, type ClaimDecideBody, type ClaimOpenBody } from '../claim-rules';
import { admin } from './admin.server';
import { notifyClaimDecided, notifyClaimOpened, notifyClaimReshipped } from './mail-events.server';
import { refundItems, type RefundActor } from './refund.server';
import { signRefundPhotos } from './refund-photos.server';

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const fail = (code: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, code, ...extra });

/* ---------------- 고객 ---------------- */
export type ClaimOpenResult = { ok: true; codes: string[] } | { ok: false; code: string; items?: { item_id: string; reason: string }[] };

export async function openClaims(orderId: string, actorId: string | null, body: ClaimOpenBody): Promise<ClaimOpenResult> {
	const { data, error } = await admin().rpc('myr_app_claim_open', { p_order_id: orderId, p_actor_id: actorId, p_kind: body.kind, p_reason: body.reason, p_lines: body.items });
	if (error) {
		console.error('[claims] open failed:', error.message);
		return fail('DB_ERROR');
	}
	const r = obj(data);
	if (!r || r.ok !== true) {
		const items = Array.isArray(r?.items) ? (r.items as Record<string, unknown>[]).map((x) => ({ item_id: String(x.item_id ?? ''), reason: String(x.reason ?? '') })) : undefined;
		return fail(typeof r?.code === 'string' ? r.code : 'DB_ERROR', items ? { items } : {});
	}
	const codes = (Array.isArray(r.requests) ? (r.requests as Record<string, unknown>[]) : []).map((x) => String(x.code ?? '')).filter(Boolean);
	// 셀러 메일 — 요청마다(줄의 셀러) · 절대 throw 하지 않는다
	const claims = await claimsForOrder(orderId).catch(() => [] as Claim[]);
	await Promise.all(claims.filter((c) => codes.includes(c.code)).map((c) => notifyClaimOpened(c)));
	return { ok: true, codes };
}

export async function claimsForOrder(orderId: string): Promise<Claim[]> {
	const { data, error } = await admin().rpc('myr_app_claims_for_order', { p_order_id: orderId });
	if (error) throw new Error(`myr_app_claims_for_order failed: ${error.message}`);
	return claimsFromJson(data);
}

/** 마이 "교환 · 환불 요청" — 회원 주문의 요청(최근순 50건) */
export async function claimsOfUser(userId: string): Promise<Claim[]> {
	const { data, error } = await admin().rpc('myr_app_claims_of_user', { p_user: userId, p_limit: 50 });
	if (error) throw new Error(`myr_app_claims_of_user failed: ${error.message}`);
	return claimsFromJson(data);
}

/* ---------------- 크리에이터 ---------------- */
export async function listSellerClaimsOfUser(userId: string): Promise<Claim[]> {
	const { data, error } = await admin().rpc('myr_app_seller_claims_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_claims_of_user failed: ${error.message}`);
	return claimsFromJson(data);
}

export async function sellerClaimsWaitingOfUser(userId: string): Promise<number> {
	const { data, error } = await admin().rpc('myr_app_seller_claims_waiting_of_user', { p_user: userId });
	if (error) {
		console.error('[claims] waiting failed:', error.message);
		return 0;
	}
	return typeof data === 'number' ? data : 0;
}

/** 요청 1건 + 사진 서명 URL(7일 · 실패한 사진은 뺀다) — 남의 요청 · 없는 코드는 null */
export async function getSellerClaimOfUser(userId: string, code: string): Promise<{ claim: Claim; photoUrls: string[] } | null> {
	const c = code.trim().toLowerCase();
	if (!CLAIM_CODE_RE.test(c)) return null;
	const { data, error } = await admin().rpc('myr_app_seller_claim_of_user', { p_user: userId, p_code: c });
	if (error) throw new Error(`myr_app_seller_claim_of_user failed: ${error.message}`);
	const claim = claimFromJson(data);
	if (!claim) return null;
	const signed = await signRefundPhotos(claim.photos);
	return { claim, photoUrls: claim.photos.map((p) => signed.get(p)).filter((u): u is string => !!u) };
}

export type ClaimRefundOutcome = { tried: boolean; ok: boolean; code?: string; amount?: number };
export type ClaimDecideResult = { ok: true; claim: Claim } | { ok: false; code: string };

export async function decideClaim(userId: string, code: string, body: ClaimDecideBody): Promise<ClaimDecideResult> {
	const c = code.trim().toLowerCase();
	if (!CLAIM_CODE_RE.test(c)) return fail('NOT_FOUND');
	const { data, error } = await admin().rpc('myr_app_claim_decide', { p_code: c, p_user: userId, p_decision: body.decision, p_resolution: body.resolution, p_message: body.message });
	if (error) {
		console.error('[claims] decide failed:', error.message);
		return fail('DB_ERROR');
	}
	const r = obj(data);
	const claim = claimFromJson(r?.request);
	if (!r || r.ok !== true || !claim) return fail(typeof r?.code === 'string' ? r.code : 'DB_ERROR');
	await notifyClaimDecided(claim);
	// 회수 없이 바로 환불(파손 · 누액)이어도 여기서는 돈을 움직이지 않는다 — 요청은 "환불할 차례"(step refund)로 남고
	// 샵 크론(reconcile · 10분마다 · retryClaimRefunds)이 환불한다. 토스 시크릿 키를 샵 한 곳에만 두기 위해서(2026-11-06 대표 결정)
	return { ok: true, claim };
}

/* ---------------- 환불 실행 — 요청에서 나가는 돈은 여기 한 곳 ---------------- */
async function refundClaim(c: Pick<Claim, 'code' | 'reason' | 'qty' | 'note' | 'photos' | 'deduction' | 'order'>, actor: RefundActor, actorId: string | null): Promise<ClaimRefundOutcome> {
	try {
		const r = await refundItems({
			actor,
			actorId,
			orderId: c.order.id,
			items: [{ item_id: c.order.item.id, qty: c.qty, ...(c.note ? { note: c.note } : {}), ...(c.photos.length ? { photos: c.photos } : {}) }],
			reason: `교환·환불 요청 ${c.code.toUpperCase()} · ${c.reason}`,
			deduction: c.deduction,
			tag: c.code
		});
		if (!r.ok) {
			console.error(`[claims] refund ${c.code} failed:`, r.code, r.message ?? '');
			return { tried: true, ok: false, code: r.code };
		}
		const { data, error } = await admin().rpc('myr_app_claim_refunded', { p_code: c.code, p_amount: r.refunded });
		if (error || obj(data)?.ok !== true) {
			// 돈은 나갔는데 요청 기록이 실패 — 다음 재시도에서 refundItems 가 already(같은 키) → 기록만 다시
			console.error(`[claims] refunded record ${c.code} failed:`, error?.message ?? JSON.stringify(data));
			return { tried: true, ok: false, code: 'RECORD_FAILED' };
		}
		return { tried: true, ok: true, amount: r.refunded };
	} catch (e) {
		console.error(`[claims] refund ${c.code} threw:`, e instanceof Error ? e.message : e);
		return { tried: true, ok: false, code: 'DB_ERROR' };
	}
}

/* ---------------- 운영 · 크론 ---------------- */
export async function adminClaims(openOnly = true): Promise<Claim[]> {
	const { data, error } = await admin().rpc('myr_app_admin_claims', { p_open_only: openOnly });
	if (error) throw new Error(`myr_app_admin_claims failed: ${error.message}`);
	return claimsFromJson(data);
}

export type ClaimOpsResult = { ok: true; already: boolean; claim: Claim; refund?: ClaimRefundOutcome; mailed?: boolean } | { ok: false; code: string };

/** 회수 확인 → 환불할 차례면 바로 환불(actor admin) */
export async function collectClaim(code: string): Promise<ClaimOpsResult> {
	const { data, error } = await admin().rpc('myr_app_admin_claim_collected', { p_code: code.trim().toLowerCase() });
	if (error) {
		console.error('[claims] collected failed:', error.message);
		return fail('DB_ERROR');
	}
	const r = obj(data);
	const claim = claimFromJson(r?.request);
	if (!r || r.ok !== true || !claim) return fail(typeof r?.code === 'string' ? r.code : 'DB_ERROR');
	if (r.refund_now !== true) return { ok: true, already: r.already === true, claim };
	const refund = await refundClaim(claim, 'admin', null);
	const after = refund.ok ? ((await adminClaimByCode(claim.code)) ?? claim) : claim;
	return { ok: true, already: r.already === true, claim: after, refund };
}

/** 재발송 송장 → 고객 메일(새 기록일 때만) */
export async function reshipClaim(code: string, courier: string, trackingNo: string): Promise<ClaimOpsResult> {
	const { data, error } = await admin().rpc('myr_app_admin_claim_reship', { p_code: code.trim().toLowerCase(), p_courier: courier, p_tracking_no: trackingNo });
	if (error) {
		console.error('[claims] reship failed:', error.message);
		return fail('DB_ERROR');
	}
	const r = obj(data);
	const claim = claimFromJson(r?.request);
	if (!r || r.ok !== true || !claim) return fail(typeof r?.code === 'string' ? r.code : 'DB_ERROR');
	const already = r.already === true;
	const mailed = already ? false : (await notifyClaimReshipped(claim))?.ok === true;
	return { ok: true, already, claim, mailed };
}

/** 환불만 다시(운영 명령 · 크론) — 환불할 차례인 요청만 */
export async function retryClaimRefund(code: string): Promise<ClaimOpsResult> {
	const claim = await adminClaimByCode(code.trim().toLowerCase());
	if (!claim) return fail('NOT_FOUND');
	if (claim.step !== 'refund') return fail('NOT_READY');
	const refund = await refundClaim(claim, 'admin', null);
	return { ok: true, already: false, claim: (refund.ok ? await adminClaimByCode(claim.code) : null) ?? claim, refund };
}

/** 크론 — 환불할 차례인 요청(오래된 순 · 20건). 콘솔 승인(파손 즉시 환불)은 여기서 처음 환불되고, 회수 확인 직후 실패한 환불은 다시.
 *  1분 = 운영 회수 확인(collectClaim)이 바로 부르는 환불과 겹치지 않을 여유(겹쳐도 토스 키 · claim_refunded 가 멱등) */
export async function retryClaimRefunds(): Promise<{ found: number; refunded: number; failed: string[] }> {
	const { data, error } = await admin().rpc('myr_app_claims_refund_due', { p_age: '1 minute', p_limit: 20 });
	if (error) {
		console.error('[claims] refund_due failed:', error.message);
		return { found: 0, refunded: 0, failed: [] };
	}
	const due = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
	let refunded = 0;
	const failed: string[] = [];
	for (const d of due) {
		const r = await retryClaimRefund(String(d.code ?? ''));
		if (r.ok && r.refund?.ok) refunded++;
		else failed.push(String(d.code ?? ''));
	}
	return { found: due.length, refunded, failed };
}

async function adminClaimByCode(code: string): Promise<Claim | null> {
	const { data, error } = await admin().from('myr_refund_requests').select('order_id').eq('code', code).maybeSingle();
	if (error || !data) return null;
	return (await claimsForOrder((data as { order_id: string }).order_id)).find((c) => c.code === code) ?? null;
}

/** 단순 변심 왕복 배송비(platform_settings · 0078) — 신청 화면의 예상 금액 · 처리 기준 문구. 실패하면 기본 6,000 */
export async function claimReturnFee(): Promise<number> {
	const { data, error } = await admin().rpc('myr_claim_return_fee');
	if (error) {
		console.error('[claims] return fee failed:', error.message);
		return 6000;
	}
	return typeof data === 'number' ? data : 6000;
}
