import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiSeller } from '$lib/server/seller';
import { getSettleInfoOfUser } from '$lib/server/settle-info';
import { invitePreviewAllowed } from '$lib/server/invite-preview';
import { previewTossCardCheck, tossCardOf } from '$lib/server/toss-auth';
import { hasTossPayouts, linkTossSeller, refreshTossSeller } from '$lib/server/toss-sellers';
import { isTossCardState } from '$lib/toss-card';

const NOT_NOW = '지금은 확인하지 못했어요. 잠시 후 다시 눌러 주세요';

/**
 * 내 정보 "토스 본인인증" [인증을 마쳤어요] — POST { preview?, attempt } → { ok, toss }.
 *   preview(주소 ?toss= · 개발 서버 · Vercel Preview 만)가 있으면 미리보기 목 · 없으면 이 계정의 토스 셀러를 다시 조회해 상태를 적고(0124) 카드를 돌려준다.
 *   카드 상태 · 문구는 서버 값(0121 myr_toss_card_state · tossCardOf) — 확인했는데 상태가 그대로면 "아직 인증 전" 안내(notYet).
 * POST { action: 'register' } — [토스페이먼츠에 다시 등록하기](2026-11-20). 서버 값(toss_ask register = 사업자번호는 있는데 토스 셀러가 없음)을 다시 읽어 그때만 등록한다
 *   (화면이 보낸 값은 믿지 않는다 · 동의가 없으면 CONSENT_REQUIRED). 토스가 정보를 거절하면 그 카드(정보 확인 필요)를 돌려준다.
 * 지급대행 키가 없으면 NOT_READY. 크리에이터는 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const body = (await event.request.json().catch(() => null)) as { preview?: unknown; attempt?: unknown; action?: unknown } | null;
	const { user } = await event.locals.safeGetSession();
	const info = user ? await getSettleInfoOfUser(user.id) : null;
	if (invitePreviewAllowed() && isTossCardState(body?.preview)) return json({ ok: true, toss: previewTossCardCheck(body.preview, Number(body.attempt) || 1, info) });
	if (!hasTossPayouts()) return json({ ok: false, code: 'NOT_READY', message: '토스 본인인증은 아직 준비 중이에요' }, { status: 404 });
	if (!info) return json({ ok: false, code: 'NOT_FOUND', message: '크리에이터 정보를 찾지 못했어요' }, { status: 404 });

	if (body?.action === 'register') {
		if (info.tossAsk === 'waiting') return json({ ok: false, code: 'WAITING', message: '토스페이먼츠 응답을 기다리고 있어요. 잠시 뒤 다시 확인해 주세요', toss: tossCardOf(info.tossState ?? 'none', info) }, { status: 409 });
		if (info.tossAsk !== 'register') return json({ ok: false, code: 'NOT_NEEDED', message: '이미 토스페이먼츠에 등록돼 있어요', toss: tossCardOf(info.tossState ?? 'none', info) }, { status: 409 });
		if (!info.tossAgreed) return json({ ok: false, code: 'CONSENT_REQUIRED', message: '[수정하기]에서 토스페이먼츠 정보 제공에 동의해 주세요' }, { status: 409 });
		const l = await linkTossSeller(seller.id, 'register');
		// 토스가 크리에이터 정보를 거절했으면 l.info 가 그 상태(정보 확인 필요 · [수정하기]) — 카드로 돌려준다. 결과 불명 · 우리 쪽 거절이면 다시 누른다
		if (l.ok) return json({ ok: true, toss: tossCardOf(l.info.tossState ?? 'none', l.info) });
		// 문구는 서버 값으로 — 토스가 크리에이터 정보를 거절했을 때(toss_ask fix)만 "고쳐 주세요". 우리 쪽 거절 · 삭제 실패(abort 가 정보를 돌려준다)는 "잠시 후 다시"
		if (l.info) {
			const fix = l.info.tossAsk === 'fix';
			return json(
				{ ok: false, code: l.code, toss: tossCardOf(l.info.tossState ?? 'none', l.info), message: fix ? '토스페이먼츠가 정보를 확인하지 못했어요. 수정하기에서 고쳐 주세요' : '지금은 등록하지 못했어요. 잠시 후 다시 눌러 주세요' },
				{ status: fix ? 200 : 502 }
			);
		}
		console.warn('[my/toss] register failed:', l.code);
		// 결과 불명 · 우리 쪽 거절 — 지금 값을 다시 읽어 카드로(결과 불명이면 "응답을 기다리고 있어요" · 5분 동안 다시 등록 안 함)
		const now = user ? await getSettleInfoOfUser(user.id) : null;
		return json({ ok: false, code: l.code, message: '지금은 등록하지 못했어요. 잠시 후 다시 확인해 주세요', toss: now ? tossCardOf(now.tossState ?? 'none', now) : undefined }, { status: 502 });
	}

	const r = await refreshTossSeller(seller.id);
	if (!r.ok) return json({ ok: false, code: r.code, message: NOT_NOW }, { status: r.code === 'NOT_REGISTERED' ? 409 : 502 });
	return json({ ok: true, toss: tossCardOf(r.info.tossState ?? 'none', r.info, r.info.tossState === info.tossState) });
};
