import copy
from datetime import datetime, timezone

import requests

PAGESPEED_API_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

PAGESPEED_CATALOG = {
    "sources": [
        {"id": "remote", "label": "Remote (Google PageSpeed Insights API)"},
    ],
    "devices": [
        {"id": "mobile", "label": "Mobile", "defaultSelected": True},
        {"id": "desktop", "label": "Desktop", "defaultSelected": True},
    ],
    "metricGroups": [
        {"id": "overview", "label": "Overview", "defaultSelected": True},
        {"id": "crux_metrics", "label": "CrUX Metrics", "defaultSelected": True},
        {"id": "lighthouse_metrics", "label": "Lighthouse Metrics", "defaultSelected": True},
        {"id": "insights", "label": "Insights", "defaultSelected": True},
        {"id": "diagnostics", "label": "Diagnostics", "defaultSelected": True},
        {"id": "mobile_friendly", "label": "Mobile Friendly", "defaultSelected": True},
        {"id": "accessibility", "label": "Accessibility", "defaultSelected": True},
    ],
    "defaultDevices": ["mobile", "desktop"],
    "defaultMetricGroups": [
        "overview",
        "crux_metrics",
        "lighthouse_metrics",
        "insights",
        "diagnostics",
        "mobile_friendly",
        "accessibility",
    ],
    "setupSteps": [
        "Open Google Cloud Console and create an API key.",
        "Enable the PageSpeed Insights API for your Google project.",
        "Paste your API key below, then click Connect.",
    ],
}


class PageSpeedServiceError(Exception):
    pass


class PageSpeedService:
    @staticmethod
    def get_catalog():
        return copy.deepcopy(PAGESPEED_CATALOG)

    @staticmethod
    def _utc_now_iso():
        return datetime.now(timezone.utc).isoformat()

    @classmethod
    def validate_api_key(cls, api_key, test_url="https://www.example.com"):
        key = str(api_key or "").strip()
        if not key:
            raise PageSpeedServiceError("API key is required.")

        params = {
            "url": str(test_url or "https://www.example.com").strip() or "https://www.example.com",
            "strategy": "mobile",
            "category": "performance",
            "key": key,
        }

        try:
            response = requests.get(PAGESPEED_API_ENDPOINT, params=params, timeout=45)
        except requests.RequestException as exc:
            raise PageSpeedServiceError(f"Network error while validating API key: {exc}") from exc

        if response.status_code == 200:
            payload = response.json() if response.text else {}
            categories = (payload.get("lighthouseResult") or {}).get("categories") or {}
            score = (categories.get("performance") or {}).get("score")
            return {
                "valid": True,
                "tested_at": cls._utc_now_iso(),
                "test_url": params["url"],
                "performance_score": int(score * 100) if isinstance(score, (int, float)) else None,
            }

        try:
            error_payload = response.json()
        except Exception:
            error_payload = {"error": response.text or f"HTTP {response.status_code}"}

        if response.status_code in (400, 401, 403):
            raise PageSpeedServiceError(
                "Google rejected this API key. Verify the key, API restrictions, and that "
                "PageSpeed Insights API is enabled in Google Cloud Console."
            )

        raise PageSpeedServiceError(
            f"Could not validate API key (HTTP {response.status_code}): {error_payload}"
        )

