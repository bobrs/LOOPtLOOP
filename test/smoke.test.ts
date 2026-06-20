import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { API_BASE, VALID_HASH, listObjectKeys, makeEnv, makeOfferRequest } from "./helpers/mock-d1";

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
