import { NextResponse } from "next/server";

import type { CadErrorResponse, CadSpringRequest } from "@/lib/cad/types";

/**
 * POST /api/cad/generate
 *
 * Server-side proxy to the companion Python CAD service. The browser talks to
 * this route so the CAD service's deployed location never reaches the bundle.
 *
 * Route Handlers are not cached by default, and POST is never cached, so no
 * cache opt-out is needed here.
 */

const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL ?? "http://localhost:8000";

/**
 * Generating four states with STEP round-trip verification takes a few seconds;
 * this is a generous ceiling that still fails rather than hanging a tab.
 */
const CAD_TIMEOUT_MS = Number(process.env.CAD_TIMEOUT_MS ?? 120_000);

function errorResponse(
  code: string,
  message: string,
  details: string[],
  status: number,
): NextResponse<CadErrorResponse> {
  return NextResponse.json({ success: false, code, message, details }, { status });
}

export async function POST(request: Request) {
  let body: CadSpringRequest;
  try {
    body = (await request.json()) as CadSpringRequest;
  } catch {
    return errorResponse("INVALID_REQUEST", "The CAD request body was not valid JSON.", [], 400);
  }

  try {
    const upstream = await fetch(`${CAD_SERVICE_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CAD_TIMEOUT_MS),
      cache: "no-store",
    });

    // Pass the service's structured body through untouched, including errors:
    // it already speaks {success, code, message, details}.
    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      return errorResponse(
        "BAD_GATEWAY",
        "The CAD service returned a response that could not be parsed.",
        [`HTTP ${upstream.status} ${upstream.statusText}`],
        502,
      );
    }

    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return errorResponse(
        "CAD_TIMEOUT",
        "The CAD service did not respond in time.",
        [
          `No response after ${Math.round(CAD_TIMEOUT_MS / 1000)} s.`,
          "Generating several states can be slow on a cold service; try fewer configurations.",
        ],
        504,
      );
    }

    return errorResponse(
      "CAD_SERVICE_UNAVAILABLE",
      "The CAD service is not reachable.",
      [
        `Tried ${CAD_SERVICE_URL}/generate.`,
        "Start it with: cd cad-service && uvicorn app.main:app --port 8000",
        error instanceof Error ? error.message : String(error),
      ],
      503,
    );
  }
}
