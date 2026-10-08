// 타입 선언 — `src/test/toss-live-switch.test.ts` 가 .mjs 를 import 할 때 tsc(packages/db `npm run check`) 가 보는 모양. 구현은 toss-live-switch-plan.mjs.
export type SwitchMode = "live" | "rollback";
export type KeyMapEntry = { key: string; source: string; projects: string[]; type: "plain" | "encrypted"; prefix: string };
export type PlanItem = { project: string; key: string; source: string; type: "plain" | "encrypted"; target: string[]; value: string };
export type Plan = { mode: string; items: PlanItem[]; errors: string[] };
export type PlanSummaryRow = { project: string; key: string; source: string; type: string; target: string; value: string };
export type VercelEnv = { key: string; type?: string; target?: string[]; value?: string | null };

export const PROJECTS: string[];
export const KEY_MAP: Record<SwitchMode, KeyMapEntry[]>;
export const TARGET: string[];
export function parseDotenv(text: string): Record<string, string>;
export function prefixOk(value: unknown, prefix: string): boolean;
export function describeValue(value: unknown): string;
export function buildPlan(mode: string, env: Record<string, string | undefined> | null | undefined): Plan;
export function summarizePlan(plan: Plan): PlanSummaryRow[];
export function summarizeVercelEnvs(envs: VercelEnv[] | null | undefined): { key: string; type?: string; value: string }[];
