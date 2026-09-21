/**
 * 일정 확정 · 반려 form action 공통 — `/requests`(행에서 바로) 와 `/campaigns/[code]`(액션 패널) 가 같은 코드를 쓴다
 * (docs/brand-console-plan.md §5 `/brand/campaigns/[code]` `?/confirmSchedule` `?/rejectSchedule` · §6 3단계 (a)(b)(c) · `sample-actions.ts` 의 3단계 판).
 *   runScheduleAction(event, kind, next) → { ok:true, already, status } | { ok:false, notFound, message }
 * 순서: requireBrand → rateLimit → 폼(parseRejectInput, 순수) → RPC(`confirmSchedule` · `rejectSchedule`) → 문구(scheduleActionFailMessage — STOCK_SHORT{left} · PERIOD_BLOCKED{by} · PERIOD_PAST).
 * 폼 필드 검증 실패가 없는 액션이라(사유는 선택) 실패는 전부 문구 하나 — 호출자는 `?err=` 로 돌린다. NOT_FOUND 는 404.
 */
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { parseRejectInput, scheduleActionFailMessage } from '@sellery/db/brand/campaign-rules';
import { RATE_LIMIT_MESSAGE, confirmSchedule, rateLimit, rejectSchedule, requireBrand } from './brand';

export type ScheduleActionKind = 'confirm' | 'reject';

export type ScheduleActionOutcome =
	| { ok: true; kind: ScheduleActionKind; code: string; already: boolean; status: string }
	| { ok: false; kind: ScheduleActionKind; code: string; notFound: boolean; message: string };

export async function runScheduleAction(event: RequestEvent, kind: ScheduleActionKind, next: string): Promise<ScheduleActionOutcome> {
	const r = await requireBrand(event, { next });
	if (!r.ok) redirect(303, r.location);
	const fd = await event.request.formData();
	const code = (event.params.code ?? (typeof fd.get('code') === 'string' ? (fd.get('code') as string) : '')).trim();
	const bad = (message: string, notFound = false) => ({ ok: false as const, kind, code, notFound, message });

	if (!rateLimit(`schedule-${kind}:${r.ctx.user.id}`)) return bad(RATE_LIMIT_MESSAGE);

	const res = kind === 'confirm' ? await confirmSchedule(r.ctx.brand.id, code) : await rejectSchedule(r.ctx.brand.id, code, parseRejectInput(fd).reason);
	if (!res.ok) return bad(scheduleActionFailMessage(res), res.code === 'NOT_FOUND');
	return { ok: true, kind, code, already: res.already, status: res.status };
}
