import html
import secrets
import threading
import time

from flask import Blueprint, jsonify, request, session

from src.app_state import get_session_settings, get_settings_for_session_id
from src.auth_utils import login_required
from src.core.search_console_service import (
    SearchConsoleAuthError,
    SearchConsoleService,
    SearchConsoleServiceError,
)

search_console_bp = Blueprint("search_console", __name__)

OAUTH_STATE_TTL_SECONDS = 10 * 60
oauth_state_store = {}
oauth_state_lock = threading.Lock()


def _cleanup_expired_oauth_states():
    now = time.time()
    expired = [state for state, data in oauth_state_store.items() if data.get("expires_at", 0) < now]
    for state in expired:
        oauth_state_store.pop(state, None)


def _render_callback_html(title, message, is_error=False):
    safe_title = html.escape(title)
    safe_message = html.escape(message)
    color = "#dc2626" if is_error else "#16a34a"
    return f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{safe_title}</title>
</head>
<body style="font-family:Arial,sans-serif;padding:24px;">
  <h2 style="margin:0 0 12px 0;color:{color};">{safe_title}</h2>
  <p style="margin:0 0 16px 0;">{safe_message}</p>
  <p style="margin:0;">You can close this window now.</p>
  <script>
    setTimeout(function() {{
      if (window.opener) {{
        window.close();
      }}
    }}, 1200);
  </script>
