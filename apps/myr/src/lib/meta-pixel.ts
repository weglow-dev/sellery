import { env } from '$env/dynamic/public';

/**
 * 메타(페이스북) 픽셀 — 브랜딩 랜딩(sellery.life/influencer/oem) 전용 (대표 요청 2026-10-19).
 *   PUBLIC_META_PIXEL_ID 가 비어 있으면 아무것도 하지 않는다(로컬·CI). 값은 Vercel 프로젝트 myr(옛 sellery-branding) 환경변수.
 *   브라우저 이벤트: PageView(레이아웃 · 내비게이션마다) · ViewContent(퍼널 첫 진입) · Lead(제조의뢰 접수 성공).
 *   Lead 는 서버 전환 API(src/lib/server/meta-capi.ts)도 같은 event_id 로 보내서 메타가 중복 제거한다.
 */
export const PIXEL_ID: string = env.PUBLIC_META_PIXEL_ID ?? '';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string };
declare global {
	interface Window {
		fbq?: Fbq;
		_fbq?: Fbq;
	}
}

/** 공식 스니펫을 TS 로 옮긴 것 — 한 번만 로드하고 init 한다 */
export function loadPixel(): void {
	if (!PIXEL_ID || typeof window === 'undefined' || window.fbq) return;
	const n: Fbq = function (...args: unknown[]) {
		if (n.callMethod) n.callMethod(...args);
		else n.queue!.push(args);
	};
	n.push = n;
	n.loaded = true;
	n.version = '2.0';
	n.queue = [];
	window.fbq = n;
	if (!window._fbq) window._fbq = n;
	const s = document.createElement('script');
	s.async = true;
	s.src = 'https://connect.facebook.net/en_US/fbevents.js';
	document.head.appendChild(s);
	window.fbq('init', PIXEL_ID);
}

/** 표준 이벤트 — eventId 를 주면 서버 전환 API 와 중복 제거.
 *  먼저 loadPixel() — 레이아웃의 afterNavigate 보다 자식 컴포넌트의 $effect/onMount 가 먼저 돌기 때문에(/apply 는 첫 단계가 질문이라 바로 ViewContent 를 쏜다),
 *  여기서 스텁을 만들어 두지 않으면 window.fbq 가 없어 이벤트가 조용히 버려진다. 스텁은 큐라서 fbevents.js 가 로드된 뒤 순서대로 전송된다. */
export function track(event: string, params: Record<string, unknown> = {}, eventId?: string): void {
	if (!PIXEL_ID || typeof window === 'undefined') return;
	loadPixel();
	if (!window.fbq) return;
	if (eventId) window.fbq('track', event, params, { eventID: eventId });
	else window.fbq('track', event, params);
}

/** 브라우저·서버가 같은 값을 쓰는 이벤트 id */
export function newEventId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
