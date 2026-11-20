/**
 * 토스 셀러 등록 연결(서버 전용 · 0124 · docs/myr.md 7-7 5번).
 * 토스를 부르는 곳은 둘뿐(2026-11-19 결정 — 크론 · 다시 시도 · 겹친 시도 처리를 없앴다):
 *   지금 바로 — 크리에이터가 저장한 직후(저장 응답 toss_action: 토스 등록 전 · 토스가 정보를 거절함 · 본인인증 전 휴대폰 변경)
 *   운영 승인 때 — 등록된 크리에이터의 정보 변경(저장이 남긴 할 일 myr_toss_todo) → approveSettleInfo 가 토스에 한 번 반영하고 성공하면 확인 완료
 * 웹훅 seller.changed · [인증을 마쳤어요]는 상태만 다시 읽어 적는다.
 * 판정은 DB(백엔드 원칙 1): 지금 / 승인 때 · 최종 동작 · 다시 등록 막기 · refSellerId = 0124 저장 RPC · myr_app_seller_toss_begin,
 *   카드 상태 · 보류 이유 · 지급 건 다시 계산 = 0121 · 0122. 여기서는 토스를 부르고 결과를 그 함수들에 적는다.
 * 시범운영(2026-11-19): 모든 환경에서 tpeerkeamf5 테스트 키로 실제 호출 — 테스트 환경도 사업자번호를 국세청 기준으로 확인한다.
 */
import { settleInfoFromJson, type BizKind, type SettleInfo } from '../settle-info';
import { buildTossSellerBody, tossBuildErrorOf, tossSellerErrorOf, type TossSellerError } from '../toss-payout-rules';
import { createTossPayouts, isUncertainPayout, type TossPayoutsApi } from '../toss-payouts-client';
import { admin } from './admin.server';
import { myrConfig } from './config.server';

export { hasTossPayouts } from './toss-payouts.server';

const defaultApi = createTossPayouts({ keys: () => ({ secretKey: myrConfig().tossPayoutSecretKey, securityKey: myrConfig().tossPayoutSecurityKey }) });

/** done — 이번 호출 뒤 승인 때 반영할 할 일이 비었나(DB 응답 · 성공 또는 크리에이터가 고칠 정보 오류로 확정). false 면 운영이 다시 승인한다 */
export type TossLinkResult = { ok: true; info: SettleInfo; done: true } | { ok: false; code: string; info: SettleInfo | null; done: boolean };

type Begin = {
	ok: boolean;
	code?: string;
	action?: 'register' | 'update';
	ref?: string | null;
	toss_id?: string | null;
	old_toss_id?: string | null;
	input?: { company: string | null; ceo: string | null; biz_no: string | null; biz_kind: BizKind | null; email: string | null; phone: string | null; bank: { bank: string; account: string; holder: string } | null };
};

/** 결과 적기 — done: 결과가 확정됐나(성공 · 크리에이터가 고칠 정보 오류 → 남은 할 일을 지운다). 응답 done(할 일이 비었나)은 DB 가 정한다 */
async function record(sellerId: string, tossId: string | null, status: string | null, error: TossSellerError | null, done: boolean): Promise<{ info: SettleInfo | null; done: boolean }> {
	const { data, error: e } = await admin().rpc('myr_app_seller_toss_record', { p_seller: sellerId, p_toss_id: tossId, p_status: status, p_error: error, p_done: done });
	const r = data as { ok?: boolean; code?: string; done?: boolean; info?: unknown } | null;
	if (e || !r?.ok) {
		console.error('[toss-sellers] record failed:', e?.message ?? r?.code);
		return { info: null, done: false };
	}
	return { info: settleInfoFromJson(r.info), done: r.done === true };
}

/** 다시 등록(이전 셀러 삭제 뒤)이 결과 불명 · 우리 쪽 거절로 끝났을 때 — 지금 id 가 방금 지운 이전 셀러일 때만 비운다(웹훅이 먼저 새 셀러를 적었으면 그대로) */
async function forget(sellerId: string, oldTossId: string): Promise<SettleInfo | null> {
	const { data, error } = await admin().rpc('myr_app_seller_toss_forget', { p_seller: sellerId, p_old_toss_id: oldTossId });
	const r = data as { ok?: boolean; code?: string; info?: unknown } | null;
	if (error || !r?.ok) {
		console.error('[toss-sellers] forget failed:', error?.message ?? r?.code);
		return null;
	}
	return settleInfoFromJson(r.info);
}

