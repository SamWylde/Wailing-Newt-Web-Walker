// Settings Management
let currentSettings = {};

function publishCurrentSettings() {
    if (typeof window !== 'undefined') {
        window.currentSettings = currentSettings;
    }
}

function sanitizeSettingsForClient(settings) {
    const sanitized = { ...settings };
    delete sanitized.ga4OauthTokens;
    delete sanitized.gscOauthTokens;
    return sanitized;
}

publishCurrentSettings();

let defaultSettings = {
    // Crawler settings
    maxDepth: 3,
    maxUrls: 5000000,
    crawlDelay: 1,
    followRedirects: true,
    crawlExternalLinks: false,

    // Speed settings
    maxThreads: 5,
    concurrency: 5,
    limitUrlsPerSecond: false,
    maxUrlsPerSecond: 2,
    respectCrawlDelay: true,

    // User-Agent settings
    presetUserAgent: 'wailingnewt',
    userAgent: 'WailingNewt/1.0 (Web Crawler)',
    robotsUserAgent: 'WailingNewt',

    // Request settings
    timeout: 10,
    retries: 3,
    acceptLanguage: 'en-US,en;q=0.9',
    respectRobotsTxt: true,
    robotsMode: 'respect',
    showInternalBlocked: true,
    showExternalBlocked: true,
    allowCookies: true,
    discoverSitemaps: true,
    enablePageSpeed: false,
    googleApiKey: '',
    pagespeedEnabled: false,
    pagespeedConnected: false,
    pagespeedSource: 'remote',
    pagespeedApiKey: '',
    pagespeedAutoConnect: true,
    pagespeedSelectedDevices: ['mobile', 'desktop'],
    pagespeedSelectedMetricGroups: [
        'overview',
        'crux_metrics',
        'lighthouse_metrics',
        'insights',
        'diagnostics',
        'mobile_friendly',
        'accessibility'
    ],
    pagespeedLastSyncAt: '',
    pagespeedLastSyncStatus: '',
    pagespeedLastSyncError: '',

    // Filter settings
    includeExtensions: 'html,htm,php,asp,aspx,jsp',
    excludeExtensions: 'pdf,doc,docx,zip,exe,dmg',
    includePatterns: '',
    excludePatterns: '',
    maxFileSize: 50,

    // Duplication detection settings
    enableDuplicationCheck: true,
    duplicationThreshold: 0.85,

    // Export settings
    exportFormat: 'csv',
    exportFields: ['url', 'status_code', 'title', 'meta_description', 'h1', 'word_count', 'response_time', 'analytics', 'og_tags', 'json_ld', 'internal_links', 'external_links', 'images'],

    // Extraction Panel - Page Details
    extractPageTitle: true,
    extractMetaDescription: true,
    extractMetaKeywords: true,
    extractH1: true,
    extractH2: true,
    extractIndexability: true,
    extractWordCount: true,
    extractReadability: true,
    extractTextCodeRatio: true,
    extractHashValue: true,
    extractPageSize: true,
    extractForms: true,
    extractAccessibility: false,
    extractResponseTime: true,
    extractLastModified: true,
    extractHTTPHeaders: false,
    extractCookies: false,
    extractMetaRobots: true,
    extractXRobotsTag: true,
    extractJSONLD: false,
    extractMicrodata: false,
    extractRDFa: false,
    extractSchemaValidation: false,
    extractGoogleRichResult: false,
    extractCaseSensitive: false,
    extractStoreHTML: false,
    extractStoreRenderedHTML: false,
    extractStorePDF: false,
    extractPDFProperties: false,
    extractPDFLinkText: false,

    // Crawl Panel - Resource Links
    crawlImages: true,
    storeImages: true,
    crawlMedia: false,
    storeMedia: false,
    crawlCSS: true,
    storeCSS: true,
    crawlJS: true,
    storeJS: true,
    crawlSWF: true,
    storeSWF: true,

    // Crawl Panel - Crawl Behaviour
    checkLinksOutside: true,
    crawlOutside: true,
    crawlSubdomains: true,
    followInternalNofollow: false,
    followExternalNofollow: false,

    // Crawl Panel - Page Links
    crawlInternal: true,
    storeInternal: true,
    crawlExternalValue: true, // Internal key name variant
    crawlExternal: true,
    storeExternal: true,
    crawlCanonicals: true,
    storeCanonicals: true,
    crawlPagination: false,
    storePagination: true,
    crawlHreflang: false,
    storeHreflang: true,

    // Crawl Panel - XML Sitemaps
    crawlSitemaps: true,
    autoDiscoverSitemaps: false,
    crawlTheseSitemaps: false,
    sitemapUrls: '',

    // Google Analytics 4 (GA4)
    ga4Enabled: false,
    ga4Connected: false,
    ga4AccountId: '',
    ga4AccountName: '',
    ga4PropertyId: '',
    ga4PropertyName: '',
    ga4DataStreamId: '',
    ga4DataStreamName: '',
    ga4DateRangePreset: 'last_30_days',
    ga4DateStart: '',
    ga4DateEnd: '',
    ga4SelectedMetrics: ['sessions', 'screenPageViews', 'engagedSessions', 'engagementRate', 'keyEvents', 'eventCount', 'totalRevenue'],
    ga4MetricDimensions: {
        sessions: 'landingPagePlusQueryString',
        screenPageViews: 'landingPagePlusQueryString',
        engagedSessions: 'landingPagePlusQueryString',
        engagementRate: 'landingPagePlusQueryString',
        keyEvents: 'landingPagePlusQueryString',
        eventCount: 'landingPagePlusQueryString',
        totalRevenue: 'landingPagePlusQueryString'
    },
    ga4FilterDimensionType: '',
    ga4FilterValue: '',
    ga4MatchTrailingSlash: true,
    ga4MatchCase: false,
    ga4LimitMaxResults: true,
    ga4MaxResults: 100000,
    ga4CrawlNewUrls: false,
    ga4LastSyncAt: '',
    ga4LastSyncStatus: '',
    ga4LastSyncError: '',

    // Google Search Console (GSC)
    gscEnabled: false,
    gscConnected: false,
    gscSiteUrl: '',
    gscSiteName: '',
    gscDateRangePreset: 'last_30_days',
    gscDateStart: '',
    gscDateEnd: '',
    gscDeviceFilter: 'all',
    gscCountryFilter: '',
    gscTypeFilter: 'web',
    gscQueryFilterOperator: 'none',
    gscQueryFilterValue: '',
    gscMatchTrailingSlash: true,
    gscMatchCase: false,
    gscLimitMaxResults: true,
    gscMaxResults: 100000,
    gscCrawlNewUrls: false,
    gscEnableUrlInspection: false,
    gscIgnoreNonIndexableUrls: false,
    gscUseMultipleProperties: false,
    gscInspectionLanguageCode: 'en-US',
    gscInspectionMaxUrls: 200,
    gscLastSyncAt: '',
    gscLastSyncStatus: '',
    gscLastSyncError: '',
    gscLastInspectionAt: '',
    gscLastInspectionStatus: '',
    gscLastInspectionError: '',

    // Limits Panel
    limitCrawlTotal: true,
    limitCrawlTotalValue: 500,
    limitCrawlDepth: true,
    limitCrawlDepthValue: 0,
    limitUrlsPerDepth: false,
    limitUrlsPerDepthValue: 1000,
    limitMaxFolderDepth: false,
    limitMaxFolderDepthValue: 5,
    limitQueryStrings: false,
    limitQueryStringsValue: 5,
    limitCrawlPerSubdomain: false,
    limitCrawlPerSubdomainValue: 1000,
    limitMaxRedirects: 10,
    limitMaxUrlLength: 10000,
    limitMaxLinksPerUrl: 10000,
    limitMaxPageSize: 50000,

    // Advanced Panel
    advCookieStorage: 'session',
    advIgnoreNonIndexable: true,
    advIgnorePaginated: true,
    advAlwaysFollowRedirects: false,
    advAlwaysFollowCanonicals: false,
    advRespectNoindex: false,
    advRespectCanonicals: false,
    advRespectNextPrev: false,
    advRespectHSTS: false,
    advRespectMetaRefresh: false,
    advExtractImagesSrcset: false,
    advCrawlFragments: false,
    advHTMLValidation: true,
    advGreenHosting: false,
    advAssumeHTML: false,
    advResponseTimeout: 20,
    advResponseRetries: 0,

    // Preferences Panel - SEO thresholds
    prefTitlePixelsMin: 200,
    prefTitlePixelsMax: 561,
    prefTitleCharsMin: 30,
    prefTitleCharsMax: 60,
    prefMetaPixelsMin: 400,
    prefMetaPixelsMax: 585,
    prefMetaCharsMin: 70,
    prefMetaCharsMax: 155,
    prefHighExternalOutlinks: 10,
    prefHighInternalOutlinks: 1000,
    prefHighCrawlDepth: 3,
    prefNonDescriptiveAnchors: "click here\nclick this\nfind out more\ngo\nhere\nlearn more\nmore\nover here\nread here\nread more\nright here\nstart\nthis\nthis page",
    prefMaxUrlLength: 115,
    prefMaxH1Length: 70,
    prefMaxH2Length: 70,
    prefMaxImageAltLength: 100,
    prefMaxImageSizeKb: 100,
    prefLowContentWordCount: 200,
    prefSoft404Phrases: "404 Not Found\n404 error\n410 Not Found\ncan't find the page\ncan't seem to find that page\ncouldn't find that page\ncouldn't find the page\ncouldn't find what you're looking for\nerror 404\nerror occurred\nno products found\nno results found\nnot exist\nnot found\nnothing found\npage cannot be found\npage does not exist\npage not found\npage you are looking for\npage you requested\nsorry\nwe couldn't find",

    // Advanced technical settings
    memoryLimit: 512,
    logLevel: 'INFO',
    saveSession: false,
    enableProxy: false,
    proxyUrl: '',
    customHeaders: '',

    // JavaScript rendering settings
    enableJavaScript: false,
    jsWaitTime: 3,
    jsTimeout: 30,
    jsBrowser: 'chromium',
    jsHeadless: true,
    jsUserAgent: 'WailingNewt/1.0 (Web Crawler with JavaScript)',
    jsViewportWidth: 1920,
    jsViewportHeight: 1080,
    jsMaxConcurrentPages: 3,

    // Crawl4AI - Anti-Detection
    stealthMode: false,
    randomUserAgent: false,
    overrideNavigator: false,
    simulateUser: false,
    magicMode: false,

    // Crawl4AI - Wait Strategy
    waitStrategy: 'fixed',
    waitForSelector: '',
    waitForExpression: '',

    // Crawl4AI - Resource Mode
    resourceMode: 'full',

    // Crawl4AI - Infinite Scroll
    scanFullPage: false,
    scrollDelay: 0.2,
    maxScrollSteps: 0,

    // Custom CSS styling
    customCSS: '',

    // Issue exclusion patterns
    issueExclusionPatterns: `# WordPress admin & system paths
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
*.min.css`
};

