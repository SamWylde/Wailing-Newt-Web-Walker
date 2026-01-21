"""Shared defaults for crawler settings and configuration."""

DEFAULT_ISSUE_EXCLUSION_PATTERNS_TEXT = """# WordPress admin & system paths
/wp-admin/*
/wp-content/plugins/*
/wp-content/themes/*
/wp-content/uploads/*
/wp-includes/*
/wp-login.php
/wp-cron.php
/xmlrpc.php
/wp-json/*
/wp-activate.php
/wp-signup.php
/wp-trackback.php

# Auth & user management pages
/login*
/signin*
/sign-in*
/log-in*
/auth/*
/authenticate/*
/register*
/signup*
/sign-up*
/registration/*
/logout*
/signout*
/sign-out*
/log-out*
/forgot-password*
/reset-password*
/password-reset*
/recover-password*
/change-password*
/account/password/*
/user/password/*
/activate/*
/verification/*
/verify/*
/confirm/*

# Admin panels & dashboards
/admin/*
/administrator/*
/_admin/*
/backend/*
/dashboard/*
/cpanel/*
/phpmyadmin/*
/pma/*
/webmail/*
/plesk/*
/control-panel/*
/manage/*
/manager/*

# E-commerce checkout & cart
/checkout/*
/cart/*
/basket/*
/payment/*
/billing/*
/order/*
/orders/*
/purchase/*

# User account pages
/account/*
/profile/*
/settings/*
/preferences/*
/my-account/*
/user/*
/member/*
/members/*

# CGI & server scripts
/cgi-bin/*
/cgi/*
/fcgi-bin/*

# Version control & config
/.git/*
/.svn/*
/.hg/*
/.bzr/*
/.cvs/*
/.env
/.env.*
/.htaccess
/.htpasswd
/web.config
/app.config
/composer.json
/package.json

# Development & build artifacts
/node_modules/*
/vendor/*
/bower_components/*
/jspm_packages/*
/includes/*
/lib/*
/libs/*
/src/*
/dist/*
/build/*
/builds/*
/_next/*
/.next/*
/out/*
/_nuxt/*
/.nuxt/*

# Testing & development
/test/*
/tests/*
/spec/*
/specs/*
/__tests__/*
/debug/*
/dev/*
/development/*
/staging/*

# API internal endpoints
/api/internal/*
/api/admin/*
/api/private/*

# System & internal
/private/*
/system/*
/core/*
/internal/*
/tmp/*
/temp/*
/cache/*
/logs/*
/log/*
/backup/*
/backups/*
/old/*
/archive/*
/archives/*
/config/*
/configs/*
/configuration/*

# Media upload forms
/upload/*
/uploads/*
/uploader/*
/file-upload/*

# Search & filtering (often noisy for SEO)
/search*
*/search/*
?s=*
?search=*
*/filter/*
?filter=*
*/sort/*
?sort=*

# Printer-friendly & special views
/print/*
?print=*
/preview/*
?preview=*
/embed/*
?embed=*
/amp/*
/amp

# Feed URLs
/feed/*
/feeds/*
/rss/*
*.rss
/atom/*
*.atom

# Common file types to exclude from issues
*.json
*.xml
*.yaml
*.yml
*.toml
*.ini
*.conf
*.log
*.txt
*.csv
*.sql
*.db
*.bak
*.backup
*.old
*.orig
*.tmp
*.swp
*.map
*.min.js
*.min.css"""


def parse_issue_exclusion_patterns(text):
    """Convert issue exclusion text into a list of patterns."""
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith('#')
    ]


def get_default_settings():
    """Return default settings used by the settings manager."""
    return {
        # Crawler settings
        'maxDepth': 3,
        'maxUrls': 5000000,
        'crawlDelay': 1,
        'followRedirects': True,
        'crawlExternalLinks': False,

        # Request settings
        'userAgent': 'WailingNewt/1.0 (Web Crawler)',
        'timeout': 10,
        'retries': 3,
        'acceptLanguage': 'en-US,en;q=0.9',
        'respectRobotsTxt': True,
        'robotsMode': 'respect',  # 'respect' or 'ignore'
        'showInternalBlocked': True,  # Show internal URLs blocked by robots.txt
        'showExternalBlocked': True,  # Show external URLs blocked by robots.txt
        'robotsUserAgent': 'WailingNewt',  # User agent for robots.txt checking
        'allowCookies': True,
        'discoverSitemaps': True,
        'enablePageSpeed': False,
        'googleApiKey': '',

        # Filter settings
        'includeExtensions': 'html,htm,php,asp,aspx,jsp',
        'excludeExtensions': 'pdf,doc,docx,zip,exe,dmg',
        'includePatterns': '',
        'excludePatterns': '',
        'maxFileSize': 50,

        # Duplication detection settings
        'enableDuplicationCheck': True,
        'duplicationThreshold': 0.85,

        # Export settings
        'exportFormat': 'csv',
        'exportFields': ['url', 'status_code', 'title', 'meta_description', 'h1'],

        # Advanced settings
        'concurrency': 5,
        'memoryLimit': 512,
        'logLevel': 'INFO',
        'saveSession': False,
        'enableProxy': False,
        'proxyUrl': '',
        'customHeaders': '',

        # JavaScript rendering settings
        'enableJavaScript': False,
        'jsWaitTime': 3,
        'jsTimeout': 30,
        'jsBrowser': 'chromium',
        'jsHeadless': True,
        'jsUserAgent': 'WailingNewt/1.0 (Web Crawler with JavaScript)',
        'jsViewportWidth': 1920,
        'jsViewportHeight': 1080,
        'jsMaxConcurrentPages': 3,

        # Custom CSS styling
        'customCSS': '',

        # Issue exclusion patterns
        'issueExclusionPatterns': DEFAULT_ISSUE_EXCLUSION_PATTERNS_TEXT,
    }


def get_default_crawler_config():
    """Return default crawler configuration used by the crawler."""
    return {
        'max_depth': 3,
        'max_urls': 5000000,
        'delay': 1.0,
        'follow_redirects': True,
        'crawl_external': False,
        'user_agent': 'WailingNewt/1.0 (Web Crawler)',
        'timeout': 10,
        'retries': 3,
        'accept_language': 'en-US,en;q=0.9',
        'respect_robots': True,
        'robots_mode': 'respect',
        'show_internal_blocked': True,
        'show_external_blocked': True,
        'robots_user_agent': 'WailingNewt',
        'allow_cookies': True,
        'include_extensions': ['html', 'htm', 'php', 'asp', 'aspx', 'jsp'],
        'exclude_extensions': ['pdf', 'doc', 'docx', 'zip', 'exe', 'dmg'],
        'include_patterns': [],
        'exclude_patterns': [],
        'max_file_size': 50 * 1024 * 1024,
        'concurrency': 5,
        'memory_limit': 512 * 1024 * 1024,
        'log_level': 'INFO',
        'enable_proxy': False,
        'proxy_url': None,
        'custom_headers': {},
        'discover_sitemaps': True,
        'enable_pagespeed': False,
        'enable_javascript': False,
        'js_wait_time': 3,
        'js_timeout': 30,
        'js_browser': 'chromium',
        'js_headless': True,
        'js_user_agent': 'WailingNewt/1.0 (Web Crawler with JavaScript)',
        'js_viewport_width': 1920,
        'js_viewport_height': 1080,
        'js_max_concurrent_pages': 3,
        'issue_exclusion_patterns': parse_issue_exclusion_patterns(
            DEFAULT_ISSUE_EXCLUSION_PATTERNS_TEXT
        ),
    }