/** 등록 시도가 확실히 실패(우리 쪽 거절 · 삭제 실패로 등록 요청 안 보냄) — 이번 시도(ref)면 등록 진행 중을 바로 끝낸다(결과 불명만 5분 대기 · 2026-11-20) */
async function abort(sellerId: string, ref: string | null | undefined): Promise<SettleInfo | null> {
	const { data, error } = await admin().rpc('myr_app_seller_toss_abort', { p_seller: sellerId, p_ref: ref ?? null });
	const r = data as { ok?: boolean; code?: string; info?: unknown } | null;
	if (error || !r?.ok) {
		console.error('[toss-sellers] abort failed:', error?.message ?? r?.code);
		return null;
	}
	return settleInfoFromJson(r.info);
}

/**
 * 토스 셀러 등록 · 수정 — 저장 직후(지금 바로 할 일) · 운영 승인(승인 때 할 일)이 부른다. 저장은 이미 끝났다(실패해도 되돌리지 않는다).
 *   register  이전 셀러가 있으면 삭제(송금 중이면 DB 가 SENDING 으로 막는다) → 새 refSellerId 로 등록 → 상태 적기
 *   update    셀러 수정(인증 유지) — 토스에 그 셀러가 없으면(404) 새로 등록
 * 실패 코드: NOT_CONFIGURED(키 없음 — 아무것도 적지 않는다) · SENDING · TOSS_DELETE · UNCERTAIN · TOSS:<code>(우리 쪽 문제 — 카드에 적지 않음) ·
 *   PAYLOAD_<code> · <토스 코드>(크리에이터가 고칠 정보 — 카드 "정보 확인 필요")
 */
export async function linkTossSeller(sellerId: string, action: 'register' | 'update', api: TossPayoutsApi = defaultApi): Promise<TossLinkResult> {
	const cfg = myrConfig();
	if (api === defaultApi && !(cfg.tossPayoutSecretKey && cfg.tossPayoutSecurityKey)) return { ok: false, code: 'NOT_CONFIGURED', info: null, done: false };
	const { data, error } = await admin().rpc('myr_app_seller_toss_begin', { p_seller: sellerId, p_action: action });
	const b = data as Begin | null;
	if (error || !b?.ok || !b.input || !b.action) {
		if (error) console.error('[toss-sellers] begin failed:', error.message);
		return { ok: false, code: b?.code ?? 'DB_ERROR', info: null, done: false };
	}

	// 본문을 먼저 만든다(2026-11-20) — 이전 셀러를 지운 뒤에 본문이 걸리면(은행 코드 표에 없음 · 이메일 없음 등) 인증된 셀러만 사라진다
	const i = b.input;
	const built = buildTossSellerBody({ refSellerId: b.ref ?? '', bizKind: i.biz_kind, company: i.company, ceo: i.ceo, bizNo: i.biz_no, email: i.email, phone: i.phone, bank: i.bank });
	if (!built.ok) {
		const err = tossBuildErrorOf(built.code, built.field);
		// 토스에는 아무것도 보내지 않았다 — 셀러는 그대로(수정: 지금 셀러 · 다시 등록: 이전 셀러 · 상태 유지) · 할 일은 남긴다(고친 뒤 같은 동작 — 다시 등록이 수정으로 바뀌지 않게) ·
		//   등록 진행 중은 바로 끝낸다(abort)
		const w = await record(sellerId, (b.action === 'update' ? b.toss_id : b.old_toss_id) ?? null, null, err, false);
		const info = b.action === 'register' ? ((await abort(sellerId, b.ref)) ?? w.info) : w.info;
		return { ok: false, code: err.code, info, done: false };
	}

	// 다시 등록 — 이전 셀러 삭제(없으면 404 · 그대로 진행)
	if (b.action === 'register' && b.old_toss_id) {
		const del = await api.deleteSeller(b.old_toss_id);
		if (!del.ok && del.status !== 404) {
			console.error('[toss-sellers] delete before re-register failed:', del.status, del.body.code, del.body.traceId ?? '');
			// 등록 요청은 보내지 않았다 — 새 셀러가 생길 일이 없으니 등록 진행 중을 바로 끝낸다
			const info = await abort(sellerId, b.ref);
			return { ok: false, code: isUncertainPayout(del) ? 'UNCERTAIN' : 'TOSS_DELETE', info, done: false };
		}
	}

	const res = b.action === 'update' && b.toss_id ? await api.updateSeller(b.toss_id, built.body) : await api.registerSeller(built.body);
	if (!res.ok && b.action === 'update' && res.status === 404) return linkTossSeller(sellerId, 'register', api); // 토스에 없는 셀러(테스트 상점 초기화 등) → 새로 등록

	if (!res.ok) {
		const err = isUncertainPayout(res) ? null : tossSellerErrorOf(res.status, res.body);
		if (!err) {
			// 결과 불명 · 우리 쪽 거절 — 카드에 적지 않는다. 다시 등록이면 id 가 아직 방금 지운 이전 셀러일 때만 비운다(새 셀러는 웹훅이 refSellerId 로 적는다)
			console.error('[toss-sellers] not settled:', res.status, res.body.code, res.body.traceId ?? '');
			const uncertain = isUncertainPayout(res);
			const forgot = b.action === 'register' && b.old_toss_id ? await forget(sellerId, b.old_toss_id) : null;
			// 우리 쪽 거절(확실한 실패)이면 등록 진행 중을 바로 끝낸다 — 결과 불명일 때만 5분을 기다린다(실제로 성공했으면 웹훅이 셀러를 적는다)
			const info = !uncertain && b.action === 'register' ? ((await abort(sellerId, b.ref)) ?? forgot) : forgot;
			return { ok: false, code: uncertain ? 'UNCERTAIN' : `TOSS:${res.body.code}`, info, done: false };
		}
		const w = await record(sellerId, b.action === 'update' ? (b.toss_id ?? null) : null, null, err, true);
		return { ok: false, code: err.code, info: w.info, done: w.done };
	}
	const w = await record(sellerId, res.body.id, res.body.status, null, true);
	if (!w.info) return { ok: false, code: 'DB_ERROR', info: null, done: false };
	return w.done ? { ok: true, info: w.info, done: true } : { ok: false, code: 'TODO_LEFT', info: w.info, done: false };
}

