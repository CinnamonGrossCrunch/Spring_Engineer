import { NextResponse } from "next/server";

import type { CadHealthResponse } from "@/lib/cad/types";

/**
 * GET /api/cad/health
 *
 * Deployment diagnostic for the companion CAD service. Not polled by the UI.
 *
 * Forced dynamic so `next build` never tries to reach the CAD service while
 * prerendering.
 */

export const dynamic = "force-dynamic";

const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL ?? "http://localhost:8000";

/**
 * Must exceed a container cold start, or a healthy-but-idle service reports as
 * degraded. The CAD service scales to zero after five minutes and takes ~8 s to
 * come back, so a 5 s budget produced spurious failures.
 */
const HEALTH_TIMEOUT_MS = Number(process.env.CAD_HEALTH_TIMEOUT_MS ?? 20_000);

function degraded(reason: string): CadHealthResponse & { reason: string } {
  return {
    status: "degraded",
    cadKernel: "unknown",
    library: "build123d",
    libraryVersion: "unavailable",
    generatorVersion: "unavailable",
    endModelVersion: "unavailable",
    timestamp: new Date().toISOString(),
    reason,
  };
}

export async function GET() {
  try {
    const upstream = await fetch(`${CAD_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        degraded(`CAD service replied HTTP ${upstream.status}.`),
        { status: 503 },
      );
    }

    return NextResponse.json((await upstream.json()) as CadHealthResponse);
  } catch (error) {
    return NextResponse.json(
      degraded(
        error instanceof DOMException && error.name === "TimeoutError"
          ? `No response from ${CAD_SERVICE_URL} within ${HEALTH_TIMEOUT_MS} ms. ` +
            "The service may still be starting from cold."
          : `Could not reach ${CAD_SERVICE_URL}.`,
      ),
      { status: 503 },
    );
  }
}
