import json
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse

import requests

from src.core.credential_encryption import decrypt_credential, encrypt_credential

GA4_OAUTH_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
GA4_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GA4_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta"
GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta"

REPO_ROOT = Path(__file__).resolve().parents[2]
GA4_LOCAL_OAUTH_CONFIG = REPO_ROOT / "ga4_oauth.local.json"

URL_MAPPABLE_DIMENSIONS = {
    "landingPagePlusQueryString",
    "pagePathPlusQueryString",
    "pagePath",
    "pageLocation",
}

GA4_METRIC_TO_INTERNAL_KEY = {
    "sessions": "ga4_sessions",
    "screenPageViews": "ga4_screen_page_views",
    "engagedSessions": "ga4_engaged_sessions",
    "engagementRate": "ga4_engagement_rate",
    "keyEvents": "ga4_key_events",
    "eventCount": "ga4_event_count",
    "totalRevenue": "ga4_total_revenue",
}

GA4_CATALOG = {
    "metrics": [
        {
            "id": "sessions",
            "label": "Sessions",
            "group": "Session",
            "required": True,
            "defaultSelected": True,
        },
        {
            "id": "engagedSessions",
            "label": "Engaged Sessions",
            "group": "Session",
            "defaultSelected": True,
        },
        {
            "id": "engagementRate",
            "label": "Engagement Rate",
            "group": "Session",
            "defaultSelected": True,
        },
        {
            "id": "screenPageViews",
            "label": "Screen/Page Views",
            "group": "Page / Screen",
            "defaultSelected": True,
        },
        {
            "id": "keyEvents",
            "label": "Key Events",
            "group": "Event",
            "defaultSelected": True,
        },
        {
            "id": "eventCount",
            "label": "Event Count",
            "group": "Event",
            "defaultSelected": True,
        },
        {
            "id": "totalRevenue",
            "label": "Total Revenue",
            "group": "Revenue",
            "defaultSelected": True,
        },
        {
            "id": "addToCarts",
            "label": "Add To Carts",
            "group": "Ecommerce",
        },
        {
            "id": "checkouts",
            "label": "Checkouts",
            "group": "Ecommerce",
        },
        {
            "id": "ecommercePurchases",
            "label": "Ecommerce Purchases",
            "group": "Ecommerce",
        },
    ],
    "dimensions": [
        {
            "id": "landingPagePlusQueryString",
            "label": "Landing Page + Query String",
            "urlMappable": True,
            "defaultSelected": True,
        },
        {
            "id": "pagePathPlusQueryString",
            "label": "Page Path + Query String",
            "urlMappable": True,
        },
        {
            "id": "pagePath",
            "label": "Page Path",
            "urlMappable": True,
        },
        {
            "id": "pageLocation",
            "label": "Page Location",
            "urlMappable": True,
        },
    ],
    "filterDimensionTypes": [
        {"id": "", "label": "None"},
        {"id": "sessionDefaultChannelGroup", "label": "Session Default Channel Group"},
        {"id": "firstUserDefaultChannelGroup", "label": "First User Default Channel Group"},
        {"id": "country", "label": "Country"},
        {"id": "deviceCategory", "label": "Device Category"},
        {"id": "sessionSourceMedium", "label": "Session Source / Medium"},
    ],
    "dateRangePresets": [
        {"id": "last_7_days", "label": "Last 7 days"},
        {"id": "last_30_days", "label": "Last 30 days"},
        {"id": "last_90_days", "label": "Last 90 days"},
        {"id": "custom", "label": "Custom"},
    ],
    "defaultMetrics": [
        "sessions",
        "screenPageViews",
        "engagedSessions",
        "engagementRate",
        "keyEvents",
        "eventCount",
        "totalRevenue",
    ],
    "defaultMetricDimensions": {
        "sessions": "landingPagePlusQueryString",
        "screenPageViews": "landingPagePlusQueryString",
        "engagedSessions": "landingPagePlusQueryString",
        "engagementRate": "landingPagePlusQueryString",
        "keyEvents": "landingPagePlusQueryString",
        "eventCount": "landingPagePlusQueryString",
        "totalRevenue": "landingPagePlusQueryString",
        "addToCarts": "landingPagePlusQueryString",
        "checkouts": "landingPagePlusQueryString",
        "ecommercePurchases": "landingPagePlusQueryString",
    },
}


