/* 카카오 로그인 콜백 — Vercel 서버리스 함수 (GET /api/auth/kakao?code=&state=)
   프론트(apps/shop)는 정적 SPA 라 토큰 교환을 못 하므로 여기서 한다. 환경변수 KAKAO_REST_KEY 가 설정되면 동작:
   1) POST https://kauth.kakao.com/oauth/token (grant_type=authorization_code, client_id, redirect_uri, code)
   2) GET  https://kapi.kakao.com/v2/user/me (Bearer) → id · nickname · email
   3) 세션 쿠키 발급 후 state(buy:<cid> | checkout) 에 맞는 /shop 경로로 리다이렉트
   키가 없으면 안내만 반환한다 (실 연동은 Supabase 세션과 함께 붙일 예정). */
export default async function handler(req, res) {
	const { code, state = '' } = req.query || {};
	res.setHeader('Content-Type', 'text/plain; charset=utf-8');
	if (!process.env.KAKAO_REST_KEY) {
		return res.status(501).send(code
			? `카카오 인가 코드 수신 (${String(code).slice(0, 8)}…). KAKAO_REST_KEY 가 설정되면 토큰을 교환하고 세션을 만듭니다. state=${state}`
			: '카카오 로그인 콜백 — /api/auth/kakao?code=…');
	}
	return res.status(501).send('KAKAO_REST_KEY 는 있지만 토큰 교환 로직이 아직 연결되지 않았습니다.');
}
