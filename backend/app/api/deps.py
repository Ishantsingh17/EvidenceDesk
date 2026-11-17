from fastapi import Request

from app.runtime import Runtime


def runtime_of(request: Request) -> Runtime:
    return request.app.state.runtime