function normalizeSpeedSettings(settings) {
    const normalized = { ...settings };
    const concurrencyValue = settings.concurrency ?? settings.maxThreads ?? defaultSettings.maxThreads;
    normalized.maxThreads = concurrencyValue;

    if (normalized.limitUrlsPerSecond === undefined && normalized.maxUrlsPerSecond) {
        normalized.limitUrlsPerSecond = true;
    }

    if (normalized.limitUrlsPerSecond === undefined) {
        normalized.limitUrlsPerSecond = defaultSettings.limitUrlsPerSecond;
    }

    if (!normalized.maxUrlsPerSecond || normalized.maxUrlsPerSecond <= 0) {
        normalized.maxUrlsPerSecond = defaultSettings.maxUrlsPerSecond;
    }

    return normalized;
}

// Initialize settings when page loads
document.addEventListener('DOMContentLoaded', function () {
    loadSettings();
    setupSettingsEventHandlers();
    applyCustomCSS();
});

function setupSettingsEventHandlers() {
    // Proxy checkbox handler
    const enableProxyCheckbox = document.getElementById('enableProxy');
    if (enableProxyCheckbox) {
        enableProxyCheckbox.addEventListener('change', function () {
            const proxySettings = document.getElementById('proxySettings');
            if (proxySettings) {
                proxySettings.style.display = this.checked ? 'block' : 'none';
            }
        });
    }

    // JavaScript checkbox handler
    const enableJavaScriptCheckbox = document.getElementById('enableJavaScript');
    if (enableJavaScriptCheckbox) {
        enableJavaScriptCheckbox.addEventListener('change', function () {
            const jsSettingsGroups = [
                'jsSettings', 'jsTimeoutGroup', 'jsBrowserGroup', 'jsHeadlessGroup',
                'jsUserAgentGroup', 'jsViewportGroup', 'jsConcurrencyGroup', 'jsWarning',
                'antiDetectionGroup', 'waitStrategyGroup', 'resourceModeGroup', 'infiniteScrollGroup'
            ];

            jsSettingsGroups.forEach(groupId => {
                const group = document.getElementById(groupId);
                if (group) {
                    group.style.display = this.checked ? 'block' : 'none';
                }
            });
        });
    }
}

