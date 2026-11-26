/**
 * 아웃리치 화면 문구 — 한국어 · 영어 (`/outreach` 목록 · `/outreach/[id]` 상세 · `meta/callback` 안내). 순수 모듈(vitest 대상).
 * 영어는 메타 앱 검수자가 읽기 위한 표시다(`$lib/lang`). 문구만 바꾼다 — 상태 값 · 적합 판정 · 수집 조건은 `@sellery/db/admin/outreach-rules` 가 정한다.
 *
 * 두 언어의 칸이 어긋나지 않게: `en` 은 `OutreachText`(= `ko` 의 모양) 타입이라 칸이 빠지면 check 가 실패한다.
 * 안내 키(`msg`) · 적합 조건 이름(`fitLabel`)처럼 타입으로 못 잡는 것은 `src/test/outreach-text.test.ts` 가 고정한다.
 */
import { META_MOCK_CATEGORY } from '@sellery/db/admin/outreach-providers';
import { OUTREACH_EVENT_LABEL, OUTREACH_FILTER, OUTREACH_STATUS_LABEL, OUTREACH_TREND_LABEL, type OutreachStatus, type OutreachTrend } from '@sellery/db/admin/outreach-rules';
import type { Lang } from './lang';

const F = OUTREACH_FILTER;
type Provider = 'meta' | 'modash' | null | undefined;
type UpsertCount = { inserted: number; updated: number; failed: number };

