/** 운영 콘솔 화면이 받는 값의 모양 — 기능 단계에서 RPC 응답이 이 모양으로 온다(docs/myr-admin-plan.md).
 *  화면은 여기 있는 이름 · 칩 · 안내 · 버튼 목록을 그대로 그리고, 상태를 다시 판정하지 않는다(CLAUDE.md 백엔드 원칙 1). */

/** 칩 색 — docs/myr-admin-screens.md §1-2 (민트 = 대기 · 진행 · 빨강 = 보류 · 막힘 · 주황 = 주의 · 회색 = 끝남) */
/** plain = 색 없음(보조 글자) — 안내 한 줄 · 할 일 칸에만 */
export type Tone = 'mint' | 'red' | 'orange' | 'grey' | 'lilac' | 'plain';
export interface Chip {
	label: string;
	tone: Tone;
}

export interface LogEntry {
	at: string;
	text: string;
	/** "자동" · "운영 김지수" · "크리에이터" */
	who: string;
}

// ───────── 크리에이터 ─────────

/** 사업자 · 정산 정보 상태(0085) — 미입력 · 확인 대기 · 확인 완료 · 다시 입력 요청 */
export type SettleStatus = 'none' | 'wait' | 'ok' | 'redo';

export interface CreatorRaw {
	id: string;
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	joinedAt: string;
	products: { live: number; total: number };
	active: boolean;
	/** 정지 기록(active=false 일 때) — 사유는 운영만 본다 · 크리에이터 콘솔은 정지 화면만 */
	stop?: { why: string; at: string; by: string } | null;
	phoneMasked: string;
	settle: SettleStatus;
	/** 사업자 · 정산 정보 — 가린 값과 [보기] 때 보여 줄 원문(목 · 원문 열람은 기록이 남는다) */
	biz: {
		firm: string;
		owner: string;
		email: string;
		bizNo: string;
		bizNoMasked: string;
		bank: string;
		account: string;
		accountMasked: string;
		holder: string;
		holderMasked: string;
		submittedAt: string;
	} | null;
	/** 확인 대기인데 이미 확인했던 정보를 크리에이터가 다시 낸 것(계좌 확인 필요 실패 뒤 계좌를 다시 입력 등) */
	resubmitNote: string | null;
	redoWhy: string | null;
	/** 토스 지급대행 셀러 상태(GET /v2/sellers/{id} · 웹훅 seller.changed) — 없으면 아직 등록 전(사업자 정보 확인 전). 크리에이터 화면 표시는 따로 */
	toss?: 'APPROVAL_REQUIRED' | 'PARTIALLY_APPROVED' | 'KYC_REQUIRED' | 'APPROVED';
	log: LogEntry[];
}

export interface CreatorView extends CreatorRaw {
	settleChip: Chip;
	/** 지급에 걸린 일 한 줄 — "계좌 확인 필요로 이체 실패 · 확인하면 다음 자동 이체(영업일 오후 1시)에 다시 보내요" */
	payNote: string | null;
	payNoteTone: Tone;
	/** [확인 완료] 모달 안내 — 확인하면 무엇이 풀리는지 */
	verifyNote: string;
	tabs: CreatorTab[];
	/** 정지면 빨간 "정지" 칩 · 서랍 정지 안내 */
	stopChip: Chip | null;
	stopNote: string | null;
	payouts: { id: string; month: string; amount: number; chips: Chip[]; holdText: string | null; paidAt: string | null }[];
}
export type CreatorTab = 'wait' | 'redo' | 'none' | 'toss' | 'ok' | 'stopped';

// ───────── 지급 ─────────

/** 지급 실패 종류 — §11 표 (결과 확인 필요 · 운영 조치 필요 · 계좌 확인 필요 · 재시도 대기) */
export type FailKind = 'check' | 'ops' | 'account' | 'retry';
/** 지급 보류 이유 — 운영 보류 · 사업자 · 정산 정보 확인 전 · 토스 본인인증 전 · 세금계산서 확인 전 */
export type HoldKind = 'ops' | 'settle' | 'toss' | 'tax';

export interface PayoutLine {
	product: string;
	/** 원래 달 — "10월분" · "9월분 · 보류 해제" */
	month: string;
	amount: number;
}

