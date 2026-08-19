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
const HEALTH_TIMEOUT_MS = 5_000;

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
          ? `No response from ${CAD_SERVICE_URL} within ${HEALTH_TIMEOUT_MS} ms.`
          : `Could not reach ${CAD_SERVICE_URL}.`,
      ),
      { status: 503 },
    );
  }
}
