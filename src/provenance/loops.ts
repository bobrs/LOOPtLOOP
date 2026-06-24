import { hmacSha256Text } from "../utils/hash";

export const DEFAULT_PROVENANCE_CODE_STEP_SECONDS = 10;
export const SUPPORTED_PROVENANCE_CODE_STEP_SECONDS = [10, 30] as const;
export const DEFAULT_PROVENANCE_LOOP_TTL_SECONDS = 30 * 60;
export const DEFAULT_PROVENANCE_VERIFY_BASE_URL = "https://witnesskey.online/provenance/verify/";
export const PROVENANCE_WINDOW_HISTORY_LIMIT = 180;

export type ProvenanceLoopStatus = "active" | "expired" | "closed";

export interface ProvenanceLoopRow {
  id: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
  status: string;
  code_step_seconds: number;
  verify_url: string;
}

export interface ProvenanceCodeWindowRow {
  id: string;
  loop_id: string;
  code: string;
  window_start: string;
  window_end: string;
  created_at: string;
}

export interface ProvenanceCurrentWindow {
  code: string;
  window_start: string;
  window_end: string;
  seconds_remaining: number;
}

export function makeProvenanceLoopId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `LP-${hex}`;
}

export function buildProvenanceVerifyUrl(baseUrl: string, loopId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("loop_id", loopId);
  return url.toString();
}

export function resolveProvenanceLoopStatus(loop: ProvenanceLoopRow, nowMs = Date.now()): ProvenanceLoopStatus {
  if (loop.status === "closed" || loop.closed_at) {
    return "closed";
  }

  return new Date(loop.expires_at).getTime() <= nowMs ? "expired" : "active";
}

export async function buildCurrentProvenanceWindow(
  loop: Pick<ProvenanceLoopRow, "id" | "code_step_seconds">,
  secret: string,
  nowMs = Date.now()
): Promise<ProvenanceCurrentWindow> {
  const stepMs = loop.code_step_seconds * 1000;
  const windowStartMs = Math.floor(nowMs / stepMs) * stepMs;
  const windowEndMs = windowStartMs + stepMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const signature = await hmacSha256Text(secret, `${loop.id}:${windowStart}:${loop.code_step_seconds}`);

  return {
    code: formatProvenanceCode(signature),
    window_start: windowStart,
    window_end: new Date(windowEndMs).toISOString(),
    seconds_remaining: Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000))
  };
}

export function makeProvenanceWindowId(loopId: string, windowStart: string): string {
  return `${loopId}:${windowStart}`;
}

function formatProvenanceCode(signature: string): string {
  const hex = signature.startsWith("sha256:") ? signature.slice("sha256:".length) : signature;
  const normalized = hex.slice(0, 8).toUpperCase();
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}
