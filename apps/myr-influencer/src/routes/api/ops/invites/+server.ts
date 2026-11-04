import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isInviteListState, issueMessage, parseIssueInput } from '@sellery/myr-core/invite-rules';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { INVITER } from '$lib/auth-copy';
import { rejectOps } from '$lib/server/ops-auth';
import { issueInvite, listInvites, revokeInvite } from '$lib/server/invite';

/**
 * 운영 API — 크리에이터 초대(0070 · docs/myr.md §4.2.1 10번). 운영 콘솔(myr-admin "크리에이터 초대")이 생기기 전까지 `packages/db/scripts/myr-invites.mjs` 가 부른다.
 *   GET    ?state=pending|used|expired|revoked|requested&limit=100   → { ok, invites }
 *   POST   { email, by? }   발급(같은 이메일의 이전 링크 취소) + 초대 메일 → { ok, invite: { email, link, expiresAt, reissued, mailed, mailReason } }
 *          링크는 이 콘솔 주소(요청 오리진) 기준 — 운영 스크립트가 가리킨 콘솔로 링크가 만들어진다. 메일이 안 나가도 링크로 전달할 수 있다
 *   DELETE { email }        대기 중인 초대 취소 → { ok, revoked }
 * 인증은 `CRON_SECRET`(Bearer) — 샵 /api/ops/ship 과 같은 방식 · 콘솔이 생기면 관리자 세션으로 바꾸고 지운다.
 */
export const GET: RequestHandler = async ({ request, url }) => {
	const rejected = rejectOps(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: issueMessage('NO_SERVICE_KEY') }, { status: 503 });
	const state = url.searchParams.get('state');
	if (state && !isInviteListState(state)) return json({ ok: false, code: 'BAD_REQUEST', message: `state 는 pending · used · expired · revoked · requested 중 하나` }, { status: 400 });
	const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
	try {
		return json({ ok: true, invites: await listInvites(state, limit) });
	} catch (e) {
		console.error('[ops/invites] list failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR', message: issueMessage('DB_ERROR') }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const rejected = rejectOps(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: issueMessage('NO_SERVICE_KEY') }, { status: 503 });
	const parsed = parseIssueInput(await request.json().catch(() => null));
	if (!parsed.ok) return json({ ok: false, code: 'BAD_EMAIL', message: parsed.message }, { status: 400 });
	const r = await issueInvite({ email: parsed.email, invitedBy: parsed.by, consoleUrl: url.origin, inviter: INVITER });
	if (!r.ok) return json({ ok: false, code: r.code, message: issueMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : 409 });
	const { invite } = r;
	return json({
		ok: true,
		invite: { email: invite.email, link: invite.link, expiresAt: invite.expiresAt, reissued: invite.reissued, mailed: invite.mail.ok, mailReason: invite.mail.ok ? null : invite.mail.reason }
	});
};

export const DELETE: RequestHandler = async ({ request }) => {
	const rejected = rejectOps(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY', message: issueMessage('NO_SERVICE_KEY') }, { status: 503 });
	const parsed = parseIssueInput(await request.json().catch(() => null));
	if (!parsed.ok) return json({ ok: false, code: 'BAD_EMAIL', message: parsed.message }, { status: 400 });
	const r = await revokeInvite(parsed.email);
	if (!r.ok) return json({ ok: false, code: r.code, message: issueMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : 400 });
	return json({ ok: true, revoked: r.revoked });
};
