import {
  buildCurrentProvenanceWindow,
  buildProvenanceVerifyUrl,
  DEFAULT_PROVENANCE_CODE_STEP_SECONDS,
  DEFAULT_PROVENANCE_LOOP_TTL_SECONDS,
  DEFAULT_PROVENANCE_VERIFY_BASE_URL,
  makeProvenanceLoopId,
  makeProvenanceWindowId,
  PROVENANCE_WINDOW_HISTORY_LIMIT,
  resolveProvenanceLoopStatus,
  SUPPORTED_PROVENANCE_CODE_STEP_SECONDS,
  type ProvenanceCodeWindowRow,
  type ProvenanceLoopRow
} from "./provenance/loops";
import type { Env } from "./types";
import { signReceiptMaterial, verifyReceiptMaterialSignature } from "./signing/receipt-signing";
import { corsPreflight, withCors } from "./utils/cors";
import { sha256Text } from "./utils/hash";
import { makeId } from "./utils/ids";
import { json, jsonError } from "./utils/json";
import { isHttpsOrLocalUrl, isSha256Hash, isStringArray } from "./utils/validation";

const CANONICAL_API_BASE_URL = "https://api.looptloop.online/v0";
const DEFAULT_VERIFY_BASE_URL = "https://witnesskey.online/verify";
const DEFAULT_ABRACADOO_ACCEPT_WITNESS_BASE_URL = "https://app.abracadoo.app/accept-witness/";
const EVENT_TYPE = "private_authorization_witnessed";
const OFFER_SCHEMA = "WITNESSKEY_AUTHORIZATION_OFFER_0_1";
const ACCEPTANCE_SCHEMA = "WITNESSKEY_AUTHORIZATION_ACCEPTANCE_0_1";
const EVENT_SCHEMA = "WITNESSKEY_AUTHORIZATION_EVENT_0_1";
const RECEIPT_SCHEMA = "WITNESSKEY_AUTHORIZATION_RECEIPT_0_1";
const OFFER_TTL_MS = 5 * 60 * 1000;
const PROVENANCE_LOOP_TTL_MS = DEFAULT_PROVENANCE_LOOP_TTL_SECONDS * 1000;
const PRIVATE_PAYLOAD_FIELDS = ["private_payload", "private_payload_text"];
const DEFAULT_STORAGE_POLICY = {
  private_payload_storage: "never",
  stored_fields: [
    "payload_hash",
    "consent_envelope",
    "declared_roles",
    "timestamps",
    "schema_version",
    "receipt_signature"
  ]
};
const DEFAULT_CLAIMS_POLICY = {
  claims: ["authorization_witnessed", "hash_witnessed", "consent_recorded"],
  non_claims: ["private_payload_contents", "identity_verification", "action_execution"]
};

interface CreateOfferRequest {
  issuer: {
    name: string;
    origin: string;
  };
  event_type: string;
  payload_hash: string;
  payload_label?: string;
  declared_roles: string[];
  consent_prompt: string;
  return_url: string;
}

interface AcceptOfferRequest {
  schema: string;
  accepted_by: {
    app: string;
    participant_ref: string;
    participant_role: string;
  };
  consent_action: string;
  consent_prompt_hash: string;
  participant_signature?: string;
}

interface CreateProvenanceLoopRequest {
  code_step_seconds?: number;
}

interface OfferRow {
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

interface EventRow {
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

type JsonMap = Record<string, unknown>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return corsPreflight(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "");

    let response: Response;

