/**
 * CAD Service Client
 *
 * Browser-safe client for communicating with the CAD service via the
 * Next.js server-side proxy. Handles request formatting, file download,
 * and error presentation.
 */

import type {
  CadSpringRequest,
  CadResponse,
  CadHealthResponse,
  SpringConfiguration,
} from "./types";

const DEFAULT_CAD_SERVICE_URL = "http://localhost:8000";

export interface CadClientConfig {
  cadServiceUrl?: string;
}

export class CadServiceError extends Error {
  constructor(
    public code: string,
    public details: string[],
    message: string
  ) {
    super(message);
    this.name = "CadServiceError";
  }
}

/**
 * Client for CAD generation. Calls the local Next.js API proxy.
 */
export class CadClient {
  private cadServiceUrl: string;

  constructor(config: CadClientConfig = {}) {
    this.cadServiceUrl = config.cadServiceUrl || DEFAULT_CAD_SERVICE_URL;
  }

  /**
   * Generate CAD for a spring candidate.
   * Returns base64-encoded STEP files.
   */
  async generateSpring(request: CadSpringRequest): Promise<CadResponse> {
    try {
      const response = await fetch("/api/cad/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = (await response.json()) as CadResponse;

      if (!response.ok) {
        if (!data.success && "code" in data) {
          throw new CadServiceError(data.code, data.details, data.message);
        }
        throw new Error(
          `CAD service error: ${response.status} ${response.statusText}`
        );
      }

      if (!data.success && "code" in data) {
        throw new CadServiceError(data.code, data.details, data.message);
      }

      return data;
    } catch (error) {
      if (error instanceof CadServiceError) throw error;
      throw new Error(
        `Failed to generate CAD: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check CAD service health.
   */
  async checkHealth(): Promise<CadHealthResponse> {
    try {
      const response = await fetch("/api/cad/health");
      if (!response.ok) {
        throw new Error(
          `CAD service health check failed: ${response.statusText}`
        );
      }
      return (await response.json()) as CadHealthResponse;
    } catch (error) {
      throw new Error(
        `CAD service health check error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Download a base64-encoded STEP file.
   */
  static downloadFile(base64Content: string, filename: string): void {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/step" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Download a ZIP file (also base64-encoded).
   */
  static downloadZip(base64Content: string, filename: string): void {
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const cadClient = new CadClient();
