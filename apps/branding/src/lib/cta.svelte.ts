/** 모든 CTA 버튼(헤더·히어로·마지막 밴드)이 공유하는 토스트 상태.
 *  제조의뢰 폼이 생기면 startApply() 안을 goto('/apply') 로 교체하고 이 모듈은 지운다. */
let toastShown = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

export const cta = {
	get toastShown() {
		return toastShown;
	}
};

export function startApply() {
	toastShown = true;
	clearTimeout(timer);
	timer = setTimeout(() => (toastShown = false), 2800);
}