function resetIssueExclusions() {
    // Always use the hardcoded defaults, not current settings
    document.getElementById('issueExclusionPatterns').value = defaultSettings.issueExclusionPatterns;
    alert('Issue exclusion patterns have been reset to defaults');
}

// Preset user agent strings
const userAgentPresets = {
    wailingnewt: {
        http: 'WailingNewt/1.0 (Web Crawler)',
        robots: 'WailingNewt'
    },
    googlebot: {
        http: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        robots: 'Googlebot'
    },
    bingbot: {
        http: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        robots: 'bingbot'
    },
    chrome: {
        http: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        robots: 'Chrome'
    },
    firefox: {
        http: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        robots: 'Firefox'
    },
    safari: {
        http: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        robots: 'Safari'
    }
};

function applyPresetUserAgent() {
    const presetSelect = document.getElementById('presetUserAgent');
    const userAgentInput = document.getElementById('userAgent');
    const robotsUserAgentInput = document.getElementById('robotsUserAgent');

    if (!presetSelect || !userAgentInput || !robotsUserAgentInput) return;

    const preset = presetSelect.value;

    if (preset === 'custom') {
        // Leave the fields editable, don't change values
        return;
    }

    const presetValues = userAgentPresets[preset];
    if (presetValues) {
        userAgentInput.value = presetValues.http;
        robotsUserAgentInput.value = presetValues.robots;
    }
}