const ko = {
	list: {
		title: '아웃리치 — 셀러리 관리자',
		heading: '크리에이터 아웃리치',
		intro: `MYR 제조의뢰 제안 후보 — 기준: 팔로워 ${F.minFollowers / 10000}만↑ · 여성 ${F.femalePct}%↑ · 20~40대 ${F.age2040Pct}%↑ · 한국 ${F.krPct}%↑ · 반응 우상향/유지. DM 은 초안을 복사해 @makeyour.recipe 에서 직접 보내요.`,
		filterAria: '상태 필터',
		all: '전체',
		searchPlaceholder: '핸들 · 이름 · 카테고리 검색',
		search: '검색',
		addSummary: '+ 후보 추가',
		addLabel: '인스타 핸들',
		addLabelSmall: '(줄·쉼표로 여러 개 · @ · URL 가능)',
		addCategory: '카테고리 (선택 · 예: 다이어트)',
		add: '추가',
		csvSummary: 'CSV 가져오기',
		csvLabel: '헤더 포함 CSV/TSV',
		csvLabelSmall: '(핸들 · 팔로워 · 여성 · 20~40대 · 한국 · 추세 · 참여율 · 카테고리 · 이름 — 순서 자유, 없는 열은 생략)',
		csvImport: '가져오기',
		th: { creator: '크리에이터', followers: '팔로워', er: '참여율', trend: '추세', female: '여성', age: '20~40', kr: '한국', fit: '적합', status: '상태', owner: '담당', updated: '수정' },
		profile: '프로필 ↗',
		fitAll: '전부 충족',
		fitMissing: '미달',
		fitUnknown: '미확인',
		statusAria: '상태 변경',
		emptyFiltered: '조건에 맞는 후보가 없어요',
		empty: '아직 후보가 없어요 — [+ 후보 추가] 또는 [CSV 가져오기]로 시작하세요',
		footnote:
			'[조건으로 수집]은 메타 공식 크리에이터 마켓플레이스 API(무료 · 참여 계정의 성별·연령·국가 분포로 다시 거름) 또는 Modash(유료) 검색에 대표 조건을 보내 걸러진 계정만 받아옵니다 · 여성·연령·국가 비율은 공식 API 로 남의 계정을 조회할 수 없어 제공사 추정값이나 CSV · 운영자 판단으로 채웁니다 · 자동 DM 발송은 메타 약관·정보통신망법 위반이라 하지 않습니다 — 답장이 온 뒤의 자동 응답만 2단계에서 붙입니다.'
	},
	meta: {
		card: 'Instagram 연결',
		connected: '연결됨',
		page: 'Facebook 페이지',
		connectedOn: (date: string | null) => (date ? `${date} 연결` : '연결'),
		stale: '다시 연결 필요',
		staleBody: '— 저장된 토큰을 읽지 못했어요(앱 시크릿 변경). 다시 연결해주세요.',
		env: '서버 토큰 사용 중',
		envBody: '환경변수에 넣어 둔 토큰으로 수집해요. 아래 버튼으로 연결하면 그 연결이 우선합니다.',
		none: '연결 안 됨',
		connect: 'Facebook 로그인으로 Instagram 연결',
		reconnect: 'Facebook 로그인으로 다시 연결',
		connectTitle: 'Facebook 로그인 창이 열려요 — 페이지와 Instagram 비즈니스 계정을 선택하고 권한을 허용하면 연결됩니다',
		connectTitleOff: 'Vercel sellery-admin 에 META_APP_ID + META_APP_SECRET 을 넣으면 켜져요',
		disconnect: '연결 해제',
		disconnectConfirm: 'Instagram 연결을 해제할까요? 다시 연결하려면 Facebook 로그인이 필요해요.',
		help: 'Facebook 로그인 창에서 페이지와 Instagram 비즈니스 계정을 선택하고 권한(instagram_basic · instagram_creator_marketplace_discovery)을 허용하면, 그 계정으로 메타 크리에이터 마켓플레이스에서 후보를 조회합니다. 메시지 권한은 요청하지 않고, 토큰은 서버에 암호화해 저장해요.',
		helpOff: '연결 설정이 없어요 — Vercel sellery-admin 에 META_APP_ID + META_APP_SECRET 을 넣으면 버튼이 켜져요.'
	},
	collect: {
		button: '⚡ 조건으로 수집',
		pageN: (n: number) => ` (${n}페이지)`,
		title: (provider: Provider) =>
			`${provider === 'meta' ? '메타 공식 크리에이터 마켓플레이스' : 'Modash'} 검색 — 조건(팔로워·여성·20~40대·한국·반응)으로 걸러진 결과 1페이지를 가져와요. 누를 때마다 다음 페이지`,
		titleOff: '위의 [Instagram 연결] 로 메타 계정을 연결하거나(무료) MODASH_API_KEY 를 넣으면 켜져요',
		subMeta: '메타 공식 크리에이터 마켓플레이스 API',
		subModash: 'Modash Discovery API',
		subOff: '수집 설정 필요 (메타 공식 또는 Modash)'
	},
	/** `?msg=<key>` 안내 — 목록 page 와 `meta/callback` 이 같이 쓴다 */
	msg: {
		added: '후보를 추가했어요',
		imported: '가져오기 완료',
		status: '상태를 바꿨어요',
		collected: '조건으로 수집 완료',
		not_configured: '수집 설정이 없어요 — 위의 [Instagram 연결] 로 메타 계정을 연결하거나, Vercel sellery-admin 에 MODASH_API_KEY 를 넣으면 버튼이 켜져요',
		provider_error: '제공사 응답 오류',
		err: '처리하지 못했어요 — 입력을 확인해주세요',
		meta_connected: 'Instagram 계정을 연결했어요',
		meta_disconnected: 'Instagram 연결을 해제했어요',
		meta_denied: 'Facebook 로그인 창에서 취소했어요 — 연결하지 않았습니다',
		meta_state: '로그인 요청을 확인하지 못했어요(시간 초과 또는 다른 창에서 시작) — [Instagram 연결] 을 다시 눌러주세요',
		meta_not_configured: 'Instagram 연결 설정이 없어요 — Vercel sellery-admin 에 META_APP_ID + META_APP_SECRET 을 넣어주세요',
		meta_exchange: 'Facebook 로그인 처리에 실패했어요',
		meta_no_instagram: '선택한 페이지에 Instagram 비즈니스 계정이 연결돼 있지 않아요 — 로그인 창에서 페이지와 Instagram 계정을 함께 선택해주세요',
		meta_need_choice: 'Instagram 계정이 여러 개 선택됐어요 — 로그인 창에서 연결할 계정 하나만 선택해주세요',
		meta_token_invalid: '받은 토큰을 확인하지 못했어요 — 다시 시도해주세요',
		meta_missing_scope: '필수 권한이 빠졌어요 — 로그인 창에서 요청한 권한을 모두 허용해주세요',
		meta_save: '연결을 저장하지 못했어요'
	} as Record<string, string>,
	/** 액션 결과 요약(`?detail=`) · 입력 오류 */
	result: {
		added: (r: UpsertCount, bad: number) => `새 ${r.inserted} · 기존 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${bad ? ` · 형식 밖 ${bad}` : ''}`,
		imported: (r: UpsertCount, skipped: number) => `새 ${r.inserted} · 갱신 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${skipped ? ` · 핸들 없는 줄 ${skipped}` : ''}`,
		collected: (r: UpsertCount & { provider?: Provider; found: number; kept: number; last: boolean; mock: boolean }) =>
			`${r.provider === 'meta' ? '메타 공식' : 'Modash'} · 받음 ${r.found} · 조건 통과 ${r.kept} · 새 ${r.inserted} · 갱신 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${r.last ? ' · 마지막 페이지' : ''}${r.mock ? ' · 모의 데이터(앱 검수 전 · 연결 확인용)' : ''}`,
		noHandles: (bad: string[]) => `핸들을 찾지 못했어요${bad.length ? ` (형식 밖: ${bad.slice(0, 5).join(', ')})` : ''}`,
		noRows: '가져올 행이 없어요 — 첫 줄에 헤더(핸들 · 팔로워 · 여성 · 20~40대 · 한국 · 추세 · 참여율 · 카테고리)가 있어야 해요',
		badStatus: '상태 값이 올바르지 않아요',
		notFound: '후보를 찾을 수 없습니다'
	},
	detail: {
		titleSuffix: '아웃리치 · 셀러리 관리자',
		back: '← 목록',
		openProfile: '프로필 열기 ↗',
		metrics: '지표',
		metricsSub: (source: string, date: string | null) => `— 수집 ${source} · 갱신 ${date ?? '—'}`,
		name: '이름/활동명',
		category: '카테고리',
		categoryPh: '다이어트 · 이너뷰티 · 건강',
		followers: '팔로워',
		er: '참여율 (%)',
		trend: '1년 반응 추세',
		unknown: '미확인',
		owner: '담당자',
		ownerPh: '운영자 이메일',
		audience: '팔로워 구성',
		audienceSmall: '(분석사 추정 또는 운영자 판단 · %)',
		female: '여성',
		age: '20~40대',
		kr: '한국',
		source: '출처',
		sourcePh: 'Modash · 수동',
		dm: 'DM 초안',
		dmSmall: '(복사해서 @makeyour.recipe 에서 직접 보내요)',
		save: '저장',
		copyDm: 'DM 초안 복사',
		regen: '초안 다시 만들기 (이름·카테고리 반영)',
		fit: '적합 판정',
		fitSub: (met: number, total: number, score: number) => `— ${met}/${total} · 점수 ${score}`,
		fitOk: '조건 전부 충족',
		missing: '미달',
		unverified: '미확인',
		followersLine: (followers: string, trend: string) => `팔로워 ${followers} · 추세 ${trend}`,
		status: '상태',
		sentLine: (sent: string, replied: string) => `DM 보냄 ${sent} · 답장 ${replied}`,
		notes: '메모 · 이력',
		notePh: '통화 내용 · 다음 액션 · 특이사항',
		noteAdd: '메모 남기기',
		noEvents: '이력이 없어요',
		remove: '후보 삭제',
		removeConfirm: (handle: string) => `@${handle} 후보를 삭제할까요? 이력도 함께 지워집니다.`,
		msg: { saved: '저장했어요', status: '상태를 바꿨어요', note: '메모를 남겼어요', draft: 'DM 초안을 다시 만들었어요', err: '처리하지 못했어요' } as Record<string, string>
	},
	statusLabel: Object.fromEntries(Object.entries(OUTREACH_STATUS_LABEL).map(([k, v]) => [k, v.label])) as Record<OutreachStatus, string>,
	statusHint: Object.fromEntries(Object.entries(OUTREACH_STATUS_LABEL).map(([k, v]) => [k, v.hint])) as Record<OutreachStatus, string>,
	trendLabel: OUTREACH_TREND_LABEL as Record<OutreachTrend, string>,
	eventLabel: OUTREACH_EVENT_LABEL,
	/** `outreachFit` 이 돌려주는 조건 이름(한국어) → 표시 문구 */
	fitLabel: (label: string): string => label,
	/** 후보의 카테고리 표시 — 모의 데이터 표시만 옮긴다 */
	category: (category: string | null): string => category ?? '—'
};