/** 토스에 다시 조회한 상태만 적는다 — 웹훅 seller.changed · [인증을 마쳤어요]. 모르는 셀러면 found false */
async function applyStatus(tossId: string, ref: string | null, status: string): Promise<{ ok: boolean; found: boolean; info: SettleInfo | null; code?: string }> {
	const { data, error } = await admin().rpc('myr_app_seller_toss_status', { p_toss_id: tossId, p_ref: ref, p_status: status });
	const r = data as { ok?: boolean; found?: boolean; code?: string; info?: unknown } | null;
	if (error || !r?.ok) return { ok: false, found: false, info: null, code: r?.code ?? 'DB_ERROR' };
	return { ok: true, found: r.found === true, info: r.found ? settleInfoFromJson(r.info) : null };
}

/** [인증을 마쳤어요] — 이 크리에이터의 토스 셀러를 다시 조회해 상태를 적는다. 등록 전이면 NOT_REGISTERED */
export async function refreshTossSeller(sellerId: string, api: TossPayoutsApi = defaultApi): Promise<TossLinkResult> {
	const { data, error } = await admin().from('sellers').select('toss_seller_id').eq('id', sellerId).maybeSingle();
	if (error || !data) return { ok: false, code: error ? 'DB_ERROR' : 'NOT_FOUND', info: null, done: false };
	if (!data.toss_seller_id) return { ok: false, code: 'NOT_REGISTERED', info: null, done: false };
	const res = await api.getSeller(data.toss_seller_id);
	if (!res.ok) {
		console.error('[toss-sellers] refresh lookup failed:', res.status, res.body.code, res.body.traceId ?? '');
		return { ok: false, code: isUncertainPayout(res) ? 'UNCERTAIN' : `TOSS:${res.body.code}`, info: null, done: false };
	}
	// 토스가 돌려준 refSellerId 를 넘긴다(우리 DB 값이 아니라) — 마지막 등록 시도의 셀러인지는 DB(myr_toss_register_confirmed)가 이 값으로 본다
	const r = await applyStatus(res.body.id, res.body.refSellerId ?? null, res.body.status);
	return r.ok && r.info ? { ok: true, info: r.info, done: true } : { ok: false, code: r.code ?? 'NOT_FOUND', info: null, done: false };
}