async function openSettings() {
    // Get user tier info
    let userTier = 'guest';
    try {
        const response = await fetch('/api/user/info');
        const data = await response.json();
        if (data.success) {
            userTier = data.user.tier;
        }
    } catch (error) {
        console.error('Failed to get user tier:', error);
    }

    // Block guests from accessing settings
    if (userTier === 'guest') {
        alert('Settings are not available for guest users.\n\nPlease register for a free account to customize crawler settings, filters, and more.\n\nClick "Logout" and then "Register here" to create an account.');
        return;
    }

    // Hide tabs based on tier
    applyTierRestrictions(userTier);

    // Load current settings into form
    populateSettingsForm();

    // Show modal
    document.getElementById('settingsModal').style.display = 'flex';

    // Focus first input
    const firstInput = document.querySelector('.settings-tab-content.active input, .settings-tab-content.active select');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
}

function applyTierRestrictions(tier) {
    // Define which tabs each tier can see - MUST MATCH HTML TAB NAMES
    const tierTabs = {
        'guest': [],  // No settings tabs for guests
        'user': ['crawler', 'export', 'issues'],
        'extra': ['crawler', 'export', 'issues', 'filters', 'requests', 'customcss', 'javascript'],
        'admin': ['crawler', 'requests', 'filters', 'export', 'javascript', 'issues', 'customcss', 'advanced']
    };

    const allowedTabs = tierTabs[tier] || [];

    // Hide/show tab buttons based on tier
    const allTabButtons = document.querySelectorAll('.settings-tab-btn');
    allTabButtons.forEach(btn => {
        const tabName = btn.getAttribute('onclick').match(/switchSettingsTab\('(.+?)'\)/)[1];
        if (allowedTabs.includes(tabName)) {
            btn.style.display = 'inline-block';
        } else {
            btn.style.display = 'none';
        }
    });

    // If current active tab is not allowed, switch to first allowed tab
    const activeTab = document.querySelector('.settings-tab-btn.active');
    if (activeTab && activeTab.style.display === 'none' && allowedTabs.length > 0) {
        // Click the first visible tab
        const firstVisibleTab = document.querySelector('.settings-tab-btn[style*="inline-block"]');
        if (firstVisibleTab) {
            firstVisibleTab.click();
        }
    }

    // Show message for guests
    if (tier === 'guest') {
        const settingsContent = document.querySelector('.settings-tabs');
        if (settingsContent) {
            const message = document.createElement('div');
            message.style.cssText = 'padding: 40px; text-align: center; color: #9ca3af; font-size: 16px;';
            message.innerHTML = `
                <h3 style="color: #f3f4f6; margin-bottom: 16px;">Settings Access Restricted</h3>
                <p>Guest accounts cannot modify settings.</p>
                <p style="margin-top: 8px; font-size: 14px;">Please upgrade your account to access settings.</p>
            `;
            settingsContent.innerHTML = '';
            settingsContent.appendChild(message);
        }
    }
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function switchSettingsTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Add active class to selected tab and content
    event.target.classList.add('active');
    document.getElementById(tabName + '-settings').classList.add('active');
}

