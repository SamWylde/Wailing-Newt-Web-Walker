from flask import Blueprint, jsonify, request
from urllib.parse import urlparse

from src.app_state import get_session_settings
from src.auth_utils import login_required
from src.core.pagespeed_service import PageSpeedService, PageSpeedServiceError

pagespeed_bp = Blueprint("pagespeed", __name__)


def _normalize_verify_url(raw_url):
    value = str(raw_url or "").strip()
    if not value:
        return "https://www.example.com"
    parsed = urlparse(value)
    if not parsed.scheme:
        value = f"https://{value}"
        parsed = urlparse(value)
    if not parsed.netloc:
        return "https://www.example.com"
    return value


def _build_status_payload(settings):
    api_key = str(settings.get("pagespeedApiKey") or settings.get("googleApiKey") or "").strip()
    connected_flag = bool(settings.get("pagespeedConnected", False))
    source = str(settings.get("pagespeedSource", "remote") or "remote")
    enabled = bool(settings.get("pagespeedEnabled", settings.get("enablePageSpeed", False)))
    auto_connect = bool(settings.get("pagespeedAutoConnect", True))
    selected_devices = settings.get("pagespeedSelectedDevices", ["mobile", "desktop"])
    selected_metric_groups = settings.get(
        "pagespeedSelectedMetricGroups",
        PageSpeedService.get_catalog().get("defaultMetricGroups", []),
    )

    return {
        "success": True,
        "connected": connected_flag and bool(api_key),
        "has_api_key": bool(api_key),
        "api_key_masked": f"...{api_key[-4:]}" if len(api_key) >= 4 else "",
        "source": source,
        "enabled": enabled,
        "auto_connect": auto_connect,
        "selected_devices": selected_devices if isinstance(selected_devices, list) else ["mobile", "desktop"],
        "selected_metric_groups": selected_metric_groups
        if isinstance(selected_metric_groups, list)
        else PageSpeedService.get_catalog().get("defaultMetricGroups", []),
        "last_sync_at": settings.get("pagespeedLastSyncAt", ""),
        "last_sync_status": settings.get("pagespeedLastSyncStatus", ""),
        "last_sync_error": settings.get("pagespeedLastSyncError", ""),
    }


@pagespeed_bp.route("/api/pagespeed/catalog", methods=["GET"])
@login_required
def pagespeed_catalog():
    return jsonify({"success": True, "catalog": PageSpeedService.get_catalog()})


@pagespeed_bp.route("/api/pagespeed/status", methods=["GET"])
@login_required
def pagespeed_status():
    settings = get_session_settings().get_settings()
    return jsonify(_build_status_payload(settings))


@pagespeed_bp.route("/api/pagespeed/connect", methods=["POST"])
@login_required
def pagespeed_connect():
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", "remote") or "remote").strip() or "remote"
    api_key = str(payload.get("api_key", "")).strip()
    auto_connect = bool(payload.get("auto_connect", True))
    enabled = bool(payload.get("enabled", True))
    verify_url = _normalize_verify_url(payload.get("verify_url", "https://www.example.com"))

    if source != "remote":
        return jsonify({"success": False, "error": "Only remote PageSpeed source is currently supported."}), 400

    if not api_key:
        return jsonify({"success": False, "error": "Enter your PageSpeed API key to connect."}), 400

    try:
        validation = PageSpeedService.validate_api_key(api_key, test_url=verify_url)
    except PageSpeedServiceError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

    settings_manager = get_session_settings()
    success, message = settings_manager.save_settings(
        {
            "pagespeedConnected": True,
            "pagespeedSource": source,
            "pagespeedApiKey": api_key,
            "googleApiKey": api_key,
            "pagespeedAutoConnect": auto_connect,
            "pagespeedEnabled": enabled,
            "enablePageSpeed": enabled,
            "pagespeedLastSyncStatus": "connected",
            "pagespeedLastSyncError": "",
        }
    )
    if not success:
        return jsonify({"success": False, "error": message or "Could not save PageSpeed settings."}), 500

    settings = settings_manager.get_settings()
    return jsonify(
        {
            **_build_status_payload(settings),
            "message": "PageSpeed Insights connected successfully.",
            "validation": validation,
        }
    )


@pagespeed_bp.route("/api/pagespeed/disconnect", methods=["POST"])
@login_required
def pagespeed_disconnect():
    settings_manager = get_session_settings()
    success, message = settings_manager.save_settings(
        {
            "pagespeedConnected": False,
            "pagespeedApiKey": "",
            "googleApiKey": "",
            "pagespeedEnabled": False,
            "enablePageSpeed": False,
            "pagespeedLastSyncStatus": "disconnected",
            "pagespeedLastSyncError": "",
        }
    )
    if not success:
        return jsonify({"success": False, "error": message or "Could not update PageSpeed settings."}), 500

    settings = settings_manager.get_settings()
    return jsonify({**_build_status_payload(settings), "message": "PageSpeed Insights disconnected."})
