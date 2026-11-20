import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { admin, hasAdmin } from '@sellery/myr-core/server/admin';
import { rejectOps } from '$lib/server/ops-auth';
import { approveSettleInfo } from '$lib/server/toss-sellers';

/**
 * 운영 API — 사업자 · 정산 정보 확인 완료(0124 · docs/myr.md 7-7 5번). 운영 콘솔이 생기기 전까지 `packages/db/scripts/myr-creators.mjs settle-verify` 가 부른다.
 *   POST { handle, at }   at = 운영이 본 제출 시각(settle-info 가 보여 준 값 · 그사이 다시 저장했으면 STALE)
 *     → 승인 때 토스에 반영할 할 일(myr_toss_todo)이 있으면 토스에 한 번 반영(토스 키가 있는 콘솔 서버라서 여기서) → 성공하면 확인 완료
 *       (다시 등록돼 본인인증 전이면 status 'toss' — 토스 인증 대기 · 크리에이터가 인증하면 확인 완료 · 0124 myr_settle_verify_status)
 *     → { ok, status, toss: 'none' | 'synced' } · 실패 { ok:false, code: TOSS_FAILED(toss.code) · TOSS_REJECTED(토스가 거절한 정보 — 할 일이 비워진 뒤 다시 눌렀을 때) · STALE · NOT_PENDING · NOT_FOUND … }
 *   토스 반영이 실패하면 확인 중 그대로(지급 보류) — 결과 불명 · 우리 쪽 거절이면 다시 누르고, 크리에이터 정보 거절이면 settle-reject(다시 입력 요청).
 * 인증은 `CRON_SECRET`(Bearer) — 초대 API(/api/ops/invites)와 같은 방식 · 콘솔이 생기면 관리자 세션으로 바꾼다.
 */
export const POST: RequestHandler = async ({ request }) => {
	const rejected = rejectOps(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const body = (await request.json().catch(() => null)) as { handle?: unknown; at?: unknown } | null;
	const raw = typeof body?.handle === 'string' ? body.handle.trim() : '';
	const handle = raw ? (raw.startsWith('@') ? raw : `@${raw}`) : '';
	const at = typeof body?.at === 'string' ? body.at.trim() : '';
	if (!handle || !at) return json({ ok: false, code: 'BAD_REQUEST', message: 'handle · at(제출 시각)이 필요해요' }, { status: 400 });
	const { data: s, error } = await admin().from('sellers').select('id').eq('handle', handle).maybeSingle();
	if (error) return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	if (!s) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const r = await approveSettleInfo(s.id, at);
	if (!r.ok && r.code === 'TOSS_FAILED') console.warn('[ops/settle] toss failed:', handle, r.toss?.code);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 409 });
};
