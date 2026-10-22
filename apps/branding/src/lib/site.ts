/** 이 랜딩이 내세우는 서비스 이름 — 2026-10-22 개발팀 결정으로 "셀러리/셀러리 브랜딩" 대신 쓴다. 제목 · og:site_name · 슬랙 접수 태그가 이 값을 쓰고, 화면의 워드마크(Landing · Rail)와 OG 이미지는 같은 글자를 직접 적는다. */
export const BRAND_NAME = 'Make Your Recipe';

/** 브랜딩 랜딩의 공개 주소 — 광고·제안서·공유 링크가 가리키는 곳 (대표 결정 2026-10-19).
 *  이 앱이 보는 호스트는 리라이트 뒤라 sellery-branding.vercel.app 이므로 request.url 을 그대로 쓰면 안 되고,
 *  canonical · og:url · 메타 전환 API event_source_url 모두 이 값에 경로를 붙여 만든다(브라우저·서버 공용 — 비밀값 없음). */
export const OEM_PUBLIC_URL = 'https://sellery.life/influencer/oem';

/** 카카오톡·DM·페이스북 링크 미리보기 이미지 — static/og.png (1200×630). 디자이너 이미지로 교체할 때 같은 경로·크기로. */
export const OG_IMAGE_URL = `${OEM_PUBLIC_URL}/og.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** 요청 경로(`/influencer/oem` · `/influencer/oem/apply`)를 공개 주소로 — base 밖 경로나 빈 값이면 랜딩 주소 */
export function publicUrlOf(pathname: string): string {
	const base = new URL(OEM_PUBLIC_URL).pathname;
	const p = pathname.replace(/\/+$/, '');
	if (p === base) return OEM_PUBLIC_URL;
	if (p.startsWith(`${base}/`)) return `${OEM_PUBLIC_URL}${p.slice(base.length)}`;
	return OEM_PUBLIC_URL;
}
