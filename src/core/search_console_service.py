import json
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

import requests

from src.core.credential_encryption import decrypt_credential, encrypt_credential

GSC_OAUTH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
GSC_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GSC_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GSC_SITES_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites"
GSC_SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3/sites"
GSC_URL_INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED_LOCAL_OAUTH_CONFIG = REPO_ROOT / "ga4_oauth.local.json"

GSC_METRIC_TO_INTERNAL_KEY = {
    "clicks": "sc_clicks",
    "impressions": "sc_impressions",
    "ctr": "sc_ctr",
    "position": "sc_position",
}

DEFAULT_GSC_MAX_RESULTS = 100000
MAX_GSC_PAGE_SIZE = 25000
DEFAULT_GSC_INSPECTION_MAX_URLS = 200
MAX_GSC_INSPECTION_MAX_URLS = 2000

QUERY_OPERATOR_MAP = {
    "contains": "contains",
    "not_contains": "notContains",
    "equals": "equals",
    "not_equals": "notEquals",
    "including_regex": "includingRegex",
    "excluding_regex": "excludingRegex",
}

GSC_CATALOG = {
    "dateRangePresets": [
        {"id": "last_7_days", "label": "Last 7 days"},
        {"id": "last_30_days", "label": "Last 30 days"},
        {"id": "last_90_days", "label": "Last 90 days"},
        {"id": "custom", "label": "Custom"},
    ],
    "deviceFilters": [
        {"id": "all", "label": "All devices"},
        {"id": "desktop", "label": "Desktop"},
        {"id": "mobile", "label": "Mobile"},
        {"id": "tablet", "label": "Tablet"},
    ],
    "typeFilters": [
        {"id": "web", "label": "Web"},
        {"id": "image", "label": "Image"},
        {"id": "video", "label": "Video"},
        {"id": "news", "label": "News"},
        {"id": "discover", "label": "Discover"},
        {"id": "googleNews", "label": "Google News"},
    ],
    "queryFilterOperators": [
        {"id": "none", "label": "None"},
        {"id": "contains", "label": "Contains"},
        {"id": "not_contains", "label": "Does not contain"},
        {"id": "equals", "label": "Equals"},
        {"id": "not_equals", "label": "Does not equal"},
        {"id": "including_regex", "label": "Matches regex"},
        {"id": "excluding_regex", "label": "Does not match regex"},
    ],
    "countryFilters": [
        {"id": "", "label": "None"},
        {"id": "usa", "label": "United States"},
        {"id": "gbr", "label": "United Kingdom"},
        {"id": "can", "label": "Canada"},
        {"id": "aus", "label": "Australia"},
        {"id": "deu", "label": "Germany"},
        {"id": "fra", "label": "France"},
        {"id": "esp", "label": "Spain"},
        {"id": "ita", "label": "Italy"},
        {"id": "ind", "label": "India"},
        {"id": "jpn", "label": "Japan"},
        {"id": "bra", "label": "Brazil"},
    ],
    "inspectionLanguages": [
        {"id": "en-US", "label": "English (US)"},
        {"id": "en-GB", "label": "English (UK)"},
        {"id": "es-ES", "label": "Spanish"},
        {"id": "fr-FR", "label": "French"},
        {"id": "de-DE", "label": "German"},
    ],
}


class SearchConsoleServiceError(Exception):
    pass


class SearchConsoleAuthError(SearchConsoleServiceError):
    pass


