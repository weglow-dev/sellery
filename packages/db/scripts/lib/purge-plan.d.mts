// 타입 선언 — src/test/purge-plan.test.ts 가 .mjs 를 import 할 때 tsc 가 보는 모양. 구현은 purge-plan.mjs.
export const OWNER_EMAILS: string[];
export const MASTER_TABLES: string[];
export const PURGE_TABLES: string[];
export type PurgeArgs = {
  confirm: boolean;
  confirmRaw: string | null;
  keepEmails: string[];
  keepCodes: string[];
  resetSeq: boolean;
  skipStorage: boolean;
  json: boolean;
  help: boolean;
};
export function parseList(v: unknown): string[];
export function parseCodes(v: unknown): string[];
export function parseArgs(argv: string[]): PurgeArgs;
export function storagePrefixesFor(purged: { seller_ids?: string[]; brand_ids?: string[]; product_ids?: string[] } | null | undefined): { bucket: string; prefix: string }[];
export function hostLabel(url: unknown): string;
export function isLocalHost(url: unknown): boolean;
