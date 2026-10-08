<script lang="ts">
	/**
	 * 콘솔 실시간 갱신 — 화면 데이터를 **새로고침 없이** 다시 읽는다 (두 콘솔 공용 · 마크업 없음).
	 *   1) 폴링: 탭이 보이는 동안 `intervalMs` 마다, 탭이 다시 보이거나 창이 포커스를 얻을 때 `refresh()` — 앱 페이지가 `() => invalidate('campaign:<code>')` 처럼 넘긴다
	 *      (`$app/navigation` 은 패키지가 import 할 수 없다 — RefundModal 의 `onRefreshed` 와 같은 규칙). 서버 load 는 같은 키로 `event.depends()` 해 두면 그 load 만 다시 돈다.
	 *   2) 브로드캐스트(선택): `topic` 이 있고 레이아웃이 `setSiteEnv()` 로 Supabase 공개값을 넣었으면 Realtime 공개 채널을 구독해
	 *      `changed` 이벤트가 오는 즉시 같은 `refresh()` — 페이로드는 쓰지 않는다(본문은 서버가 게이트를 거쳐 다시 준다 · `@sellery/db/realtime` 헤더).
	 *      구독에 실패해도(Realtime 꺼짐 · 사설 채널만 허용 · 네트워크) 조용히 폴링만 남는다 — 콘솔 에러를 내지 않는다.
	 *   같은 라우트 안에서 `topic`/`refresh` 가 바뀌면(캠페인 a → b) 구독·타이머를 새로 건다. 언마운트 시 전부 정리(채널 제거 · 타이머 해제).
	 *   refresh 가 겹치지 않게 1개만 진행하고, 진행 중 들어온 신호는 끝난 뒤 한 번 더 돌린다(누락 없음 · 중복 없음).
	 */
	import { createBrowserSupabase } from '@sellery/db/browser';
	import { CAMPAIGN_CHANGED_EVENT, parseCampaignChangedPayload } from '@sellery/db/realtime';
	import { getSiteEnv } from '../env';

	let {
		refresh,
		topic = null,
		intervalMs = 10_000
	}: {
		/** 데이터를 다시 읽는 함수 — 보통 `() => invalidate(key)` */
		refresh: () => Promise<unknown>;
		/** Realtime 브로드캐스트 채널 — `campaignTopic(campaign.id)`. null 이면 폴링만 */
		topic?: string | null;
		/** 폴링 간격(ms) — 상세 10초 · 목록 20초 */
		intervalMs?: number;
	} = $props();

	const env = getSiteEnv();
	/** 포커스·가시성 이벤트는 이 간격보다 자주 돌리지 않는다 */
	const MIN_GAP_MS = 2_000;

	$effect(() => {
		const run = refresh;
		const t = topic;
		const ms = Math.max(2_000, intervalMs);
		let disposed = false;
		let inflight = false;
		let again = false;
		let lastAt = 0;

		async function tick() {
			if (disposed) return;
			if (inflight) {
				again = true;
				return;
			}
			inflight = true;
			try {
				do {
					again = false;
					lastAt = Date.now();
					await run();
				} while (again && !disposed);
			} catch {
				// 네비게이션 중단 등 — 다음 틱에 다시
			} finally {
				inflight = false;
			}
		}
		const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
		const soft = () => {
			if (visible() && Date.now() - lastAt >= MIN_GAP_MS) void tick();
		};

		const timer = setInterval(() => {
			if (visible()) void tick();
		}, ms);
		document.addEventListener('visibilitychange', soft);
		window.addEventListener('focus', soft);

		// 브로드캐스트 — 설정이 없거나 채널 이름이 없으면 건너뛴다
		let removeChannel: (() => void) | null = null;
		if (t && env.supabaseUrl && env.supabaseAnonKey) {
			try {
				const sb = createBrowserSupabase(env.supabaseUrl, env.supabaseAnonKey);
				const ch = sb
					.channel(t, { config: { broadcast: { self: false } } })
					.on('broadcast', { event: CAMPAIGN_CHANGED_EVENT }, (m) => {
						if (parseCampaignChangedPayload(m.payload)) void tick();
					})
					.subscribe((status) => {
						if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.info(`[live] ${t}: ${status} — 폴링만 사용`);
					});
				removeChannel = () => {
					void sb.removeChannel(ch);
				};
			} catch (e) {
				console.info('[live] realtime unavailable — 폴링만 사용', e instanceof Error ? e.message : e);
			}
		}

		return () => {
			disposed = true;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', soft);
			window.removeEventListener('focus', soft);
			removeChannel?.();
		};
	});
</script>
