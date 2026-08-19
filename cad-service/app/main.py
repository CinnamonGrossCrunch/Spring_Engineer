"""
FastAPI surface for the spring CAD service.

Thin by design: parse, delegate to `generator.generate_cad`, translate
`CadError` into a structured JSON body. No Python traceback ever reaches a
client.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .errors import CadError
from .generator import generate_cad
from .schemas import CadHealthResponse, CadSpringRequest, CadSpringResponse
from .spring_end_model import CAD_GENERATOR_VERSION, END_MODEL_VERSION

log = logging.getLogger("spring-cad")

app = FastAPI(
    title="Spring CAD Service",
    version=CAD_GENERATOR_VERSION,
    description=(
        "Generates nominal squared-and-ground compression spring B-rep geometry "
        "from already-derived V2 candidate values and exports STEP. "
        "Does not compute spring physics."
    ),
)


@app.exception_handler(CadError)
async def cad_error_handler(_request: Request, exc: CadError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request,
                                   exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        location = ".".join(str(p) for p in err.get("loc", ()) if p != "body")
        details.append(f"{location or 'request'}: {err.get('msg', 'invalid value')}")
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "code": "INVALID_REQUEST",
            "message": "The CAD request was not well formed.",
            "details": details,
        },
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    # Log the traceback server-side; return only a stable code to the client.
    log.exception("Unhandled CAD service error")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "code": "INTERNAL_ERROR",
            "message": "The CAD service hit an unexpected internal error.",
            "details": [type(exc).__name__],
        },
    )


@app.get("/health", response_model=CadHealthResponse)
def health() -> CadHealthResponse:
    """Diagnostics for deployment checks. Not intended for continuous polling."""
    try:
        import build123d

        library_version = getattr(build123d, "__version__", "unknown")
        status = "ok"
    except Exception:  # noqa: BLE001
        library_version = "unavailable"
        status = "degraded"

    return CadHealthResponse(
        status=status,
        cadKernel="OpenCascade",
        library="build123d",
        libraryVersion=library_version,
        generatorVersion=CAD_GENERATOR_VERSION,
        endModelVersion=END_MODEL_VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post("/generate", response_model=CadSpringResponse)
def generate(request: CadSpringRequest) -> CadSpringResponse:
    """
    Generate STEP geometry for the requested configurations of one candidate.

    Synchronous: generation is seconds, not minutes, so there is no job queue
    and the client shows an indeterminate progress state rather than a fake
    percentage.
    """
    return generate_cad(request)
