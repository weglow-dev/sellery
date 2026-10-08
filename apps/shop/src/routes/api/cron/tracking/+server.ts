import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { createAdminClient, runTrackingSweep } from '$lib/server/db';
import { rejectCron } from '$lib/server/cron';
import { sweettrackerApiKey } from '$lib/server/env';

/**
 * GET|POST /api/cron/tracking — 택배 자동 추적 (0049 · 스마트택배 · docs/deploy.md §5.8 · §8.2).
 *
 * 인증: `Authorization: Bearer ${CRON_SECRET}`(Vercel Cron 규약) 또는 `x-cron-secret` — campaign-tick 과 같은 `rejectCron`. 미설정이면 503.
 * 스케줄: `apps/shop/vercel.json` crons — 매시 20분(UTC). 매시 돌지만 **소포당 간격은 DB `app_tracking_due` 가 판정**
 *   (배송 중 3시간 · 택배사 미등록 송장 6시간 · 발송 14일 경과 TIMEOUT) — 월 5,000회 요금제를 다른 서비스와 나눠 쓴다.
 * 동작: `runTrackingSweep` — 샘플(SAMPLE_SHIPPED) 먼저, 고객 주문(PAID + 송장 + 미완료) 순으로 최대 `limit` 건 조회(동시 5) →
 *   `app_tracking_record`: 스냅샷 기록 · 배송 완료면 샘플 SAMPLE_SHIPPED → TESTING(actor system · campaign_events sample_received{auto:true})
 *   · 주문 `delivered_at`. 멱등(간격 안에서는 빈 목록 · 이미 전이된 캠페인은 already). 메일은 보내지 않는다(결정 2026-10-08 — 추후).
 * `SWEETTRACKER_API_KEY` 가 없으면 호출 없이 { skipped:'NO_KEY' } 200.
 * 응답 { ok, skipped?, dryRun, timedOut, due, checked, delivered, transitioned[], notFound, errors, usage{used,remaining,limit} } — items 는 로그에만.
 * 쿼리 `?limit=N`(1~200 · 기본 50) · `?dry=1`(조회만 — API 는 호출한다).
 */
export const config: Config = { maxDuration: 60 };

async function run(request: Request, url: URL): Promise<Response> {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	const limitRaw = Number(url.searchParams.get('limit') ?? '');
	const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(Math.trunc(limitRaw), 200) : 50;
	const dryRun = url.searchParams.get('dry') === '1';
	try {
		const r = await runTrackingSweep(createAdminClient(), { apiKey: sweettrackerApiKey(), limit, dryRun });
		const { items, ...summary } = r;
		for (const it of items) {
			if (it.transitioned) console.log(`[tracking] ${it.code} 샘플 배송 완료 → TESTING (${it.courier} ${it.tracking_no})`);
			else if (it.status === 'ERROR') console.warn(`[tracking] ${it.kind} ${it.code} 조회 실패: ${it.error ?? '-'}`);
		}
		if (r.usage?.remaining !== null && r.usage?.remaining !== undefined && r.usage.remaining < 500) console.warn(`[tracking] 스마트택배 남은 호출량 ${r.usage.remaining} — 요금제 확인`);
		return json(summary);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[tracking]', message);
		return json({ ok: false, code: 'DB_ERROR', message }, { status: 500 });
	}
}

export const GET: RequestHandler = ({ request, url }) => run(request, url);
export const POST: RequestHandler = ({ request, url }) => run(request, url);