class GA4ServiceError(Exception):
    pass


class GA4AuthError(GA4ServiceError):
    pass


class GA4Service:
    @staticmethod
    def get_catalog():
        return json.loads(json.dumps(GA4_CATALOG))

    @staticmethod
    def _utc_now():
        return datetime.now(timezone.utc)

    @staticmethod
    def _extract_resource_id(resource_name):
        if not resource_name:
            return ""
        return str(resource_name).strip().split("/")[-1]

    @staticmethod
    def _normalize_property_resource(property_id):
        property_id = str(property_id or "").strip()
        if not property_id:
            raise GA4ServiceError("Google Analytics property is not configured.")
        if property_id.startswith("properties/"):
            return property_id
        return f"properties/{property_id}"

    @staticmethod
    def _get_env_oauth_credentials():
        client_id = os.getenv("GA4_OAUTH_CLIENT_ID", "").strip()
        client_secret = os.getenv("GA4_OAUTH_CLIENT_SECRET", "").strip()
        redirect_uri = os.getenv("GA4_OAUTH_REDIRECT_URI", "").strip()
        has_any = bool(client_id or client_secret or redirect_uri)
        has_all = bool(client_id and client_secret and redirect_uri)
        credentials = None
        if has_all:
            credentials = {
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            }
        return {
            "credentials": credentials,
            "has_any": has_any,
            "has_all": has_all,
        }

    @staticmethod
    def _read_local_oauth_credentials():
        if not GA4_LOCAL_OAUTH_CONFIG.exists():
            return {"credentials": None, "error": "", "exists": False}

        try:
            with open(GA4_LOCAL_OAUTH_CONFIG, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            return {"credentials": None, "error": f"Invalid ga4_oauth.local.json: {exc}", "exists": True}

        local_client_id = str(data.get("client_id", "")).strip()
        local_client_secret = str(data.get("client_secret", "")).strip()
        local_redirect_uri = str(data.get("redirect_uri", "")).strip()
        if local_client_id and local_client_secret and local_redirect_uri:
            return {
                "credentials": {
                    "client_id": local_client_id,
                    "client_secret": local_client_secret,
                    "redirect_uri": local_redirect_uri,
                },
                "error": "",
                "exists": True,
            }

        return {
            "credentials": None,
            "error": (
                "ga4_oauth.local.json exists but is missing one or more required values: "
                "client_id, client_secret, redirect_uri."
            ),
            "exists": True,
        }

    @classmethod
    def _resolve_oauth_credentials(cls):
        env_info = cls._get_env_oauth_credentials()
        if env_info["credentials"]:
            return env_info["credentials"]

        local_info = cls._read_local_oauth_credentials()
        if local_info["credentials"]:
            return local_info["credentials"]

        if local_info["error"]:
            raise GA4ServiceError(local_info["error"])

        raise GA4ServiceError(
            "Google Analytics is not set up yet. Use Crawl Config > API Access > Google Analytics "
            "to enter your Client ID and Client Secret."
        )

    @classmethod
    def get_credential_source(cls):
        env_info = cls._get_env_oauth_credentials()
        if env_info["credentials"]:
            return "env"
        local_info = cls._read_local_oauth_credentials()
        if local_info["credentials"]:
            return "local_file"
        return "none"

    @staticmethod
    def get_suggested_redirect_uri(fallback_origin=""):
        default_uri = "http://localhost:5000/api/ga4/oauth/callback"
        origin = str(fallback_origin or "").strip()
        if not origin:
            return default_uri

        parsed = urlparse(origin)
        if not parsed.scheme or not parsed.netloc:
            return default_uri

        return f"{parsed.scheme}://{parsed.netloc}/api/ga4/oauth/callback"

    @classmethod
    def get_oauth_setup_state(cls, fallback_origin=""):
        env_info = cls._get_env_oauth_credentials()
        local_info = cls._read_local_oauth_credentials()
        source = "none"
        if env_info["credentials"]:
            source = "env"
        elif local_info["credentials"]:
            source = "local_file"

        setup_error = ""
        if source == "none":
            if local_info["error"]:
                setup_error = local_info["error"]
            elif env_info["has_any"] and not env_info["has_all"]:
                setup_error = (
                    "Only some GA4 OAuth environment variables are set. Provide all three values "
                    "(GA4_OAUTH_CLIENT_ID, GA4_OAUTH_CLIENT_SECRET, GA4_OAUTH_REDIRECT_URI), "
                    "or use the in-app setup below."
                )

        return {
            "has_credentials": source != "none",
            "setup_required": source == "none",
            "credential_source": source,
            "suggested_redirect_uri": cls.get_suggested_redirect_uri(fallback_origin),
            "config_path": GA4_LOCAL_OAUTH_CONFIG.name,
            "setup_error": setup_error,
            "setup_steps": [
                "Open Google Cloud Console and create an OAuth 2.0 Client ID.",
                "Add the Redirect URI shown below in Google Cloud Console.",
                "Paste your Client ID and Client Secret below, then click Save Setup.",
                "Click Sign in with Google to connect your GA4 account.",
            ],
        }

    @classmethod
    def save_local_oauth_credentials(cls, client_id, client_secret, redirect_uri):
        client_id = str(client_id or "").strip()
        client_secret = str(client_secret or "").strip()
        redirect_uri = str(redirect_uri or "").strip()

        if not client_id:
            raise GA4ServiceError("Client ID is required.")
        if not client_secret:
            raise GA4ServiceError("Client Secret is required.")
        if not redirect_uri:
            raise GA4ServiceError("Redirect URI is required.")

        parsed = urlparse(redirect_uri)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise GA4ServiceError(
                "Redirect URI must be a full URL, for example: "
                "http://localhost:5000/api/ga4/oauth/callback"
            )

        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        }
        try:
            with open(GA4_LOCAL_OAUTH_CONFIG, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
                fh.write("\n")
        except Exception as exc:
            raise GA4ServiceError(f"Could not save {GA4_LOCAL_OAUTH_CONFIG.name}: {exc}") from exc

        return {
            "config_path": GA4_LOCAL_OAUTH_CONFIG.name,
            "credential_source": cls.get_credential_source(),
        }

    @classmethod
    def has_oauth_credentials(cls):
        try:
            cls._resolve_oauth_credentials()
            return True
        except Exception:
            return False

    @classmethod
    def build_oauth_url(cls, state, redirect_uri=""):
        creds = cls._resolve_oauth_credentials()
        final_redirect_uri = str(redirect_uri or "").strip() or creds.get("redirect_uri", "")
        if not final_redirect_uri:
            raise GA4ServiceError("Redirect URI is not configured.")
        params = {
            "client_id": creds["client_id"],
            "redirect_uri": final_redirect_uri,
            "response_type": "code",
            "scope": GA4_OAUTH_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{GA4_OAUTH_AUTH_URL}?{urlencode(params)}"

    @staticmethod
    def _encrypt_token_blob(tokens):
        if not tokens:
            return {}

        encrypted = {}
        for key, value in tokens.items():
            if key in {"access_token", "refresh_token", "id_token"} and value:
                encrypted[key] = encrypt_credential(str(value))
            else:
                encrypted[key] = value
        encrypted["_encrypted"] = True
        return encrypted

    @staticmethod
    def _decrypt_token_blob(tokens):
        if not tokens:
            return {}

        decrypted = dict(tokens)
        if not decrypted.get("_encrypted"):
            return decrypted

        for key in ("access_token", "refresh_token", "id_token"):
            if decrypted.get(key):
                decrypted[key] = decrypt_credential(decrypted[key])
        return decrypted

    @classmethod
    def _prepare_token_record(cls, token_payload, existing_refresh_token=None):
        access_token = token_payload.get("access_token")
        if not access_token:
            raise GA4AuthError("Google OAuth response did not include an access token.")

        expires_in = int(token_payload.get("expires_in", 3600))
        expires_at = cls._utc_now() + timedelta(seconds=max(60, expires_in - 30))

        refresh_token = token_payload.get("refresh_token") or existing_refresh_token

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": token_payload.get("token_type", "Bearer"),
            "scope": token_payload.get("scope", GA4_OAUTH_SCOPE),
            "expires_in": expires_in,
            "expires_at": expires_at.isoformat(),
            "updated_at": cls._utc_now().isoformat(),
        }

    @classmethod
    def exchange_code_for_tokens(cls, code, redirect_uri=""):
        creds = cls._resolve_oauth_credentials()
        final_redirect_uri = str(redirect_uri or "").strip() or creds.get("redirect_uri", "")
        if not final_redirect_uri:
            raise GA4AuthError("Redirect URI is missing for token exchange.")
        payload = {
            "code": code,
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "redirect_uri": final_redirect_uri,
            "grant_type": "authorization_code",
        }
        response = requests.post(GA4_OAUTH_TOKEN_URL, data=payload, timeout=30)
        if response.status_code != 200:
            try:
                body = response.json()
            except Exception:
                body = {"error": response.text}
            raise GA4AuthError(f"OAuth token exchange failed: {body}")
        return cls._prepare_token_record(response.json())

    @classmethod
    def refresh_token(cls, refresh_token):
        if not refresh_token:
            raise GA4AuthError("Missing refresh token.")

        creds = cls._resolve_oauth_credentials()
        payload = {
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        response = requests.post(GA4_OAUTH_TOKEN_URL, data=payload, timeout=30)
        if response.status_code != 200:
            try:
                body = response.json()
            except Exception:
                body = {"error": response.text}
            raise GA4AuthError(f"OAuth token refresh failed: {body}")
        return cls._prepare_token_record(response.json(), existing_refresh_token=refresh_token)

    @classmethod
    def _is_token_expired(cls, token_record):
        expires_at = token_record.get("expires_at")
        if not expires_at:
            return True
        try:
            expiry = datetime.fromisoformat(expires_at)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
        except Exception:
            return True
        return cls._utc_now() >= expiry

    @classmethod
    def get_decrypted_tokens(cls, settings):
        return cls._decrypt_token_blob(settings.get("ga4OauthTokens", {}))

    @classmethod
    def save_tokens_to_settings(cls, settings_manager, token_record, connected=True):
        encrypted = cls._encrypt_token_blob(token_record)
        settings_manager.save_settings(
            {
                "ga4OauthTokens": encrypted,
                "ga4Connected": bool(connected),
            }
        )

    @classmethod
    def _get_access_token(cls, settings_manager):
        settings = settings_manager.get_settings()
        tokens = cls.get_decrypted_tokens(settings)

        if not tokens:
            raise GA4AuthError("Google Analytics is not connected.")

        if not tokens.get("access_token") or cls._is_token_expired(tokens):
            refresh_token = tokens.get("refresh_token")
            if not refresh_token:
                raise GA4AuthError("Google Analytics access expired and no refresh token is available.")
            refreshed = cls.refresh_token(refresh_token)
            tokens = {**tokens, **refreshed}
            cls.save_tokens_to_settings(settings_manager, tokens, connected=True)

        return tokens["access_token"]

    @classmethod
    def _request_with_retry(
        cls,
        settings_manager,
        method,
        url,
        params=None,
        json_body=None,
        retries=3,
        timeout=30,
    ):
        access_token = cls._get_access_token(settings_manager)

        for attempt in range(retries + 1):
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            response = requests.request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
                timeout=timeout,
            )

            if response.status_code == 401 and attempt < retries:
                settings = settings_manager.get_settings()
                tokens = cls.get_decrypted_tokens(settings)
                refresh_token = tokens.get('refresh_token')
                if refresh_token:
                    refreshed = cls.refresh_token(refresh_token)
                    tokens = {**tokens, **refreshed}
                    cls.save_tokens_to_settings(settings_manager, tokens, connected=True)
                    access_token = tokens.get('access_token', access_token)
                else:
                    access_token = cls._get_access_token(settings_manager)
                continue

            if response.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                delay = (2 ** attempt) * random.uniform(0.4, 1.2)
                time.sleep(delay)
                continue

            if response.status_code >= 400:
                try:
                    body = response.json()
                except Exception:
                    body = {"error": response.text}
                raise GA4ServiceError(f"Google Analytics API error ({response.status_code}): {body}")

            return response.json()

        raise GA4ServiceError("Google Analytics API request failed after retries.")

    @classmethod
    def list_account_summaries(cls, settings_manager):
        page_token = None
        accounts = []

        while True:
            params = {"pageSize": 200}
            if page_token:
                params["pageToken"] = page_token

            payload = cls._request_with_retry(
                settings_manager=settings_manager,
                method="GET",
                url=f"{GA4_ADMIN_API_BASE}/accountSummaries",
                params=params,
            )

            for summary in payload.get("accountSummaries", []):
                account_resource = summary.get("account", "")
                account_id = cls._extract_resource_id(account_resource)
                property_summaries = []

                for prop in summary.get("propertySummaries", []):
                    prop_resource = prop.get("property", "")
                    property_summaries.append(
                        {
                            "id": cls._extract_resource_id(prop_resource),
                            "resourceName": prop_resource,
                            "name": prop.get("displayName") or prop_resource,
                        }
                    )

                accounts.append(
                    {
                        "id": account_id,
                        "resourceName": account_resource,
                        "name": summary.get("displayName") or account_resource,
                        "properties": property_summaries,
                    }
                )

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

        return accounts

    @classmethod
    def list_property_streams(cls, settings_manager, property_id):
        property_resource = cls._normalize_property_resource(property_id)
        page_token = None
        streams = []

        while True:
            params = {"pageSize": 200}
            if page_token:
                params["pageToken"] = page_token

            payload = cls._request_with_retry(
                settings_manager=settings_manager,
                method="GET",
                url=f"{GA4_ADMIN_API_BASE}/{property_resource}/dataStreams",
                params=params,
            )

            for stream in payload.get("dataStreams", []):
                stream_type = stream.get("type")
                if stream_type != "WEB_DATA_STREAM":
                    continue
                stream_resource = stream.get("name", "")
                streams.append(
                    {
                        "id": cls._extract_resource_id(stream_resource),
                        "resourceName": stream_resource,
                        "name": stream.get("displayName") or stream_resource,
                        "type": stream_type,
                    }
                )

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

        return streams

    @classmethod
    def _build_date_range(cls, config):
        preset = str(config.get("ga4_date_range_preset", "last_30_days")).strip() or "last_30_days"
        start = str(config.get("ga4_date_start", "")).strip()
        end = str(config.get("ga4_date_end", "")).strip()

        preset_mapping = {
            "last_7_days": ("7daysAgo", "yesterday"),
            "last_30_days": ("30daysAgo", "yesterday"),
            "last_90_days": ("90daysAgo", "yesterday"),
        }

        if preset == "custom" and start and end:
            return [{"startDate": start, "endDate": end}]

        mapped = preset_mapping.get(preset, preset_mapping["last_30_days"])
        return [{"startDate": mapped[0], "endDate": mapped[1]}]

    @staticmethod
    def _build_dimension_filter(config):
        dimension = str(config.get("ga4_filter_dimension_type", "")).strip()
        value = str(config.get("ga4_filter_value", "")).strip()
        if not dimension or not value:
            return None

        return {
            "filter": {
                "fieldName": dimension,
                "stringFilter": {
                    "matchType": "CONTAINS",
                    "value": value,
                    "caseSensitive": False,
                },
            }
        }

    @classmethod
    def run_report_paginated(
        cls,
        settings_manager,
        property_id,
        dimensions,
        metrics,
        date_ranges,
        dimension_filter=None,
        max_results=100000,
        page_size=10000,
    ):
        if not metrics:
            return []

        property_resource = cls._normalize_property_resource(property_id)
        rows = []
        offset = 0
        max_results = int(max_results or 100000)
        page_size = max(1, min(int(page_size), 250000))

        while True:
            limit_for_page = page_size
            if max_results > 0:
                remaining = max_results - len(rows)
                if remaining <= 0:
                    break
                limit_for_page = min(limit_for_page, remaining)

            payload = {
                "dateRanges": date_ranges,
                "dimensions": [{"name": d} for d in dimensions],
                "metrics": [{"name": m} for m in metrics],
                "offset": str(offset),
                "limit": str(limit_for_page),
                "keepEmptyRows": False,
            }
            if dimension_filter:
                payload["dimensionFilter"] = dimension_filter

            data = cls._request_with_retry(
                settings_manager=settings_manager,
                method="POST",
                url=f"{GA4_DATA_API_BASE}/{property_resource}:runReport",
                json_body=payload,
                timeout=60,
            )

            chunk = data.get("rows", [])
            if not chunk:
                break

            rows.extend(chunk)
            offset += len(chunk)

            row_count = int(data.get("rowCount", len(rows)))
            if offset >= row_count:
                break
            if len(chunk) < limit_for_page:
                break

        return rows

    @staticmethod
    def normalize_dimension_value(raw_value, match_trailing_slash=True, match_case=False):
        value = str(raw_value or "").strip()
        if not value:
            return ""

        parsed = urlparse(value)
        if parsed.scheme and parsed.netloc:
            path = parsed.path or "/"
            query = parsed.query
        else:
            if not value.startswith("/"):
                value = "/" + value
            parsed = urlparse(value)
            path = parsed.path or "/"
            query = parsed.query

        if not match_trailing_slash and path not in ("", "/"):
            path = path.rstrip("/")
            if not path:
                path = "/"

        normalized = path
        if query:
            normalized = f"{normalized}?{query}"

        if not match_case:
            normalized = normalized.lower()

        return normalized

    @staticmethod
    def _to_absolute_url(base_url, dimension_value):
        value = str(dimension_value or "").strip()
        if not value:
            return None

        if value.startswith(("http://", "https://")):
            candidate = value
        else:
            if not value.startswith("/"):
                value = "/" + value
            candidate = urljoin(base_url, value)

        parsed = urlparse(candidate)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return None

        clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path or '/'}"
        if parsed.query:
            clean = f"{clean}?{parsed.query}"
        return clean

    @staticmethod
    def _passes_scope_filters(url, crawl_start_url, crawler_config):
        parsed_url = urlparse(url)
        parsed_start = urlparse(crawl_start_url)
        if not parsed_url.netloc or not parsed_start.netloc:
            return False

        target_host = parsed_url.netloc.lower()
        start_host = parsed_start.netloc.lower()

        if crawler_config.get("crawl_subdomains", True):
            if target_host != start_host and not target_host.endswith("." + start_host):
                return False
        else:
            if target_host != start_host:
                return False

        max_url_length = int(crawler_config.get("limit_max_url_length", 10000))
        if len(url) > max_url_length:
            return False

        if crawler_config.get("limit_query_strings", False):
            max_query_params = int(crawler_config.get("limit_query_strings_value", 5))
            query_params = [p for p in parsed_url.query.split("&") if p]
            if len(query_params) > max_query_params:
                return False

        if crawler_config.get("exclude_patterns"):
            for pattern in crawler_config["exclude_patterns"]:
                if not pattern:
                    continue
                try:
                    if re.search(pattern, url):
                        return False
                except re.error:
                    continue

        include_patterns = crawler_config.get("include_patterns") or []
        if include_patterns:
            matched = False
            for pattern in include_patterns:
                if not pattern:
                    continue
                try:
                    if re.search(pattern, url):
                        matched = True
                        break
                except re.error:
                    continue
            if not matched:
                return False

        return True

    @classmethod
    def discover_urls_for_crawl(cls, settings_manager, crawl_start_url, crawler_config):
        property_id = str(crawler_config.get("ga4_property_id", "")).strip()
        if not property_id:
            return [], {"status": "skipped", "reason": "property_not_selected"}

        date_ranges = cls._build_date_range(crawler_config)
        max_results = int(crawler_config.get("ga4_max_results", 100000))
        if not crawler_config.get("ga4_limit_max_results", True):
            max_results = 100000

        rows = cls.run_report_paginated(
            settings_manager=settings_manager,
            property_id=property_id,
            dimensions=["landingPagePlusQueryString"],
            metrics=["sessions"],
            date_ranges=date_ranges,
            dimension_filter=cls._build_dimension_filter(crawler_config),
            max_results=max_results,
        )

        discovered = []
        seen = set()
        for row in rows:
            values = row.get("dimensionValues", [])
            if not values:
                continue
            absolute = cls._to_absolute_url(crawl_start_url, values[0].get("value"))
            if not absolute:
                continue
            if not cls._passes_scope_filters(absolute, crawl_start_url, crawler_config):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            discovered.append(absolute)

        return discovered, {
            "status": "success",
            "rows": len(rows),
            "urls_added": len(discovered),
        }

    @staticmethod
    def _coerce_metric_value(raw_value):
        if raw_value in (None, ""):
            return None
        value = str(raw_value).strip()
        if value == "":
            return None
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            try:
                return float(value)
            except ValueError:
                return value

    @classmethod
    def enrich_crawl_results(cls, settings_manager, crawl_results, crawler_config):
        property_id = str(crawler_config.get("ga4_property_id", "")).strip()
        if not property_id:
            return {"status": "skipped", "reason": "property_not_selected"}

        selected_metrics = crawler_config.get("ga4_selected_metrics") or list(GA4_CATALOG["defaultMetrics"])
        selected_metrics = [str(m).strip() for m in selected_metrics if str(m).strip()]
        if "sessions" not in selected_metrics:
            selected_metrics.insert(0, "sessions")
        selected_metrics = list(dict.fromkeys(selected_metrics))

        metric_dimensions = crawler_config.get("ga4_metric_dimensions") or {}
        default_dimension = "landingPagePlusQueryString"

        grouped_metrics = {}
        for metric in selected_metrics:
            dimension = str(metric_dimensions.get(metric) or default_dimension).strip()
            if dimension not in URL_MAPPABLE_DIMENSIONS:
                dimension = default_dimension
            grouped_metrics.setdefault(dimension, []).append(metric)

        date_ranges = cls._build_date_range(crawler_config)
        dimension_filter = cls._build_dimension_filter(crawler_config)

        match_trailing_slash = bool(crawler_config.get("ga4_match_trailing_slash", True))
        match_case = bool(crawler_config.get("ga4_match_case", False))

        crawl_lookup = {}
        for row in crawl_results:
            key = cls.normalize_dimension_value(
                row.get("url"),
                match_trailing_slash=match_trailing_slash,
                match_case=match_case,
            )
            crawl_lookup.setdefault(key, []).append(row)

        matched_urls = set()
        unmatched_rows = 0
        total_rows = 0
        max_results = int(crawler_config.get("ga4_max_results", 100000))
        if not crawler_config.get("ga4_limit_max_results", True):
            max_results = 100000

        for dimension, metrics in grouped_metrics.items():
            rows = cls.run_report_paginated(
                settings_manager=settings_manager,
                property_id=property_id,
                dimensions=[dimension],
                metrics=metrics,
                date_ranges=date_ranges,
                dimension_filter=dimension_filter,
                max_results=max_results,
            )
            total_rows += len(rows)

            for row in rows:
                dim_values = row.get("dimensionValues", [])
                metric_values = row.get("metricValues", [])
                if not dim_values:
                    continue

                dim_value = dim_values[0].get("value", "")
                key = cls.normalize_dimension_value(
                    dim_value,
                    match_trailing_slash=match_trailing_slash,
                    match_case=match_case,
                )
                matches = crawl_lookup.get(key, [])
                if not matches:
                    unmatched_rows += 1
                    continue

                extracted_values = {}
                for idx, metric in enumerate(metrics):
                    raw_metric = metric_values[idx].get("value") if idx < len(metric_values) else None
                    extracted_values[metric] = cls._coerce_metric_value(raw_metric)

                for matched in matches:
                    analytics = matched.setdefault("analytics", {})
                    ga4_block = analytics.setdefault("ga4", {})
                    ga4_metrics = ga4_block.setdefault("metrics", {})
                    ga4_metrics.update(extracted_values)
                    ga4_block["matched_dimension_value"] = dim_value
                    matched["ga4"] = ga4_block

                    for metric_name, internal_key in GA4_METRIC_TO_INTERNAL_KEY.items():
                        if metric_name in extracted_values:
                            analytics[internal_key] = extracted_values[metric_name]

                    matched_urls.add(matched.get("url", ""))

        timestamp = cls._utc_now().isoformat()
        for row in crawl_results:
            analytics = row.setdefault("analytics", {})
            ga4_block = analytics.setdefault("ga4", {})
            ga4_block.setdefault("metrics", {})
            ga4_block["last_sync_at"] = timestamp
            ga4_block["sync_status"] = "matched" if row.get("url") in matched_urls else "unmatched"
            row["ga4"] = ga4_block

        return {
            "status": "success",
            "last_sync_at": timestamp,
            "matched_urls": len([u for u in matched_urls if u]),
            "unmatched_urls": max(0, len(crawl_results) - len(matched_urls)),
            "unmatched_rows": unmatched_rows,
            "total_rows": total_rows,
            "selected_metrics": selected_metrics,
        }