export interface PayoutAttempt {
	at: string;
	result: string;
	tone: Tone;
	/** 지급대행 응답 원문 — 운영만 본다 */
	raw: string | null;
}

export interface PayoutRaw {
	id: string;
	creatorId: string;
	month: string;
	amount: number;
	lines: PayoutLine[];
	account: string;
	paid: { at: string; by: string; manual: boolean } | null;
	/** 송금 중 — 은행 답이 없으면 noReply(웹훅을 기다리며 매시간 자동 확인 · 기다린 시간 · 다음 확인 시각) */
	sending: { at: string; noReply?: { waited: string; nextCheck: string } } | null;
	/** 결과 확인 필요면 check(처음 보낸 시각) — at 은 운영에게 넘어온 시각(보낸 지 24시간) */
	fail: { kind: FailKind; why: string; at: string; check?: { sentAt: string } } | null;
	opsHold: { memo: string; by: string } | null;
	tries: number;
	attempts: PayoutAttempt[];
	log: LogEntry[];
	memo: string | null;
}

export type PayoutTab = 'fail' | 'hold' | 'ready' | 'sending' | 'paid' | 'none';
export type PayoutAction = 'resend' | 'openCreator' | 'openTax' | 'hold' | 'release' | 'cancelPaid' | 'record';

export interface PayoutView extends PayoutRaw {
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	/** 서버가 정한 탭 — 보류와 실패가 겹치면 둘 다 */
	tabs: PayoutTab[];
	failKind: FailKind | null;
	holdKinds: HoldKind[];
	/** 상태 칩(용어집 §1-3 운영 이름) — 겹치면 둘 */
	chips: Chip[];
	/** 걸린 보류 이유 전부(운영 보류 → 사업자 정보 → 세금계산서 순) */
	holdText: string | null;
	/** 줄 아래 안내 한 줄 */
	note: string | null;
	noteTone: Tone;
	nextTry: string | null;
	actions: PayoutAction[];
	/** 운영 보류 해제 뒤에도 남는 이유 — [보류 해제] 안내 */
	releaseLeft: string | null;
	taxId: string | null;
	/** 담긴 줄 수 문구 — "3줄 · 지난 달 보류분 포함" */
	linesText: string;
}

// ───────── 세금계산서 ─────────

/** 세금계산서 상태(0104) — 제출 전 · 확인 중 · 확인 완료 · 다시 제출 필요 */
export type TaxStatus = 'none' | 'chk' | 'ok' | 'redo';

export interface TaxRaw {
	id: string;
	creatorId: string;
	payoutId: string;
	month: string;
	/** 합계 · 공급가액 · 세액 — 서버 값(myr_tax_invoice_amounts) */
	total: number;
	supply: number;
	vat: number;
	writeDate: string;
	due: string;
	status: TaxStatus;
	approvalNo: string | null;
	submittedAt: string | null;
	/** 기다린 시간 — 서버가 제출 시각으로 계산 */
	waited: string | null;
	overdue: boolean;
	/** 낸 합계가 지금 합계와 다르면 낸 값 */
	sentTotal: number | null;
	redoWhy: string | null;
	log: LogEntry[];
}

export type TaxAction = 'confirm' | 'redo';

export interface TaxView extends TaxRaw {
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	firm: string;
	bizNo: string;
	bizNoMasked: string;
	chip: Chip;
	payChips: Chip[];
	/** [수취 확인] 옆 안내 — "지금 확인하면 오늘 오후 1시 지급" · "확인해도 사업자 정보 확인 전이라 계속 보류돼요" */
	confirmNote: string | null;
	confirmNoteTone: Tone;
	/** 확인이 거절될 이유(낸 뒤 합계가 바뀜) */
	blocked: string | null;
	actions: TaxAction[];
}

// ───────── 홈 · 메뉴 ─────────

export interface NavBadge {
	n: number;
	/** 급한 건이 하나라도 있으면 빨강, 기다리기만 하면 되는 건 회색 */
	hot: boolean;
}

/** 홈 "오늘 처리할 일" 칩 — 빨강(급함 · 급한 일 수에 들어감) · 주황 숫자(처리할 일) · 회색(기다리기만 하면 됨) */
export interface HomeChip {
	label: string;
	n: number;
	tone: 'red' | 'orange' | 'grey';
	href: string;
}

