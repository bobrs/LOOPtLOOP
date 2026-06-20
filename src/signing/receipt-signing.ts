import { hmacSha256Text } from "../utils/hash";
import { canonicalizeJson } from "./canonicalize";

export const RECEIPT_SIGNATURE_MATERIAL_SCHEMA = "WITNESSKEY_AUTHORIZATION_SIGNATURE_MATERIAL_0_1";

type JsonMap = Record<string, unknown>;

export interface ReceiptSignatureInput {
  eventId: string;
  offerId: string;
  loopId: string;
  eventType: string;
  issuerName: string;
  issuerOrigin: string;
  payloadHash: string;
  participantApp: string | null;
  participantRef: string | null;
  participantRole: string | null;
  declaredRoles: string[];
  consentPromptHash: string;
  storagePolicy: JsonMap;
  claimsPolicy: JsonMap;
  createdAt: string;
  expiresAt: string | null;
  verificationUrl: string;
  receiptSignature?: string;
}

export interface ReceiptSignatureMaterial {
  schema: string;
  event_id: string;
  offer_id: string;
  loop_id: string;
  event_type: string;
  issuer_name: string;
  issuer_origin: string;
  payload_hash: string;
  participant_app: string | null;
  participant_ref: string | null;
  participant_role: string | null;
  declared_roles: string[];
  consent_prompt_hash: string;
  storage_policy: JsonMap;
  claims_policy: JsonMap;
  created_at: string;
  expires_at: string | null;
  verification_url: string;
}

export function buildReceiptSignatureMaterial(input: ReceiptSignatureInput): ReceiptSignatureMaterial {
  return {
    schema: RECEIPT_SIGNATURE_MATERIAL_SCHEMA,
    event_id: input.eventId,
    offer_id: input.offerId,
    loop_id: input.loopId,
    event_type: input.eventType,
    issuer_name: input.issuerName,
    issuer_origin: input.issuerOrigin,
    payload_hash: input.payloadHash,
    participant_app: input.participantApp,
    participant_ref: input.participantRef,
    participant_role: input.participantRole,
    declared_roles: input.declaredRoles,
    consent_prompt_hash: input.consentPromptHash,
    storage_policy: input.storagePolicy,
    claims_policy: input.claimsPolicy,
    created_at: input.createdAt,
    expires_at: input.expiresAt,
    verification_url: input.verificationUrl
  };
}

export function canonicalizeReceiptSignatureMaterial(input: ReceiptSignatureInput): string {
  return canonicalizeJson(buildReceiptSignatureMaterial(input));
}

export async function signReceiptMaterial(input: ReceiptSignatureInput, signingSecret: string): Promise<string> {
  return hmacSha256Text(signingSecret, canonicalizeReceiptSignatureMaterial(input));
}

export async function verifyReceiptMaterialSignature(
  input: ReceiptSignatureInput,
  receiptSignature: string,
  signingSecret: string
): Promise<boolean> {
  const expectedSignature = await signReceiptMaterial(input, signingSecret);
  return expectedSignature === receiptSignature;
}
