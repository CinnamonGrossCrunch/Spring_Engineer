import { NextResponse } from "next/server";
import type { CadHealthResponse } from "@/lib/cad/types";

const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL || "http://localhost:8000";

/**
 * GET /api/cad/health
 *
 * Health check endpoint for the CAD service.
 */
export async function GET() {
  try {
    const response = await fetch(`${CAD_SERVICE_URL}/health`);
    const data = (await response.json()) as CadHealthResponse;

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        cadKernel: "unknown",
        library: "unknown",
        libraryVersion: "unknown",
        generatorVersion: "unknown",
        timestamp: new Date().toISOString(),
      } as CadHealthResponse,
      { status: 503 }
    );
  }
}