    try {
      if (path === "/" || path === "/v0") {
        response = json({
          service: "LOOPtLOOP Private Authorization Witness API",
          version: "0.1.0",
          canonical_base_url: CANONICAL_API_BASE_URL,
          invariant: "Private payload stays private. This API witnesses hashes and consent envelopes, not private payloads."
        });
      } else if (request.method === "POST" && path === "/v0/provenance-loops") {
        response = await handleCreateProvenanceLoop(request, env);
      } else if (request.method === "GET" && /^\/v0\/provenance-loops\/[^/]+\/current$/.test(path)) {
        const loopId = path.split("/")[3]!;
        response = await handleGetCurrentProvenanceLoop(env, loopId);
      } else if (request.method === "GET" && /^\/v0\/provenance-loops\/[^/]+$/.test(path)) {
        const loopId = path.split("/").pop()!;
        response = await handleGetProvenanceLoop(env, loopId);
      } else if (request.method === "POST" && path === "/v0/authorization-offers") {
        response = await handleCreateOffer(request, env);
      } else if (request.method === "GET" && /^\/v0\/authorization-offers\/[^/]+$/.test(path)) {
        const offerId = path.split("/").pop()!;
        response = await handleGetOffer(env, offerId);
      } else if (request.method === "POST" && /^\/v0\/authorization-offers\/[^/]+\/accept$/.test(path)) {
        const offerId = path.split("/")[3]!;
        response = await handleAcceptOffer(request, env, offerId);
      } else if (request.method === "POST" && /^\/v0\/authorization-offers\/[^/]+\/reject$/.test(path)) {
        const offerId = path.split("/")[3]!;
        response = await handleRejectOffer(request, env, offerId);
      } else if (request.method === "GET" && /^\/v0\/authorization-events\/[^/]+$/.test(path)) {
        const eventId = path.split("/").pop()!;
        response = await handleGetEvent(env, eventId);
      } else if (request.method === "GET" && /^\/v0\/authorization-events\/[^/]+\/verify$/.test(path)) {
        const eventId = path.split("/")[3]!;
        response = await handleVerifyEvent(env, eventId);
      } else {
        response = jsonError("not_found", "Route not found.", 404);
      }
    } catch (error) {
      response = jsonError("internal_error", error instanceof Error ? error.message : "Unknown error", 500);
    }

    return withCors(request, env, response);
  }
};

