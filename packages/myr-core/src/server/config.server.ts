/**
 * 패키지 설정 주입 — 비밀은 각 앱의 `$lib/server/env.ts` 가 `$env` 에서 읽어 **모듈 로드 시 1회** 넘긴다(packages/db `configureDb` 와 같은 관례).
 * 패키지는 `$env` 도 `process.env` 도 읽지 않는다 — 그래야 샵 · 인플루언서 콘솔 · 운영 콘솔이 같은 코드를 쓴다.
 *
 *   configureMyrCore({ supabaseUrl: PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, tossSecretKey: env.TOSS_SECRET_KEY,
 *                      resendApiKey: env.RESEND_API_KEY, resendApiUrl: env.RESEND_API_URL, mailFrom: env.MAIL_FROM, shopUrl: pub.PUBLIC_SITE_URL });
 *
 * 값이 없어도 실패하지 않는다 — 실제로 필요한 호출 시점에만 throw(`admin()`) 하거나 CONFIG_ERROR(`tossCancel`) · 조용히 건너뛴다(메일).
 * 빌드·모듈 로드는 비밀 없이 통과해야 한다(CI 원칙).
 */
export type MyrCoreConfig = {
	/** PUBLIC_SUPABASE_URL */
	supabaseUrl?: string;
	/** SUPABASE_SERVICE_ROLE_KEY — service role(RLS 우회). 없으면 `admin()` 이 호출 시점에 throw */
	serviceKey?: string;
	/** TOSS_SECRET_KEY — 없으면 토스 호출이 CONFIG_ERROR */
	tossSecretKey?: string;
	/** RESEND_API_KEY — 없으면 메일 비활성(프로세스당 1회 안내) */
	resendApiKey?: string;
	/** RESEND_API_URL — 로컬 목 서버 검증용(기본 https://api.resend.com) */
	resendApiUrl?: string;
	/** MAIL_FROM — 발신자(기본 `MYR <noreply@sellery.life>`) */
	mailFrom?: string;
	/** 샵 주소(메일 링크 오리진) — 샵은 PUBLIC_SITE_URL, 콘솔은 샵 주소 환경변수. 형식이 어긋나면 기본값(`site.ts`) */
	shopUrl?: string;
	/** 이벗(EBUT_*) — 하나라도 비면 연동 꺼짐(`ebut.ts` ebutReady). 샵만 넣는다(이벗 호출은 샵 크론 한 곳 · 결정 12) */
	ebutId?: string;
	ebutCustCode?: string;
	ebutApiKey?: string;
	ebutOrdShop?: string;
	ebutSenderName?: string;
	ebutSenderPhone?: string;
	ebutSenderZipcode?: string;
	ebutSenderAddress?: string;
	/** 이벗이 쓰는 택배사 이름(선택 · 조회 링크용) */
	ebutCourier?: string;
	/** EBUT_API_URL — 로컬 목 서버 검증용(기본 이벗 OrderSheet v2 주소 · resendApiUrl 과 같은 용도) */
	ebutApiUrl?: string;
};

const KEYS = [
	'supabaseUrl',
	'serviceKey',
	'tossSecretKey',
	'resendApiKey',
	'resendApiUrl',
	'mailFrom',
	'shopUrl',
	'ebutId',
	'ebutCustCode',
	'ebutApiKey',
	'ebutOrdShop',
	'ebutSenderName',
	'ebutSenderPhone',
	'ebutSenderZipcode',
	'ebutSenderAddress',
	'ebutCourier',
	'ebutApiUrl'
] as const;
let config: MyrCoreConfig = {};

/** 부분 갱신 — 빈 문자열은 "없음" 으로 정규화한다 */
export function configureMyrCore(next: MyrCoreConfig): void {
	const clean: MyrCoreConfig = {};
	for (const k of KEYS) {
		const v = next[k];
		if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
		else if (k in next) clean[k] = undefined;
	}
	config = { ...config, ...clean };
}

export function myrConfig(): Readonly<MyrCoreConfig> {
	return config;
}
