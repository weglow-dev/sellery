// 타입 선언 — src/test/myr-products-plan.test.ts 가 .mjs 를 import 할 때 tsc 가 보는 모양. 구현은 myr-products-plan.mjs.
export const CATEGORIES: string[];
export const STATUSES: string[];
export const CODE_RE: RegExp;
export function normHandle(h: unknown): string;

export type SeedProduct = Record<string, unknown>;
export type Detail = {
  story_title: string;
  story: string;
  ingredient_rows: { name: string; why: string; amount: string }[];
  howto_steps: { t: string; d: string }[];
  faq: { q: string; a: string }[];
};
export type ProductRow = Detail & {
  code: string;
  seller_id: string;
  category: string;
  name: string;
  unit: string;
  price: number;
  options: unknown[];
  tile: string | null;
  thumb_url: string | null;
  icon: string;
  form: string;
  pack: string;
  flavor: string;
  tag: string;
  chips: string[];
  ingredients: string[];
  note: string;
  howto: string;
  stock: number;
  status: string;
  seller_margin_rate: number | null;
};
export function withDetail(p: SeedProduct): Detail;
export function validateProduct(p: unknown): string[];
export function toRow(p: SeedProduct, sellerId: string, status: string): ProductRow;