async function handleCreateOffer(request: Request, env: Env): Promise<Response> {
  const parsedBody = await parseJsonBody(request);
  if (parsedBody instanceof Response) return parsedBody;

  const privateField = findPrivatePayloadField(parsedBody);
  if (privateField) {
    return jsonError("private_payload_not_allowed", `Field "${privateField}" is not accepted. Submit only a sha256: payload hash.`, 400);
  }

  const validated = validateCreateOfferRequest(parsedBody);
  if (validated instanceof Response) return validated;

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_MS).toISOString();
  const offerId = makeId("wo");
  const offer: OfferRow = {
    id: offerId,
    schema_version: OFFER_SCHEMA,
    event_type: EVENT_TYPE,
    issuer_name: validated.issuer.name,
    issuer_origin: validated.issuer.origin,
    payload_hash: validated.payload_hash,
    payload_label: validated.payload_label ?? null,
    declared_roles_json: JSON.stringify(validated.declared_roles),
    consent_prompt: validated.consent_prompt,
    consent_prompt_hash: await sha256Text(validated.consent_prompt),
    storage_policy_json: JSON.stringify(DEFAULT_STORAGE_POLICY),
    claims_policy_json: JSON.stringify(DEFAULT_CLAIMS_POLICY),
    return_url: validated.return_url,
    created_at: createdAt,
    expires_at: expiresAt,
    status: "offered"
  };

  await env.DB.prepare(
    `INSERT INTO authorization_offers (
      id, schema_version, event_type, issuer_name, issuer_origin, payload_hash,
      payload_label, declared_roles_json, consent_prompt, consent_prompt_hash,
      storage_policy_json, claims_policy_json, return_url, created_at, expires_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      offer.id,
      offer.schema_version,
      offer.event_type,
      offer.issuer_name,
      offer.issuer_origin,
      offer.payload_hash,
      offer.payload_label,
      offer.declared_roles_json,
      offer.consent_prompt,
      offer.consent_prompt_hash,
      offer.storage_policy_json,
      offer.claims_policy_json,
      offer.return_url,
      offer.created_at,
      offer.expires_at,
      offer.status
    )
    .run();

  const acceptWitnessBaseUrl = env.ABRACADOO_ACCEPT_WITNESS_BASE_URL || DEFAULT_ABRACADOO_ACCEPT_WITNESS_BASE_URL;
  const acceptUrl = new URL(acceptWitnessBaseUrl);
  acceptUrl.searchParams.set("offer_id", offer.id);

  return json(
    {
      offer_id: offer.id,
      status: offer.status,
      accept_url: acceptUrl.toString(),
      expires_at: offer.expires_at
    },
    { status: 201 }
  );
}

async function handleCreateProvenanceLoop(request: Request, env: Env): Promise<Response> {
  const parsedBody = await parseJsonBody(request, true);
  if (parsedBody instanceof Response) return parsedBody;

  const privateField = findPrivatePayloadField(parsedBody);
  if (privateField) {
    return jsonError("private_payload_not_allowed", `Field "${privateField}" is not accepted in provenance loop creation.`, 400);
  }

  const validated = validateCreateProvenanceLoopRequest(parsedBody);
  if (validated instanceof Response) return validated;

  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const loopId = makeProvenanceLoopId();
  const verifyUrl = buildProvenanceVerifyUrl(
    env.PROVENANCE_VERIFY_BASE_URL || DEFAULT_PROVENANCE_VERIFY_BASE_URL,
    loopId
  );
  const loop: ProvenanceLoopRow = {
    id: loopId,
    created_at: createdAt,
    expires_at: new Date(now + PROVENANCE_LOOP_TTL_MS).toISOString(),
    closed_at: null,
    status: "active",
    code_step_seconds: validated.code_step_seconds ?? DEFAULT_PROVENANCE_CODE_STEP_SECONDS,
    verify_url: verifyUrl
  };

  await env.DB.prepare(
    `INSERT INTO provenance_loops (
      id, created_at, expires_at, closed_at, status, code_step_seconds, verify_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      loop.id,
      loop.created_at,
      loop.expires_at,
      loop.closed_at,
      loop.status,
      loop.code_step_seconds,
      loop.verify_url
    )
    .run();

  const currentWindow = await buildAndStoreCurrentProvenanceWindow(env, loop, now);
  return json(
    mapProvenanceLoopRowToResponse(loop, [
      {
        code: currentWindow.code,
        window_start: currentWindow.window_start,
        window_end: currentWindow.window_end
      }
    ]),
    { status: 201 }
  );
}

async function handleGetProvenanceLoop(env: Env, loopId: string): Promise<Response> {
  const loop = await getProvenanceLoopById(env, loopId);
  if (!loop) {
    return jsonError("provenance_loop_not_found", "Provenance loop not found.", 404);
  }

  const hydratedLoop = await hydrateProvenanceLoopStatus(env, loop);
  if (hydratedLoop.status === "active") {
    await buildAndStoreCurrentProvenanceWindow(env, hydratedLoop);
  }

  const windows = await getObservedProvenanceWindows(env, loopId, PROVENANCE_WINDOW_HISTORY_LIMIT);
  return json(mapProvenanceLoopRowToResponse(hydratedLoop, windows.map((window) => ({
    code: window.code,
    window_start: window.window_start,
    window_end: window.window_end
  }))));
}

async function handleGetCurrentProvenanceLoop(env: Env, loopId: string): Promise<Response> {
  const loop = await getProvenanceLoopById(env, loopId);
  if (!loop) {
    return jsonError("provenance_loop_not_found", "Provenance loop not found.", 404);
  }

  const hydratedLoop = await hydrateProvenanceLoopStatus(env, loop);
  if (hydratedLoop.status === "closed") {
    return jsonError("provenance_loop_closed", "Provenance loop is closed.", 409);
  }
  if (hydratedLoop.status === "expired") {
    return jsonError("provenance_loop_expired", "Provenance loop has expired.", 409);
  }

  const currentWindow = await buildAndStoreCurrentProvenanceWindow(env, hydratedLoop);
  return json({
    loop_id: hydratedLoop.id,
    status: hydratedLoop.status,
    current_code: currentWindow.code,
    window_start: currentWindow.window_start,
    window_end: currentWindow.window_end,
    seconds_remaining: currentWindow.seconds_remaining,
    verify_url: hydratedLoop.verify_url
  });
}

