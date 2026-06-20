import type { Env } from "./types";
import { corsPreflight, withCors } from "./utils/cors";
import { json, jsonError } from "./utils/json";

// This is an intentional walking-skeleton router. Codex should replace the TODO
// branches with D1-backed implementations that match docs/private-authorization-witnessing-v0.1.md.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return corsPreflight(request, env);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    let response: Response;

    try {
      if (path === "/" || path === "/v0") {
        response = json({
          service: "LOOPtLOOP Private Authorization Witness API",
          version: "0.1.0-seed",
          canonical_base_url: "https://api.looptloop.online/v0",
          invariant: "Private payload stays private. This API witnesses hashes and consent envelopes, not private payloads."
        });
      } else if (request.method === "POST" && path === "/v0/authorization-offers") {
        response = jsonError("not_implemented", "Create authorization offer is not implemented yet.", 501);
      } else if (request.method === "GET" && /^\/v0\/authorization-offers\/[^/]+$/.test(path)) {
        response = jsonError("not_implemented", "Get authorization offer is not implemented yet.", 501);
      } else if (request.method === "POST" && /^\/v0\/authorization-offers\/[^/]+\/accept$/.test(path)) {
        response = jsonError("not_implemented", "Accept authorization offer is not implemented yet.", 501);
      } else if (request.method === "POST" && /^\/v0\/authorization-offers\/[^/]+\/reject$/.test(path)) {
        response = jsonError("not_implemented", "Reject authorization offer is not implemented yet.", 501);
      } else if (request.method === "GET" && /^\/v0\/authorization-events\/[^/]+$/.test(path)) {
        response = jsonError("not_implemented", "Get authorization event is not implemented yet.", 501);
      } else if (request.method === "GET" && /^\/v0\/authorization-events\/[^/]+\/verify$/.test(path)) {
        response = jsonError("not_implemented", "Verify authorization event is not implemented yet.", 501);
      } else {
        response = jsonError("not_found", "Route not found.", 404);
      }
    } catch (error) {
      response = jsonError("internal_error", error instanceof Error ? error.message : "Unknown error", 500);
    }

    return withCors(request, env, response);
  }
};
