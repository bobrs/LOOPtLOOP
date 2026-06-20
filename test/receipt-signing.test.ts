import { describe, expect, it } from "vitest";
import worker from "../src/index";
import {
  buildReceiptSignatureMaterial,
  canonicalizeReceiptSignatureMaterial,
  signReceiptMaterial,
  verifyReceiptMaterialSignature
} from "../src/signing/receipt-signing";
import { sha256Text } from "../src/utils/hash";
import {
  API_BASE,
  CONSENT_PROMPT,
  MockEventRow,
  makeAcceptanceRequest,
  makeEnv,
  makeOfferRequest,
  parseStoredArray,
  parseStoredObject
} from "./helpers/mock-d1";

describe("receipt signing", () => {
  it("verifies for a valid event and receipt", async () => {
    const { signingInput, signature } = await createSignedEvent();

    const isValid = await verifyReceiptMaterialSignature(signingInput, signature, "test-secret");

    expect(isValid).toBe(true);
  });

  it("invalidates when payload_hash changes", async () => {
    const { signingInput, signature } = await createSignedEvent();

    const isValid = await verifyReceiptMaterialSignature(
      {
        ...signingInput,
        payloadHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      signature,
      "test-secret"
    );

    expect(isValid).toBe(false);
  });

  it("invalidates when participant_ref changes", async () => {
    const { signingInput, signature } = await createSignedEvent();

    const isValid = await verifyReceiptMaterialSignature(
      {
        ...signingInput,
        participantRef: "tampered-participant-ref"
      },
      signature,
      "test-secret"
    );

    expect(isValid).toBe(false);
  });

  it("invalidates when created_at changes", async () => {
    const { signingInput, signature } = await createSignedEvent();

    const isValid = await verifyReceiptMaterialSignature(
      {
        ...signingInput,
        createdAt: "2030-01-01T00:00:00.000Z"
      },
      signature,
      "test-secret"
    );

    expect(isValid).toBe(false);
  });

  it("ignores receipt_signature when producing canonical signed material", async () => {
    const { signingInput, signature } = await createSignedEvent();

    const canonicalA = canonicalizeReceiptSignatureMaterial({
      ...signingInput,
      receiptSignature: signature
    });
    const canonicalB = canonicalizeReceiptSignatureMaterial({
      ...signingInput,
      receiptSignature: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    });
    const material = buildReceiptSignatureMaterial({
      ...signingInput,
      receiptSignature: signature
    });
    const recomputedSignature = await signReceiptMaterial(signingInput, "test-secret");

    expect(canonicalA).toBe(canonicalB);
    expect(material).not.toHaveProperty("receipt_signature");
    expect(recomputedSignature).toBe(signature);
  });
});

async function createSignedEvent() {
  const env = makeEnv();
  const createResponse = await worker.fetch(
    new Request(`${API_BASE}/authorization-offers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeOfferRequest())
    }),
    env
  );
  const created = await createResponse.json() as { offer_id: string };

  await worker.fetch(
    new Request(`${API_BASE}/authorization-offers/${created.offer_id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
    }),
    env
  );

  const event = Array.from(env.database.events.values())[0] as MockEventRow;
  const signingInput = {
    eventId: event.id,
    offerId: event.offer_id,
    loopId: event.loop_id,
    eventType: event.event_type,
    issuerName: event.issuer_name,
    issuerOrigin: event.issuer_origin,
    payloadHash: event.payload_hash,
    participantApp: event.participant_app,
    participantRef: event.participant_ref,
    participantRole: event.participant_role,
    declaredRoles: parseStoredArray(event.declared_roles_json),
    consentPromptHash: event.consent_prompt_hash,
    storagePolicy: parseStoredObject(event.storage_policy_json),
    claimsPolicy: parseStoredObject(event.claims_policy_json),
    createdAt: event.created_at,
    expiresAt: event.expires_at,
    verificationUrl: event.verification_url
  };

  return {
    signingInput,
    signature: event.receipt_signature
  };
}
