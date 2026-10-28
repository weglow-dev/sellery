import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';

/**
 * 메타 전환 API(Conversions API) — 제조의뢰 접수(Lead)를 서버에서도 보낸다 (대표 요청 2026-10-19).
 *   브라우저 픽셀(src/lib/meta-pixel.ts)과 **같은 event_id** 를 써서 메타가 중복 제거한다(광고 차단기·iOS 로 픽셀이 막혀도 전환이 잡힌다).
 *   필요한 값: PUBLIC_META_PIXEL_ID · META_CAPI_ACCESS_TOKEN (둘 중 하나라도 없으면 조용히 건너뛴다) · META_CAPI_TEST_EVENT_CODE(선택 — 이벤트 관리자 "테스트 이벤트" 탭 코드).
 *   개인정보: 전화번호는 숫자만 남기고 국가코드(82)를 붙여 SHA-256 해시로만 보낸다. 활동명은 실명이 아니라 보내지 않는다.
 *   실패해도 접수 결과에는 영향을 주지 않는다(슬랙이 접수 경로) — 로그만 남긴다. 3초 타임아웃.
 */
import { OEM_PUBLIC_URL } from '$lib/site';

const GRAPH = 'https://graph.facebook.com/v21.0';

export type LeadEventInput = {
	eventId: string;
	phone: string;
	category?: string;
	/** 접수한 페이지의 공개 주소 — 홈(`/influencer/oem`)과 바로 가기(`/influencer/oem/apply`)가 다르다 · 기본 OEM_PUBLIC_URL */
	sourceUrl?: string;
	ip?: string | null;
	userAgent?: string | null;
	/** 픽셀 쿠키 _fbp · _fbc (sellery.life 도메인 — 리라이트가 그대로 넘긴다) */
	fbp?: string | null;
	fbc?: string | null;
};

/** Web Crypto — 이 앱은 @types/node 없이 쓰므로 node:crypto 대신 (Node 22 · 서버리스 모두 전역 crypto.subtle 지원) */
async function sha256(v: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
	return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** "010-1234-5678" → "821012345678" (메타 ph 형식: 숫자만 · 국가코드 포함) */
export function normalizePhoneForMeta(phone: string): string {
	const d = (phone ?? '').replace(/\D/g, '');
	if (!d) return '';
	if (d.startsWith('82')) return d;
	return d.startsWith('0') ? `82${d.slice(1)}` : `82${d}`;
}

export function isMetaCapiConfigured(): boolean {
	return Boolean(pub.PUBLIC_META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN);
}

export async function sendMetaLeadEvent(i: LeadEventInput): Promise<boolean> {
	const pixel = pub.PUBLIC_META_PIXEL_ID;
	const token = env.META_CAPI_ACCESS_TOKEN;
	if (!pixel || !token) return false;
	const user_data: Record<string, unknown> = {};
	const ph = normalizePhoneForMeta(i.phone);
	if (ph) user_data.ph = [await sha256(ph)];
	if (i.ip) user_data.client_ip_address = i.ip;
	if (i.userAgent) user_data.client_user_agent = i.userAgent;
	if (i.fbp) user_data.fbp = i.fbp;
	if (i.fbc) user_data.fbc = i.fbc;
	const body: Record<string, unknown> = {
		data: [
			{
				event_name: 'Lead',
				event_time: Math.floor(Date.now() / 1000),
				event_id: i.eventId,
				action_source: 'website',
				event_source_url: i.sourceUrl ?? OEM_PUBLIC_URL,
				user_data,
				custom_data: { content_name: 'oem_apply', ...(i.category ? { content_category: i.category } : {}) }
			}
		]
	};
	if (env.META_CAPI_TEST_EVENT_CODE) body.test_event_code = env.META_CAPI_TEST_EVENT_CODE;
	try {
		const res = await fetch(`${GRAPH}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(3_000)
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			console.error('[meta-capi] responded', res.status, text.slice(0, 300));
			return false;
		}
		return true;
	} catch (e) {
		console.error('[meta-capi] failed:', e instanceof Error ? e.message : e);
		return false;
	}
}
