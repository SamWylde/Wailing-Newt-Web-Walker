import html
import secrets
import threading
import time

from flask import Blueprint, jsonify, request, session

from src.app_state import get_session_settings, get_settings_for_session_id
from src.auth_utils import login_required
from src.core.ga4_service import GA4AuthError, GA4Service, GA4ServiceError

ga4_bp = Blueprint("ga4", __name__)

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


@ga4_bp.route("/api/ga4/oauth/start", methods=["GET"])
@login_required
def ga4_oauth_start():
    try:
        # Ensure a session-bound settings manager exists before creating OAuth state.
        get_session_settings()

        if not GA4Service.has_oauth_credentials():
            return jsonify(
                {
                    "success": False,
                    "error": (
                        "GA4 OAuth is not configured. Set GA4_OAUTH_CLIENT_ID, "
                        "GA4_OAUTH_CLIENT_SECRET, and GA4_OAUTH_REDIRECT_URI, or "
                        "create ga4_oauth.local.json."
                    ),
                }
            ), 400

        state = secrets.token_urlsafe(32)
        with oauth_state_lock:
            _cleanup_expired_oauth_states()
            oauth_state_store[state] = {
                "session_id": session.get("session_id"),
                "user_id": session.get("user_id"),
                "tier": session.get("tier", "guest"),
                "expires_at": time.time() + OAUTH_STATE_TTL_SECONDS,
            }

        return jsonify({"success": True, "auth_url": GA4Service.build_oauth_url(state), "state": state})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@ga4_bp.route("/api/ga4/oauth/callback", methods=["GET"])
def ga4_oauth_callback():
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
        token_record = GA4Service.exchange_code_for_tokens(code)
        GA4Service.save_tokens_to_settings(settings_manager, token_record, connected=True)
        settings_manager.save_settings(
            {
                "ga4Connected": True,
                "ga4LastSyncStatus": "connected",
                "ga4LastSyncError": "",
            }
        )
        return _render_callback_html("Google Connected", "Google Analytics is now connected.")
    except Exception as exc:
        settings_manager.save_settings(
            {
                "ga4Connected": False,
                "ga4LastSyncStatus": "oauth_error",
                "ga4LastSyncError": str(exc),
            }
        )
        return _render_callback_html("Google Sign-in Failed", str(exc), is_error=True)


@ga4_bp.route("/api/ga4/oauth/status", methods=["GET"])
@login_required
def ga4_oauth_status():
    settings = get_session_settings().get_settings()
    token_blob = settings.get("ga4OauthTokens") or {}
    has_tokens = bool(token_blob)
    return jsonify(
        {
            "success": True,
            "connected": bool(settings.get("ga4Connected") and has_tokens),
            "has_credentials": GA4Service.has_oauth_credentials(),
            "account_id": settings.get("ga4AccountId", ""),
            "account_name": settings.get("ga4AccountName", ""),
            "property_id": settings.get("ga4PropertyId", ""),
            "property_name": settings.get("ga4PropertyName", ""),
            "stream_id": settings.get("ga4DataStreamId", ""),
            "stream_name": settings.get("ga4DataStreamName", ""),
            "last_sync_at": settings.get("ga4LastSyncAt", ""),
            "last_sync_status": settings.get("ga4LastSyncStatus", ""),
            "last_sync_error": settings.get("ga4LastSyncError", ""),
        }
    )


@ga4_bp.route("/api/ga4/oauth/disconnect", methods=["POST"])
@login_required
def ga4_oauth_disconnect():
    settings_manager = get_session_settings()
    success, message = settings_manager.save_settings(
        {
            "ga4Connected": False,
            "ga4OauthTokens": {},
            "ga4AccountId": "",
            "ga4AccountName": "",
            "ga4PropertyId": "",
            "ga4PropertyName": "",
            "ga4DataStreamId": "",
            "ga4DataStreamName": "",
            "ga4LastSyncStatus": "disconnected",
            "ga4LastSyncError": "",
        }
    )
    return jsonify({"success": bool(success), "message": message})


@ga4_bp.route("/api/ga4/accounts", methods=["GET"])
@login_required
def ga4_accounts():
    settings_manager = get_session_settings()
    try:
        accounts = GA4Service.list_account_summaries(settings_manager)
        return jsonify({"success": True, "accounts": accounts})
    except (GA4AuthError, GA4ServiceError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@ga4_bp.route("/api/ga4/properties/<property_id>/streams", methods=["GET"])
@login_required
def ga4_property_streams(property_id):
    settings_manager = get_session_settings()
    try:
        streams = GA4Service.list_property_streams(settings_manager, property_id)
        return jsonify({"success": True, "streams": streams})
    except (GA4AuthError, GA4ServiceError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@ga4_bp.route("/api/ga4/catalog", methods=["GET"])
@login_required
def ga4_catalog():
    return jsonify({"success": True, "catalog": GA4Service.get_catalog()})