// New settings panel navigation (for the new sidebar-style settings modal)
function showSettingsPanel(panelName) {
    // Remove active class from all nav items
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Hide all panels
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Show selected panel
    const panel = document.getElementById('settings-panel-' + panelName);
    if (panel) {
        panel.classList.add('active');
    }

    // Add active class to clicked item
    if (event && event.target) {
        event.target.closest('.settings-nav-item').classList.add('active');
    }
}

function filterSettingsItems() {
    const searchTerm = document.getElementById('settingsSearch').value.toLowerCase();
    const items = document.querySelectorAll('.settings-nav-item');

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function populateSettingsForm() {
    // Populate all form fields with current settings
    Object.keys(currentSettings).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = currentSettings[key];
            } else {
                element.value = currentSettings[key];
            }
        }
    });

    // Handle export fields checkboxes
    const exportFieldsCheckboxes = document.querySelectorAll('input[name="exportFields"]');
    exportFieldsCheckboxes.forEach(checkbox => {
        checkbox.checked = currentSettings.exportFields.includes(checkbox.value);
    });

    // Show/hide proxy settings
    const enableProxy = currentSettings.enableProxy;
    const proxySettings = document.getElementById('proxySettings');
    if (proxySettings) {
        proxySettings.style.display = enableProxy ? 'block' : 'none';
    }

    // Show/hide JavaScript settings
    const enableJavaScript = currentSettings.enableJavaScript;
    const jsSettingsGroups = [
        'jsSettings', 'jsTimeoutGroup', 'jsBrowserGroup', 'jsHeadlessGroup',
        'jsUserAgentGroup', 'jsViewportGroup', 'jsConcurrencyGroup', 'jsWarning',
        'antiDetectionGroup', 'waitStrategyGroup', 'resourceModeGroup', 'infiniteScrollGroup'
    ];

    jsSettingsGroups.forEach(groupId => {
        const group = document.getElementById(groupId);
        if (group) {
            group.style.display = enableJavaScript ? 'block' : 'none';
        }
    });
}

function collectSettingsFromForm() {
    const settings = {};

    // Collect regular form fields
    const formFields = [
        'maxDepth', 'maxUrls', 'crawlDelay', 'followRedirects', 'crawlExternalLinks',
        'presetUserAgent', 'userAgent', 'robotsUserAgent',
        'timeout', 'retries', 'acceptLanguage', 'respectRobotsTxt', 'allowCookies', 'discoverSitemaps', 'enablePageSpeed', 'googleApiKey',
        'includeExtensions', 'excludeExtensions', 'includePatterns', 'excludePatterns', 'maxFileSize',
        'enableDuplicationCheck', 'duplicationThreshold',
        'exportFormat', 'concurrency', 'memoryLimit', 'logLevel', 'saveSession',
        'enableProxy', 'proxyUrl', 'customHeaders',
        'enableJavaScript', 'jsWaitTime', 'jsTimeout', 'jsBrowser', 'jsHeadless', 'jsUserAgent', 'jsViewportWidth', 'jsViewportHeight', 'jsMaxConcurrentPages',
        'stealthMode', 'randomUserAgent', 'overrideNavigator', 'simulateUser', 'magicMode',
        'waitStrategy', 'waitForSelector', 'waitForExpression',
        'resourceMode',
        'scanFullPage', 'scrollDelay', 'maxScrollSteps',
        'customCSS', 'issueExclusionPatterns'
    ];

    formFields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            if (element.type === 'checkbox') {
                settings[fieldId] = element.checked;
            } else if (element.type === 'number') {
                settings[fieldId] = parseFloat(element.value) || 0;
            } else {
                settings[fieldId] = element.value;
            }
        }
    });

    // Collect export fields
    const exportFieldsCheckboxes = document.querySelectorAll('input[name="exportFields"]:checked');
    settings.exportFields = Array.from(exportFieldsCheckboxes).map(cb => cb.value);

    return settings;
}

