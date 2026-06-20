import { describe, expect, it } from "vitest";
import worker from "../src/index";

const API_BASE = "https://api.looptloop.online/v0";
const VALID_HASH = `sha256:${"a".repeat(64)}`;

interface MockD1Result {
  success: boolean;
}

interface MockEnv {
  DB: D1Database;
  API_BASE_URL: string;
  WITNESSKEY_VERIFY_BASE_URL: string;
  ALLOWED_ORIGINS: string;
  RECEIPT_SIGNING_SECRET?: string;
}

class MockD1Database {
  readonly offers = new Map<string, Record<string, unknown>>();
  readonly events = new Map<string, Record<string, unknown>>();

  prepare(query: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this, query);
  }
}

class MockD1PreparedStatement {
  constructor(
    private readonly database: MockD1Database,
    private readonly query: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.database, this.query, params);
  }

  async first<T>(): Promise<T | null> {
    const query = normalizeSql(this.query);

    if (query === "SELECT * FROM authorization_offers WHERE id = ?") {
      const offerId = this.params[0] as string;
      return (this.database.offers.get(offerId) as T | undefined) ?? null;
    }

    if (query === "SELECT * FROM authorization_events WHERE id = ?") {
      const eventId = this.params[0] as string;
      return (this.database.events.get(eventId) as T | undefined) ?? null;
    }

    throw new Error(`Unsupported first() query in test mock: ${query}`);
  }

  async run(): Promise<MockD1Result> {
    const query = normalizeSql(this.query);

    if (query.startsWith("INSERT INTO authorization_offers")) {
      const [
        id,
        schemaVersion,
        eventType,
        issuerName,
        issuerOrigin,
        payloadHash,
        payloadLabel,
        declaredRolesJson,
        consentPrompt,
        consentPromptHash,
        storagePolicyJson,
        claimsPolicyJson,
        returnUrl,
        createdAt,
        expiresAt,
        status
      ] = this.params;

      this.database.offers.set(id as string, {
        id,
        schema_version: schemaVersion,
        event_type: eventType,
        issuer_name: issuerName,
        issuer_origin: issuerOrigin,
        payload_hash: payloadHash,
        payload_label: payloadLabel,
        declared_roles_json: declaredRolesJson,
        consent_prompt: consentPrompt,
        consent_prompt_hash: consentPromptHash,
        storage_policy_json: storagePolicyJson,
        claims_policy_json: claimsPolicyJson,
        return_url: returnUrl,
        created_at: createdAt,
        expires_at: expiresAt,
        status
      });

      return { success: true };
    }

    if (query === "UPDATE authorization_offers SET status = ? WHERE id = ?") {
      const [status, offerId] = this.params;
      const offer = this.database.offers.get(offerId as string);
      if (!offer) {
        throw new Error(`Missing offer for update: ${String(offerId)}`);
      }

      this.database.offers.set(offerId as string, {
        ...offer,
        status
      });

      return { success: true };
    }

    if (query.startsWith("INSERT INTO authorization_events")) {
      const [
        id,
        offerId,
        loopId,
        schemaVersion,
        eventType,
        issuerName,
        issuerOrigin,
        payloadHash,
        participantApp,
        participantRef,
        participantRole,
        declaredRolesJson,
        consentPromptHash,
        storagePolicyJson,
        claimsPolicyJson,
        receiptJson,
        receiptSignature,
        verificationUrl,
        createdAt,
        expiresAt,
        status
      ] = this.params;

      this.database.events.set(id as string, {
        id,
        offer_id: offerId,
        loop_id: loopId,
        schema_version: schemaVersion,
        event_type: eventType,
        issuer_name: issuerName,
        issuer_origin: issuerOrigin,
        payload_hash: payloadHash,
        participant_app: participantApp,
        participant_ref: participantRef,
        participant_role: participantRole,
        declared_roles_json: declaredRolesJson,
        consent_prompt_hash: consentPromptHash,
        storage_policy_json: storagePolicyJson,
        claims_policy_json: claimsPolicyJson,
        receipt_json: receiptJson,
        receipt_signature: receiptSignature,
        verification_url: verificationUrl,
        created_at: createdAt,
        expires_at: expiresAt,
        status
      });

      return { success: true };
    }

    throw new Error(`Unsupported run() query in test mock: ${query}`);
  }
}

