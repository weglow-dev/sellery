/**
 * 토스 셀러 등록 연결(서버 전용 · 0124 · docs/myr.md 7-7 5번) — 정보 저장 뒤 등록 · 수정 · 다시 등록, 상태 다시 읽기(웹훅 · [인증을 마쳤어요]).
 * 판정은 DB(백엔드 원칙 1): 할 일 = 저장 응답 toss_action(0121) · 최종 동작 · 다시 등록 막기 · refSellerId = myr_app_seller_toss_begin ·
 *   카드 상태 · 보류 이유 · 지급 건 다시 계산 = 0121 · 0122(상태를 적으면 트리거가 돈다). 여기서는 토스를 부르고 결과를 그 함수들에 적는다.
 * 시범운영(2026-11-19): 모든 환경에서 tpeerkeamf5 테스트 키로 실제 호출 — 테스트 환경은 법인 셀러만 받으므로 개인사업자는 토스가 거절할 수 있다.
 * 등록 응답을 못 받으면(네트워크 · 5xx) 상태를 비워 두고(카드 "등록 전") — refSellerId 를 먼저 적어 두었으니 웹훅 seller.changed 가 이 크리에이터를 찾는다.
 */
import { settleInfoFromJson, type BizKind, type SettleInfo } from '../settle-info';
import { buildTossSellerBody, tossBuildErrorOf, tossSellerErrorOf, type TossSellerError } from '../toss-payout-rules';
import { createTossPayouts, isUncertainPayout, type TossPayoutsApi } from '../toss-payouts-client';
import { admin } from './admin.server';
import { myrConfig } from './config.server';

export { hasTossPayouts } from './toss-payouts.server';

const defaultApi = createTossPayouts({ keys: () => ({ secretKey: myrConfig().tossPayoutSecretKey, securityKey: myrConfig().tossPayoutSecurityKey }) });

export type TossLinkResult = { ok: true; info: SettleInfo } | { ok: false; code: string; info: SettleInfo | null };

type Begin = {
	ok: boolean;
	code?: string;
	action?: 'register' | 'update';
	ref?: string | null;
	toss_id?: string | null;
	old_toss_id?: string | null;
	input?: { company: string | null; ceo: string | null; biz_no: string | null; biz_kind: BizKind | null; email: string | null; phone: string | null; bank: { bank: string; account: string; holder: string } | null };
};

async function record(sellerId: string, tossId: string | null, status: string | null, error: TossSellerError | null): Promise<SettleInfo | null> {
	const { data, error: e } = await admin().rpc('myr_app_seller_toss_record', { p_seller: sellerId, p_toss_id: tossId, p_status: status, p_error: error });
	const r = data as { ok?: boolean; code?: string; info?: unknown } | null;
	if (e || !r?.ok) {
		console.error('[toss-sellers] record failed:', e?.message ?? r?.code);
		return null;
	}
	return settleInfoFromJson(r.info);
}

/**
 * 저장 응답 toss_action 대로 토스 셀러를 등록 · 수정한다 — 저장은 이미 끝났다(실패해도 되돌리지 않는다).
 *   register  이전 셀러가 있으면 삭제(송금 중이면 DB 가 SENDING 으로 막는다) → 새 refSellerId 로 등록 → 상태 적기(개인사업자 본인인증 전 · 법인 인증 완료)
 *   update    셀러 수정(인증 유지) — 토스에 그 셀러가 없으면(404) 새로 등록
 * 실패 코드: NOT_CONFIGURED(키 없음 — 아무것도 적지 않는다) · SENDING · TOSS_DELETE · UNCERTAIN · TOSS:<code>(우리 쪽 문제 — 카드에 적지 않음) ·
 *   PAYLOAD_<code> · <토스 코드>(크리에이터가 고칠 정보 — 카드 "정보 확인 필요")
 */
