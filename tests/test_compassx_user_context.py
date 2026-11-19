from unittest.mock import patch

import pytest

from backend.services.compassx_users import (
    CompassxUserError,
    actor_from_compassx,
    user_token_from_header,
)


def test_workload_identity_is_not_a_user():
    assert user_token_from_header("id_app_c8e225b8db0e") is None
    assert user_token_from_header("Bearer id_app_c8e225b8db0e") is None
    assert user_token_from_header("Bearer user-jwt") == "user-jwt"
    assert user_token_from_header(None) is None


def test_actor_uses_compassx_email_and_workspace_role():
    me = {
        "id": "user-1",
        "email": "vishal@example.com",
        "display_name": "Vishal",
        "account_role": "account_viewer",
        "status": "active",
    }
    members = [
        {
            "principal_type": "user",
            "user_id": "user-1",
            "email": "vishal@example.com",
            "display_name": "Vishal",
            "role_id": "workspace_admin",
        },
        {
            "principal_type": "group",
            "principal_id": "group-1",
            "display_name": "Admins",
            "role_id": "workspace_admin",
        },
    ]

    def fake_get(path, token, workspace_slug):
        assert token == "user-jwt"
        assert workspace_slug == "mitarsh"
        if path == "/api/um/auth/me":
            return me
        if path == "/api/um/workspaces/ws-1/members":
            return members
        raise AssertionError(path)

    with patch("backend.services.compassx_users._get", side_effect=fake_get):
        actor_id, roles, user = actor_from_compassx("Bearer user-jwt", "ws-1", "mitarsh")

    assert actor_id == "vishal@example.com"
    assert roles == ["workspace_admin"]
    assert user["id"] == "user-1"


def test_missing_token_does_not_call_compassx():
    with patch("backend.services.compassx_users._get") as get:
        assert actor_from_compassx(None, "ws-1", "mitarsh") is None
        get.assert_not_called()


def test_compassx_error_is_raised():
    with patch(
        "backend.services.compassx_users._get",
        side_effect=CompassxUserError(401, "Not authenticated"),
    ):
        with pytest.raises(CompassxUserError) as caught:
            actor_from_compassx("user-jwt", "ws-1", "mitarsh")
    assert caught.value.status_code == 401
