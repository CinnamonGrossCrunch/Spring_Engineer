import { NextResponse } from "next/server";
import type { CadSpringRequest, CadResponse } from "@/lib/cad/types";

const CAD_SERVICE_URL = process.env.CAD_SERVICE_URL || "http://localhost:8000";

/**
 * POST /api/cad/generate
 *
 * Proxy endpoint that forwards CAD generation requests to the Python service.
 * The browser calls this endpoint instead of calling the CAD service directly,
 * keeping the frontend decoupled from the CAD service deployment.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CadSpringRequest;

    const response = await fetch(`${CAD_SERVICE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as CadResponse;

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        code: "SERVICE_ERROR",
        message: "CAD service error",
        details: [error instanceof Error ? error.message : String(error)],
      } as CadResponse,
      { status: 500 }
    );
  }
}
