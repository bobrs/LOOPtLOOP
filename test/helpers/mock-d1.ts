export const API_BASE = "https://api.looptloop.online/v0";
export const VALID_HASH = `sha256:${"a".repeat(64)}`;
export const CONSENT_PROMPT = "I consent to hash-based authorization witnessing only.";

interface MockD1Result {
  success: boolean;
}

export interface TestEnv {
  DB: D1Database;
  API_BASE_URL: string;
  WITNESSKEY_VERIFY_BASE_URL: string;
  ALLOWED_ORIGINS: string;
  RECEIPT_SIGNING_SECRET?: string;
  database: MockD1Database;
}

export interface MockOfferRow {
  id: string;
  schema_version: string;
  event_type: string;
  issuer_name: string;
  issuer_origin: string;
  payload_hash: string;
  payload_label: string | null;
  declared_roles_json: string;
  consent_prompt: string;
  consent_prompt_hash: string;
  storage_policy_json: string;
  claims_policy_json: string;
  return_url: string | null;
  created_at: string;
  expires_at: string;
  status: string;
}

export interface MockEventRow {
  id: string;
  offer_id: string;
  loop_id: string;
  schema_version: string;
  event_type: string;
  issuer_name: string;
  issuer_origin: string;
  payload_hash: string;
  participant_app: string | null;
  participant_ref: string | null;
  participant_role: string | null;
  declared_roles_json: string;
  consent_prompt_hash: string;
  storage_policy_json: string;
  claims_policy_json: string;
  receipt_json: string;
  receipt_signature: string;
  verification_url: string;
  created_at: string;
  expires_at: string | null;
  status: string;
}

export class MockD1Database {
  readonly offers = new Map<string, MockOfferRow>();
  readonly events = new Map<string, MockEventRow>();

  prepare(query: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this, query);
  }

  getOffer(offerId: string): MockOfferRow | undefined {
    return this.offers.get(offerId);
  }

  getEvent(eventId: string): MockEventRow | undefined {
    return this.events.get(eventId);
  }

  patchOffer(offerId: string, updates: Partial<MockOfferRow>): void {
    const offer = this.offers.get(offerId);
    if (!offer) {
      throw new Error(`Offer not found: ${offerId}`);
    }

    this.offers.set(offerId, {
      ...offer,
      ...updates
    });
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
        id: id as string,
        schema_version: schemaVersion as string,
        event_type: eventType as string,
        issuer_name: issuerName as string,
        issuer_origin: issuerOrigin as string,
        payload_hash: payloadHash as string,
        payload_label: payloadLabel as string | null,
        declared_roles_json: declaredRolesJson as string,
        consent_prompt: consentPrompt as string,
        consent_prompt_hash: consentPromptHash as string,
        storage_policy_json: storagePolicyJson as string,
        claims_policy_json: claimsPolicyJson as string,
        return_url: returnUrl as string | null,
        created_at: createdAt as string,
        expires_at: expiresAt as string,
        status: status as string
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
        status: status as string
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
        id: id as string,
        offer_id: offerId as string,
        loop_id: loopId as string,
        schema_version: schemaVersion as string,
        event_type: eventType as string,
        issuer_name: issuerName as string,
        issuer_origin: issuerOrigin as string,
        payload_hash: payloadHash as string,
        participant_app: participantApp as string | null,
        participant_ref: participantRef as string | null,
        participant_role: participantRole as string | null,
        declared_roles_json: declaredRolesJson as string,
        consent_prompt_hash: consentPromptHash as string,
        storage_policy_json: storagePolicyJson as string,
        claims_policy_json: claimsPolicyJson as string,
        receipt_json: receiptJson as string,
        receipt_signature: receiptSignature as string,
        verification_url: verificationUrl as string,
        created_at: createdAt as string,
        expires_at: expiresAt as string | null,
        status: status as string
      });

      return { success: true };
    }

    throw new Error(`Unsupported run() query in test mock: ${query}`);
  }
}

export function makeEnv(): TestEnv {
  const database = new MockD1Database();

  return {
    DB: database as unknown as D1Database,
    API_BASE_URL: API_BASE,
    WITNESSKEY_VERIFY_BASE_URL: "https://witnesskey.online/verify",
    ALLOWED_ORIGINS: "https://witnesskey.online,https://abracadoo.app",
    RECEIPT_SIGNING_SECRET: "test-secret",
    database
  };
}

export function makeOfferRequest() {
  return {
    issuer: {
      name: "WitnessKey",
      origin: "https://witnesskey.online"
    },
    event_type: "private_authorization_witnessed",
    payload_hash: VALID_HASH,
    payload_label: "Demo authorization payload",
    declared_roles: ["user", "ai_agent"],
    consent_prompt: CONSENT_PROMPT,
    return_url: "https://abracadoo.app/return"
  };
}

export function makeAcceptanceRequest(consentPromptHash: string) {
  return {
    schema: "WITNESSKEY_AUTHORIZATION_ACCEPTANCE_0_1",
    accepted_by: {
      app: "abracadoo.app",
      participant_ref: "local-demo-user",
      participant_role: "authorizer"
    },
    consent_action: "accept",
    consent_prompt_hash: consentPromptHash
  };
}

export function listObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => listObjectKeys(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const objectValue = value as Record<string, unknown>;
  return Object.keys(objectValue).flatMap((key) => [key, ...listObjectKeys(objectValue[key])]);
}

function normalizeSql(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}
