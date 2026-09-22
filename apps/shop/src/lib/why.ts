/**
 * "셀러리가 다른 이유" 카드 6장 — 홈 `/` 6번 섹션과 `/about` 이 같은 문구를 쓴다 (프로토타입 vCustHome 원문).
 * 정책 숫자(환불 보호 일수)는 호출자가 넘긴다 — 홈은 campaign_card settings.clear_days, 소개는 DEFAULT_SETTINGS.clear_days.
 */
export type WhyCard = { icon: string; title: string; text: string };

export function whyCards(clearDays: number): WhyCard[] {
	return [
		{ icon: '🥬', title: '건강·웰니스만', text: '건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 한 분야를 깊게 검증합니다.' },
		{ icon: '✅', title: '검증된 상품', text: '브랜드 사업자 확인과 상품 검수(표시광고 기준)를 거친 상품만 노출됩니다. 판매가는 브랜드가 셀러리에 등록한 가격 그대로입니다.' },
		{ icon: '🛡️', title: '인증 인플루언서', text: '채널 소유 인증과 실제 판매 실적에 따른 7단계 등급. 모든 판매 페이지에 인증 마크가 표시됩니다.' },
		{
			icon: '🔒',
			title: `안전 결제 · ${clearDays}일 환불 보호`,
			text: `결제 대금은 셀러리가 보관하고, 판매 종료 후 ${clearDays}일의 환불 보호 기간이 지난 뒤 정산됩니다.`
		},
		{ icon: '🚚', title: '브랜드 직배송', text: '중간 유통 없이 브랜드가 직접 발송합니다. 운송장은 알림톡으로, 문의는 셀러리 고객센터로 받습니다.' },
		{ icon: '⏱️', title: '기간 한정 가격', text: '인플루언서 판매 기간에만 열리는 가격입니다. 같은 기간, 다른 곳에서 더 낮은 가격은 없습니다.' }
	];
}
