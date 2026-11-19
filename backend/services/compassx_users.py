"""Read the signed-in person from CompassX. The app workload identity is not a user."""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from backend.config import settings


class CompassxUserError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def user_token_from_header(value: Optional[str]) -> Optional[str]:
    """The portal user JWT. An app workload id is never a person."""
    if not value:
        return None
    token = value.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token or token.startswith("id_app_"):
        return None
    return token


def _base_url() -> str:
    raw = (
        os.getenv("COMPASSX_BACKEND_URL")
        or os.getenv("COMPASSX_API_URL")
        or settings.COMPASSX_BACKEND_URL
        or ""
    )
    return raw.rstrip("/")


def _headers(token: str, workspace_slug: Optional[str]) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if workspace_slug:
        headers["X-Workspace-Slug"] = workspace_slug
    return headers


def _get(path: str, token: str, workspace_slug: Optional[str]) -> Any:
    base = _base_url()
    if not base:
        raise CompassxUserError(503, "CompassX backend URL is not configured")
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.get(f"{base}{path}", headers=_headers(token, workspace_slug))
    except httpx.HTTPError as exc:
        raise CompassxUserError(502, f"CompassX user request failed: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise CompassxUserError(response.status_code, detail)
    return response.json()


def fetch_current_user(token: str, workspace_slug: Optional[str]) -> dict[str, Any]:
    body = _get("/api/um/auth/me", token, workspace_slug)
    if not isinstance(body, dict):
        raise CompassxUserError(502, "CompassX returned an unexpected user")
    return body


def fetch_workspace_members(
    token: str,
    workspace_id: str,
    workspace_slug: Optional[str],
) -> list[dict[str, Any]]:
    body = _get(f"/api/um/workspaces/{workspace_id}/members", token, workspace_slug)
    if not isinstance(body, list):
        raise CompassxUserError(502, "CompassX returned an unexpected member list")
    return [row for row in body if isinstance(row, dict)]


def actor_from_compassx(
    token: Optional[str],
    workspace_id: Optional[str],
    workspace_slug: Optional[str],
) -> Optional[tuple[str, list[str], dict[str, Any]]]:
    """Return (actor id, roles, user) for the signed-in CompassX user.

    Actor id is the email when CompassX has one, otherwise the user id.
    """
    clean = user_token_from_header(token)
    if not clean:
        return None
    user = fetch_current_user(clean, workspace_slug)
    actor_id = (user.get("email") or user.get("id") or "").strip()
    if not actor_id:
        raise CompassxUserError(502, "CompassX user has no email or id")
    roles: list[str] = []
    account_role = user.get("account_role")
    if isinstance(account_role, str) and account_role:
        roles.append(account_role)
    if workspace_id:
        try:
            for member in fetch_workspace_members(clean, workspace_id, workspace_slug):
                same_user = member.get("user_id") == user.get("id") or (
                    member.get("email") and member.get("email") == user.get("email")
                )
                if member.get("principal_type") == "user" and same_user and member.get("role_id"):
                    roles = [str(member["role_id"])]
                    break
        except CompassxUserError:
            pass
    return actor_id, roles, user
