/**
 * 샘플 승인 · 거절 · 발송 form action 공통 — `/requests`(행에서 바로) 와 `/campaigns/[code]`(액션 패널) 가 같은 코드를 쓴다
 * (docs/brand-console-plan.md §5 `/brand/requests` "행에서 바로 승인/거절(상세와 같은 액션)" · §6 2단계 (c)(d)(f)).
 *   runSampleAction(event, kind, code, next) → { ok:true, already, status } | { ok:false, message, field?, values }
 * 순서: requireBrand → rateLimit → 폼 검증(parseShipInput · parseRejectInput, 순수) → RPC(`approveSample` · `rejectSample` · `shipSample`) → 문구(sampleActionFailMessage).
 * NOT_FOUND(남의 캠페인 · 없는 코드)는 호출자가 404 로 — 소유자 불일치를 구분하지 않는다(§6 (g)).
 */
import { redirect, type RequestEvent } from '@sveltejs/kit';
import { parseRejectInput, parseShipInput, sampleActionFailMessage, type ShipField } from '@sellery/db/brand/campaign-rules';
import { RATE_LIMIT_MESSAGE, approveSample, rateLimit, rejectSample, requireBrand, shipSample } from './brand';

export type SampleActionKind = 'approve' | 'reject' | 'ship';

export type SampleActionOutcome =
	| { ok: true; kind: SampleActionKind; already: boolean; status: string }
	| { ok: false; kind: SampleActionKind; notFound: boolean; message: string; field: ShipField | null; values: Record<string, string> };

export async function runSampleAction(event: RequestEvent, kind: SampleActionKind, next: string): Promise<SampleActionOutcome & { code: string }> {
	const r = await requireBrand(event, { next });
	if (!r.ok) redirect(303, r.location);
	const fd = await event.request.formData();
	const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
	const code = (event.params.code ?? values.code ?? '').trim();
	const bad = (message: string, field: ShipField | null = null, notFound = false) => ({ ok: false as const, kind, code, notFound, message, field, values });

	if (!rateLimit(`sample-${kind}:${r.ctx.user.id}`)) return bad(RATE_LIMIT_MESSAGE);

	let res;
	if (kind === 'approve') {
		res = await approveSample(r.ctx.brand.id, code);
	} else if (kind === 'reject') {
		res = await rejectSample(r.ctx.brand.id, code, parseRejectInput(fd).reason);
	} else {
		const parsed = parseShipInput(fd);
		if (!parsed.ok) return bad(parsed.message, parsed.field);
		res = await shipSample(r.ctx.brand.id, code, parsed.courier, parsed.trackingNo);
	}
	if (!res.ok) {
		const field: ShipField | null = res.code === 'BAD_COURIER' ? 'courier' : res.code === 'BAD_TRACKING' ? 'tracking_no' : null;
		return bad(sampleActionFailMessage(res), field, res.code === 'NOT_FOUND');
	}
	return { ok: true, kind, code, already: res.already, status: res.status };
}