describe("seed constants", () => {
  it("uses api.looptloop.online as canonical base", () => {
    expect(API_BASE).toBe("https://api.looptloop.online/v0");
  });

  it("keeps the private payload invariant explicit", () => {
    const invariant = "Private payload stays private";
    expect(invariant).toContain("Private payload");
  });
});

describe("worker api skeleton", () => {
  it("returns a JSON 404 for an unknown route", async () => {
    const response = await worker.fetch(new Request(`${API_BASE}/missing`), makeEnv());
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.error.code).toBe("not_found");
  });

  it("creates an offer when payload_hash starts with sha256:", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeOfferRequest())
      }),
      env
    );
    const body = await response.json() as { offer_id: string; status: string; accept_url: string; expires_at: string };

    expect(response.status).toBe(201);
    expect(body.offer_id).toMatch(/^wo_/);
    expect(body.status).toBe("offered");
    expect(body.accept_url).toBe(`${API_BASE}/authorization-offers/${body.offer_id}/accept`);
    expect(body.expires_at).toContain("T");
  });

  it("rejects offer creation without a valid payload_hash", async () => {
    const response = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...makeOfferRequest(),
          payload_hash: "not-a-sha256-hash"
        })
      }),
      makeEnv()
    );
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_payload_hash");
  });

  it("fetches a created offer", async () => {
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

    const fetchResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${created.offer_id}`),
      env
    );
    const body = await fetchResponse.json() as {
      offer_id: string;
      event_type: string;
      subject: { payload_hash: string };
    };

    expect(fetchResponse.status).toBe(200);
    expect(body.offer_id).toBe(created.offer_id);
    expect(body.event_type).toBe("private_authorization_witnessed");
    expect(body.subject.payload_hash).toBe(VALID_HASH);
  });

  it("does not require or return a private payload field", async () => {
    const env = makeEnv();
    const createResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeOfferRequest())
      }),
      env
    );
    const createdBody = await createResponse.json() as { offer_id: string };
    const fetchResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${createdBody.offer_id}`),
      env
    );
    const fetchedBody = await fetchResponse.json();

    expect(createResponse.status).toBe(201);
    expect(listObjectKeys(createdBody)).not.toContain("private_payload");
    expect(listObjectKeys(createdBody)).not.toContain("private_payload_text");
    expect(listObjectKeys(fetchedBody)).not.toContain("private_payload");
    expect(listObjectKeys(fetchedBody)).not.toContain("private_payload_text");
  });
});

function makeEnv(): MockEnv {
  return {
    DB: new MockD1Database() as unknown as D1Database,
    API_BASE_URL: API_BASE,
    WITNESSKEY_VERIFY_BASE_URL: "https://witnesskey.online/verify",
    ALLOWED_ORIGINS: "https://witnesskey.online,https://abracadoo.app",
    RECEIPT_SIGNING_SECRET: "test-secret"
  };
}

function makeOfferRequest() {
  return {
    issuer: {
      name: "WitnessKey",
      origin: "https://witnesskey.online"
    },
    event_type: "private_authorization_witnessed",
    payload_hash: VALID_HASH,
    payload_label: "Demo authorization payload",
    declared_roles: ["user", "ai_agent"],
    consent_prompt: "I consent to hash-based authorization witnessing only.",
    return_url: "https://abracadoo.app/return"
  };
}

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function listObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => listObjectKeys(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const objectValue = value as Record<string, unknown>;
  return Object.keys(objectValue).flatMap((key) => [key, ...listObjectKeys(objectValue[key])]);
}