export async function linkTossSeller(sellerId: string, action: 'register' | 'update', api: TossPayoutsApi = defaultApi): Promise<TossLinkResult> {
	const cfg = myrConfig();
	if (api === defaultApi && !(cfg.tossPayoutSecretKey && cfg.tossPayoutSecurityKey)) return { ok: false, code: 'NOT_CONFIGURED', info: null };
	const { data, error } = await admin().rpc('myr_app_seller_toss_begin', { p_seller: sellerId, p_action: action });
	const b = data as Begin | null;
	if (error || !b?.ok || !b.input || !b.action) {
		if (error) console.error('[toss-sellers] begin failed:', error.message);
		return { ok: false, code: b?.code ?? 'DB_ERROR', info: null };
	}

	// 다시 등록 — 이전 셀러 삭제(없으면 404 · 그대로 진행)
	if (b.action === 'register' && b.old_toss_id) {
		const del = await api.deleteSeller(b.old_toss_id);
		if (!del.ok && del.status !== 404) {
			console.error('[toss-sellers] delete before re-register failed:', del.status, del.body.code, del.body.traceId ?? '');
			return { ok: false, code: isUncertainPayout(del) ? 'UNCERTAIN' : 'TOSS_DELETE', info: null };
		}
	}

	const i = b.input;
	const built = buildTossSellerBody({ refSellerId: b.ref ?? '', bizKind: i.biz_kind, company: i.company, ceo: i.ceo, bizNo: i.biz_no, email: i.email, phone: i.phone, bank: i.bank });
	if (!built.ok) {
		const err = tossBuildErrorOf(built.code, built.field);
		// 수정이면 토스의 셀러는 그대로(id 유지 · 상태는 다음 조회까지 비운다) · 등록이면 셀러 없음
		const info = await record(sellerId, b.action === 'update' ? (b.toss_id ?? null) : null, null, err);
		return { ok: false, code: err.code, info };
	}

	const res = b.action === 'update' && b.toss_id ? await api.updateSeller(b.toss_id, built.body) : await api.registerSeller(built.body);
	if (!res.ok && b.action === 'update' && res.status === 404) return linkTossSeller(sellerId, 'register', api); // 토스에 없는 셀러(테스트 상점 초기화 등) → 새로 등록

	if (!res.ok) {
		if (isUncertainPayout(res)) {
			console.error('[toss-sellers] uncertain:', res.status, res.body.code, res.body.traceId ?? '');
			// 등록이면 이전 셀러는 지웠고 새 셀러는 모른다 — 비워 두고 웹훅(refSellerId)을 기다린다 · 수정이면 그대로
			const info = b.action === 'register' ? await record(sellerId, null, null, null) : null;
			return { ok: false, code: 'UNCERTAIN', info };
		}
		const err = tossSellerErrorOf(res.status, res.body);
		if (!err) {
			console.error('[toss-sellers] toss refused (not creator info):', res.status, res.body.code, res.body.traceId ?? '');
			const info = b.action === 'register' ? await record(sellerId, null, null, null) : null;
			return { ok: false, code: `TOSS:${res.body.code}`, info };
		}
		const info = await record(sellerId, b.action === 'update' ? (b.toss_id ?? null) : null, null, err);
		return { ok: false, code: err.code, info };
	}
	const info = await record(sellerId, res.body.id, res.body.status, null);
	return info ? { ok: true, info } : { ok: false, code: 'DB_ERROR', info: null };
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
	const { data, error } = await admin().from('sellers').select('toss_seller_id, myr_toss_ref').eq('id', sellerId).maybeSingle();
	if (error || !data) return { ok: false, code: error ? 'DB_ERROR' : 'NOT_FOUND', info: null };
	if (!data.toss_seller_id) return { ok: false, code: 'NOT_REGISTERED', info: null };
	const res = await api.getSeller(data.toss_seller_id);
	if (!res.ok) {
		console.error('[toss-sellers] refresh lookup failed:', res.status, res.body.code, res.body.traceId ?? '');
		return { ok: false, code: isUncertainPayout(res) ? 'UNCERTAIN' : `TOSS:${res.body.code}`, info: null };
	}
	const r = await applyStatus(res.body.id, data.myr_toss_ref ?? null, res.body.status);
	return r.ok && r.info ? { ok: true, info: r.info } : { ok: false, code: r.code ?? 'NOT_FOUND', info: null };
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