function saveSettings() {
    // Collect settings from form
    const collectedSettings = collectSettingsFromForm();
    const newSettings = sanitizeSettingsForClient(
        normalizeSpeedSettings({ ...currentSettings, ...collectedSettings })
    );

    // Validate settings
    const validation = validateSettings(newSettings);
    if (!validation.valid) {
        alert('Settings validation failed: ' + validation.errors.join(', '));
        return;
    }

    // Save to localStorage first (primary storage for persistence)
    try {
        localStorage.setItem('wailingnewt_settings', JSON.stringify(newSettings));
        console.log('Settings saved to localStorage');
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        showNotification('Warning: Settings may not persist', 'warning');
    }

    // Update current settings
    currentSettings = { ...newSettings };
    publishCurrentSettings();

    // Apply custom CSS immediately
    applyCustomCSS();

    // Close settings modal
    closeSettings();
    showNotification('Settings saved successfully', 'success');

    // Sync to backend for crawler configuration
    fetch('/api/save_settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings)
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.warn('Backend sync failed:', data.error);
            }

            // Update crawler with new settings if it's running
            if (window.crawlState && window.crawlState.isRunning) {
                updateCrawlerSettings();
            }
        })
        .catch(error => {
            console.error('Error syncing settings to backend:', error);
        });
}

function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to their default values?')) {
        currentSettings = sanitizeSettingsForClient({ ...defaultSettings });
        publishCurrentSettings();

        // Clear localStorage
        try {
            localStorage.removeItem('wailingnewt_settings');
            console.log('Settings cleared from localStorage');
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
        }

        populateSettingsForm();
        applyCustomCSS(); // Remove any custom CSS
        showNotification('Settings reset to defaults', 'info');

        // Sync reset to backend
        syncSettingsToBackend();
    }
}

function validateSettings(settings) {
    const errors = [];

    // Validate numeric ranges
    if (settings.maxDepth < 1 || settings.maxDepth > 10) {
        errors.push('Max depth must be between 1 and 10');
    }

    if (settings.maxUrls < 1 || settings.maxUrls > 5000000) {
        errors.push('Max URLs must be between 1 and 5,000,000');
    }

    if (settings.crawlDelay < 0 || settings.crawlDelay > 60) {
        errors.push('Crawl delay must be between 0 and 60 seconds');
    }

    if (settings.timeout < 1 || settings.timeout > 120) {
        errors.push('Timeout must be between 1 and 120 seconds');
    }

    if (settings.retries < 0 || settings.retries > 10) {
        errors.push('Retries must be between 0 and 10');
    }

    if (settings.maxFileSize < 1 || settings.maxFileSize > 1000) {
        errors.push('Max file size must be between 1 and 1000 MB');
    }

    if (settings.concurrency < 1 || settings.concurrency > 50) {
        errors.push('Concurrency must be between 1 and 50');
    }

    if (settings.memoryLimit < 64 || settings.memoryLimit > 4096) {
        errors.push('Memory limit must be between 64 and 4096 MB');
    }

    // Validate duplication detection settings
    if (settings.duplicationThreshold < 0 || settings.duplicationThreshold > 1) {
        errors.push('Duplication threshold must be between 0.0 and 1.0');
    }

    // Validate JavaScript settings if enabled
    if (settings.enableJavaScript) {
        if (settings.jsWaitTime < 0 || settings.jsWaitTime > 30) {
            errors.push('JavaScript wait time must be between 0 and 30 seconds');
        }

        if (settings.jsTimeout < 5 || settings.jsTimeout > 120) {
            errors.push('JavaScript timeout must be between 5 and 120 seconds');
        }

        if (settings.jsViewportWidth < 800 || settings.jsViewportWidth > 4000) {
            errors.push('JavaScript viewport width must be between 800 and 4000 pixels');
        }

        if (settings.jsViewportHeight < 600 || settings.jsViewportHeight > 3000) {
            errors.push('JavaScript viewport height must be between 600 and 3000 pixels');
        }

        if (settings.jsMaxConcurrentPages < 1 || settings.jsMaxConcurrentPages > 10) {
            errors.push('JavaScript concurrent pages must be between 1 and 10');
        }

        if (!settings.jsUserAgent.trim()) {
            errors.push('JavaScript user agent cannot be empty');
        }
    }

    // Validate proxy URL if proxy is enabled
    if (settings.enableProxy && settings.proxyUrl) {
        try {
            new URL(settings.proxyUrl);
        } catch (e) {
            errors.push('Invalid proxy URL format');
        }
    }

    // Validate user agent
    if (!settings.userAgent.trim()) {
        errors.push('User agent cannot be empty');
    }

    // Validate export fields
    if (settings.exportFields.length === 0) {
        errors.push('At least one export field must be selected');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function loadSettings() {
    fetch('/api/get_settings')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentSettings = sanitizeSettingsForClient(
                    normalizeSpeedSettings({ ...defaultSettings, ...data.settings })
                );
                publishCurrentSettings();
                localStorage.setItem('wailingnewt_settings', JSON.stringify(currentSettings));
                applyCustomCSS();
                return;
            }
            throw new Error(data.error || 'Failed to load settings from backend');
        })
        .catch(error => {
            console.warn('Backend settings load failed, trying localStorage:', error);
            try {
                const savedSettings = localStorage.getItem('wailingnewt_settings');
                if (savedSettings) {
                    const parsed = JSON.parse(savedSettings);
                    currentSettings = sanitizeSettingsForClient(
                        normalizeSpeedSettings({ ...defaultSettings, ...parsed })
                    );
                    publishCurrentSettings();
                    applyCustomCSS();
                    syncSettingsToBackend();
                    return;
                }
            } catch (storageError) {
                console.warn('Failed to load settings from localStorage:', storageError);
            }

            currentSettings = sanitizeSettingsForClient(
                normalizeSpeedSettings({ ...defaultSettings })
            );
            publishCurrentSettings();
            applyCustomCSS();
        });
}