export type OutreachText = typeof ko;

/** `outreachFit` 의 조건 이름 → 영어. 이름을 만드는 곳은 `outreach-rules.outreachFit` — 어긋나면 테스트가 실패한다 */
export const FIT_LABEL_EN: Record<string, string> = {
	[`팔로워 ${F.minFollowers / 10000}만↑`]: `Followers ${F.minFollowers / 1000}K+`,
	[`여성 ${F.femalePct}%↑`]: `Female ${F.femalePct}%+`,
	[`20~40대 ${F.age2040Pct}%↑`]: `Age 20–49 ${F.age2040Pct}%+`,
	[`한국 ${F.krPct}%↑`]: `Korea ${F.krPct}%+`,
	'반응 우상향/유지': 'Engagement trend up or flat'
};

const en: OutreachText = {
	list: {
		title: 'Outreach — Sellery Admin',
		heading: 'Creator Outreach',
		intro: `Candidate creators for a Make Your Recipe (MYR) product collaboration. Criteria: ${F.minFollowers / 1000}K+ followers · ${F.femalePct}%+ female · ${F.age2040Pct}%+ aged 20–49 · ${F.krPct}%+ in Korea · engagement trend up or flat. Our team copies the draft and sends each message by hand from @makeyour.recipe — this console never sends messages.`,
		filterAria: 'Status filter',
		all: 'All',
		searchPlaceholder: 'Search handle · name · category',
		search: 'Search',
		addSummary: '+ Add candidates',
		addLabel: 'Instagram handles',
		addLabelSmall: '(one per line or comma-separated · @handle or profile URL)',
		addCategory: 'Category (optional · e.g. Diet)',
		add: 'Add',
		csvSummary: 'Import CSV',
		csvLabel: 'CSV/TSV with a header row',
		csvLabelSmall: '(handle · followers · female · age 20–49 · Korea · trend · engagement rate · category · name — any order, missing columns are skipped)',
		csvImport: 'Import',
		th: { creator: 'Creator', followers: 'Followers', er: 'Eng. rate', trend: 'Trend', female: 'Female', age: '20–49', kr: 'Korea', fit: 'Fit', status: 'Status', owner: 'Owner', updated: 'Updated' },
		profile: 'Profile ↗',
		fitAll: 'All criteria met',
		fitMissing: 'Not met',
		fitUnknown: 'Unverified',
		statusAria: 'Change status',
		emptyFiltered: 'No candidates match this filter',
		empty: 'No candidates yet — start with [+ Add candidates] or [Import CSV]',
		footnote:
			'[Collect by criteria] sends our criteria to the official Meta Creator Marketplace API (or Modash, a paid provider) and saves only the creators that match · Audience gender, age and country shares come from the provider or from our own review · This console does not send direct messages automatically — every message is written and sent by a person.'
	},
	meta: {
		card: 'Instagram connection',
		connected: 'Connected',
		page: 'Facebook Page',
		connectedOn: (date) => (date ? `connected ${date}` : 'connected'),
		stale: 'Reconnect required',
		staleBody: '— the saved token could not be read (the app secret changed). Please connect again.',
		env: 'Using server token',
		envBody: 'Collecting with a token stored in the server environment. Connecting with the button below takes priority.',
		none: 'Not connected',
		connect: 'Connect Instagram with Facebook Login',
		reconnect: 'Reconnect with Facebook Login',
		connectTitle: 'Opens Facebook Login — choose your Page and Instagram business account and grant the requested permissions to connect',
		connectTitleOff: 'Set META_APP_ID and META_APP_SECRET on Vercel (sellery-admin) to enable this button',
		disconnect: 'Disconnect',
		disconnectConfirm: 'Disconnect Instagram? You will need to log in with Facebook again to reconnect.',
		help: 'In the Facebook Login dialog, choose your Page and Instagram business account and grant the permissions (instagram_basic · instagram_creator_marketplace_discovery). We then use that account to look up candidate creators in Meta Creator Marketplace. We do not request any messaging permission, and the access token is stored encrypted on our server.',
		helpOff: 'Connection is not configured — set META_APP_ID and META_APP_SECRET on Vercel (sellery-admin) to enable the button.'
	},
	collect: {
		button: '⚡ Collect by criteria',
		pageN: (n) => ` (page ${n})`,
		title: (provider) =>
			`Searches ${provider === 'meta' ? 'Meta Creator Marketplace' : 'Modash'} with our criteria (followers · female · age 20–49 · Korea · engagement) and saves one page of matching creators. Each click loads the next page`,
		titleOff: 'Connect a Meta account with [Instagram connection] above, or set MODASH_API_KEY, to enable',
		subMeta: 'Official Meta Creator Marketplace API',
		subModash: 'Modash Discovery API',
		subOff: 'Collection is not configured (Meta or Modash)'
	},
	msg: {
		added: 'Candidates added',
		imported: 'Import complete',
		status: 'Status updated',
		collected: 'Collected by criteria',
		not_configured: 'Collection is not configured — connect a Meta account with [Instagram connection] above, or set MODASH_API_KEY on Vercel (sellery-admin)',
		provider_error: 'The provider returned an error',
		err: 'Could not complete the request — please check the input',
		meta_connected: 'Instagram account connected',
		meta_disconnected: 'Instagram disconnected',
		meta_denied: 'Facebook Login was cancelled — nothing was connected',
		meta_state: 'Could not verify the login request (it timed out or was started in another window) — please click [Connect Instagram] again',
		meta_not_configured: 'Instagram connection is not configured — set META_APP_ID and META_APP_SECRET on Vercel (sellery-admin)',
		meta_exchange: 'Facebook Login could not be completed',
		meta_no_instagram: 'The selected Page has no Instagram business account — please select both the Page and its Instagram account in the login dialog',
		meta_need_choice: 'More than one Instagram account was selected — please select only the account to connect',
		meta_token_invalid: 'The received token could not be verified — please try again',
		meta_missing_scope: 'A required permission is missing — please grant all requested permissions in the login dialog',
		meta_save: 'The connection could not be saved'
	},
	result: {
		added: (r, bad) => `new ${r.inserted} · existing ${r.updated}${r.failed ? ` · failed ${r.failed}` : ''}${bad ? ` · invalid ${bad}` : ''}`,
		imported: (r, skipped) => `new ${r.inserted} · updated ${r.updated}${r.failed ? ` · failed ${r.failed}` : ''}${skipped ? ` · rows without a handle ${skipped}` : ''}`,
		collected: (r) =>
			`${r.provider === 'meta' ? 'Meta Creator Marketplace' : 'Modash'} · received ${r.found} · matched ${r.kept} · new ${r.inserted} · updated ${r.updated}${r.failed ? ` · failed ${r.failed}` : ''}${r.last ? ' · last page' : ''}${r.mock ? ' · mock data (before app review · connection check only)' : ''}`,
		noHandles: (bad) => `No handles found${bad.length ? ` (invalid: ${bad.slice(0, 5).join(', ')})` : ''}`,
		noRows: 'Nothing to import — the first line must be a header row (handle · followers · female · age 20–49 · Korea · trend · engagement rate · category)',
		badStatus: 'Invalid status value',
		notFound: 'Candidate not found'
	},
	detail: {
		titleSuffix: 'Outreach · Sellery Admin',
		back: '← Back to list',
		openProfile: 'Open profile ↗',
		metrics: 'Metrics',
		metricsSub: (source, date) => `— source ${source} · checked ${date ?? '—'}`,
		name: 'Name',
		category: 'Category',
		categoryPh: 'Diet · Inner beauty · Health',
		followers: 'Followers',
		er: 'Engagement rate (%)',
		trend: '12-month engagement trend',
		unknown: 'Unverified',
		owner: 'Owner',
		ownerPh: 'Team member email',
		audience: 'Audience',
		audienceSmall: '(provider estimate or our own review · %)',
		female: 'Female',
		age: 'Age 20–49',
		kr: 'Korea',
		source: 'Source',
		sourcePh: 'Modash · manual',
		dm: 'Message draft',
		dmSmall: '(copy it and send it by hand from @makeyour.recipe)',
		save: 'Save',
		copyDm: 'Copy message draft',
		regen: 'Regenerate draft (uses name and category)',
		fit: 'Fit check',
		fitSub: (met, total, score) => `— ${met}/${total} · score ${score}`,
		fitOk: 'All criteria met',
		missing: 'Not met',
		unverified: 'Unverified',
		followersLine: (followers, trend) => `Followers ${followers} · Trend ${trend}`,
		status: 'Status',
		sentLine: (sent, replied) => `Message sent ${sent} · Replied ${replied}`,
		notes: 'Notes · History',
		notePh: 'Call notes · next action · remarks',
		noteAdd: 'Add note',
		noEvents: 'No history yet',
		remove: 'Delete candidate',
		removeConfirm: (handle) => `Delete candidate @${handle}? Its history is deleted too.`,
		msg: { saved: 'Saved', status: 'Status updated', note: 'Note added', draft: 'Message draft regenerated', err: 'Could not complete the request' }
	},
	statusLabel: { candidate: 'Candidate', queued: 'Ready to send', sent: 'Message sent', replied: 'Replied', meeting: 'Meeting', joined: 'Joined', declined: 'Declined', excluded: 'Excluded' },
	statusHint: {
		candidate: 'Collected · not reviewed yet',
		queued: 'Fit confirmed · message draft ready',
		sent: 'Sent by a team member from @makeyour.recipe',
		replied: 'Conversation in progress',
		meeting: 'Meeting scheduled',
		joined: 'Collaboration request received / contract signed',
		declined: 'Not interested · do not contact again',
		excluded: 'Does not meet the criteria'
	},
	trendLabel: { up: 'Up', flat: 'Flat', down: 'Down' },
	eventLabel: { collected: 'Collected', status: 'Status change', note: 'Note', dm_sent: 'Message sent', reply: 'Reply', edit: 'Metrics edited' },
	fitLabel: (label) => FIT_LABEL_EN[label] ?? label,
	category: (category) => (category === META_MOCK_CATEGORY ? 'Mock data (before app review)' : (category ?? '—'))
};

const TEXT: Record<Lang, OutreachText> = { ko, en };

export function outreachText(lang: Lang): OutreachText {
	return TEXT[lang];
}

/** `?msg=<key>&detail=…` → 안내 한 줄(없는 키면 detail 만) */
export function outreachNotice(t: OutreachText, key: string, detail: string | null): string | null {
	if (!key) return null;
	return `${t.msg[key] ?? ''}${detail ? ` — ${detail}` : ''}`;
}