</body>
</html>
"""


@search_console_bp.route("/api/search_console/oauth/start", methods=["GET"])
@login_required
def search_console_oauth_start():
    try:
        get_session_settings()
        setup_state = SearchConsoleService.get_oauth_setup_state(request.host_url)

        if not setup_state.get("has_credentials"):
            return jsonify(
                {
                    "success": False,
                    "setup_required": True,
                    "error": (
                        "Google sign-in needs a one-time setup before it can connect to Search Console. "
                        "Use the setup panel in this screen to continue."
                    ),
                    "credential_source": setup_state.get("credential_source", "none"),
                    "suggested_redirect_uri": setup_state.get("suggested_redirect_uri", ""),
                    "config_path": setup_state.get("config_path", "ga4_oauth.local.json"),
                    "setup_error": setup_state.get("setup_error", ""),
                    "setup_steps": setup_state.get("setup_steps", []),
                }
            ), 400

        redirect_uri = SearchConsoleService.get_suggested_redirect_uri(request.host_url)
        state = secrets.token_urlsafe(32)
        with oauth_state_lock:
            _cleanup_expired_oauth_states()
            oauth_state_store[state] = {
                "session_id": session.get("session_id"),
                "user_id": session.get("user_id"),
                "tier": session.get("tier", "guest"),
                "redirect_uri": redirect_uri,
                "expires_at": time.time() + OAUTH_STATE_TTL_SECONDS,
            }

        return jsonify(
            {
                "success": True,
                "auth_url": SearchConsoleService.build_oauth_url(state, redirect_uri=redirect_uri),
                "state": state,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@search_console_bp.route("/api/search_console/oauth/callback", methods=["GET"])
def search_console_oauth_callback():
    error = request.args.get("error")
    if error:
        return _render_callback_html("Google Sign-in Failed", f"OAuth error: {error}", is_error=True)

    code = request.args.get("code", "").strip()
    state = request.args.get("state", "").strip()
    if not code or not state:
        return _render_callback_html("Google Sign-in Failed", "Missing OAuth code or state.", is_error=True)

    with oauth_state_lock:
        _cleanup_expired_oauth_states()
        state_payload = oauth_state_store.pop(state, None)

    if not state_payload:
        return _render_callback_html(
            "Google Sign-in Failed",
            "OAuth state is invalid or expired. Start sign-in again from Crawl Config.",
            is_error=True,
        )

    settings_manager = get_settings_for_session_id(
        state_payload.get("session_id"),
        user_id=state_payload.get("user_id"),
        tier=state_payload.get("tier", "guest"),
    )
    if not settings_manager:
        return _render_callback_html("Google Sign-in Failed", "Session not found for OAuth callback.", is_error=True)

    try:
        token_record = SearchConsoleService.exchange_code_for_tokens(
            code, redirect_uri=state_payload.get("redirect_uri", "")
        )
        SearchConsoleService.save_tokens_to_settings(settings_manager, token_record, connected=True)
        settings_manager.save_settings(
            {
                "gscConnected": True,
                "gscLastSyncStatus": "connected",
                "gscLastSyncError": "",
                "gscLastInspectionStatus": "",
                "gscLastInspectionError": "",
            }
        )
        return _render_callback_html("Google Connected", "Google Search Console is now connected.")
    except Exception as exc:
        settings_manager.save_settings(
            {
                "gscConnected": False,
                "gscLastSyncStatus": "oauth_error",
                "gscLastSyncError": str(exc),
            }
        )
        return _render_callback_html("Google Sign-in Failed", str(exc), is_error=True)


@search_console_bp.route("/api/search_console/oauth/status", methods=["GET"])
@login_required
def search_console_oauth_status():
    settings = get_session_settings().get_settings()
    token_blob = settings.get("gscOauthTokens") or {}
    setup_state = SearchConsoleService.get_oauth_setup_state(request.host_url)
    return jsonify(
        {
            "success": True,
            "connected": bool(settings.get("gscConnected") and bool(token_blob)),
            "has_credentials": setup_state.get("has_credentials", False),
            "setup_required": setup_state.get("setup_required", True),
            "credential_source": setup_state.get("credential_source", "none"),
            "suggested_redirect_uri": setup_state.get("suggested_redirect_uri", ""),
            "config_path": setup_state.get("config_path", "ga4_oauth.local.json"),
            "setup_error": setup_state.get("setup_error", ""),
            "setup_steps": setup_state.get("setup_steps", []),
            "site_url": settings.get("gscSiteUrl", ""),
            "site_name": settings.get("gscSiteName", ""),
            "last_sync_at": settings.get("gscLastSyncAt", ""),
            "last_sync_status": settings.get("gscLastSyncStatus", ""),
            "last_sync_error": settings.get("gscLastSyncError", ""),
            "last_inspection_at": settings.get("gscLastInspectionAt", ""),
            "last_inspection_status": settings.get("gscLastInspectionStatus", ""),
            "last_inspection_error": settings.get("gscLastInspectionError", ""),
        }
    )


@search_console_bp.route("/api/search_console/oauth/configure", methods=["POST"])
@login_required
def search_console_oauth_configure():
    payload = request.get_json(silent=True) or {}
    client_id = str(payload.get("client_id", "")).strip()
    client_secret = str(payload.get("client_secret", "")).strip()
    redirect_uri = str(payload.get("redirect_uri", "")).strip() or SearchConsoleService.get_suggested_redirect_uri(
        request.host_url
    )

    try:
        result = SearchConsoleService.save_local_oauth_credentials(client_id, client_secret, redirect_uri)
        setup_state = SearchConsoleService.get_oauth_setup_state(request.host_url)
        return jsonify(
            {
                "success": True,
                "message": "Setup saved. You can now sign in with Google.",
                "credential_source": setup_state.get("credential_source", result.get("credential_source", "none")),
                "has_credentials": setup_state.get("has_credentials", False),
                "setup_required": setup_state.get("setup_required", True),
                "suggested_redirect_uri": setup_state.get("suggested_redirect_uri", redirect_uri),
                "config_path": setup_state.get("config_path", result.get("config_path", "ga4_oauth.local.json")),
            }
        )
    except SearchConsoleServiceError as exc:
        setup_state = SearchConsoleService.get_oauth_setup_state(request.host_url)
        return (
            jsonify(
                {
                    "success": False,
                    "error": str(exc),
                    "setup_required": setup_state.get("setup_required", True),
                    "credential_source": setup_state.get("credential_source", "none"),
                    "suggested_redirect_uri": setup_state.get("suggested_redirect_uri", ""),
                    "config_path": setup_state.get("config_path", "ga4_oauth.local.json"),
                    "setup_error": setup_state.get("setup_error", ""),
                }
            ),
            400,
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@search_console_bp.route("/api/search_console/oauth/disconnect", methods=["POST"])
@login_required
def search_console_oauth_disconnect():
    settings_manager = get_session_settings()
    success, message = settings_manager.save_settings(
        {
            "gscConnected": False,
            "gscOauthTokens": {},
            "gscSiteUrl": "",
            "gscSiteName": "",
            "gscLastSyncStatus": "disconnected",
            "gscLastSyncError": "",
            "gscLastInspectionStatus": "disconnected",
            "gscLastInspectionError": "",
        }
    )
    return jsonify({"success": bool(success), "message": message})


@search_console_bp.route("/api/search_console/sites", methods=["GET"])
@login_required
def search_console_sites():
    settings_manager = get_session_settings()
    try:
        sites = SearchConsoleService.list_sites(settings_manager)
        return jsonify({"success": True, "sites": sites})
    except (SearchConsoleAuthError, SearchConsoleServiceError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@search_console_bp.route("/api/search_console/catalog", methods=["GET"])
@login_required
def search_console_catalog():
    return jsonify({"success": True, "catalog": SearchConsoleService.get_catalog()})