export type TossWebhookResult = { status: number; result: string };

/** 웹훅 seller.changed — 본문은 믿지 않고 id 로 다시 조회한 셀러만 적는다. 모르는 셀러(다른 서비스 · 삭제됨)는 200 ignored · 조회 불명은 502(토스가 다시 보낸다) */
export async function handleTossSellerChanged(tossId: string, api: TossPayoutsApi = defaultApi): Promise<TossWebhookResult> {
	const res = await api.getSeller(tossId);
	if (!res.ok) {
		if (isUncertainPayout(res)) return { status: 502, result: 'error: lookup failed' };
		return { status: 200, result: `ignored: lookup ${res.body.code}` };
	}
	const r = await applyStatus(res.body.id, res.body.refSellerId ?? null, res.body.status);
	if (!r.ok) return r.code === 'BAD_STATUS' ? { status: 200, result: `ignored: status ${res.body.status}` } : { status: 502, result: `error: ${r.code}` };
	return r.found ? { status: 200, result: `synced ${res.body.status}` } : { status: 200, result: 'ignored: unknown seller' };
}

/* ---------------- 운영 승인(콘솔 운영 API /api/ops/settle · 운영 콘솔이 생기기 전까지 myr-creators.mjs settle-verify) ---------------- */

export type SettleApproveResult =
	| { ok: true; status: string; toss: 'none' | 'synced' }
	| { ok: false; code: string; toss?: { code: string }; submittedAt?: string | null };

/**
 * 사업자 · 정산 정보 확인 완료 — 승인 때 토스에 반영할 할 일(myr_toss_todo)이 있으면 먼저 토스에 한 번 반영하고, 할 일이 비었을 때만 확인 완료.
 * 토스 반영이 실패하면 확인 중 그대로(사업자 정보 보류로 지급 멈춤) — TOSS_FAILED 와 토스 코드를 돌려준다:
 *   결과 불명 · 우리 쪽 거절 · 삭제 실패 → 할 일이 남아 운영이 다시 누른다 · 크리에이터 정보 거절(카드 "정보 확인 필요") → 운영이 "다시 입력 요청"(settle-reject).
 * 할 일이 남았는지는 확인 RPC 가 정한다(TOSS_PENDING = myr_seller_toss_todo_open) — 먼저 확인 RPC 를 불러 STALE · NOT_PENDING 을 거른 뒤(토스를 부르기 전에),
 * TOSS_PENDING 일 때만 토스에 반영하고 다시 확인한다. 등록 · 수정은 시작 RPC 가 남은 할 일과 합쳐 정한다(myr_toss_todo_merge — 등록 우선) — 여기서는 할 일 값을 보지 않는다.
 * submittedAt — 운영이 본 제출 시각(그사이 다시 저장했으면 STALE · 0085). adminId — 확인한 운영자(스크립트는 null).
 */
export async function approveSettleInfo(sellerId: string, submittedAt: string, adminId: string | null = null, api: TossPayoutsApi = defaultApi): Promise<SettleApproveResult> {
	const verify = async () => {
		const { data, error } = await admin().rpc('myr_app_admin_settle_info_check', { p_seller: sellerId, p_decision: 'verify', p_submitted_at: submittedAt, p_note: null, p_admin: adminId });
		return error ? null : (data as { ok?: boolean; code?: string; status?: string; submitted_at?: string | null } | null);
	};
	let toss: 'none' | 'synced' = 'none';
	let c = await verify();
	if (c?.code === 'TOSS_PENDING') {
		const r = await linkTossSeller(sellerId, 'update', api);
		// 성공했을 때만 확인 완료 — 토스가 크리에이터 정보를 거절했으면(결과는 확정 · 카드 "정보 확인 필요") 운영이 "다시 입력 요청"을 보낸다
		if (!r.ok) return { ok: false, code: 'TOSS_FAILED', toss: { code: r.code } };
		toss = 'synced';
		c = await verify();
	}
	if (!c?.ok) return { ok: false, code: c?.code ?? 'DB_ERROR', submittedAt: c?.submitted_at ?? null };
	return { ok: true, status: c.status ?? 'verified', toss };
}