/** 홈 "오늘 처리할 일" 한 줄 = 메뉴 하나(시안 순서 고정 · 정렬하지 않는다) — 타일 색은 칩 중 가장 급한 색 */
export interface HomeRow {
	key: string;
	name: string;
	icon: string;
	href: string;
	tone: 'red' | 'orange' | 'grey';
	chips: HomeChip[];
}

/** 홈 "정산 일정" 한 단계 — 큰 숫자 · 분모 · 진행 막대(%) · 아래 한 줄(색은 tone) */
export interface HomeStep {
	no: string;
	title: string;
	when: string;
	val: string;
	of: string;
	pct: number;
	desc: string;
	tone: 'red' | 'orange' | 'plain';
	href: string;
	/** 단계 상태 — done 끝남(✓ 민트) · now 진행 중(주황 동그라미 + pill) · wait 아직(흐리게) */
	state: 'done' | 'now' | 'wait';
	pill: string | null;
}

/** 정산 일정 회차 — cur 지금 회차(10월분) · next 다음 회차(11월분 · 확정 전) */
export interface HomeCycle {
	key: 'cur' | 'next';
	label: string;
	steps: HomeStep[];
}

// ───────── 상품(§4) ─────────

/** 상품 상태 — draft 임시저장 · review 신규 심사 · live 판매 중 · paused 일시중지 · rejected 반려 · ended 판매 종료(0071) */
export type ProductStatus = 'draft' | 'review' | 'live' | 'paused' | 'rejected' | 'ended';
/** 샵 상세 섹션 번호 — 1 기본 정보(구매 패널) · 2 레시피 노트 · 3 왜 만들었나요 · 4 성분 · 5 섭취법 · 6 제품 정보 · 7 FAQ · 0 전체(의견 대상) */
export type SecNo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 섹션 안 한 줄 — h 소제목(성분 이름 · 질문 등 · 없으면 '') · t 내용 */
export interface SecItem {
	h: string;
	t: string;
}
export interface ProductRaw {
	id: string;
	code: string;
	creatorId: string;
	name: string;
	category: string;
	price: number;
	unit: string;
	/** 사진 자리 — 타일 그라데이션 키 · 그림 키(UI 단계) */
	tile: string;
	icon: string;
	/** 사진이 여러 장일 때 [타일, 그림] — 첫 장이 대표 사진(없으면 tile · icon 한 장) */
	photos?: [string, string][];
	status: ProductStatus;
	stock: number | null;
	/** 상태 바뀐 뒤 지난 날 — 심사 탭은 기다린 날(오래 기다린 순) · 나머지는 최근 수정순 */
	days: number;
	/** 심사 요청 시각(신규 심사) */
	submittedAt: string | null;
	/** 샵 상세 미리보기(신규 심사) — 섹션 2~7 · 비면 샵에서 숨김 */
	content: [SecNo, SecItem[]][] | null;
	/** 이전 반려 이력 한 줄씩 */
	rejects: string[];
	/** 반려 때 보낸 의견 [섹션, 문장] */
	sent: [SecNo, string][] | null;
	/** 열린 수정본(판매 중 상품의 수정 심사) — 바뀐 섹션만 [섹션, 지금 샵, 수정본] */
	rev: { at: string; days: number; diff: [SecNo, SecItem[], SecItem[]][]; history: string[] } | null;
	/** 제조 원장 요약(§10-1) — 없으면 null(정산 보류) */
	ledger: LedgerRaw | null;
	log: LogEntry[];
}
/** 반려 의견 한 줄 — 섹션 · 문장(300자) */
/** 제조 원장(§10-1 · 0103) — 차수마다 제조금액 · 보증금(25%) 입금 확인일 · 환급 · 메모 · 입력자 · 무효, 상계 이력(정산월마다 정산금에서 상계한 금액) */
export interface LedgerRound {
	n: number;
	amount: number;
	depositAt: string | null;
	refunded: boolean;
	memo: string;
	by: string;
	void: boolean;
}
export interface LedgerRaw {
	rounds: LedgerRound[];
	offsets: { month: string; amount: number }[];
}

export interface ProductOpinion {
	sec: SecNo;
	text: string;
}
