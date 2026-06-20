import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { API_BASE, CONSENT_PROMPT, makeAcceptanceRequest, makeEnv, makeOfferRequest } from "./helpers/mock-d1";
import { sha256Text } from "../src/utils/hash";

describe("cors", () => {
  it("allows abracadoo preflight requests", async () => {
    const response = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "OPTIONS",
        headers: {
          origin: "https://app.abracadoo.app",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,authorization"
        }
      }),
      makeEnv()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.abracadoo.app");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET,POST,OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type,authorization");
  });

  it("includes allow-origin on GET responses for abracadoo", async () => {
    const env = makeEnv();
    const createResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: {
          origin: "https://app.abracadoo.app",
          "content-type": "application/json"
        },
        body: JSON.stringify(makeOfferRequest())
      }),
      env
    );
    const created = await createResponse.json() as { offer_id: string };

    const response = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${created.offer_id}`, {
        headers: {
          origin: "https://app.abracadoo.app"
        }
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.abracadoo.app");
  });

  it("includes allow-origin on POST accept responses for abracadoo", async () => {
    const env = makeEnv();
    const createResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers`, {
        method: "POST",
        headers: {
          origin: "https://app.abracadoo.app",
          "content-type": "application/json"
        },
        body: JSON.stringify(makeOfferRequest())
      }),
      env
    );
    const created = await createResponse.json() as { offer_id: string };

    const acceptResponse = await worker.fetch(
      new Request(`${API_BASE}/authorization-offers/${created.offer_id}/accept`, {
        method: "POST",
        headers: {
          origin: "https://app.abracadoo.app",
          "content-type": "application/json"
        },
        body: JSON.stringify(makeAcceptanceRequest(await sha256Text(CONSENT_PROMPT)))
      }),
      env
    );

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.headers.get("access-control-allow-origin")).toBe("https://app.abracadoo.app");
  });

  it("does not emit allow-origin for disallowed origins", async () => {
    const env = makeEnv();
    const response = await worker.fetch(
      new Request(`${API_BASE}/missing`, {
        headers: {
          origin: "https://evil.example"
        }
      }),
      env
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