function syncSettingsToBackend() {
    // Send settings to backend without waiting for response
    // This ensures crawler gets the right config
    fetch('/api/save_settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitizeSettingsForClient(currentSettings))
    }).catch(error => {
        console.warn('Failed to sync settings to backend:', error);
    });
}

function updateCrawlerSettings() {
    // Send updated settings to crawler
    fetch('/api/update_crawler_settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(sanitizeSettingsForClient(currentSettings))
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Crawler settings updated');
            } else {
                console.warn('Failed to update crawler settings:', data.error);
            }
        })
        .catch(error => {
            console.error('Error updating crawler settings:', error);
        });
}

function exportSettings() {
    // Create downloadable settings file
    const settingsBlob = new Blob([JSON.stringify(sanitizeSettingsForClient(currentSettings), null, 2)], {
        type: 'application/json'
    });

    const url = URL.createObjectURL(settingsBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wailingnewt-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedSettings = JSON.parse(e.target.result);

            // Validate imported settings
            const validation = validateSettings(importedSettings);
            if (!validation.valid) {
                alert('Invalid settings file: ' + validation.errors.join(', '));
                return;
            }

            // Merge with defaults to ensure all fields are present
            currentSettings = sanitizeSettingsForClient({ ...defaultSettings, ...importedSettings });
            publishCurrentSettings();
            populateSettingsForm();
            showNotification('Settings imported successfully', 'success');

        } catch (error) {
            alert('Invalid settings file format');
        }
    };
    reader.readAsText(file);
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 1001;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
    `;

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
    }

    // Add to page
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Close modal when clicking outside
document.addEventListener('click', function (event) {
    const modal = document.getElementById('settingsModal');
    if (event.target === modal) {
        closeSettings();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('settingsModal');
        if (modal.style.display === 'flex') {
            closeSettings();
        }
    }
});

// Export current settings object for use by other modules
window.getCurrentSettings = function () {
    return currentSettings;
};

// Apply custom CSS to the page
function applyCustomCSS() {
    // Remove existing custom CSS if present
    const existingStyle = document.getElementById('custom-user-styles');
    if (existingStyle) {
        existingStyle.remove();
    }

    // Get custom CSS from settings
    const customCSS = currentSettings.customCSS || '';

    // Only inject if there's CSS to apply
    if (customCSS.trim()) {
        const styleElement = document.createElement('style');
        styleElement.id = 'custom-user-styles';
        styleElement.textContent = customCSS;
        document.head.appendChild(styleElement);
        console.log('Custom CSS applied');
    }
}
