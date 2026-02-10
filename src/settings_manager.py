import json
import os
from pathlib import Path

from src.core.crawler_defaults import get_default_settings

class SettingsManager:
    def __init__(self, session_id=None, user_id=None, tier='guest'):
        """
        Initialize settings manager
        user_id: Database user ID for per-user settings storage
        session_id: Session ID (deprecated, kept for compatibility)
        tier: User tier (guest, user, extra, admin)
        """
        self.session_id = session_id
        self.user_id = user_id
        self.tier = tier

        # Load default settings
        self.default_settings = self._get_default_settings()
        self.current_settings = self.load_settings()

    def _get_tier_allowed_settings(self):
        """Get settings keys allowed for each tier - MAPPED DIRECTLY FROM HTML TABS"""
        # guest: can only crawl, no settings control
        guest_settings = []

        # user: Crawler, Export, Issue Exclusion tabs
        user_settings = [
            # Crawler tab
            'maxDepth', 'maxUrls', 'crawlDelay', 'followRedirects', 'crawlExternalLinks',
            'maxThreads', 'limitUrlsPerSecond', 'maxUrlsPerSecond',
            'maxFileSize', 'respectCrawlDelay', 'timeout', 'retries',
            # Crawl Panel - Resource Links
            'crawlImages', 'storeImages', 'crawlMedia', 'storeMedia',
            'crawlCSS', 'storeCSS', 'crawlJS', 'storeJS', 'crawlSWF', 'storeSWF',
            # Crawl Panel - Crawl Behaviour
            'checkLinksOutside', 'crawlOutside', 'crawlSubdomains',
            'followInternalNofollow', 'followExternalNofollow',
            # Crawl Panel - Page Links
            'crawlInternal', 'storeInternal', 'crawlExternal', 'storeExternal',
            'crawlCanonicals', 'storeCanonicals', 'crawlPagination', 'storePagination',
            'crawlHreflang', 'storeHreflang',
            # Crawl Panel - XML Sitemaps
            'crawlSitemaps', 'autoDiscoverSitemaps', 'crawlTheseSitemaps', 'sitemapUrls',
            # Export tab
            'exportFormat', 'exportFields',
            # Issues tab
            'issueExclusionPatterns',
            # GA4 settings (available for all logged-in users)
            'ga4Enabled', 'ga4Connected',
            'ga4AccountId', 'ga4AccountName',
            'ga4PropertyId', 'ga4PropertyName',
            'ga4DataStreamId', 'ga4DataStreamName',
            'ga4DateRangePreset', 'ga4DateStart', 'ga4DateEnd',
            'ga4SelectedMetrics', 'ga4MetricDimensions',
            'ga4FilterDimensionType', 'ga4FilterValue',
            'ga4MatchTrailingSlash', 'ga4MatchCase',
            'ga4LimitMaxResults', 'ga4MaxResults',
            'ga4CrawlNewUrls', 'ga4OauthTokens',
            'ga4LastSyncAt', 'ga4LastSyncStatus', 'ga4LastSyncError',
            # Search Console settings (available for all logged-in users)
            'gscEnabled', 'gscConnected',
            'gscSiteUrl', 'gscSiteName',
            'gscDateRangePreset', 'gscDateStart', 'gscDateEnd',
            'gscDeviceFilter', 'gscCountryFilter', 'gscTypeFilter',
            'gscQueryFilterOperator', 'gscQueryFilterValue',
            'gscMatchTrailingSlash', 'gscMatchCase',
            'gscLimitMaxResults', 'gscMaxResults',
            'gscCrawlNewUrls',
            'gscEnableUrlInspection', 'gscIgnoreNonIndexableUrls', 'gscUseMultipleProperties',
            'gscInspectionLanguageCode', 'gscInspectionMaxUrls',
            'gscOauthTokens',
            'gscLastSyncAt', 'gscLastSyncStatus', 'gscLastSyncError',
            'gscLastInspectionAt', 'gscLastInspectionStatus', 'gscLastInspectionError',
            # PageSpeed settings (available for all logged-in users)
            'enablePageSpeed', 'googleApiKey',
            'pagespeedEnabled', 'pagespeedConnected',
            'pagespeedSource', 'pagespeedApiKey', 'pagespeedAutoConnect',
            'pagespeedSelectedDevices', 'pagespeedSelectedMetricGroups',
            'pagespeedLastSyncAt', 'pagespeedLastSyncStatus', 'pagespeedLastSyncError'
        ]

        # extra: all in user + Filters, Requests, Custom CSS, JavaScript tabs
        extra_settings = user_settings + [
            # Requests tab
            'userAgent', 'timeout', 'retries', 'acceptLanguage', 'respectRobotsTxt', 'allowCookies',
            'discoverSitemaps', 'enablePageSpeed', 'googleApiKey', 'robotsUserAgent',
            # Robots.txt settings
            'robotsMode', 'showInternalBlocked', 'showExternalBlocked',
            # Filters tab
            'includeExtensions', 'excludeExtensions', 'includePatterns', 'excludePatterns', 'maxFileSize',
            # Extraction Panel
            'extractPageTitle', 'extractMetaDescription', 'extractMetaKeywords',
            'extractH1', 'extractH2', 'extractIndexability', 'extractWordCount',
            'extractReadability', 'extractTextCodeRatio', 'extractHashValue',
            'extractPageSize', 'extractForms', 'extractAccessibility',
            'extractResponseTime', 'extractLastModified', 'extractHTTPHeaders',
            'extractCookies', 'extractMetaRobots', 'extractXRobotsTag',
            'extractJSONLD', 'extractMicrodata', 'extractRDFa',
            'extractSchemaValidation', 'extractGoogleRichResult', 'extractCaseSensitive',
            'extractStoreHTML', 'extractStoreRenderedHTML',
            'extractStorePDF', 'extractPDFProperties', 'extractPDFLinkText',
            # Limits Panel
            'limitCrawlTotal', 'limitCrawlTotalValue',
            'limitCrawlDepth', 'limitCrawlDepthValue',
            'limitUrlsPerDepth', 'limitUrlsPerDepthValue',
            'limitMaxFolderDepth', 'limitMaxFolderDepthValue',
            'limitQueryStrings', 'limitQueryStringsValue',
            'limitCrawlPerSubdomain', 'limitCrawlPerSubdomainValue',
            'limitMaxRedirects', 'limitMaxUrlLength', 'limitMaxLinksPerUrl', 'limitMaxPageSize',
            # JavaScript tab
            'enableJavaScript', 'jsWaitTime', 'jsTimeout', 'jsBrowser', 'jsHeadless',
            'jsUserAgent', 'jsViewportWidth', 'jsViewportHeight', 'jsMaxConcurrentPages',
            # Advanced Panel
            'advCookieStorage', 'advIgnoreNonIndexable', 'advIgnorePaginated',
            'advAlwaysFollowRedirects', 'advAlwaysFollowCanonicals',
            'advRespectNoindex', 'advRespectCanonicals', 'advRespectNextPrev', 'advRespectHSTS',
            'advRespectMetaRefresh', 'advExtractImagesSrcset', 'advCrawlFragments',
            'advHTMLValidation', 'advGreenHosting', 'advAssumeHTML',
            'advResponseTimeout', 'advResponseRetries',
            # Preferences Panel
            'prefTitlePixelsMin', 'prefTitlePixelsMax', 'prefTitleCharsMin', 'prefTitleCharsMax',
            'prefMetaPixelsMin', 'prefMetaPixelsMax', 'prefMetaCharsMin', 'prefMetaCharsMax',
            'prefHighExternalOutlinks', 'prefHighInternalOutlinks', 'prefHighCrawlDepth',
            'prefNonDescriptiveAnchors', 'prefMaxUrlLength', 'prefMaxH1Length', 'prefMaxH2Length',
            'prefMaxImageAltLength', 'prefMaxImageSizeKb', 'prefLowContentWordCount', 'prefSoft404Phrases',
            # Custom CSS tab
            'customCSS',
            # HTTP Headers & Content Area
            'httpHeaders', 'contentArea',
            # Authentication settings
            'authStandardsEnabled', 'authStandardsData', 'authFormsData'
        ]

        # admin: all settings including Advanced tab
        admin_settings = list(self.default_settings.keys())

        return {
            'guest': guest_settings,
            'user': user_settings,
            'extra': extra_settings,
            'admin': admin_settings
        }

    def filter_settings_by_tier(self, settings):
        """Filter settings to only include ones allowed for this tier"""
        allowed = self._get_tier_allowed_settings().get(self.tier, [])
        if not allowed:  # guest gets nothing
            return {}
        if self.tier == 'admin':  # admin gets everything
            return settings
        # Filter to allowed keys only
        return {k: v for k, v in settings.items() if k in allowed}

    def _get_default_settings(self):
        """Get fresh default settings"""
        return get_default_settings()

    def load_settings(self):
        """Load settings from database or return defaults"""
        try:
            # If user_id is provided, load from database
            if self.user_id:
                from src.auth_db import get_user_settings
                saved_settings = get_user_settings(self.user_id)
                if saved_settings:
                    # Merge with defaults to ensure all keys are present
                    settings = {**self.default_settings}
                    settings.update(saved_settings)
                    return settings

            # Otherwise return defaults
            return self.default_settings.copy()

        except Exception as e:
            print(f"Error loading settings: {e}")
            return self.default_settings.copy()

    def save_settings(self, settings):
        """Save settings to database (filtered by tier)"""
        try:
            # Filter settings by tier to prevent unauthorized changes
            filtered_settings = self.filter_settings_by_tier(settings)

            # Validate settings before saving
            # Only validate the filtered settings that the user is allowed to change
            test_settings = {**self.default_settings}
            test_settings.update(filtered_settings)
            if not self.validate_settings(test_settings):
                return False, "Invalid settings provided"

            # Load current settings from database to preserve unauthorized keys
            if self.user_id:
                from src.auth_db import get_user_settings, save_user_settings
                current_db_settings = get_user_settings(self.user_id) or self.default_settings.copy()

                # Update only the filtered (allowed) keys
                current_db_settings.update(filtered_settings)

                # Save back to database
                success, message = save_user_settings(self.user_id, current_db_settings)

                # Update in-memory settings
                self.current_settings = current_db_settings

                return success, message

            # If no user_id, just keep in memory (session-specific)
            self.current_settings.update(filtered_settings)
            return True, "Settings saved successfully (session-specific)"

        except Exception as e:
            return False, f"Error saving settings: {str(e)}"

    def get_settings(self):
        """Get current settings"""
        return self.current_settings.copy()

    def get_setting(self, key, default=None):
        """Get a specific setting value"""
        return self.current_settings.get(key, default)

    def update_setting(self, key, value):
        """Update a specific setting"""
        if key in self.default_settings:
            self.current_settings[key] = value
            return self.save_settings(self.current_settings)
        return False, f"Unknown setting key: {key}"

    def reset_settings(self):
        """Reset settings to defaults"""
        # Get fresh defaults from the method to ensure latest patterns are used
        fresh_defaults = self._get_default_settings()
        return self.save_settings(fresh_defaults)

    def validate_settings(self, settings):
        """Validate settings values"""
        try:
            # Check required keys exist
            for key in self.default_settings:
                if key not in settings:
                    return False

            # Validate numeric ranges
            numeric_validations = {
                'maxDepth': (1, 10),
                'maxUrls': (1, 5000000),
                'crawlDelay': (0, 60),
                'maxThreads': (1, 50),
                'maxUrlsPerSecond': (1, 100),
                'timeout': (1, 120),
                'retries': (0, 10),
                'maxFileSize': (1, 1000),
                'concurrency': (1, 50),
                'memoryLimit': (64, 4096),
                'jsWaitTime': (0, 30),
                'jsTimeout': (5, 120),
                'jsViewportWidth': (800, 4000),
                'jsViewportHeight': (600, 3000),
                'jsMaxConcurrentPages': (1, 10),
                'duplicationThreshold': (0.0, 1.0),
                'ga4MaxResults': (1, 1000000),
                'gscMaxResults': (1, 1000000),
                'gscInspectionMaxUrls': (1, 2000),
            }

            for key, (min_val, max_val) in numeric_validations.items():
                if key in settings:
                    value = settings[key]
                    if not isinstance(value, (int, float)) or value < min_val or value > max_val:
                        return False

            # Validate string fields are not empty where required
            required_strings = ['userAgent']
            for key in required_strings:
                if key in settings and not settings[key].strip():
                    return False

            # Validate export fields is a list
            if 'exportFields' in settings and not isinstance(settings['exportFields'], list):
                return False

            # Validate proxy URL if proxy is enabled
            if settings.get('enableProxy') and settings.get('proxyUrl'):
                try:
                    from urllib.parse import urlparse
                    result = urlparse(settings['proxyUrl'])
                    if not all([result.scheme, result.netloc]):
                        return False
                except:
                    return False

            return True

        except Exception:
            return False

    def get_crawler_config(self):
        """Get settings formatted for the crawler"""
        settings = self.get_settings()

        delay = settings['crawlDelay']
        if settings.get('limitUrlsPerSecond'):
            max_urls_per_second = max(1, settings.get('maxUrlsPerSecond', 1))
            delay = max(0.1, 1 / max_urls_per_second)

        return {
            'max_depth': settings['maxDepth'],
            'max_urls': settings['maxUrls'],
            'delay': delay,
            'follow_redirects': settings['followRedirects'],
            'crawl_external': settings['crawlExternalLinks'],
            'user_agent': settings['userAgent'],
            'timeout': settings['timeout'],
            'retries': settings['retries'],
            'accept_language': settings['acceptLanguage'],
            'respect_robots': settings['respectRobotsTxt'],
            'allow_cookies': settings['allowCookies'],
            'include_extensions': [ext.strip() for ext in settings['includeExtensions'].split(',') if ext.strip()],
            'exclude_extensions': [ext.strip() for ext in settings['excludeExtensions'].split(',') if ext.strip()],
            'include_patterns': [p.strip() for p in settings['includePatterns'].split('\n') if p.strip() and not p.strip().startswith('#')],
            'exclude_patterns': [p.strip() for p in settings['excludePatterns'].split('\n') if p.strip() and not p.strip().startswith('#')],
            'max_file_size': settings['maxFileSize'] * 1024 * 1024,  # Convert MB to bytes
            'concurrency': (
                settings.get('concurrency', settings.get('maxThreads', 5))
                if self.tier == 'admin'
                else settings.get('maxThreads', settings.get('concurrency', 5))
            ),
            'memory_limit': settings['memoryLimit'] * 1024 * 1024,  # Convert MB to bytes
            'log_level': settings['logLevel'],
            'enable_proxy': settings['enableProxy'],
            'proxy_url': settings['proxyUrl'] if settings['enableProxy'] else None,
            'custom_headers': self._get_all_headers(settings),
            'discover_sitemaps': settings['discoverSitemaps'],
            'enable_pagespeed': settings.get('pagespeedEnabled', settings.get('enablePageSpeed', False)),
            'google_api_key': settings.get('pagespeedApiKey', settings.get('googleApiKey', '')),
            'pagespeed_source': settings.get('pagespeedSource', 'remote'),
            'pagespeed_auto_connect': settings.get('pagespeedAutoConnect', True),
            'pagespeed_selected_devices': settings.get('pagespeedSelectedDevices', ['mobile', 'desktop']),
            'pagespeed_selected_metric_groups': settings.get(
                'pagespeedSelectedMetricGroups',
                ['overview', 'crux_metrics', 'lighthouse_metrics', 'insights', 'diagnostics', 'mobile_friendly', 'accessibility']
            ),
            'enable_javascript': settings['enableJavaScript'],
            'js_wait_time': settings['jsWaitTime'],
            'js_timeout': settings['jsTimeout'],
            'js_browser': settings['jsBrowser'],
            'js_headless': settings['jsHeadless'],
            'js_user_agent': settings['jsUserAgent'],
            'js_viewport_width': settings['jsViewportWidth'],
            'js_viewport_height': settings['jsViewportHeight'],
            'js_max_concurrent_pages': settings['jsMaxConcurrentPages'],
            'issue_exclusion_patterns': [p.strip() for p in settings['issueExclusionPatterns'].split('\n') if p.strip()],
            'enable_duplication_check': settings['enableDuplicationCheck'],
            'duplication_threshold': settings['duplicationThreshold'],
            # Content area settings
            'content_area': settings.get('contentArea', {
                'mode': 'exclude',
                'checkAltText': False,
                'excludeTags': ['nav', 'footer'],
                'excludeClasses': [],
                'excludeIds': []
            }),

            # === NEW SETTINGS ===

            # Crawl Panel - Resource Links
            'crawl_images': settings.get('crawlImages', True),
            'store_images': settings.get('storeImages', True),
            'crawl_media': settings.get('crawlMedia', False),
            'store_media': settings.get('storeMedia', False),
            'crawl_css': settings.get('crawlCSS', True),
            'store_css': settings.get('storeCSS', True),
            'crawl_js': settings.get('crawlJS', True),
            'store_js': settings.get('storeJS', True),
            'crawl_swf': settings.get('crawlSWF', True),
            'store_swf': settings.get('storeSWF', True),

            # Crawl Panel - Crawl Behaviour
            'check_links_outside': settings.get('checkLinksOutside', True),
            'crawl_outside': settings.get('crawlOutside', True),
            'crawl_subdomains': settings.get('crawlSubdomains', True),
            'follow_internal_nofollow': settings.get('followInternalNofollow', False),
            'follow_external_nofollow': settings.get('followExternalNofollow', False),

            # Crawl Panel - Page Links
            'crawl_internal': settings.get('crawlInternal', True),
            'store_internal': settings.get('storeInternal', True),
            'crawl_external_links': settings.get('crawlExternal', True),
            'store_external': settings.get('storeExternal', True),
            'crawl_canonicals': settings.get('crawlCanonicals', True),
            'store_canonicals': settings.get('storeCanonicals', True),
            'crawl_pagination': settings.get('crawlPagination', False),
            'store_pagination': settings.get('storePagination', True),
            'crawl_hreflang': settings.get('crawlHreflang', False),
            'store_hreflang': settings.get('storeHreflang', True),

            # Crawl Panel - XML Sitemaps
            'crawl_sitemaps': settings.get('crawlSitemaps', True),
            'auto_discover_sitemaps': settings.get('autoDiscoverSitemaps', False),
            'crawl_these_sitemaps': settings.get('crawlTheseSitemaps', False),
            'sitemap_urls': [u.strip() for u in settings.get('sitemapUrls', '').split('\n') if u.strip()],

            # Extraction settings
            'extract_page_title': settings.get('extractPageTitle', True),
            'extract_meta_description': settings.get('extractMetaDescription', True),
            'extract_meta_keywords': settings.get('extractMetaKeywords', True),
            'extract_h1': settings.get('extractH1', True),
            'extract_h2': settings.get('extractH2', True),
            'extract_indexability': settings.get('extractIndexability', True),
            'extract_word_count': settings.get('extractWordCount', True),
            'extract_readability': settings.get('extractReadability', True),
            'extract_text_code_ratio': settings.get('extractTextCodeRatio', True),
            'extract_hash_value': settings.get('extractHashValue', True),
            'extract_page_size': settings.get('extractPageSize', True),
            'extract_forms': settings.get('extractForms', True),
            'extract_accessibility': settings.get('extractAccessibility', False),
            'extract_response_time': settings.get('extractResponseTime', True),
            'extract_last_modified': settings.get('extractLastModified', True),
            'extract_http_headers': settings.get('extractHTTPHeaders', False),
            'extract_cookies': settings.get('extractCookies', False),
            'extract_meta_robots': settings.get('extractMetaRobots', True),
            'extract_x_robots_tag': settings.get('extractXRobotsTag', True),
            'extract_json_ld': settings.get('extractJSONLD', False),
            'extract_microdata': settings.get('extractMicrodata', False),
            'extract_rdfa': settings.get('extractRDFa', False),
            'extract_schema_validation': settings.get('extractSchemaValidation', False),
            'extract_google_rich_result': settings.get('extractGoogleRichResult', False),
            'extract_case_sensitive': settings.get('extractCaseSensitive', False),
            'extract_store_html': settings.get('extractStoreHTML', False),
            'extract_store_rendered_html': settings.get('extractStoreRenderedHTML', False),
            'extract_store_pdf': settings.get('extractStorePDF', False),
            'extract_pdf_properties': settings.get('extractPDFProperties', False),
            'extract_pdf_link_text': settings.get('extractPDFLinkText', False),

            # Limits settings
            'limit_crawl_total': settings.get('limitCrawlTotal', True),
            'limit_crawl_total_value': settings.get('limitCrawlTotalValue', 500),
            'limit_crawl_depth': settings.get('limitCrawlDepth', True),
            'limit_crawl_depth_value': settings.get('limitCrawlDepthValue', 0),
            'limit_urls_per_depth': settings.get('limitUrlsPerDepth', False),
            'limit_urls_per_depth_value': settings.get('limitUrlsPerDepthValue', 1000),
            'limit_max_folder_depth': settings.get('limitMaxFolderDepth', False),
            'limit_max_folder_depth_value': settings.get('limitMaxFolderDepthValue', 5),
            'limit_query_strings': settings.get('limitQueryStrings', False),
            'limit_query_strings_value': settings.get('limitQueryStringsValue', 5),
            'limit_crawl_per_subdomain': settings.get('limitCrawlPerSubdomain', False),
            'limit_crawl_per_subdomain_value': settings.get('limitCrawlPerSubdomainValue', 1000),
            'limit_max_redirects': settings.get('limitMaxRedirects', 10),
            'limit_max_url_length': settings.get('limitMaxUrlLength', 10000),
            'limit_max_links_per_url': settings.get('limitMaxLinksPerUrl', 10000),
            'limit_max_page_size': settings.get('limitMaxPageSize', 50000) * 1024,  # Convert KB to bytes

            # Advanced settings
            'adv_cookie_storage': settings.get('advCookieStorage', 'session'),
            'adv_ignore_non_indexable': settings.get('advIgnoreNonIndexable', True),
            'adv_ignore_paginated': settings.get('advIgnorePaginated', True),
            'adv_always_follow_redirects': settings.get('advAlwaysFollowRedirects', False),
            'adv_always_follow_canonicals': settings.get('advAlwaysFollowCanonicals', False),
            'adv_respect_noindex': settings.get('advRespectNoindex', False),
            'adv_respect_canonicals': settings.get('advRespectCanonicals', False),
            'adv_respect_next_prev': settings.get('advRespectNextPrev', False),
            'adv_respect_hsts': settings.get('advRespectHSTS', False),
            'adv_respect_meta_refresh': settings.get('advRespectMetaRefresh', False),
            'adv_extract_images_srcset': settings.get('advExtractImagesSrcset', False),
            'adv_crawl_fragments': settings.get('advCrawlFragments', False),
            'adv_html_validation': settings.get('advHTMLValidation', True),
            'adv_green_hosting': settings.get('advGreenHosting', False),
            'adv_assume_html': settings.get('advAssumeHTML', False),
            'adv_response_timeout': settings.get('advResponseTimeout', 20),
            'adv_response_retries': settings.get('advResponseRetries', 0),

            # Preferences - SEO thresholds
            'pref_title_pixels_min': settings.get('prefTitlePixelsMin', 200),
            'pref_title_pixels_max': settings.get('prefTitlePixelsMax', 561),
            'pref_title_chars_min': settings.get('prefTitleCharsMin', 30),
            'pref_title_chars_max': settings.get('prefTitleCharsMax', 60),
            'pref_meta_pixels_min': settings.get('prefMetaPixelsMin', 400),
            'pref_meta_pixels_max': settings.get('prefMetaPixelsMax', 585),
            'pref_meta_chars_min': settings.get('prefMetaCharsMin', 70),
            'pref_meta_chars_max': settings.get('prefMetaCharsMax', 155),
            'pref_high_external_outlinks': settings.get('prefHighExternalOutlinks', 10),
            'pref_high_internal_outlinks': settings.get('prefHighInternalOutlinks', 1000),
            'pref_high_crawl_depth': settings.get('prefHighCrawlDepth', 3),
            'pref_non_descriptive_anchors': [a.strip() for a in settings.get('prefNonDescriptiveAnchors', '').split('\n') if a.strip()],
            'pref_max_url_length': settings.get('prefMaxUrlLength', 115),
            'pref_max_h1_length': settings.get('prefMaxH1Length', 70),
            'pref_max_h2_length': settings.get('prefMaxH2Length', 70),
            'pref_max_image_alt_length': settings.get('prefMaxImageAltLength', 100),
            'pref_max_image_size_kb': settings.get('prefMaxImageSizeKb', 100),
            'pref_low_content_word_count': settings.get('prefLowContentWordCount', 200),
            'pref_soft_404_phrases': [p.strip() for p in settings.get('prefSoft404Phrases', '').split('\n') if p.strip()],

            # Authentication settings
            'auth_standards_enabled': settings.get('authStandardsEnabled', False),
            'auth_standards_data': settings.get('authStandardsData', []),
            'auth_forms_data': settings.get('authFormsData', []),

            # Google Analytics 4 settings
            'ga4_enabled': settings.get('ga4Enabled', False),
            'ga4_connected': settings.get('ga4Connected', False),
            'ga4_account_id': settings.get('ga4AccountId', ''),
            'ga4_account_name': settings.get('ga4AccountName', ''),
            'ga4_property_id': settings.get('ga4PropertyId', ''),
            'ga4_property_name': settings.get('ga4PropertyName', ''),
            'ga4_data_stream_id': settings.get('ga4DataStreamId', ''),
            'ga4_data_stream_name': settings.get('ga4DataStreamName', ''),
            'ga4_date_range_preset': settings.get('ga4DateRangePreset', 'last_30_days'),
            'ga4_date_start': settings.get('ga4DateStart', ''),
            'ga4_date_end': settings.get('ga4DateEnd', ''),
            'ga4_selected_metrics': (
                settings.get('ga4SelectedMetrics', [])
                if isinstance(settings.get('ga4SelectedMetrics', []), list)
                else []
            ),
            'ga4_metric_dimensions': (
                settings.get('ga4MetricDimensions', {})
                if isinstance(settings.get('ga4MetricDimensions', {}), dict)
                else {}
            ),
            'ga4_filter_dimension_type': settings.get('ga4FilterDimensionType', ''),
            'ga4_filter_value': settings.get('ga4FilterValue', ''),
            'ga4_match_trailing_slash': settings.get('ga4MatchTrailingSlash', True),
            'ga4_match_case': settings.get('ga4MatchCase', False),
            'ga4_limit_max_results': settings.get('ga4LimitMaxResults', True),
            'ga4_max_results': settings.get('ga4MaxResults', 100000),
            'ga4_crawl_new_urls': settings.get('ga4CrawlNewUrls', False),
            'ga4_oauth_tokens': settings.get('ga4OauthTokens', {}),
            'ga4_last_sync_at': settings.get('ga4LastSyncAt', ''),
            'ga4_last_sync_status': settings.get('ga4LastSyncStatus', ''),
            'ga4_last_sync_error': settings.get('ga4LastSyncError', ''),

            # Google Search Console settings
            'gsc_enabled': settings.get('gscEnabled', False),
            'gsc_connected': settings.get('gscConnected', False),
            'gsc_site_url': settings.get('gscSiteUrl', ''),
            'gsc_site_name': settings.get('gscSiteName', ''),
            'gsc_date_range_preset': settings.get('gscDateRangePreset', 'last_30_days'),
            'gsc_date_start': settings.get('gscDateStart', ''),
            'gsc_date_end': settings.get('gscDateEnd', ''),
            'gsc_device_filter': settings.get('gscDeviceFilter', 'all'),
            'gsc_country_filter': settings.get('gscCountryFilter', ''),
            'gsc_type_filter': settings.get('gscTypeFilter', 'web'),
            'gsc_query_filter_operator': settings.get('gscQueryFilterOperator', 'none'),
            'gsc_query_filter_value': settings.get('gscQueryFilterValue', ''),
            'gsc_match_trailing_slash': settings.get('gscMatchTrailingSlash', True),
            'gsc_match_case': settings.get('gscMatchCase', False),
            'gsc_limit_max_results': settings.get('gscLimitMaxResults', True),
            'gsc_max_results': settings.get('gscMaxResults', 100000),
            'gsc_crawl_new_urls': settings.get('gscCrawlNewUrls', False),
            'gsc_enable_url_inspection': settings.get('gscEnableUrlInspection', False),
            'gsc_ignore_non_indexable_urls': settings.get('gscIgnoreNonIndexableUrls', False),
            'gsc_use_multiple_properties': settings.get('gscUseMultipleProperties', False),
            'gsc_inspection_language_code': settings.get('gscInspectionLanguageCode', 'en-US'),
            'gsc_inspection_max_urls': settings.get('gscInspectionMaxUrls', 200),
            'gsc_oauth_tokens': settings.get('gscOauthTokens', {}),
            'gsc_last_sync_at': settings.get('gscLastSyncAt', ''),
            'gsc_last_sync_status': settings.get('gscLastSyncStatus', ''),
            'gsc_last_sync_error': settings.get('gscLastSyncError', ''),
            'gsc_last_inspection_at': settings.get('gscLastInspectionAt', ''),
            'gsc_last_inspection_status': settings.get('gscLastInspectionStatus', ''),
            'gsc_last_inspection_error': settings.get('gscLastInspectionError', ''),
        }

    def _parse_custom_headers(self, headers_text):
        """Parse custom headers from text format"""
        headers = {}
        if headers_text:
            for line in headers_text.split('\n'):
                line = line.strip()
                if ':' in line:
                    key, value = line.split(':', 1)
                    headers[key.strip()] = value.strip()
        return headers

    def _get_all_headers(self, settings):
        """Get all HTTP headers from both text-based and object-based sources"""
        headers = {}

        # Parse text-based custom headers (legacy)
        if settings.get('customHeaders'):
            headers.update(self._parse_custom_headers(settings['customHeaders']))

        # Merge object-based HTTP headers from the new UI
        if settings.get('httpHeaders') and isinstance(settings['httpHeaders'], dict):
            headers.update(settings['httpHeaders'])

        return headers