async function handleGetOffer(env: Env, offerId: string): Promise<Response> {
  const offer = await getOfferById(env, offerId);
  if (!offer) {
    return jsonError("offer_not_found", "Authorization offer not found.", 404);
  }

  return json(mapOfferRowToResponse(offer));
}

async function handleAcceptOffer(request: Request, env: Env, offerId: string): Promise<Response> {
  const offer = await getOfferById(env, offerId);
  if (!offer) {
    return jsonError("offer_not_found", "Authorization offer not found.", 404);
  }
  if (isExpired(offer.expires_at)) {
    await updateOfferStatus(env, offer.id, "expired");
    return jsonError("offer_expired", "Expired offers cannot be accepted.", 409);
  }
  if (offer.status === "accepted") {
    return jsonError("offer_already_accepted", "Accepted offers cannot be accepted twice.", 409);
  }
  if (offer.status !== "offered") {
    return jsonError("offer_not_acceptable", `Offer cannot be accepted from status "${offer.status}".`, 409);
  }

  const parsedBody = await parseJsonBody(request);
  if (parsedBody instanceof Response) return parsedBody;

  const privateField = findPrivatePayloadField(parsedBody);
  if (privateField) {
    return jsonError("private_payload_not_allowed", `Field "${privateField}" is not accepted. Submit only consent metadata.`, 400);
  }

  const validated = validateAcceptOfferRequest(parsedBody);
  if (validated instanceof Response) return validated;
  if (validated.consent_prompt_hash !== offer.consent_prompt_hash) {
    return jsonError("consent_prompt_hash_mismatch", "Consent prompt hash does not match the offer.", 409);
  }

  const createdAt = new Date().toISOString();
  const eventId = makeId("we");
  const loopId = makeId("loop");
  const verificationBaseUrl = env.WITNESSKEY_VERIFY_BASE_URL || DEFAULT_VERIFY_BASE_URL;
  const verificationUrl = `${verificationBaseUrl.replace(/\/$/, "")}/${eventId}`;
  const declaredRoles = parseJsonArray(offer.declared_roles_json);
  const storagePolicy = parseJsonObject(offer.storage_policy_json);
  const claimsPolicy = parseJsonObject(offer.claims_policy_json);
  const signingInput = {
    eventId,
    offerId: offer.id,
    loopId,
    eventType: EVENT_TYPE,
    issuerName: offer.issuer_name,
    issuerOrigin: offer.issuer_origin,
    payloadHash: offer.payload_hash,
    participantApp: validated.accepted_by.app,
    participantRef: validated.accepted_by.participant_ref,
    participantRole: validated.accepted_by.participant_role,
    declaredRoles,
    consentPromptHash: offer.consent_prompt_hash,
    storagePolicy,
    claimsPolicy,
    createdAt,
    expiresAt: null,
    verificationUrl
  };
  const receiptPayload = {
    schema: RECEIPT_SCHEMA,
    receipt_id: makeId("wr"),
    event_id: eventId,
    offer_id: offer.id,
    event_type: EVENT_TYPE,
    payload_hash: offer.payload_hash,
    issuer_origin: offer.issuer_origin,
    participant_app: validated.accepted_by.app,
    declared_roles: declaredRoles,
    created_at: createdAt,
    verification_url: verificationUrl,
    human_summary: `Witnessed ${EVENT_TYPE} for ${offer.issuer_origin} using hash-only authorization evidence.`
  };
  const receiptSignature = await signReceiptMaterial(signingInput, getReceiptSigningSecret(env));
  const receipt = {
    ...receiptPayload,
    receipt_signature: receiptSignature
  };
  const event: EventRow = {
    id: eventId,
    offer_id: offer.id,
    loop_id: loopId,
    schema_version: EVENT_SCHEMA,
    event_type: EVENT_TYPE,
    issuer_name: offer.issuer_name,
    issuer_origin: offer.issuer_origin,
    payload_hash: offer.payload_hash,
    participant_app: validated.accepted_by.app,
    participant_ref: validated.accepted_by.participant_ref,
    participant_role: validated.accepted_by.participant_role,
    declared_roles_json: offer.declared_roles_json,
    consent_prompt_hash: offer.consent_prompt_hash,
    storage_policy_json: offer.storage_policy_json,
    claims_policy_json: offer.claims_policy_json,
    receipt_json: JSON.stringify(receipt),
    receipt_signature: receiptSignature,
    verification_url: verificationUrl,
    created_at: createdAt,
    expires_at: null,
    status: "active"
  };

  await env.DB.prepare(
    `INSERT INTO authorization_events (
      id, offer_id, loop_id, schema_version, event_type, issuer_name, issuer_origin,
      payload_hash, participant_app, participant_ref, participant_role, declared_roles_json,
      consent_prompt_hash, storage_policy_json, claims_policy_json, receipt_json,
      receipt_signature, verification_url, created_at, expires_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      event.id,
      event.offer_id,
      event.loop_id,
      event.schema_version,
      event.event_type,
      event.issuer_name,
      event.issuer_origin,
      event.payload_hash,
      event.participant_app,
      event.participant_ref,
      event.participant_role,
      event.declared_roles_json,
      event.consent_prompt_hash,
      event.storage_policy_json,
      event.claims_policy_json,
      event.receipt_json,
      event.receipt_signature,
      event.verification_url,
      event.created_at,
      event.expires_at,
      event.status
    )
    .run();

  await updateOfferStatus(env, offer.id, "accepted");

  return json({
    status: "accepted",
    offer_id: offer.id,
    event: mapEventRowToResponse(event),
    receipt
  });
}

async function handleRejectOffer(request: Request, env: Env, offerId: string): Promise<Response> {
  const offer = await getOfferById(env, offerId);
  if (!offer) {
    return jsonError("offer_not_found", "Authorization offer not found.", 404);
  }
  if (isExpired(offer.expires_at)) {
    await updateOfferStatus(env, offer.id, "expired");
    return jsonError("offer_expired", "Expired offers cannot be rejected.", 409);
  }
  if (offer.status !== "offered") {
    return jsonError("offer_not_rejectable", `Offer cannot be rejected from status "${offer.status}".`, 409);
  }

  const parsedBody = await parseJsonBody(request, true);
  if (parsedBody instanceof Response) return parsedBody;
  const privateField = findPrivatePayloadField(parsedBody);
  if (privateField) {
    return jsonError("private_payload_not_allowed", `Field "${privateField}" is not accepted. Submit only hash-based authorization metadata.`, 400);
  }

  await updateOfferStatus(env, offer.id, "rejected");
  return json({
    offer_id: offer.id,
    status: "rejected",
    rejected_at: new Date().toISOString()
  });
}

async function handleGetEvent(env: Env, eventId: string): Promise<Response> {
  const event = await getEventById(env, eventId);
  if (!event) {
    return jsonError("event_not_found", "Authorization event not found.", 404);
  }

  return json(mapEventRowToResponse(event));
}

async function handleVerifyEvent(env: Env, eventId: string): Promise<Response> {
  const event = await getEventById(env, eventId);
  if (!event) {
    return jsonError("event_not_found", "Authorization event not found.", 404);
  }

  const isValid = await verifyReceiptMaterialSignature(
    buildReceiptSignatureInputFromEvent(event),
    event.receipt_signature,
    getReceiptSigningSecret(env)
  );
  return json({
    event_id: event.id,
    event_status: event.status,
    verification_status: isValid ? "verified" : "invalid",
    receipt_signature_valid: isValid,
    verification_url: event.verification_url,
    event: mapEventRowToResponse(event)
  });
}

async function getProvenanceLoopById(env: Env, loopId: string): Promise<ProvenanceLoopRow | null> {
  return env.DB.prepare("SELECT * FROM provenance_loops WHERE id = ?").bind(loopId).first<ProvenanceLoopRow>();
}

async function getObservedProvenanceWindows(
  env: Env,
  loopId: string,
  limit: number
): Promise<ProvenanceCodeWindowRow[]> {
  const result = await env.DB.prepare(
    "SELECT * FROM provenance_code_windows WHERE loop_id = ? ORDER BY window_start DESC LIMIT ?"
  )
    .bind(loopId, limit)
    .all<ProvenanceCodeWindowRow>();
  return result.results ?? [];
}

async function getOfferById(env: Env, offerId: string): Promise<OfferRow | null> {
  return env.DB.prepare("SELECT * FROM authorization_offers WHERE id = ?").bind(offerId).first<OfferRow>();
}

async function getEventById(env: Env, eventId: string): Promise<EventRow | null> {
  return env.DB.prepare("SELECT * FROM authorization_events WHERE id = ?").bind(eventId).first<EventRow>();
}

async function updateOfferStatus(env: Env, offerId: string, status: string): Promise<void> {
  await env.DB.prepare("UPDATE authorization_offers SET status = ? WHERE id = ?").bind(status, offerId).run();
}

async function updateProvenanceLoopStatus(env: Env, loopId: string, status: string): Promise<void> {
  await env.DB.prepare("UPDATE provenance_loops SET status = ? WHERE id = ?").bind(status, loopId).run();
}

function mapOfferRowToResponse(offer: OfferRow): JsonMap {
  const response: JsonMap = {
    schema: OFFER_SCHEMA,
    offer_id: offer.id,
    event_type: offer.event_type,
    issuer: {
      name: offer.issuer_name,
      origin: offer.issuer_origin
    },
    subject: {
      type: "private_payload_hash",
      hash_alg: "SHA-256",
      payload_hash: offer.payload_hash
    },
    declared_roles: parseJsonArray(offer.declared_roles_json),
    consent_prompt: offer.consent_prompt,
    storage_policy: parseJsonObject(offer.storage_policy_json),
    claims_policy: parseJsonObject(offer.claims_policy_json),
    created_at: offer.created_at,
    expires_at: offer.expires_at,
    return_url: offer.return_url
  };

  if (offer.payload_label) {
    response.payload_label = offer.payload_label;
  }

  return response;
}

function mapEventRowToResponse(event: EventRow): JsonMap {
  const response: JsonMap = {
    schema: EVENT_SCHEMA,
    event_id: event.id,
    offer_id: event.offer_id,
    loop_id: event.loop_id,
    event_type: event.event_type,
    issuer: {
      name: event.issuer_name,
      origin: event.issuer_origin
    },
    participants: [
      {
        app: event.participant_app,
        participant_ref: event.participant_ref,
        participant_role: event.participant_role
      }
    ],
    subject: {
      type: "private_payload_hash",
      hash_alg: "SHA-256",
      payload_hash: event.payload_hash
    },
    declared_roles: parseJsonArray(event.declared_roles_json),
    consent: {
      action: "accept",
      consent_prompt_hash: event.consent_prompt_hash
    },
    storage_policy: parseJsonObject(event.storage_policy_json),
    claims_policy: parseJsonObject(event.claims_policy_json),
    created_at: event.created_at,
    receipt_signature: event.receipt_signature,
    verification_url: event.verification_url
  };

  if (event.expires_at) {
    response.expires_at = event.expires_at;
  }

  return response;
}

function mapProvenanceLoopRowToResponse(
  loop: ProvenanceLoopRow,
  observedWindows: Array<{ code: string; window_start: string; window_end: string }>
): JsonMap {
  const response: JsonMap = {
    loop_id: loop.id,
    created_at: loop.created_at,
    expires_at: loop.expires_at,
    status: loop.status,
    code_step_seconds: loop.code_step_seconds,
    verify_url: loop.verify_url
  };

  if (loop.closed_at) {
    response.closed_at = loop.closed_at;
  }
  if (observedWindows.length > 0) {
    response.observed_windows = observedWindows;
  }

  return response;
}

async function parseJsonBody(request: Request, allowEmptyBody = false): Promise<JsonMap | Response> {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return allowEmptyBody ? {} : jsonError("invalid_json", "Request body must be a JSON object.", 400);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }

  if (!isRecord(parsedBody)) {
    return jsonError("invalid_json", "Request body must be a JSON object.", 400);
  }

  return parsedBody;
}

function validateCreateOfferRequest(body: JsonMap): CreateOfferRequest | Response {
  if (!isRecord(body.issuer)) {
    return jsonError("invalid_issuer", "issuer.name and issuer.origin are required.", 400);
  }
  if (typeof body.issuer.name !== "string" || body.issuer.name.trim().length === 0) {
    return jsonError("invalid_issuer_name", "issuer.name is required.", 400);
  }
  if (!isHttpsOrLocalUrl(body.issuer.origin)) {
    return jsonError("invalid_issuer_origin", "issuer.origin must be an https or local URL.", 400);
  }
  if (body.event_type !== EVENT_TYPE) {
    return jsonError("invalid_event_type", `event_type must be "${EVENT_TYPE}".`, 400);
  }
  if (!isSha256Hash(body.payload_hash)) {
    return jsonError("invalid_payload_hash", "payload_hash must be present and start with sha256:.", 400);
  }
  if (body.payload_label !== undefined && typeof body.payload_label !== "string") {
    return jsonError("invalid_payload_label", "payload_label must be a string when provided.", 400);
  }
  if (!isStringArray(body.declared_roles)) {
    return jsonError("invalid_declared_roles", "declared_roles must be a non-empty array of strings.", 400);
  }
  if (typeof body.consent_prompt !== "string" || body.consent_prompt.trim().length === 0) {
    return jsonError("invalid_consent_prompt", "consent_prompt is required.", 400);
  }
  if (!isHttpsOrLocalUrl(body.return_url)) {
    return jsonError("invalid_return_url", "return_url must be an https or local URL.", 400);
  }

  return {
    issuer: {
      name: body.issuer.name,
      origin: body.issuer.origin
    },
    event_type: body.event_type,
    payload_hash: body.payload_hash,
    payload_label: body.payload_label,
    declared_roles: body.declared_roles,
    consent_prompt: body.consent_prompt,
    return_url: body.return_url
  };
}

function validateCreateProvenanceLoopRequest(body: JsonMap): CreateProvenanceLoopRequest | Response {
  if (body.code_step_seconds === undefined) {
    return {};
  }
  if (
    typeof body.code_step_seconds !== "number" ||
    !Number.isInteger(body.code_step_seconds) ||
    !SUPPORTED_PROVENANCE_CODE_STEP_SECONDS.includes(body.code_step_seconds as 10 | 30)
  ) {
    return jsonError(
      "invalid_code_step_seconds",
      `code_step_seconds must be one of ${SUPPORTED_PROVENANCE_CODE_STEP_SECONDS.join(", ")}.`,
      400
    );
  }

  return {
    code_step_seconds: body.code_step_seconds
  };
}

function validateAcceptOfferRequest(body: JsonMap): AcceptOfferRequest | Response {
  if (body.schema !== ACCEPTANCE_SCHEMA) {
    return jsonError("invalid_schema", `schema must be "${ACCEPTANCE_SCHEMA}".`, 400);
  }
  if (!isRecord(body.accepted_by)) {
    return jsonError("invalid_accepted_by", "accepted_by.app, accepted_by.participant_ref, and accepted_by.participant_role are required.", 400);
  }
  if (typeof body.accepted_by.app !== "string" || body.accepted_by.app.trim().length === 0) {
    return jsonError("invalid_participant_app", "accepted_by.app is required.", 400);
  }
  if (typeof body.accepted_by.participant_ref !== "string" || body.accepted_by.participant_ref.trim().length === 0) {
    return jsonError("invalid_participant_ref", "accepted_by.participant_ref is required.", 400);
  }
  if (typeof body.accepted_by.participant_role !== "string" || body.accepted_by.participant_role.trim().length === 0) {
    return jsonError("invalid_participant_role", "accepted_by.participant_role is required.", 400);
  }
  if (body.consent_action !== "accept") {
    return jsonError("invalid_consent_action", 'consent_action must be "accept".', 400);
  }
  if (!isSha256Hash(body.consent_prompt_hash)) {
    return jsonError("invalid_consent_prompt_hash", "consent_prompt_hash must start with sha256:.", 400);
  }
  if (body.participant_signature !== undefined && typeof body.participant_signature !== "string") {
    return jsonError("invalid_participant_signature", "participant_signature must be a string when provided.", 400);
  }

  return {
    schema: body.schema,
    accepted_by: {
      app: body.accepted_by.app,
      participant_ref: body.accepted_by.participant_ref,
      participant_role: body.accepted_by.participant_role
    },
    consent_action: body.consent_action,
    consent_prompt_hash: body.consent_prompt_hash,
    participant_signature: body.participant_signature
  };
}

function findPrivatePayloadField(body: JsonMap): string | null {
  for (const field of PRIVATE_PAYLOAD_FIELDS) {
    if (field in body) {
      return field;
    }
  }

  return null;
}

function isRecord(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonArray(value: string): string[] {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Stored JSON value is not an array.");
  }

  return parsed as string[];
}

function parseJsonObject(value: string): JsonMap {
  const parsed = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Stored JSON value is not an object.");
  }

  return parsed;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function hydrateProvenanceLoopStatus(env: Env, loop: ProvenanceLoopRow): Promise<ProvenanceLoopRow> {
  const resolvedStatus = resolveProvenanceLoopStatus(loop);
  if (resolvedStatus !== loop.status) {
    await updateProvenanceLoopStatus(env, loop.id, resolvedStatus);
    return {
      ...loop,
      status: resolvedStatus
    };
  }

  return loop;
}

async function buildAndStoreCurrentProvenanceWindow(
  env: Env,
  loop: ProvenanceLoopRow,
  nowMs = Date.now()
) {
  const currentWindow = await buildCurrentProvenanceWindow(loop, getProvenanceLoopSecret(env), nowMs);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO provenance_code_windows (
      id, loop_id, code, window_start, window_end, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      makeProvenanceWindowId(loop.id, currentWindow.window_start),
      loop.id,
      currentWindow.code,
      currentWindow.window_start,
      currentWindow.window_end,
      new Date(nowMs).toISOString()
    )
    .run();

  return currentWindow;
}

function buildReceiptSignatureInputFromEvent(event: EventRow) {
  return {
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
    declaredRoles: parseJsonArray(event.declared_roles_json),
    consentPromptHash: event.consent_prompt_hash,
    storagePolicy: parseJsonObject(event.storage_policy_json),
    claimsPolicy: parseJsonObject(event.claims_policy_json),
    createdAt: event.created_at,
    expiresAt: event.expires_at,
    verificationUrl: event.verification_url
  };
}

function getReceiptSigningSecret(env: Env): string {
  return env.RECEIPT_SIGNING_SECRET || "development-receipt-signing-secret";
}

function getProvenanceLoopSecret(env: Env): string {
  return env.PROVENANCE_LOOP_SECRET || env.RECEIPT_SIGNING_SECRET || "development-provenance-loop-secret";
}
