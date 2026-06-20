import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { sha256Text } from "../src/utils/hash";
import {
  API_BASE,
  CONSENT_PROMPT,
  VALID_HASH,
  listObjectKeys,
  makeAcceptanceRequest,
  makeEnv,
  makeOfferRequest
} from "./helpers/mock-d1";

describe("authorization offer lifecycle", () => {
  it("creates, fetches, accepts, fetches the event, and verifies the event", async () => {
    const env = makeEnv();
    const createResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeOfferRequest())
      }),
      env
    );
    const createdOffer = await createResponse.json() as {
      offer_id: string;
      status: string;
    };

    const fetchOfferResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${createdOffer.offer_id}`),
      env
    );
    const fetchedOffer = await fetchOfferResponse.json() as {
      offer_id: string;
      status?: string;
      subject: { payload_hash: string };
    };

    const acceptResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${createdOffer.offer_id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );
    const accepted = await acceptResponse.json() as {
      status: string;
      event: { event_id: string; offer_id: string };
      receipt: { event_id: string; offer_id: string; receipt_signature: string };
    };

    const fetchEventResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-events/${accepted.event.event_id}`),
      env
    );
    const fetchedEvent = await fetchEventResponse.json() as {
      event_id: string;
      offer_id: string;
      subject: { payload_hash: string };
      receipt_signature: string;
    };

    const verifyResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-events/${accepted.event.event_id}/verify`),
      env
    );
    const verified = await verifyResponse.json() as {
      event_id: string;
      verification_status: string;
      receipt_signature_valid: boolean;
      event: { event_id: string; offer_id: string };
    };

    expect(createResponse.status).toBe(201);
    expect(createdOffer.status).toBe("offered");
    expect(fetchOfferResponse.status).toBe(200);
    expect(fetchedOffer.offer_id).toBe(createdOffer.offer_id);
    expect(fetchedOffer.subject.payload_hash).toBe(VALID_HASH);

    expect(acceptResponse.status).toBe(200);
    expect(accepted.status).toBe("accepted");
    expect(accepted.event.offer_id).toBe(createdOffer.offer_id);
    expect(accepted.receipt.offer_id).toBe(createdOffer.offer_id);
    expect(accepted.receipt.event_id).toBe(accepted.event.event_id);
    expect(accepted.receipt.receipt_signature).toMatch(/^sha256:/);
    expect(env.database.events.size).toBe(1);

    expect(fetchEventResponse.status).toBe(200);
    expect(fetchedEvent.event_id).toBe(accepted.event.event_id);
    expect(fetchedEvent.offer_id).toBe(createdOffer.offer_id);
    expect(fetchedEvent.subject.payload_hash).toBe(VALID_HASH);

    expect(verifyResponse.status).toBe(200);
    expect(verified.event_id).toBe(accepted.event.event_id);
    expect(verified.verification_status).toBe("verified");
    expect(verified.receipt_signature_valid).toBe(true);
    expect(verified.event.offer_id).toBe(createdOffer.offer_id);
    expect(listObjectKeys(verified)).not.toContain("private_payload");
    expect(listObjectKeys(verified)).not.toContain("private_payload_text");
  });

  it("rejects an unexpired offer and does not create an event", async () => {
    const env = makeEnv();
    const offerId = await createOffer(env);

    const rejectResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/reject`, {
        method: "POST"
      }),
      env
    );
    const rejected = await rejectResponse.json() as {
      offer_id: string;
      status: string;
    };

    expect(rejectResponse.status).toBe(200);
    expect(rejected.offer_id).toBe(offerId);
    expect(rejected.status).toBe("rejected");
    expect(env.database.getOffer(offerId)?.status).toBe("rejected");
    expect(env.database.events.size).toBe(0);
  });

  it("rejects acceptance of an expired offer and does not create an event", async () => {
    const env = makeEnv();
    const offerId = await createOffer(env);
    env.database.patchOffer(offerId, {
      expires_at: new Date(Date.now() - 60_000).toISOString()
    });

    const acceptResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );
    const body = await acceptResponse.json() as { error: { code: string } };

    expect(acceptResponse.status).toBe(409);
    expect(body.error.code).toBe("offer_expired");
    expect(env.database.getOffer(offerId)?.status).toBe("expired");
    expect(env.database.events.size).toBe(0);
  });

  it("rejects double acceptance", async () => {
    const env = makeEnv();
    const offerId = await createOffer(env);

    const firstAccept = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );

    const secondAccept = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );
    const body = await secondAccept.json() as { error: { code: string } };

    expect(firstAccept.status).toBe(200);
    expect(secondAccept.status).toBe(409);
    expect(body.error.code).toBe("offer_already_accepted");
    expect(env.database.events.size).toBe(1);
  });

  it("rejects acceptance after rejection", async () => {
    const env = makeEnv();
    const offerId = await createOffer(env);

    await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/reject`, {
        method: "POST"
      }),
      env
    );

    const acceptResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${offerId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );
    const body = await acceptResponse.json() as { error: { code: string } };

    expect(acceptResponse.status).toBe(409);
    expect(body.error.code).toBe("offer_not_acceptable");
    expect(env.database.events.size).toBe(0);
  });
});

async function createOffer(env: ReturnType<typeof makeEnv>): Promise<string> {
  const createResponse = await worker.fetch(
    new Request(`${API_BASE}/authorization-offers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeOfferRequest())
    }),
    env
  );
  const created = await createResponse.json() as { offer_id: string };
  return created.offer_id;
}