class SearchConsoleService:
    @staticmethod
    def get_catalog():
        return json.loads(json.dumps(GSC_CATALOG))

    @staticmethod
    def _utc_now():
        return datetime.now(timezone.utc)

    @staticmethod
    def _get_env_oauth_credentials():
        client_id = os.getenv("GA4_OAUTH_CLIENT_ID", "").strip()
        client_secret = os.getenv("GA4_OAUTH_CLIENT_SECRET", "").strip()
        redirect_uri = os.getenv("GA4_OAUTH_REDIRECT_URI", "").strip()
        has_any = bool(client_id or client_secret or redirect_uri)
        has_all = bool(client_id and client_secret and redirect_uri)
        credentials = None
        if has_all:
            credentials = {"client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri}
        return {"credentials": credentials, "has_any": has_any, "has_all": has_all}

    @staticmethod
    def _read_local_oauth_credentials():
        if not SHARED_LOCAL_OAUTH_CONFIG.exists():
            return {"credentials": None, "error": "", "exists": False}

        try:
            with open(SHARED_LOCAL_OAUTH_CONFIG, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            return {"credentials": None, "error": f"Invalid {SHARED_LOCAL_OAUTH_CONFIG.name}: {exc}", "exists": True}

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
                f"{SHARED_LOCAL_OAUTH_CONFIG.name} exists but is missing one or more required values: "
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
            raise SearchConsoleServiceError(local_info["error"])

        raise SearchConsoleServiceError(
            "Google sign-in is not set up yet. Open Crawl Config > API Access > Search Console and complete setup."
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
    def get_suggested_redirect_uri(fallback_origin="", callback_path="/api/search_console/oauth/callback"):
        default_uri = f"http://localhost:5000{callback_path}"
        origin = str(fallback_origin or "").strip()
        if not origin:
            return default_uri
        parsed = urlparse(origin)
        if not parsed.scheme or not parsed.netloc:
            return default_uri
        return f"{parsed.scheme}://{parsed.netloc}{callback_path}"

    @classmethod
    def get_oauth_setup_state(cls, fallback_origin="", callback_path="/api/search_console/oauth/callback"):
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
                    "or use in-app setup."
                )

        return {
            "has_credentials": source != "none",
            "setup_required": source == "none",
            "credential_source": source,
            "suggested_redirect_uri": cls.get_suggested_redirect_uri(fallback_origin, callback_path),
            "config_path": SHARED_LOCAL_OAUTH_CONFIG.name,
            "setup_error": setup_error,
            "setup_steps": [
                "Open Google Cloud Console and create an OAuth 2.0 Client ID.",
                "Add the Redirect URI shown below in Google Cloud Console.",
                "Paste your Client ID and Client Secret below, then click Save Setup.",
                "Click Sign in with Google to connect Search Console.",
            ],
        }

    @classmethod
    def save_local_oauth_credentials(cls, client_id, client_secret, redirect_uri):
        client_id = str(client_id or "").strip()
        client_secret = str(client_secret or "").strip()
        redirect_uri = str(redirect_uri or "").strip()

        if not client_id:
            raise SearchConsoleServiceError("Client ID is required.")
        if not client_secret:
            raise SearchConsoleServiceError("Client Secret is required.")
        if not redirect_uri:
            raise SearchConsoleServiceError("Redirect URI is required.")

        parsed = urlparse(redirect_uri)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SearchConsoleServiceError(
                "Redirect URI must be a full URL, for example: "
                "http://localhost:5000/api/search_console/oauth/callback"
            )

        payload = {"client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri}
        try:
            with open(SHARED_LOCAL_OAUTH_CONFIG, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
                fh.write("\n")
        except Exception as exc:
            raise SearchConsoleServiceError(f"Could not save {SHARED_LOCAL_OAUTH_CONFIG.name}: {exc}") from exc

        return {"config_path": SHARED_LOCAL_OAUTH_CONFIG.name, "credential_source": cls.get_credential_source()}

    @classmethod
    def build_oauth_url(cls, state, redirect_uri=""):
        creds = cls._resolve_oauth_credentials()
        final_redirect_uri = str(redirect_uri or "").strip() or creds.get("redirect_uri", "")
        if not final_redirect_uri:
            raise SearchConsoleServiceError("Redirect URI is not configured.")

        params = {
            "client_id": creds["client_id"],
            "redirect_uri": final_redirect_uri,
            "response_type": "code",
            "scope": GSC_OAUTH_SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        query = "&".join([f"{key}={quote(str(value), safe='')}" for key, value in params.items()])
        return f"{GSC_OAUTH_AUTH_URL}?{query}"

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
            raise SearchConsoleAuthError("Google OAuth response did not include an access token.")

        expires_in = int(token_payload.get("expires_in", 3600))
        expires_at = cls._utc_now() + timedelta(seconds=max(60, expires_in - 30))
        refresh_token = token_payload.get("refresh_token") or existing_refresh_token
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": token_payload.get("token_type", "Bearer"),
            "scope": token_payload.get("scope", GSC_OAUTH_SCOPE),
            "expires_in": expires_in,
            "expires_at": expires_at.isoformat(),
            "updated_at": cls._utc_now().isoformat(),
        }

    @classmethod
    def exchange_code_for_tokens(cls, code, redirect_uri=""):
        creds = cls._resolve_oauth_credentials()
        final_redirect_uri = str(redirect_uri or "").strip() or creds.get("redirect_uri", "")
        if not final_redirect_uri:
            raise SearchConsoleAuthError("Redirect URI is missing for token exchange.")

        payload = {
            "code": code,
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "redirect_uri": final_redirect_uri,
            "grant_type": "authorization_code",
        }
        response = requests.post(GSC_OAUTH_TOKEN_URL, data=payload, timeout=30)
        if response.status_code != 200:
            try:
                body = response.json()
            except Exception:
                body = {"error": response.text}
            raise SearchConsoleAuthError(f"OAuth token exchange failed: {body}")

        return cls._prepare_token_record(response.json())

    @classmethod
    def refresh_token(cls, refresh_token):
        if not refresh_token:
            raise SearchConsoleAuthError("Missing refresh token.")

        creds = cls._resolve_oauth_credentials()
        payload = {
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        response = requests.post(GSC_OAUTH_TOKEN_URL, data=payload, timeout=30)
        if response.status_code != 200:
            try:
                body = response.json()
            except Exception:
                body = {"error": response.text}
            raise SearchConsoleAuthError(f"OAuth token refresh failed: {body}")

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
        return cls._decrypt_token_blob(settings.get("gscOauthTokens", {}))

    @classmethod
    def save_tokens_to_settings(cls, settings_manager, token_record, connected=True):
        encrypted = cls._encrypt_token_blob(token_record)
        settings_manager.save_settings({"gscOauthTokens": encrypted, "gscConnected": bool(connected)})

    @classmethod
    def _get_access_token(cls, settings_manager):
        settings = settings_manager.get_settings()
        tokens = cls.get_decrypted_tokens(settings)
        if not tokens:
            raise SearchConsoleAuthError("Search Console is not connected.")

        if not tokens.get("access_token") or cls._is_token_expired(tokens):
            refresh_token = tokens.get("refresh_token")
            if not refresh_token:
                raise SearchConsoleAuthError("Search Console access expired and no refresh token is available.")
            refreshed = cls.refresh_token(refresh_token)
            tokens = {**tokens, **refreshed}
            cls.save_tokens_to_settings(settings_manager, tokens, connected=True)

        return tokens["access_token"]

    @classmethod
    def _request_with_retry(cls, settings_manager, method, url, params=None, json_body=None, retries=3, timeout=30):
        access_token = cls._get_access_token(settings_manager)
        for attempt in range(retries + 1):
            response = requests.request(
                method,
                url,
                params=params,
                json=json_body,
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                timeout=timeout,
            )

            if response.status_code == 401 and attempt < retries:
                settings = settings_manager.get_settings()
                tokens = cls.get_decrypted_tokens(settings)
                refresh_token = tokens.get("refresh_token")
                if refresh_token:
                    refreshed = cls.refresh_token(refresh_token)
                    tokens = {**tokens, **refreshed}
                    cls.save_tokens_to_settings(settings_manager, tokens, connected=True)
                    access_token = tokens.get("access_token", access_token)
                else:
                    access_token = cls._get_access_token(settings_manager)
                continue

            if response.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep((2 ** attempt) * random.uniform(0.4, 1.2))
                continue

            if response.status_code >= 400:
                try:
                    body = response.json()
                except Exception:
                    body = {"error": response.text}
                raise SearchConsoleServiceError(f"Search Console API error ({response.status_code}): {body}")

            if response.text:
                try:
                    return response.json()
                except Exception:
                    return {}
            return {}

        raise SearchConsoleServiceError("Search Console API request failed after retries.")

    @staticmethod
    def _safe_int(value, fallback):
        try:
            return int(value)
        except Exception:
            return fallback

    @classmethod
    def list_sites(cls, settings_manager):
        payload = cls._request_with_retry(settings_manager, "GET", GSC_SITES_ENDPOINT)
        sites = []
        for entry in payload.get("siteEntry", []):
            site_url = str(entry.get("siteUrl", "")).strip()
            if not site_url:
                continue
            site_type = "domain" if site_url.startswith("sc-domain:") else "url_prefix"
            sites.append(
                {
                    "siteUrl": site_url,
                    "name": site_url,
                    "siteType": site_type,
                    "permissionLevel": entry.get("permissionLevel", ""),
                }
            )

        def _site_sort_key(site):
            level = site.get("permissionLevel", "")
            rank = {
                "siteOwner": 0,
                "siteFullUser": 1,
                "siteRestrictedUser": 2,
                "siteUnverifiedUser": 3,
            }.get(level, 4)
            return (rank, site.get("siteUrl", ""))

        sites.sort(key=_site_sort_key)
        return sites

    @staticmethod
    def _build_date_range(config):
        preset = str(config.get("gsc_date_range_preset", "last_30_days")).strip() or "last_30_days"
        start = str(config.get("gsc_date_start", "")).strip()
        end = str(config.get("gsc_date_end", "")).strip()

        if preset == "custom" and start and end:
            return start, end

        days = {"last_7_days": 7, "last_30_days": 30, "last_90_days": 90}.get(preset, 30)
        today = datetime.now(timezone.utc).date()
        end_date = today - timedelta(days=1)
        start_date = end_date - timedelta(days=max(1, days - 1))
        return start_date.isoformat(), end_date.isoformat()

    @classmethod
    def _build_dimension_filter_groups(cls, config):
        filters = []

        device_filter = str(config.get("gsc_device_filter", "all")).strip().lower()
        if device_filter and device_filter != "all":
            filters.append({"dimension": "device", "operator": "equals", "expression": device_filter.upper()})

        country_filter = str(config.get("gsc_country_filter", "")).strip().lower()
        if country_filter and country_filter not in {"none", "all"}:
            filters.append({"dimension": "country", "operator": "equals", "expression": country_filter.upper()})

        query_operator = str(config.get("gsc_query_filter_operator", "none")).strip().lower()
        query_value = str(config.get("gsc_query_filter_value", "")).strip()
        mapped_operator = QUERY_OPERATOR_MAP.get(query_operator, "")
        if query_value and mapped_operator:
            filters.append({"dimension": "query", "operator": mapped_operator, "expression": query_value})

        if not filters:
            return None
        return [{"groupType": "and", "filters": filters}]

    @classmethod
    def _build_search_analytics_payload(cls, config, start_row, row_limit, dimensions):
        start_date, end_date = cls._build_date_range(config)
        payload = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dimensions,
            "rowLimit": max(1, min(int(row_limit), MAX_GSC_PAGE_SIZE)),
            "startRow": max(0, int(start_row)),
        }

        type_filter = str(config.get("gsc_type_filter", "web")).strip()
        if type_filter:
            payload["type"] = type_filter

        dimension_filter_groups = cls._build_dimension_filter_groups(config)
        if dimension_filter_groups:
            payload["dimensionFilterGroups"] = dimension_filter_groups

        return payload

    @classmethod
    def query_search_analytics(cls, settings_manager, site_url, payload):
        site_url = str(site_url or "").strip()
        if not site_url:
            raise SearchConsoleServiceError("Search Console property is not configured.")
        encoded_site = quote(site_url, safe="")
        url = f"{GSC_SEARCH_ANALYTICS_BASE}/{encoded_site}/searchAnalytics/query"
        return cls._request_with_retry(settings_manager, "POST", url, json_body=payload, timeout=60)

    @classmethod
    def inspect_url(cls, settings_manager, site_url, inspection_url, language_code="en-US"):
        payload = {
            "inspectionUrl": str(inspection_url or "").strip(),
            "siteUrl": str(site_url or "").strip(),
            "languageCode": str(language_code or "en-US").strip() or "en-US",
        }
        if not payload["inspectionUrl"] or not payload["siteUrl"]:
            raise SearchConsoleServiceError("Missing URL Inspection parameters.")
        return cls._request_with_retry(
            settings_manager, "POST", GSC_URL_INSPECTION_ENDPOINT, json_body=payload, timeout=60
        )

    @staticmethod
    def _normalize_url(url, match_trailing_slash=True, match_case=False, fallback_base_url=None):
        value = str(url or "").strip()
        if not value:
            return ""

        if value.startswith(("http://", "https://")):
            parsed = urlparse(value)
        else:
            if fallback_base_url:
                parsed = urlparse(urljoin(fallback_base_url, value))
            else:
                return ""

        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return ""

        scheme = parsed.scheme.lower()
        host = parsed.netloc.lower()
        path = parsed.path or "/"
        if not match_trailing_slash and path not in ("", "/"):
            path = path.rstrip("/") or "/"
        normalized = f"{scheme}://{host}{path}"
        if parsed.query:
            normalized = f"{normalized}?{parsed.query}"
        if not match_case:
            normalized = normalized.lower()
        return normalized

    @staticmethod
    def _to_absolute_url(base_url, candidate):
        value = str(candidate or "").strip()
        if not value:
            return None
        if value.startswith(("http://", "https://")):
            combined = value
        else:
            if not value.startswith("/"):
                value = "/" + value
            combined = urljoin(base_url, value)
        parsed = urlparse(combined)
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
    def _collect_search_analytics_rows(cls, settings_manager, crawler_config, dimensions):
        site_url = str(crawler_config.get("gsc_site_url", "")).strip()
        if not site_url:
            return []

        max_results = cls._safe_int(crawler_config.get("gsc_max_results"), DEFAULT_GSC_MAX_RESULTS)
        if max_results <= 0:
            max_results = DEFAULT_GSC_MAX_RESULTS
        if not crawler_config.get("gsc_limit_max_results", True):
            max_results = DEFAULT_GSC_MAX_RESULTS

        rows = []
        start_row = 0
        while True:
            remaining = max_results - len(rows)
            if remaining <= 0:
                break
            row_limit = min(MAX_GSC_PAGE_SIZE, remaining)
            payload = cls._build_search_analytics_payload(
                crawler_config, start_row=start_row, row_limit=row_limit, dimensions=dimensions
            )
            data = cls.query_search_analytics(settings_manager, site_url, payload)
            chunk = data.get("rows", [])
            if not chunk:
                break

            rows.extend(chunk)
            start_row += len(chunk)

            if len(chunk) < row_limit:
                break

        return rows

    @staticmethod
    def _coerce_metric_value(raw_value):
        if raw_value in (None, ""):
            return None
        try:
            value = float(raw_value)
            if value.is_integer():
                return int(value)
            return value
        except Exception:
            return raw_value

    @classmethod
    def discover_urls_for_crawl(cls, settings_manager, crawl_start_url, crawler_config):
        site_url = str(crawler_config.get("gsc_site_url", "")).strip()
        if not site_url:
            return [], {"status": "skipped", "reason": "site_not_selected"}

        rows = cls._collect_search_analytics_rows(settings_manager, crawler_config, ["page"])
        discovered = []
        seen = set()
        for row in rows:
            keys = row.get("keys", [])
            if not keys:
                continue
            absolute = cls._to_absolute_url(crawl_start_url, keys[0])
            if not absolute:
                continue
            if not cls._passes_scope_filters(absolute, crawl_start_url, crawler_config):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            discovered.append(absolute)

        return discovered, {"status": "success", "rows": len(rows), "urls_added": len(discovered)}

    @classmethod
    def _site_matches_url(cls, site_url, target_url):
        site_url = str(site_url or "").strip()
        target_url = str(target_url or "").strip()
        if not site_url or not target_url:
            return False

        parsed_target = urlparse(target_url)
        target_host = (parsed_target.hostname or "").lower()
        if not target_host:
            return False

        if site_url.startswith("sc-domain:"):
            domain = site_url.split(":", 1)[1].strip().lower()
            return target_host == domain or target_host.endswith("." + domain)

        return target_url.lower().startswith(site_url.lower())

    @classmethod
    def _select_inspection_site(cls, target_url, primary_site_url, available_sites, use_multiple_properties):
        if cls._site_matches_url(primary_site_url, target_url):
            return primary_site_url
        if not use_multiple_properties:
            return None

        best_site = None
        best_score = -1
        for site in available_sites:
            site_url = str(site.get("siteUrl", "")).strip()
            if not cls._site_matches_url(site_url, target_url):
                continue
            if site_url.startswith("sc-domain:"):
                score = len(site_url.split(":", 1)[1])
            else:
                score = len(site_url)
            if score > best_score:
                best_score = score
                best_site = site_url
        return best_site

    @classmethod
    def _extract_inspection_summary(cls, inspection_result):
        index_status = inspection_result.get("indexStatusResult", {}) if isinstance(inspection_result, dict) else {}
        return {
            "verdict": index_status.get("verdict", ""),
            "coverage_state": index_status.get("coverageState", ""),
            "indexing_state": index_status.get("indexingState", ""),
            "page_fetch_state": index_status.get("pageFetchState", ""),
            "robots_txt_state": index_status.get("robotsTxtState", ""),
            "google_canonical": index_status.get("googleCanonical", ""),
            "user_canonical": index_status.get("userCanonical", ""),
            "last_crawl_time": index_status.get("lastCrawlTime", ""),
            "referring_urls_count": len(index_status.get("referringUrls", []) or []),
        }

    @classmethod
    def _rank_inspection_candidates(cls, candidates):
        ranked = sorted(
            candidates,
            key=lambda item: (
                -(float(item["metrics"].get("clicks") or 0)),
                -(float(item["metrics"].get("impressions") or 0)),
                item["index"],
            ),
        )
        return ranked

    @classmethod
    def _run_url_inspection(cls, settings_manager, crawl_results, crawler_config):
        if not crawler_config.get("gsc_enable_url_inspection", False):
            return {"status": "skipped", "reason": "disabled", "inspected_urls": 0}

        primary_site_url = str(crawler_config.get("gsc_site_url", "")).strip()
        if not primary_site_url:
            return {"status": "skipped", "reason": "site_not_selected", "inspected_urls": 0}

        max_urls = cls._safe_int(crawler_config.get("gsc_inspection_max_urls"), DEFAULT_GSC_INSPECTION_MAX_URLS)
        max_urls = max(1, min(max_urls, MAX_GSC_INSPECTION_MAX_URLS))
        language_code = str(crawler_config.get("gsc_inspection_language_code", "en-US")).strip() or "en-US"
        ignore_non_indexable = bool(crawler_config.get("gsc_ignore_non_indexable_urls", False))
        use_multiple_properties = bool(crawler_config.get("gsc_use_multiple_properties", False))

        available_sites = []
        if use_multiple_properties:
            try:
                available_sites = cls.list_sites(settings_manager)
            except Exception:
                available_sites = []

        candidates = []
        for idx, row in enumerate(crawl_results):
            analytics = row.get("analytics", {})
            if not isinstance(analytics, dict):
                continue
            sc_block = analytics.get("search_console", {})
            if not isinstance(sc_block, dict):
                continue
            metrics = sc_block.get("metrics", {})
            if not isinstance(metrics, dict):
                continue
            if metrics.get("clicks") is None and metrics.get("impressions") is None:
                continue

            robots = str(row.get("robots", "") or "").lower()
            if ignore_non_indexable and "noindex" in robots:
                continue

            candidates.append({"index": idx, "row": row, "metrics": metrics})

        if not candidates:
            return {"status": "skipped", "reason": "no_candidates", "inspected_urls": 0}

        ranked = cls._rank_inspection_candidates(candidates)[:max_urls]
        inspected = 0
        failures = 0
        skipped = 0
        last_error = ""
        timestamp = cls._utc_now().isoformat()

        for item in ranked:
            row = item["row"]
            target_url = str(row.get("url", "")).strip()
            if not target_url:
                skipped += 1
                continue

            selected_site = cls._select_inspection_site(
                target_url, primary_site_url, available_sites, use_multiple_properties
            )
            if not selected_site:
                skipped += 1
                analytics = row.setdefault("analytics", {})
                sc_block = analytics.setdefault("search_console", {})
                sc_block["inspection"] = {"status": "skipped", "reason": "no_matching_property"}
                row["search_console"] = sc_block
                continue

            try:
                response = cls.inspect_url(settings_manager, selected_site, target_url, language_code=language_code)
                inspection_result = response.get("inspectionResult", {})
                summary = cls._extract_inspection_summary(inspection_result)
                analytics = row.setdefault("analytics", {})
                sc_block = analytics.setdefault("search_console", {})
                sc_block["inspection"] = {
                    "status": "success",
                    "site_url": selected_site,
                    "inspected_at": timestamp,
                    **summary,
                }
                row["search_console"] = sc_block
                inspected += 1
            except Exception as exc:
                failures += 1
                last_error = str(exc)
                analytics = row.setdefault("analytics", {})
                sc_block = analytics.setdefault("search_console", {})
                sc_block["inspection"] = {
                    "status": "error",
                    "site_url": selected_site,
                    "inspected_at": timestamp,
                    "error": str(exc),
                }
                row["search_console"] = sc_block

        status = "success" if failures == 0 else ("partial" if inspected > 0 else "error")
        return {
            "status": status,
            "inspected_urls": inspected,
            "failed_urls": failures,
            "skipped_urls": skipped,
            "last_inspection_at": timestamp,
            "error": last_error,
        }

    @classmethod
    def enrich_crawl_results(cls, settings_manager, crawl_results, crawler_config):
        site_url = str(crawler_config.get("gsc_site_url", "")).strip()
        if not site_url:
            return {"status": "skipped", "reason": "site_not_selected"}
        if not crawl_results:
            return {"status": "skipped", "reason": "no_crawl_results"}

        match_trailing_slash = bool(crawler_config.get("gsc_match_trailing_slash", True))
        match_case = bool(crawler_config.get("gsc_match_case", False))

        fallback_base_url = ""
        for row in crawl_results:
            url = str(row.get("url", "")).strip()
            if url.startswith(("http://", "https://")):
                parsed = urlparse(url)
                fallback_base_url = f"{parsed.scheme}://{parsed.netloc}"
                break

        crawl_lookup = {}
        for row in crawl_results:
            key = cls._normalize_url(
                row.get("url"),
                match_trailing_slash=match_trailing_slash,
                match_case=match_case,
                fallback_base_url=fallback_base_url,
            )
            if key:
                crawl_lookup.setdefault(key, []).append(row)

        rows = cls._collect_search_analytics_rows(settings_manager, crawler_config, ["page"])
        matched_urls = set()
        unmatched_rows = 0

        timestamp = cls._utc_now().isoformat()
        for row in rows:
            keys = row.get("keys", [])
            if not keys:
                continue

            page_value = keys[0]
            normalized_key = cls._normalize_url(
                page_value,
                match_trailing_slash=match_trailing_slash,
                match_case=match_case,
                fallback_base_url=fallback_base_url,
            )
            matches = crawl_lookup.get(normalized_key, [])
            if not matches:
                unmatched_rows += 1
                continue

            metrics = {
                "clicks": cls._coerce_metric_value(row.get("clicks")),
                "impressions": cls._coerce_metric_value(row.get("impressions")),
                "ctr": cls._coerce_metric_value(row.get("ctr")),
                "position": cls._coerce_metric_value(row.get("position")),
            }
            for matched in matches:
                analytics = matched.setdefault("analytics", {})
                sc_block = analytics.setdefault("search_console", {})
                sc_metrics = sc_block.setdefault("metrics", {})
                sc_metrics.update(metrics)
                sc_block["matched_page"] = page_value
                sc_block["last_sync_at"] = timestamp
                sc_block["sync_status"] = "matched"
                matched["search_console"] = sc_block

                for metric_name, internal_key in GSC_METRIC_TO_INTERNAL_KEY.items():
                    if metrics.get(metric_name) is not None:
                        analytics[internal_key] = metrics.get(metric_name)
                matched_urls.add(matched.get("url", ""))

        for row in crawl_results:
            analytics = row.setdefault("analytics", {})
            sc_block = analytics.setdefault("search_console", {})
            sc_block.setdefault("metrics", {})
            sc_block["last_sync_at"] = timestamp
            if row.get("url") not in matched_urls:
                sc_block["sync_status"] = "unmatched"
            row["search_console"] = sc_block

        inspection_summary = cls._run_url_inspection(settings_manager, crawl_results, crawler_config)
        if inspection_summary.get("status") not in {"skipped"}:
            for row in crawl_results:
                analytics = row.setdefault("analytics", {})
                sc_block = analytics.setdefault("search_console", {})
                if isinstance(sc_block.get("inspection"), dict):
                    sc_block["inspection"]["last_inspection_at"] = inspection_summary.get("last_inspection_at", "")
                row["search_console"] = sc_block

        return {
            "status": "success",
            "last_sync_at": timestamp,
            "matched_urls": len([u for u in matched_urls if u]),
            "unmatched_urls": max(0, len(crawl_results) - len(matched_urls)),
            "unmatched_rows": unmatched_rows,
            "total_rows": len(rows),
            "inspection": inspection_summary,
            "inspected_urls": inspection_summary.get("inspected_urls", 0),
        }
