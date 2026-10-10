<script lang="ts">
	/**
	 * 스레드 "입력 중" 송수신 — 두 콘솔(`/campaigns/[code]`) 공용 · 마크업 없음 (대표 요청 2026-10-10).
	 *   보냄: 입력란 `oninput` → `typed()` — `typingTopic` 공개 채널로 `{sender, at}` 을 TYPING_EVERY_MS 마다 한 번만 브로드캐스트. 전송 완료 `sent()` → `{sender, stop:true}`.
	 *   받음: 상대(sender ≠ me) 신호가 오면 `active = true`, TYPING_TTL_MS 안에 다음 신호가 없거나 stop 이 오면 false — 페이지가 `bind:active` 로 받아 ThreadMessages 의 말풍선을 켠다.
	 *   순간 신호라 DB 에 남지 않고 새로고침하면 사라진다. 구독 실패(Realtime 꺼짐 · 키 없음 · 네트워크)는 조용히 아무 일도 하지 않는다 — LiveRefresh 와 같은 규칙.
	 *   `export function` 두 개는 페이지가 `bind:this` 로 부른다. 같은 라우트 안에서 topic 이 바뀌면(캠페인 a → b) 채널을 새로 건다.
	 */
	import { createBrowserSupabase, type BrowserSupabase } from '@sellery/db/browser';
	import { TYPING_EVENT, TYPING_EVERY_MS, TYPING_TTL_MS, parseTypingPayload, typingPayload, type ThreadSender } from '@sellery/db/realtime';
	import { getSiteEnv } from '../env';

	let {
		topic = null,
		me,
		active = $bindable(false)
	}: {
		/** `typingTopic(campaign.id)` — null 이면 아무것도 안 한다 */
		topic?: string | null;
		/** 내 쪽 — 내 신호는 무시하고 상대 신호만 켠다 */
		me: ThreadSender;
		/** 상대가 입력 중인가 — 페이지가 bind 해서 ThreadMessages 로 넘긴다 */
		active?: boolean;
	} = $props();

	const env = getSiteEnv();
	let ch: ReturnType<BrowserSupabase['channel']> | null = null;
	let ready = false;
	let lastSentAt = 0;
	let ttl: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const t = topic;
		const who = me;
		active = false;
		ready = false;
		ch = null;
		if (!t || !env.supabaseUrl || !env.supabaseAnonKey) return;
		try {
			const sb = createBrowserSupabase(env.supabaseUrl, env.supabaseAnonKey);
			const channel = sb
				.channel(t, { config: { broadcast: { self: false } } })
				.on('broadcast', { event: TYPING_EVENT }, (m) => {
					const p = parseTypingPayload(m.payload);
					if (!p || p.sender === who) return;
					if (ttl) clearTimeout(ttl);
					if (p.stop) {
						active = false;
						return;
					}
					active = true;
					ttl = setTimeout(() => {
						active = false;
					}, TYPING_TTL_MS);
				})
				.subscribe((status) => {
					ready = status === 'SUBSCRIBED';
				});
			ch = channel;
			return () => {
				ready = false;
				ch = null;
				if (ttl) clearTimeout(ttl);
				void sb.removeChannel(channel);
			};
		} catch {
			// Realtime 미설정 — 조용히
		}
	});

	function push(stop: boolean) {
		if (!ch || !ready) return;
		void ch.send({ type: 'broadcast', event: TYPING_EVENT, payload: typingPayload(me, stop) }).catch(() => {});
	}

	/** 입력란에 글자가 바뀔 때마다 — 2초에 한 번만 나간다 */
	export function typed() {
		const now = Date.now();
		if (now - lastSentAt < TYPING_EVERY_MS) return;
		lastSentAt = now;
		push(false);
	}

	/** 전송 완료 — 상대 화면의 말풍선을 즉시 끈다 */
	export function sent() {
		lastSentAt = 0;
		push(true);
	}
</script>
