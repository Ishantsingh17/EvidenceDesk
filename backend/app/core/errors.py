"""Standard error response shape (schema §10).

Only the two generic codes are wired now; feature-specific codes arrive with
their features. Stack traces are never returned to the client.
"""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": str(uuid.uuid4()),
        }
    }


async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [".".join(str(p) for p in err.get("loc", ())) for err in exc.errors()]
    return JSONResponse(
        status_code=422,
        content=error_body("VALIDATION_ERROR", "The request is invalid.", {"fields": fields}),
    )


async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
    body = error_body("INTERNAL_ERROR", "An unexpected error occurred.")
    logger.error(
        "Unhandled error request_id=%s type=%s",
        body["error"]["request_id"],
        type(exc).__name__,
    )
    return JSONResponse(status_code=500, content=body)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
