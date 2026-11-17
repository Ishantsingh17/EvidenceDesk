"""Standard error response shape (schema §10) and the application error type.

Services raise `AppError` with a stable code from schema §10.1; the handler turns it into
the standard JSON body. Stack traces are never returned to the client.
"""

import logging
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """A safe, expected failure with a stable error code and HTTP status."""

    def __init__(self, code: str, message: str, status_code: int, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": str(uuid.uuid4()),
        }
    }


async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.details))


async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [".".join(str(p) for p in err.get("loc", ())) for err in exc.errors()]
    return JSONResponse(
        status_code=422,
        content=error_body("VALIDATION_ERROR", "The request is invalid.", {"fields": fields}),
    )


async def _http_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
    message = "This endpoint does not exist." if exc.status_code == 404 else str(exc.detail)
    return JSONResponse(status_code=exc.status_code, content=error_body(code, message))


async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
    body = error_body("INTERNAL_ERROR", "An unexpected error occurred.")
    logger.error(
        "Unhandled error request_id=%s type=%s",
        body["error"]["request_id"],
        type(exc).__name__,
    )
    return JSONResponse(status_code=500, content=body)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
