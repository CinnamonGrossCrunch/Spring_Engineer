/**
 * Browser-side CAD client.
 *
 * Always talks to the local Next.js proxy at /api/cad/*, never to the CAD
 * service directly, so the deployed location of the Python service is not
 * baked into the bundle.
 */

import type {
  CadFile,
  CadHealthResponse,
  CadResponse,
  CadSpringRequest,
  CadSpringResponse,
} from "./types";

/** Structured failure carrying the service's error code and details. */
export class CadServiceError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = "CadServiceError";
    this.code = code;
    this.details = details;
  }
}

function isErrorBody(body: unknown): body is { code: string; message: string; details?: string[] } {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof (body as { code: unknown }).code === "string"
  );
}

/** POST a CAD request through the proxy and return the generated artifacts. */
export async function generateSpringCad(
  request: CadSpringRequest,
  signal?: AbortSignal,
): Promise<CadSpringResponse> {
  let response: Response;
  try {
    response = await fetch("/api/cad/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CadServiceError("CANCELLED", "CAD generation was cancelled.");
    }
    throw new CadServiceError(
      "NETWORK_ERROR",
      "Could not reach the CAD service.",
      [error instanceof Error ? error.message : String(error)],
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CadServiceError(
      "BAD_RESPONSE",
      `The CAD service returned an unreadable response (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || (body as CadResponse)?.success === false) {
    if (isErrorBody(body)) {
      throw new CadServiceError(body.code, body.message, body.details ?? []);
    }
    throw new CadServiceError(
      "SERVICE_ERROR",
      `The CAD service failed (HTTP ${response.status}).`,
    );
  }

  const ok = body as CadSpringResponse;
  if (!ok.files?.length) {
    throw new CadServiceError(
      "EMPTY_RESULT",
      "The CAD service reported success but returned no files.",
    );
  }
  return ok;
}

/** Diagnostics only — the UI does not poll this. */
export async function checkCadHealth(signal?: AbortSignal): Promise<CadHealthResponse> {
  const response = await fetch("/api/cad/health", { signal });
  return (await response.json()) as CadHealthResponse;
}

/** Turn a base64 payload into a Blob without an intermediate data URL. */
function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

/**
 * Save one generated artifact.
 *
 * The service decides the filename and MIME type, so this works uniformly for
 * a single STEP, a ZIP bundle, or a STEP assembly.
 */
export function downloadCadFile(file: CadFile): void {
  const blob = base64ToBlob(file.content, file.contentType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Save every artifact from a response. */
export function downloadAll(response: CadSpringResponse): void {
  response.files.forEach(downloadCadFile);
}

/** Human-readable size for the download button. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
