import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { API_BASE, makeEnv } from "./helpers/mock-d1";

describe("provenance loops", () => {
  it("creates a live provenance loop and returns current-window metadata", async () => {
    const env = makeEnv();
    const createResponse = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code_step_seconds: 10
        })
      }),
      env
    );
    const created = await createResponse.json() as {
      loop_id: string;
      status: string;
      code_step_seconds: number;
      verify_url: string;
      observed_windows: Array<{ code: string; window_start: string; window_end: string }>;
    };

    const currentResponse = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops/${created.loop_id}/current`),
      env
    );
    const current = await currentResponse.json() as {
      loop_id: string;
      status: string;
      current_code: string;
      window_start: string;
      window_end: string;
      seconds_remaining: number;
      verify_url: string;
    };

    expect(createResponse.status).toBe(201);
    expect(created.loop_id).toMatch(/^LP-[0-9A-F]+$/);
    expect(created.status).toBe("active");
    expect(created.code_step_seconds).toBe(10);
    expect(created.verify_url).toContain(`loop_id=${created.loop_id}`);
    expect(created.observed_windows[0]?.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);

    expect(currentResponse.status).toBe(200);
    expect(current.loop_id).toBe(created.loop_id);
    expect(current.status).toBe("active");
    expect(current.current_code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(current.seconds_remaining).toBeGreaterThan(0);
    expect(current.verify_url).toBe(created.verify_url);
    expect(env.database.listProvenanceWindows(created.loop_id).length).toBeGreaterThan(0);
  });

  it("fetches stored provenance loop metadata and observed windows", async () => {
    const env = makeEnv();
    const created = await createLoop(env);

    await worker.fetch(
      new Request(`${API_BASE}/provenance-loops/${created.loop_id}/current`),
      env
    );

    const fetchResponse = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops/${created.loop_id}`),
      env
    );
    const loop = await fetchResponse.json() as {
      loop_id: string;
      created_at: string;
      expires_at: string;
      status: string;
      code_step_seconds: number;
      verify_url: string;
      observed_windows: Array<{ code: string; window_start: string; window_end: string }>;
    };

    expect(fetchResponse.status).toBe(200);
    expect(loop.loop_id).toBe(created.loop_id);
    expect(loop.status).toBe("active");
    expect(loop.code_step_seconds).toBe(10);
    expect(loop.created_at).toContain("T");
    expect(loop.expires_at).toContain("T");
    expect(loop.verify_url).toContain(`loop_id=${created.loop_id}`);
    expect(loop.observed_windows.length).toBeGreaterThan(0);
  });

  it("marks expired loops as expired and blocks current-code reads", async () => {
    const env = makeEnv();
    const created = await createLoop(env);
    env.database.patchProvenanceLoop(created.loop_id, {
      expires_at: new Date(Date.now() - 60_000).toISOString()
    });

    const currentResponse = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops/${created.loop_id}/current`),
      env
    );
    const currentBody = await currentResponse.json() as { error: { code: string } };

    const fetchResponse = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops/${created.loop_id}`),
      env
    );
    const fetchedLoop = await fetchResponse.json() as { status: string };

    expect(currentResponse.status).toBe(409);
    expect(currentBody.error.code).toBe("provenance_loop_expired");
    expect(fetchResponse.status).toBe(200);
    expect(fetchedLoop.status).toBe("expired");
  });

  it("rejects unsupported provenance code step values", async () => {
    const response = await worker.fetch(
      new Request(`${API_BASE}/provenance-loops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code_step_seconds: 12
        })
      }),
      makeEnv()
    );
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_code_step_seconds");
  });
});

async function createLoop(env: ReturnType<typeof makeEnv>) {
  const response = await worker.fetch(
    new Request(`${API_BASE}/provenance-loops`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }),
    env
  );
  return response.json() as Promise<{ loop_id: string }>;
}
