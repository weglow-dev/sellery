/**
 * @sellery/ui/site — 고객 사이트(apps/shop) · 콘솔(apps/influencer, S5) 용 **props-only** 컴포넌트 (docs/monorepo-migration.md 결정 4 · §4.3 · PR-4).
 * 마크업·클래스명·문구는 web/src/components/*.tsx 와 동일 — css/site.css 가 그대로 먹는다.
 * 데이터는 전부 props(서버 load 결과) 또는 Svelte 컨텍스트(`setSiteEnv`) — `@sellery/core` 데모 상태(S · D_ · act)는 import 하지 않는다(scripts/check-boundaries.mjs (d)).
 * 데모 컴포넌트(`@sellery/ui` 루트 index.ts)와 이름이 겹치는 것은 `Site*` 접두로 내보낸다.
 */

// 셸
export { default as AppBar } from './AppBar.svelte';
export { default as SubNav } from './SubNav.svelte';
export type { NavUser } from './SubNav.svelte';
export { default as SiteFooter } from './SiteFooter.svelte';
export { default as Wordmark } from './Wordmark.svelte';
export { default as SignOutButton } from './SignOutButton.svelte';
export { default as ToastHost } from './ToastHost.svelte';
export { showToast, toasts, DURATION_MS as TOAST_DURATION_MS } from './toast.svelte';
export type { ToastItem } from './toast.svelte';
export { setSiteEnv, getSiteEnv } from './env';
export type { SiteEnv } from './env';

// 아이콘 (프로토타입 상수명 유지)
export { default as CEL } from './icons/Cel.svelte';
export { default as LOGO_ICON } from './icons/LogoIcon.svelte';
export { default as KAKAO_ICON } from './icons/KakaoIcon.svelte';
export { default as USER_ICON } from './icons/UserIcon.svelte';
export { default as PlatIcon } from './icons/PlatIcon.svelte';
export { default as GradeIcon } from './icons/GradeIcon.svelte';
export { PLATFORM_NAMES, isPlatform, GRADE_NAMES, isGradeName } from './icons/icons';
export type { Platform, GradeName } from './icons/icons';

// 공용 조각
export { default as Modal } from './Modal.svelte';
export { default as GradeBox } from './GradeBox.svelte';
export { default as StatusChip } from './StatusChip.svelte';
export type { ChipTone } from './StatusChip.svelte';
export { default as PlatformHandle } from './PlatformHandle.svelte';
export { default as ProductIcon } from './ProductIcon.svelte';
export { default as SellerAvatar } from './SellerAvatar.svelte';
export { default as Viewers } from './Viewers.svelte';
export { default as ViewersSum } from './ViewersSum.svelte';
export { default as Tilt } from './Tilt.svelte';
export { tilt } from './tilt';
export { NOTIFY_TOAST, CS_TYPES, VERIFY_LOAD_FAIL } from './constants';

// 인증 · 카드 · 판매 페이지
export { default as SiteVerifyModal } from './VerifyModal.svelte';
export { default as VerifyLauncher } from './VerifyLauncher.svelte';
export { default as TrustBand } from './TrustBand.svelte';
export { default as CampaignCard } from './CampaignCard.svelte';
export { default as SellerInfoCard } from './SellerInfoCard.svelte';
export { default as ShippingPolicyCard } from './ShippingPolicyCard.svelte';
export { default as StoreView } from './store/StoreView.svelte';
export { default as BuyCta } from './store/BuyCta.svelte';
export { checkoutUrl } from './store/BuyCta.svelte';
export { default as OptionPicker } from './store/OptionPicker.svelte';
export { default as QtyStepper } from './store/QtyStepper.svelte';
export { QTY_MIN, QTY_MAX, clampQty } from './store/QtyStepper.svelte';

// 법적 고지 · 문의
export { default as LegalDoc } from './LegalDoc.svelte';
export { inlineParts, fmtEffective } from './legal/inline';
export type { InlinePart } from './legal/inline';
export { default as SiteCsModal } from './CsModal.svelte';
export { default as CsModalButton } from './CsModalButton.svelte';
