/**
 * 아이콘 이름·판정 — web/src/components/icons.tsx 의 순수부 (docs/monorepo-migration.md §4.3 · PR-4).
 * SVG 는 같은 폴더의 .svelte 컴포넌트(Cel · LogoIcon · KakaoIcon · UserIcon · PlatIcon · GradeIcon).
 * 프로토타입 상수명(CEL · LOGO_ICON · KAKAO_ICON · USER_ICON)은 `site/index.ts` 가 컴포넌트 별칭으로 유지한다.
 */

export type Platform = "instagram" | "youtube" | "naver" | "tiktok";

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  naver: "네이버 블로그",
  tiktok: "틱톡",
};

export function isPlatform(p: string | null | undefined): p is Platform {
  return p === "instagram" || p === "youtube" || p === "naver" || p === "tiktok";
}

export const GRADE_NAMES = ["스타터", "브론즈", "실버", "골드", "플래티넘", "다이아", "블랙"] as const;
export type GradeName = (typeof GRADE_NAMES)[number];

export function isGradeName(g: string | null | undefined): g is GradeName {
  return (GRADE_NAMES as readonly string[]).includes(g ?? "");
}
