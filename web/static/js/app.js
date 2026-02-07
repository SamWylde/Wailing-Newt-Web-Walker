// Debug: confirm script is loading
console.log('app.js v4 loaded successfully');

// Application State
let crawlState = {
    isRunning: false,
    isPaused: false,
    startTime: null,
    baseUrl: null,
    urls: [],
    links: [],
    issues: [],
    stats: {
        discovered: 0,
        crawled: 0,
        depth: 0,
        speed: 0
    },
    filters: {
        active: null,
        issueFilter: 'all',
        linksFilter: {
            internalStatusCode: 'all',
            externalStatusCode: 'all',
            internalSearch: '',
            externalSearch: ''
        }
    }
};
window.crawlState = crawlState;

// Incremental polling instance
let incrementalPoller = null;

// Virtual Scrollers
let virtualScrollers = {
    overview: null,
    internal: null,
    external: null,
    internalLinks: null,
    externalLinks: null,
    issues: null
};

// Tab Configuration System
const TAB_DEFINITIONS = [
    { id: 'overview', label: 'Overview', defaultVisible: true },
    { id: 'internal', label: 'Internal', defaultVisible: true },
    { id: 'external', label: 'External', defaultVisible: true },
    { id: 'security', label: 'Security', defaultVisible: false },
    { id: 'status-codes', label: 'Response Codes', defaultVisible: true },
    { id: 'url', label: 'URL', defaultVisible: false },
    { id: 'page-titles', label: 'Page Titles', defaultVisible: false },
    { id: 'meta-description', label: 'Meta Description', defaultVisible: false },
    { id: 'meta-keywords', label: 'Meta Keywords', defaultVisible: false },
    { id: 'h1', label: 'H1', defaultVisible: false },
    { id: 'h2', label: 'H2', defaultVisible: false },
    { id: 'content', label: 'Content', defaultVisible: false },
    { id: 'images', label: 'Images', defaultVisible: false },
    { id: 'canonicals', label: 'Canonicals', defaultVisible: false },
    { id: 'pagination', label: 'Pagination', defaultVisible: false },
    { id: 'directives', label: 'Directives', defaultVisible: false },
    { id: 'hreflang', label: 'Hreflang', defaultVisible: false },
    { id: 'javascript', label: 'JavaScript', defaultVisible: false },
    { id: 'links', label: 'Links', defaultVisible: true },
    { id: 'amp', label: 'AMP', defaultVisible: false },
    { id: 'structured-data', label: 'Structured Data', defaultVisible: false },
    { id: 'sitemaps', label: 'Sitemaps', defaultVisible: false },
    { id: 'issues', label: 'Issues', defaultVisible: true },
    { id: 'content-analysis', label: 'Content Analysis', defaultVisible: true },
    { id: 'link-health', label: 'Link Health', defaultVisible: true },
    { id: 'core-web-vitals', label: 'Core Web Vitals', defaultVisible: true },
    { id: 'pagespeed', label: 'PageSpeed', defaultVisible: true },
    { id: 'mobile', label: 'Mobile', defaultVisible: false },
    { id: 'accessibility', label: 'Accessibility', defaultVisible: false },
    { id: 'custom-search', label: 'Custom Search', defaultVisible: false },
    { id: 'custom-extraction', label: 'Custom Extraction', defaultVisible: false },
    { id: 'custom-javascript', label: 'Custom JavaScript', defaultVisible: false },
    { id: 'analytics', label: 'Analytics', defaultVisible: false },
    { id: 'search-console', label: 'Search Console', defaultVisible: false },
    { id: 'validation', label: 'Validation', defaultVisible: false },
    { id: 'link-metrics', label: 'Link Metrics', defaultVisible: false },
    { id: 'ai', label: 'AI', defaultVisible: false },
    { id: 'visualization', label: 'Visualization', defaultVisible: true },
    { id: 'reports', label: 'Reports', defaultVisible: true }
];

// Tab visibility state (loaded from localStorage)
let tabVisibility = {};

// Initialize tab visibility from localStorage or defaults
function initTabConfiguration() {
    const stored = localStorage.getItem('wailingNewt_tabVisibility');
    if (stored) {
        try {
            tabVisibility = JSON.parse(stored);
            // Ensure all tabs have a visibility setting
            TAB_DEFINITIONS.forEach(tab => {
                if (tabVisibility[tab.id] === undefined) {
                    tabVisibility[tab.id] = tab.defaultVisible;
                }
            });
        } catch (e) {
            console.error('Error loading tab visibility config:', e);
            resetTabsToDefault();
        }
    } else {
        resetTabsToDefault();
    }
    renderTabButtons();
    renderTabConfigureDropdown();
}

// Reset all tabs to default visibility
function resetTabsToDefault() {
    tabVisibility = {};
    TAB_DEFINITIONS.forEach(tab => {
        tabVisibility[tab.id] = tab.defaultVisible;
    });
    saveTabConfiguration();
}

// Save tab visibility to localStorage
function saveTabConfiguration() {
    localStorage.setItem('wailingNewt_tabVisibility', JSON.stringify(tabVisibility));
}

// Render tab buttons based on visibility
function renderTabButtons() {
    const tabHeader = document.getElementById('tab-header-container');
    if (!tabHeader) return;

    // Clear and re-render all tab buttons
    tabHeader.innerHTML = '';

    // Add compact configure button first (dropdown toggle)
    const newConfigBtn = document.createElement('button');
    newConfigBtn.className = 'tab-configure-btn';
    newConfigBtn.onclick = toggleConfigureDropdown;
    newConfigBtn.title = 'Configure Tabs';
    newConfigBtn.setAttribute('aria-label', 'Configure Tabs');
    newConfigBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7 10l5 5 5-5z"></path>
    </svg>`;
    tabHeader.appendChild(newConfigBtn);

    // Add visible tabs
    TAB_DEFINITIONS.forEach(tab => {
        if (tabVisibility[tab.id]) {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.setAttribute('data-tab-id', tab.id);
            btn.onclick = () => switchTab(tab.id);
            btn.textContent = tab.label;

            // Set first visible tab as active
            if (!tabHeader.querySelector('.tab-btn.active') && tabVisibility[tab.id]) {
                btn.classList.add('active');
                // Also show the corresponding pane
                const pane = document.getElementById(tab.id + '-tab');
                if (pane) pane.classList.add('active');
            }

            tabHeader.appendChild(btn);
        }
    });
}
// Render the tab configure dropdown with checkboxes
function renderTabConfigureDropdown() {
    let dropdown = document.getElementById('tab-configure-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'tab-configure-dropdown';
        dropdown.className = 'tab-configure-dropdown';
        // Stop clicks inside from bubbling to the document-level closer
        dropdown.onclick = (e) => e.stopPropagation();
        document.querySelector('.toolbar-row--tabs').appendChild(dropdown);
    }

    // Capture the current scroll position if list exists
    const list = dropdown.querySelector('.tab-configure-list');
    const scrollPos = list ? list.scrollTop : 0;

    dropdown.innerHTML = `
        <div class="tab-configure-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Configure Tabs
        </div>
        <button class="tab-configure-reset" onclick="handleResetTabs()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
            </svg>
            Reset Tabs
        </button>
        <div class="tab-configure-list">
            ${TAB_DEFINITIONS.map(tab => `
                <label class="tab-configure-item">
                    <input type="checkbox" 
                           data-tab-checkbox="${tab.id}"
                           ${tabVisibility[tab.id] ? 'checked' : ''} 
                           onchange="handleTabVisibilityChange('${tab.id}', this.checked)">
                    <span class="tab-configure-checkbox"></span>
                    <span class="tab-configure-label">${tab.label}</span>
                </label>
            `).join('')}
        </div>
    `;

    // Restore scroll position
    if (scrollPos) {
        const newList = dropdown.querySelector('.tab-configure-list');
        if (newList) newList.scrollTop = scrollPos;
    }
}

// Position the dropdown below the gear button
function positionTabConfigureDropdown() {
    const dropdown = document.getElementById('tab-configure-dropdown');
    const configBtn = document.querySelector('.tab-configure-btn');
    if (dropdown && configBtn) {
        const btnRect = configBtn.getBoundingClientRect();
        dropdown.style.top = (btnRect.bottom + 4) + 'px';
        dropdown.style.left = Math.max(8, btnRect.right - 220) + 'px'; // Align right edge with button, shift if off-screen
    }
}

// Toggle configure dropdown visibility
function toggleConfigureDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('tab-configure-dropdown');

    if (dropdown) {
        const isShowing = dropdown.classList.toggle('show');

        if (isShowing) {
            positionTabConfigureDropdown();

            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', closeConfigureDropdown);
            }, 0);
        }
    }
}

// Close the dropdown and apply pending tab changes
function closeConfigureDropdown(event) {
    const dropdown = document.getElementById('tab-configure-dropdown');
    const configBtn = document.querySelector('.tab-configure-btn');

    // Only close if clicking outside dropdown and button
    if (dropdown && event && !dropdown.contains(event.target) && configBtn && !configBtn.contains(event.target)) {
        applyTabChangesAndClose();
    }
}

// Handle checkbox change for a tab - only updates state, not UI
function handleTabVisibilityChange(tabId, isVisible) {
    tabVisibility[tabId] = isVisible;
    saveTabConfiguration();
    // UI update is deferred until dropdown closes
}

// Apply tab changes and close dropdown
function applyTabChangesAndClose() {
    const dropdown = document.getElementById('tab-configure-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    document.removeEventListener('click', closeConfigureDropdown);

    // Now update the UI with all pending changes
    renderTabButtons();

    // If the currently active tab was hidden, switch to first visible
    const activeTabId = document.querySelector('.tab-btn.active')?.getAttribute('data-tab-id');
    if (!activeTabId || !tabVisibility[activeTabId]) {
        const firstVisibleTab = TAB_DEFINITIONS.find(t => tabVisibility[t.id]);
        if (firstVisibleTab) {
            switchTab(firstVisibleTab.id);
        }
    }
}

// Handle reset tabs button
function handleResetTabs() {
    resetTabsToDefault();
    renderTabButtons();
    renderTabConfigureDropdown();

    // Switch to Overview tab
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const overviewPane = document.getElementById('overview-tab');
    const overviewBtn = document.querySelector('[data-tab-id="overview"]');
    if (overviewPane) overviewPane.classList.add('active');
    if (overviewBtn) overviewBtn.classList.add('active');

    // Re-position because tab bar shifted
    positionTabConfigureDropdown();
    // Keep dropdown open
    const dropdown = document.getElementById('tab-configure-dropdown');
    if (dropdown) dropdown.classList.add('show');
}

// Initialize application
document.addEventListener('DOMContentLoaded', async function () {
    await initializeApp();
});

async function initializeApp() {
    // Load plugins first (before tabs are initialized)
    if (window.WailingNewtPlugin && window.WailingNewtPlugin.loader) {
        await window.WailingNewtPlugin.loader.loadAllPlugins();
        window.WailingNewtPlugin.loader.initializePlugins();
    }

    // Initialize tab configuration (show/hide tabs based on user preferences)
    initTabConfiguration();

    // Setup event listeners
    setupEventListeners();

    // Initialize tables
    initializeTables();

    // Initialize table sub-navigation and columns
    initTableConfigUI();

    // Load user info
    loadUserInfo();

    // Initialize theme
    initializeTheme();

    // Initialize keyboard shortcuts
    initializeShortcuts();

    // Initialize auto-update listener (Electron desktop app only)
    initializeAutoUpdate();

    // DEBUG: Check sessionStorage
    console.log('DEBUG: Checking sessionStorage force_ui_refresh:', sessionStorage.getItem('force_ui_refresh'));

    // Check if we just loaded a crawl from dashboard
    if (sessionStorage.getItem('force_ui_refresh') === 'true') {
        console.log('DEBUG: Found force_ui_refresh flag, loading crawl data...');
        sessionStorage.removeItem('force_ui_refresh');

        try {
            // Fetch the loaded data immediately with FULL refresh (no incremental)
            const response = await fetch('/api/crawl_status');
            const data = await response.json();

            // DEBUG: Log the full response
            console.log('DEBUG: Full /api/crawl_status response:', JSON.stringify(data, null, 2));

            // Clear existing data first
            clearAllTables();
            resetStats();

            // Force populate all data
            crawlState.urls = [];
            crawlState.links = data.links || [];
            crawlState.issues = data.issues || [];
            crawlState.stats = data.stats || {};
            crawlState.baseUrl = data.stats?.baseUrl || '';

            // Set URL input
            if (crawlState.baseUrl) {
                document.getElementById('urlInput').value = crawlState.baseUrl;
            }

            // Add each URL to tables
            if (data.urls && data.urls.length > 0) {
                data.urls.forEach(url => addUrlToTable(url));
            }

            // Load links if present
            if (data.links && data.links.length > 0) {
                crawlState.pendingLinks = data.links;
                // If links tab is active, load them immediately
                if (isLinksTabActive()) {
                    updateLinksTable(data.links);
                }
            }

            // Load issues if present
            if (data.issues && data.issues.length > 0) {
                crawlState.pendingIssues = data.issues;
                // If issues tab is active, load them immediately
                if (isIssuesTabActive()) {
                    updateIssuesTable(data.issues);
                } else {
                    // Update badge count even if tab not active
                    const issuesTabButton = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.includes('Issues'));
                    if (issuesTabButton && data.issues.length > 0) {
                        const errorCount = data.issues.filter(i => i.type === 'error').length;
                        const warningCount = data.issues.filter(i => i.type === 'warning').length;
                        let badgeColor = '#3b82f6';
                        if (errorCount > 0) badgeColor = '#ef4444';
                        else if (warningCount > 0) badgeColor = '#f59e0b';
                        issuesTabButton.innerHTML = `Issues <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 12px; font-size: 12px;">${data.issues.length}</span>`;
                    }
                }
            }

            // Update all displays
            updateStatsDisplay();
            updateFilterCounts();
            updateStatusCodesTable();
            updateCrawlButtons();
            if (window.GA4Config && typeof window.GA4Config.renderAnalyticsTab === 'function') {
                window.GA4Config.renderAnalyticsTab(crawlState.urls, crawlState.stats);
            }

            // Check if the crawl is currently running (resumed from dashboard)
            if (data.status === 'running') {
                // Set crawl state to running
                crawlState.isRunning = true;
                crawlState.isPaused = false;
                crawlState.startTime = new Date(); // Set start time to now for timer

                // Show progress UI
                showProgress();

                // Update buttons for running state
                updateCrawlButtons();

                // Start polling for updates
                updateStatus('Crawl resumed - updating...');
                pollCrawlProgress();
            } else {
                // Crawl is not running, just loaded data
                updateStatus(`Loaded crawl: ${data.stats.crawled} URLs, ${data.links?.length || 0} links, ${data.issues?.length || 0} issues`);
            }

            console.log('Loaded crawl from database:', {
                urls: data.urls?.length || 0,
                links: data.links?.length || 0,
                issues: data.issues?.length || 0,
                stats: data.stats,
                status: data.status,
                isRunning: crawlState.isRunning
            });
        } catch (error) {
            console.error('Error loading crawl data:', error);
            updateStatus('Error loading crawl data');
        }
    }

    // Set initial focus
    document.getElementById('urlInput').focus();

    console.log('Wailing Newt Web Walker initialized');
}

function setupEventListeners() {
    // URL input enter key
    document.getElementById('urlInput').addEventListener('keypress', handleUrlKeypress);

    // Update timer every second when crawling
    setInterval(updateTimer, 1000);
}

function handleUrlKeypress(event) {
    if (event.key === 'Enter' && !crawlState.isRunning) {
        toggleCrawl();
    }
}

function toggleCrawl() {
    if (!crawlState.isRunning) {
        startCrawl();
    } else if (crawlState.isPaused) {
        resumeCrawl();
    } else {
        pauseCrawl();
    }
}

function startCrawl() {
    const urlInput = document.getElementById('urlInput');
    let url = urlInput.value.trim();

    if (!url) {
        alert('Please enter a URL to crawl');
        urlInput.focus();
        return;
    }

    // Normalize the URL - add protocol if missing
    url = normalizeUrl(url);

    if (!isValidUrl(url)) {
        alert('Please enter a valid URL or domain');
        urlInput.focus();
        return;
    }

    // Update the input field with the normalized URL
    urlInput.value = url;

    crawlState.isRunning = true;
    crawlState.isPaused = false;
    crawlState.startTime = new Date();
    crawlState.baseUrl = url;

    // Initialize incremental poller for new crawl
    if (!incrementalPoller) {
        incrementalPoller = new IncrementalPoller();
    }
    incrementalPoller.reset();

    // Update UI
    updateCrawlButtons();
    showProgress();
    updateStatus('Starting crawl...');

    // Clear previous data
    clearAllTables();
    resetStats();

    // Start the actual crawling via Python backend
    startPythonCrawl(url);
}

function pauseCrawl() {
    crawlState.isPaused = true;
    updateCrawlButtons();
    updateStatus('Crawl paused');

    // Pause Python crawler
    fetch('/api/pause_crawl', {
        method: 'POST'
    }).catch(error => {
        console.error('Error pausing crawl:', error);
    });
}

function resumeCrawl() {
    crawlState.isPaused = false;
    updateCrawlButtons();
    updateStatus('Resuming crawl...');

    // Resume Python crawler
    fetch('/api/resume_crawl', {
        method: 'POST'
    }).catch(error => {
        console.error('Error resuming crawl:', error);
    });
}

function stopCrawl() {
    crawlState.isRunning = false;
    crawlState.isPaused = false;

    // Update UI
    updateCrawlButtons();
    hideProgress();
    updateStatus('Crawl stopped');

    // Stop Python crawler
    stopPythonCrawl();
}

function clearCrawlData() {
    if (crawlState.isRunning) {
        if (!confirm('A crawl is currently running. Stop the crawl and clear all data?')) {
            return;
        }
        stopCrawl();
    }

    // Clear all data
    clearAllTables();
    resetStats();
    crawlState.urls = [];
    crawlState.links = [];
    crawlState.issues = [];
    crawlState.baseUrl = null;
    crawlState.filters.active = null;
    crawlState.pendingLinks = null;
    crawlState.pendingIssues = null;
    updateStatusCodesTable();

    // Clear issues and reset badge
    window.currentIssues = [];
    updateIssuesTable([]);  // This will also clear the badge

    // Reset issue filter counts
    document.getElementById('issues-all-count').textContent = '(0)';
    document.getElementById('issues-error-count').textContent = '(0)';
    document.getElementById('issues-warning-count').textContent = '(0)';
    document.getElementById('issues-info-count').textContent = '(0)';

    // Clear visualization
    if (typeof window.clearVisualization === 'function') {
        window.clearVisualization();
    }

    if (window.GA4Config && typeof window.GA4Config.clearAnalyticsTab === 'function') {
        window.GA4Config.clearAnalyticsTab();
    }

    // Notify plugins of data clear (send empty data)
    if (window.WailingNewtPlugin && window.WailingNewtPlugin.loader) {
        window.WailingNewtPlugin.loader.notifyDataUpdate({
            urls: [],
            links: [],
            issues: [],
            stats: { discovered: 0, crawled: 0, depth: 0, speed: 0 }
        });
    }

    // Clear filter states
    document.querySelectorAll('.filter-item').forEach(item => {
        item.classList.remove('active');
    });

    // Reset the "All Issues" filter to active
    document.querySelector('[data-filter="all"]')?.classList.add('active');

    // Update UI
    updateStatus('Data cleared');
    hideProgress();
    updateCrawlButtons(); // Update save/load button states

    // Reset URL input
    document.getElementById('urlInput').value = '';
    document.getElementById('urlInput').focus();
}

function startPythonCrawl(url) {
    // Call Python backend to start crawling
    fetch('/api/start_crawl', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Crawling in progress...');
                if (data.ga4_discovery && data.ga4_discovery.urls_added > 0) {
                    showNotification(`GA4 added ${data.ga4_discovery.urls_added} URLs before crawl start`, 'info');
                }
                // Refresh user info to update crawl count
                loadUserInfo();
                // Start polling for updates
                pollCrawlProgress();
            } else {
                updateStatus('Error: ' + data.error);
                stopCrawl();
            }
        })
        .catch(error => {
            console.error('Error starting crawl:', error);
            updateStatus('Error starting crawl');
            stopCrawl();
        });
}

function stopPythonCrawl() {
    fetch('/api/stop_crawl', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            console.log('Crawl stopped:', data);
        })
        .catch(error => {
            console.error('Error stopping crawl:', error);
        });
}

function pollCrawlProgress() {
    if (!crawlState.isRunning) return;

    // Use incremental poller if available, otherwise fall back to regular fetch
    const fetchPromise = incrementalPoller
        ? incrementalPoller.fetchUpdate()
        : fetch('/api/crawl_status').then(response => response.json());

    fetchPromise
        .then(data => {
            updateCrawlData(data);

            // Update bottom status bar based on current state
            if (data.is_running_pagespeed) {
                updateStatus('Running PageSpeed analysis...');
            } else if (data.status === 'running') {
                updateStatus('Crawling in progress...');
            }

            // Update visualization if visualization tab is active
            const vizTab = document.getElementById('visualization-tab');
            if (vizTab && vizTab.classList.contains('active') && typeof loadVisualizationData === 'function') {
                loadVisualizationData();
            }

            if (crawlState.isRunning && data.status !== 'completed') {
                setTimeout(pollCrawlProgress, 1000); // Poll every second
            } else if (data.status === 'completed') {
                stopCrawl();
                updateStatus('Crawl completed');
                // Update visualization one final time when crawl completes
                if (typeof loadVisualizationData === 'function') {
                    loadVisualizationData();
                }
                // Notify plugins that crawl is complete
                if (window.WailingNewtPlugin && window.WailingNewtPlugin.loader) {
                    window.WailingNewtPlugin.loader.notifyCrawlComplete({
                        urls: crawlState.urls,
                        links: crawlState.links,
                        issues: crawlState.issues,
                        stats: crawlState.stats
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error polling crawl status:', error);
            // Continue polling even if there's an error (common on large crawls)
            if (crawlState.isRunning) {
                setTimeout(pollCrawlProgress, 1000);
            }
        });
}

function updateCrawlData(data) {
    if (data.full_refresh) {
        clearAllTables();
        crawlState.urls = [];
        crawlState.links = [];
        crawlState.issues = [];
        crawlState.pendingLinks = null;
        crawlState.pendingIssues = null;
    }

    // Update statistics
    crawlState.stats = data.stats || crawlState.stats;
    updateStatsDisplay();

    // Update memory statistics
    if (data.memory && data.memory_data) {
        updateMemoryDisplay(data.memory, data.memory_data);
    }

    // Update tables with new URLs
    if (data.urls) {
        data.urls.forEach(url => {
            addUrlToTable(url);
        });
    }

    // Update links tables only if Links tab is active to improve performance
    if (data.links) {
        // Always store links data in crawlState
        crawlState.links = data.links;
        if (isLinksTabActive()) {
            updateLinksTable(data.links);
        } else {
            // Store in pendingLinks for lazy loading when switching to tab
            crawlState.pendingLinks = data.links;
        }
    }

    // Update issues table only if Issues tab is active
    if (data.issues) {
        // Always store issues data in crawlState
        crawlState.issues = data.issues;
        if (isIssuesTabActive()) {
            updateIssuesTable(data.issues);
        } else {
            // Store in pendingIssues for lazy loading when switching to tab
            crawlState.pendingIssues = data.issues;
        }
    }

    // Update filter counts
    updateFilterCounts();

    // Update status codes table (respecting active filter)
    updateStatusCodesTable(crawlState.filters.active);

    // Update Content Analysis and Link Health tables if active
    if (data.urls) {
        if (isContentAnalysisTabActive()) {
            // clear table first if doing a full refresh, but normally we append?
            // for now, let's just append new ones or clear/redraw if simple
            // data.urls contains ALL urls usually in incremental unless strictly diff?
            // incrementalPoller usually returns diff.
            // If full refresh, clearing happens elsewhere.
            data.urls.forEach(url => addUrlToContentAnalysisTable(url));
        }
        if (isLinkHealthTabActive()) {
            data.urls.forEach(url => addUrlToLinkHealthTable(url));
        }
    }

    // Update progress and status text
    updateProgress(data.progress || 0);
    updateProgressText(data);

    // Update Content Analysis and Link Health tables (handled via VirtualScrollers in addUrlToTable)

    // Update PageSpeed results if available
    if (data.stats && data.stats.pagespeed_results) {
        displayPageSpeedResults(data.stats.pagespeed_results);
    }

    // Notify plugins of data update
    if (window.WailingNewtPlugin && window.WailingNewtPlugin.loader) {
        window.WailingNewtPlugin.loader.notifyDataUpdate({
            urls: crawlState.urls,
            links: crawlState.links,
            issues: crawlState.issues,
            stats: crawlState.stats
        });
    }

    if (window.GA4Config && typeof window.GA4Config.renderAnalyticsTab === 'function') {
        window.GA4Config.renderAnalyticsTab(crawlState.urls, crawlState.stats);
    }
}

function updateProgressText(data) {
    const statusText = document.getElementById('statusText');
    if (!statusText) return;

    if (data.is_running_pagespeed) {
        statusText.textContent = 'Running PageSpeed analysis...';
    } else if (data.status === 'completed') {
        statusText.textContent = 'Crawl completed';
    } else if (data.status === 'running') {
        const stats = data.stats || crawlState.stats;
        if (stats.crawled === 0) {
            statusText.textContent = 'Starting crawl...';
        } else if (stats.discovered > stats.crawled) {
            statusText.textContent = `Crawling in progress... (${stats.crawled}/${stats.discovered} URLs)`;
        } else {
            statusText.textContent = `Finishing up... (${stats.crawled} URLs crawled)`;
        }
    }
    // Don't update statusText when not running - let updateStatus handle that
}

function updateStatsDisplay() {
    document.getElementById('discoveredCount').textContent = crawlState.stats.discovered;
    document.getElementById('crawledCount').textContent = crawlState.stats.crawled;
    document.getElementById('crawlDepth').textContent = crawlState.stats.depth;
    document.getElementById('crawlSpeed').textContent = crawlState.stats.speed + ' URLs/sec';
}

function updateMemoryDisplay(memoryData, memoryDataSizes) {
    if (!memoryData || !memoryDataSizes) return;

    // Actual data size (deep measurement)
    const dataMB = memoryDataSizes.total_deep_mb || 0;
    document.getElementById('memCurrent').textContent = dataMB.toFixed(1) + ' MB';

    // KB per URL (actual data)
    const kbPerUrl = memoryDataSizes.avg_per_url_kb || 0;
    document.getElementById('memPeak').textContent = kbPerUrl.toFixed(1) + ' KB/URL';

    // Estimate for 1M URLs (data only)
    const estimate1M = (kbPerUrl * 1000000) / 1024; // Convert to MB
    const estimate1MDisplay = estimate1M > 1024
        ? (estimate1M / 1024).toFixed(1) + ' GB'
        : estimate1M.toFixed(0) + ' MB';
    document.getElementById('memEstimate1M').textContent = estimate1MDisplay;

    // System available
    const availableMB = memoryData.system?.available_mb || 0;
    document.getElementById('memAvailable').textContent = availableMB.toFixed(0) + ' MB';
}

function updateCrawlButtons() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const saveCrawlBtn = document.getElementById('saveCrawlBtn');
    const loadCrawlBtn = document.getElementById('loadCrawlBtn');

    if (crawlState.isRunning) {
        if (crawlState.isPaused) {
            startBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                Resume
            `;
        } else {
            startBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
                Pause
            `;
        }
        startBtn.disabled = false;
        stopBtn.disabled = false;
        clearBtn.disabled = false;
        saveCrawlBtn.disabled = true; // Disable during crawl
        loadCrawlBtn.disabled = true; // Disable during crawl
    } else {
        startBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            Start
        `;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        clearBtn.disabled = false;

        // Save button: only enabled if crawl is completed and has data
        const hasData = crawlState.stats.crawled > 0;
        saveCrawlBtn.disabled = !hasData;

        // Load button: only enabled if no current crawl data
        loadCrawlBtn.disabled = hasData;
    }
}

function showProgress() {
    document.getElementById('progressContainer').style.display = 'flex';
}

function hideProgress() {
    document.getElementById('progressContainer').style.display = 'none';
}

function updateProgress(percentage) {
    document.getElementById('progressFill').style.width = percentage + '%';
}

function updateStatus(message) {
    document.getElementById('statusText').textContent = message;
}

function updateTimer() {
    if (crawlState.isRunning && crawlState.startTime) {
        const elapsed = new Date() - crawlState.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('crawlTime').textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Table Management
function initializeTables() {
    // Clear any existing data first
    clearAllTables();
    // Initialize virtual scrollers for all tables
    initializeVirtualScrollers();
    // Initialize column resizers after virtual scrollers
    setTimeout(() => {
        if (window.initializeColumnResizers) {
            initializeColumnResizers();
        }
    }, 100);
}

/**
 * Initialize Table Configuration UI (Sub-tabs and Configure dropdown)
 */
function initTableConfigUI() {
    const subNav = document.getElementById('internalSubNav');
    const dropdown = document.getElementById('configureTabsDropdown');
    const resetButton = document.getElementById('resetTabsBtn');

    if (!subNav || !dropdown) return;

    // 1. Populate Sub-navigation Tabs
    renderTableTabs();

    // 2. Populate Configure Tabs Dropdown
    renderConfigureDropdown();

    // 3. Configure Button Click
    const configBtn = document.getElementById('configureTabsBtn');
    if (configBtn) {
        configBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.classList.remove('show');
    });

    // 4. Reset Button
    if (resetButton) {
        resetButton.addEventListener('click', (e) => {
            e.stopPropagation();
            TableConfig.resetToDefaults();
            renderTableTabs();
            renderConfigureDropdown();
            updateInternalTableHeaders();
            if (virtualScrollers.internal) virtualScrollers.internal.refresh();
        });
    }

    // 4. Initial Header Setup
    updateInternalTableHeaders();
}

/**
 * Render the sub-navigation tabs for the Internal view
 */
function renderTableTabs() {
    const subNav = document.getElementById('internalSubNav');
    if (!subNav) return;

    // Clear existing tabs (except potentially the configure dropdown which is inside but we handled it in HTML)
    // Actually in index.html, the configure-tabs-container is AFTER the tabs usually?
    // Let's check index.html structure first to be sure.

    // For now, let's just find the tabs container or clear specific ones.
    const container = subNav.querySelector('.sub-nav-tabs');
    if (!container) return;

    container.innerHTML = '';

    TableConfig.groups.forEach(group => {
        if (!TableConfig.visibility.groups[group.id]) return;

        const tab = document.createElement('button');
        tab.className = `sub-nav-btn ${TableConfig.visibility.activeGroup === group.id ? 'active' : ''}`;
        tab.textContent = group.label;
        tab.dataset.groupId = group.id;

        tab.addEventListener('click', () => {
            // Update active state in UI
            container.querySelectorAll('.sub-nav-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update TableConfig
            TableConfig.updateActiveColumns(group.id);

            // Update Table Headers and refresh scroller
            updateInternalTableHeaders();
            if (virtualScrollers.internal) {
                virtualScrollers.internal.refresh();
            }
        });

        container.appendChild(tab);
    });
}

/**
 * Render the items in the Configure Tabs dropdown
 */
function renderConfigureDropdown() {
    const dropdown = document.getElementById('configureTabsDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    TableConfig.groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'configure-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!TableConfig.visibility.groups[group.id];
        checkbox.id = `view-group-${group.id}`;

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = group.label;

        item.appendChild(checkbox);
        item.appendChild(label);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            TableConfig.toggleGroup(group.id);
            renderTableTabs();
        });

        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            // Don't toggle twice if clicking checkbox directly
        });

        dropdown.appendChild(item);
    });
}

/**
 * Update the Internal table headers based on active columns
 */
function updateInternalTableHeaders() {
    const thead = document.querySelector('#internal-tab table thead tr');
    if (!thead) return;

    const columns = TableConfig.getActiveColumns();
    thead.innerHTML = columns.map(col => `<th data-column="${col.id}">${col.label}</th>`).join('');

    // Re-initialize resizers if needed
    if (window.initializeColumnResizers) {
        initializeColumnResizers();
    }
}

/**
 * Helper to get value from urlData based on column ID
 */
function getColumnValue(urlData, columnId) {
    switch (columnId) {
        case 'url': return urlData.url;
        case 'status_code': return urlData.status_code;
        case 'content_type': return urlData.content_type || 'N/A';
        case 'size': return formatBytes(urlData.size || 0);
        case 'title': return urlData.title || '';
        case 'status_text': return getStatusCodeDescription(urlData.status_code);
        case 'redirect_url': return urlData.redirect_url || '-';
        case 'redirect_type': return urlData.redirect_type || '-';
        case 'depth': return urlData.depth || 0;
        case 'word_count': return urlData.word_count || 0;
        case 'h1': return urlData.h1 || '';
        case 'h1_count': return urlData.h1 ? 1 : 0; // Simplified
        case 'h2': return Array.isArray(urlData.h2) ? urlData.h2[0] || '' : (urlData.h2 || '');
        case 'h2_count': return Array.isArray(urlData.h2) ? urlData.h2.length : 0;
        case 'meta_description': return urlData.meta_description || '';
        case 'title_length': return urlData.title ? urlData.title.length : 0;
        case 'meta_description_length': return urlData.meta_description ? urlData.meta_description.length : 0;
        case 'canonical_url': return urlData.canonical_url || '';
        case 'meta_robots': return urlData.robots || '';
        case 'internal_links_count': return urlData.internal_links || 0;
        case 'external_links_count': return urlData.external_links || 0;
        case 'total_links_count': return (urlData.internal_links || 0) + (urlData.external_links || 0);
        case 'images_count': return Array.isArray(urlData.images) ? urlData.images.length : 0;
        case 'performance_score': return urlData.pagespeed?.performance || '-';
        case 'lcp': return urlData.pagespeed?.metrics?.largest_contentful_paint || '-';
        case 'fid': return urlData.pagespeed?.metrics?.first_input_delay || '-';
        case 'cls': return urlData.pagespeed?.metrics?.cumulative_layout_shift || '-';
        case 'ga_id': return urlData.analytics?.ga_id || urlData.analytics?.ga4_id || '-';
        case 'gtm_id': return urlData.analytics?.gtm_id || '-';
        case 'fb_pixel': return urlData.analytics?.facebook_pixel || '-';
        case 'ga4_sessions': return urlData.analytics?.ga4_sessions ?? urlData.analytics?.ga4?.metrics?.sessions ?? '-';
        case 'ga4_screen_page_views': return urlData.analytics?.ga4_screen_page_views ?? urlData.analytics?.ga4?.metrics?.screenPageViews ?? '-';
        case 'ga4_engaged_sessions': return urlData.analytics?.ga4_engaged_sessions ?? urlData.analytics?.ga4?.metrics?.engagedSessions ?? '-';
        case 'ga4_engagement_rate': return urlData.analytics?.ga4_engagement_rate ?? urlData.analytics?.ga4?.metrics?.engagementRate ?? '-';
        case 'ga4_key_events': return urlData.analytics?.ga4_key_events ?? urlData.analytics?.ga4?.metrics?.keyEvents ?? '-';
        case 'ga4_event_count': return urlData.analytics?.ga4_event_count ?? urlData.analytics?.ga4?.metrics?.eventCount ?? '-';
        case 'ga4_total_revenue': return urlData.analytics?.ga4_total_revenue ?? urlData.analytics?.ga4?.metrics?.totalRevenue ?? '-';
        case 'json_ld_count': return Array.isArray(urlData.json_ld) ? urlData.json_ld.length : 0;
        case 'in_sitemap': return urlData.in_sitemap ? 'Yes' : 'No';
        default:
            // Generic fallback for flat objects or deeper nesting
            if (urlData[columnId] !== undefined) return urlData[columnId];
            return '-';
    }
}

function initializeVirtualScrollers() {
    try {
        // Overview table
        const overviewContainer = document.querySelector('#overview-tab .table-container');
        if (overviewContainer && overviewContainer.querySelector('tbody')) {
            virtualScrollers.overview = new VirtualScroller(overviewContainer, {
                rowHeight: 100,
                buffer: 25,
                renderRow: renderOverviewRow
            });
            console.log('Overview virtual scroller initialized');
        }

        // Internal URLs table
        const internalContainer = document.querySelector('#internal-tab .table-container');
        if (internalContainer && internalContainer.querySelector('tbody')) {
            virtualScrollers.internal = new VirtualScroller(internalContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderInternalRow
            });
            console.log('Internal virtual scroller initialized');
        }

        // External URLs table
        const externalContainer = document.querySelector('#external-tab .table-container');
        if (externalContainer && externalContainer.querySelector('tbody')) {
            virtualScrollers.external = new VirtualScroller(externalContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderExternalRow
            });
            console.log('External virtual scroller initialized');
        }

        // Internal Links table
        const internalLinksContainer = document.querySelector('#links-tab .internal-links-container');
        if (internalLinksContainer && internalLinksContainer.querySelector('tbody')) {
            virtualScrollers.internalLinks = new VirtualScroller(internalLinksContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderInternalLinkRow
            });
            console.log('Internal links virtual scroller initialized');
        }

        // External Links table
        const externalLinksContainer = document.querySelector('#links-tab .external-links-container');
        if (externalLinksContainer && externalLinksContainer.querySelector('tbody')) {
            virtualScrollers.externalLinks = new VirtualScroller(externalLinksContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderExternalLinkRow
            });
            console.log('External links virtual scroller initialized');
        }

        // Issues table
        const issuesContainer = document.querySelector('#issues-tab .table-container');
        if (issuesContainer && issuesContainer.querySelector('tbody')) {
            virtualScrollers.issues = new VirtualScroller(issuesContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderIssueRow
            });
            console.log('Issues virtual scroller initialized');
        }

        // Content Analysis table
        const contentAnalysisContainer = document.querySelector('#content-analysis-tab .table-container');
        if (contentAnalysisContainer && contentAnalysisContainer.querySelector('tbody')) {
            virtualScrollers.contentAnalysis = new VirtualScroller(contentAnalysisContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderContentAnalysisRow
            });
            console.log('Content Analysis virtual scroller initialized');
        }

        // Link Health table
        const linkHealthContainer = document.querySelector('#link-health-tab .table-container');
        if (linkHealthContainer && linkHealthContainer.querySelector('tbody')) {
            virtualScrollers.linkHealth = new VirtualScroller(linkHealthContainer, {
                rowHeight: 80,
                buffer: 25,
                renderRow: renderLinkHealthRow
            });
            console.log('Link Health virtual scroller initialized');
        }
    } catch (error) {
        console.error('Error initializing virtual scrollers:', error);
    }
}

function isLinksTabActive() {
    const linksTab = document.getElementById('links-tab');
    return linksTab && linksTab.classList.contains('active');
}

function isIssuesTabActive() {
    const issuesTab = document.getElementById('issues-tab');
    return issuesTab && issuesTab.classList.contains('active');
}

function updateLinksTable(links) {
    // Create a lookup map of URL statuses from crawled URLs
    const urlStatusMap = new Map();
    if (crawlState.urls && crawlState.urls.length > 0) {
        crawlState.urls.forEach(url => {
            urlStatusMap.set(url.url, url.status_code);
        });
    }

    // Remove duplicates from links array (extra safety check)
    const uniqueLinks = [];
    const seenLinks = new Set();
    links.forEach(link => {
        const key = `${link.source_url}|${link.target_url}`;
        if (!seenLinks.has(key)) {
            seenLinks.add(key);

            // Update target status with actual crawled status if available
            const crawledStatus = urlStatusMap.get(link.target_url);
            if (crawledStatus) {
                link.target_status = crawledStatus;
            }

            uniqueLinks.push(link);
        }
    });

    // Store unfiltered links in crawlState
    crawlState.links = uniqueLinks;

    // Apply filters and update virtual scrollers
    applyLinksFilter();

    console.log(`Links loaded: ${crawlState.links.filter(l => l.is_internal).length} internal, ${crawlState.links.filter(l => !l.is_internal).length} external`);
}

function applyLinksFilter() {
    if (!crawlState.links || crawlState.links.length === 0) return;

    // Separate internal and external links
    let internalLinks = crawlState.links.filter(link => link.is_internal);
    let externalLinks = crawlState.links.filter(link => !link.is_internal);

    // Apply status code filter for internal links
    const internalStatusFilter = crawlState.filters.linksFilter.internalStatusCode;
    if (internalStatusFilter && internalStatusFilter !== 'all') {
        internalLinks = internalLinks.filter(link => {
            if (!link.target_status) return false;
            const status = parseInt(link.target_status);
            switch (internalStatusFilter) {
                case '2xx': return status >= 200 && status < 300;
                case '3xx': return status >= 300 && status < 400;
                case '4xx': return status >= 400 && status < 500;
                case '5xx': return status >= 500;
                default: return true;
            }
        });
    }

    // Apply search filter for internal links
    const internalSearch = crawlState.filters.linksFilter.internalSearch.toLowerCase();
    if (internalSearch) {
        internalLinks = internalLinks.filter(link =>
            link.source_url.toLowerCase().includes(internalSearch) ||
            link.target_url.toLowerCase().includes(internalSearch) ||
            (link.anchor_text && link.anchor_text.toLowerCase().includes(internalSearch))
        );
    }

    // Apply status code filter for external links
    const externalStatusFilter = crawlState.filters.linksFilter.externalStatusCode;
    if (externalStatusFilter && externalStatusFilter !== 'all') {
        externalLinks = externalLinks.filter(link => {
            if (!link.target_status) return false;
            const status = parseInt(link.target_status);
            switch (externalStatusFilter) {
                case '2xx': return status >= 200 && status < 300;
                case '3xx': return status >= 300 && status < 400;
                case '4xx': return status >= 400 && status < 500;
                case '5xx': return status >= 500;
                default: return true;
            }
        });
    }

    // Apply search filter for external links
    const externalSearch = crawlState.filters.linksFilter.externalSearch.toLowerCase();
    if (externalSearch) {
        externalLinks = externalLinks.filter(link =>
            link.source_url.toLowerCase().includes(externalSearch) ||
            link.target_url.toLowerCase().includes(externalSearch) ||
            (link.target_domain && link.target_domain.toLowerCase().includes(externalSearch))
        );
    }

    // Update virtual scrollers with filtered data
    if (virtualScrollers.internalLinks) {
        virtualScrollers.internalLinks.setData(internalLinks);
    }

    if (virtualScrollers.externalLinks) {
        virtualScrollers.externalLinks.setData(externalLinks);
    }
}

function filterInternalLinks(filterType) {
    crawlState.filters.linksFilter.internalStatusCode = filterType;
    applyLinksFilter();
}

function filterExternalLinks(filterType) {
    crawlState.filters.linksFilter.externalStatusCode = filterType;
    applyLinksFilter();
}

function searchInternalLinks(searchText) {
    crawlState.filters.linksFilter.internalSearch = searchText;
    applyLinksFilter();
}

function searchExternalLinks(searchText) {
    crawlState.filters.linksFilter.externalSearch = searchText;
    applyLinksFilter();
}

function updateIssuesTable(issues) {
    if (!issues || !Array.isArray(issues)) {
        issues = [];
    }

    // Store issues globally for filtering
    window.currentIssues = issues;

    const emptyState = document.getElementById('issuesEmptyState');
    const issuesTable = document.getElementById('issuesTable');

    // Count by type
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    issues.forEach(issue => {
        if (issue.type === 'error') errorCount++;
        else if (issue.type === 'warning') warningCount++;
        else if (issue.type === 'info') infoCount++;
    });

    // Update filter counts
    document.getElementById('issues-all-count').textContent = `(${issues.length})`;
    document.getElementById('issues-error-count').textContent = `(${errorCount})`;
    document.getElementById('issues-warning-count').textContent = `(${warningCount})`;
    document.getElementById('issues-info-count').textContent = `(${infoCount})`;

    // Show/hide empty state
    if (issues.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (issuesTable) issuesTable.style.display = 'none';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (issuesTable) issuesTable.style.display = 'table';

        // Use virtual scroller for issues
        if (virtualScrollers.issues) {
            virtualScrollers.issues.setData(issues);
        }
    }

    // Update issue count in tab button (find the button, not the tab content)
    const issuesTabButton = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.includes('Issues'));
    if (issuesTabButton) {
        const totalIssues = issues.length;
        if (totalIssues > 0) {
            let badgeColor = '#3b82f6';
            if (errorCount > 0) badgeColor = '#ef4444';
            else if (warningCount > 0) badgeColor = '#f59e0b';

            issuesTabButton.innerHTML = `Issues <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 12px; font-size: 12px;">${totalIssues}</span>`;
        } else {
            issuesTabButton.innerHTML = 'Issues';
        }
    }
}

function clearAllTables() {
    // Clear virtual scrollers if they exist
    if (virtualScrollers.overview) {
        virtualScrollers.overview.clear();
    }
    if (virtualScrollers.internal) {
        virtualScrollers.internal.clear();
    }
    if (virtualScrollers.external) {
        virtualScrollers.external.clear();
    }
    if (virtualScrollers.internalLinks) {
        virtualScrollers.internalLinks.clear();
    }
    if (virtualScrollers.externalLinks) {
        virtualScrollers.externalLinks.clear();
    }
    if (virtualScrollers.issues) {
        virtualScrollers.issues.clear();
    }

    // Clear status codes table (not virtualized)
    const statusCodesBody = document.getElementById('statusCodesTableBody');
    if (statusCodesBody) statusCodesBody.innerHTML = '';

    crawlState.urls = [];

    console.log('All tables cleared');
}

function formatAnalyticsInfo(analytics) {
    const detected = [];
    if (analytics.gtag || analytics.ga4_id) detected.push('GA4');
    if (analytics.google_analytics) detected.push('GA');
    if (analytics.gtm_id) detected.push('GTM');
    if (analytics.facebook_pixel) detected.push('FB');
    if (analytics.hotjar) detected.push('HJ');
    if (analytics.mixpanel) detected.push('MP');

    return detected.length > 0 ? detected.join(', ') : '';
}

function addUrlToTable(urlData) {
    // Check if URL already exists to prevent duplicates
    const existingUrl = crawlState.urls.find(u => u.url === urlData.url);
    if (existingUrl) {
        return; // Skip duplicate
    }

    crawlState.urls.push(urlData);

    // Update virtual scrollers with new data
    if (virtualScrollers.overview) {
        virtualScrollers.overview.appendData([urlData]);
    }

    if (urlData.is_internal && virtualScrollers.internal) {
        virtualScrollers.internal.appendData([urlData]);
    } else if (!urlData.is_internal && virtualScrollers.external) {
        virtualScrollers.external.appendData([urlData]);
    }

    if (virtualScrollers.contentAnalysis) {
        virtualScrollers.contentAnalysis.appendData([urlData]);
    }

    if (virtualScrollers.linkHealth) {
        virtualScrollers.linkHealth.appendData([urlData]);
    }

    // Reapply current filter if one is active
    if (crawlState.filters.active) {
        applyFilter(crawlState.filters.active);
    }
}

function addRowToTable(tableBodyId, rowData) {
    const tbody = document.getElementById(tableBodyId);
    const row = tbody.insertRow();

    rowData.forEach(cellData => {
        const cell = row.insertCell();
        // Check if cellData contains HTML (specifically our button)
        if (typeof cellData === 'string' && cellData.includes('<button')) {
            cell.innerHTML = cellData;
        } else {
            cell.textContent = cellData;
        }
    });
}

// Tab Management
function switchTab(tabName) {
    // Remove active class from all tabs and panes
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    // Add active class to selected tab button and pane
    const tabBtn = document.querySelector(`[data-tab-id="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');

    const tabPane = document.getElementById(tabName + '-tab');
    if (tabPane) tabPane.classList.add('active');

    // Load pending links data if switching to Links tab
    if (tabName === 'links' && crawlState.pendingLinks) {
        updateLinksTable(crawlState.pendingLinks);
        crawlState.pendingLinks = null; // Clear pending data
    }

    // Load pending issues data if switching to Issues tab
    if (tabName === 'issues' && crawlState.pendingIssues) {
        updateIssuesTable(crawlState.pendingIssues);
        crawlState.pendingIssues = null; // Clear pending data
    }

    if (tabName === 'analytics' && window.GA4Config && typeof window.GA4Config.renderAnalyticsTab === 'function') {
        window.GA4Config.renderAnalyticsTab(crawlState.urls, crawlState.stats);
    }

    // Initialize visualization if switching to Visualization tab
    if (tabName === 'visualization' && typeof initVisualization === 'function') {
        // Small delay to ensure the tab is visible before initializing
        setTimeout(() => {
            initVisualization();
        }, 100);
    }

    // Initialize SEO Reports if switching to Reports tab
    if (tabName === 'reports' && typeof ReportsModule !== 'undefined') {
        ReportsModule.init();
        ReportsModule.refresh();
    }

    // Handle plugin tabs
    const pluginTab = document.getElementById(`${tabName}-tab`);
    if (pluginTab && pluginTab.classList.contains('plugin-tab')) {
        handlePluginTabSwitch(tabName);
    }
}

// Handle plugin tab activation
function handlePluginTabSwitch(tabName) {
    if (!window.WailingNewtPlugin || !window.WailingNewtPlugin.loader) {
        return;
    }

    const loader = window.WailingNewtPlugin.loader;

    // Deactivate previously active plugin
    if (loader.activePluginId && loader.activePluginId !== tabName) {
        loader.deactivatePlugin(loader.activePluginId);
    }

    // Activate the new plugin
    loader.activatePlugin(tabName, {
        urls: crawlState.urls,
        links: crawlState.links,
        issues: crawlState.issues,
        stats: crawlState.stats
    });
}

// Issue Filtering
function filterIssues(filterType) {
    // Store the active filter
    crawlState.filters.issueFilter = filterType;

    // Update active button state and colors
    document.querySelectorAll('#issues-tab .filter-item').forEach(btn => {
        btn.classList.remove('active');
        const filter = btn.getAttribute('data-filter');

        if (filter === filterType) {
            btn.classList.add('active');
            // Set active state colors
            if (filter === 'all') {
                btn.style.background = '#374151';
                btn.style.borderColor = '#4b5563';
                btn.style.color = 'white';
            } else if (filter === 'error') {
                btn.style.background = 'rgba(239, 68, 68, 0.2)';
                btn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            } else if (filter === 'warning') {
                btn.style.background = 'rgba(245, 158, 11, 0.2)';
                btn.style.borderColor = 'rgba(245, 158, 11, 0.5)';
            } else if (filter === 'info') {
                btn.style.background = 'rgba(59, 130, 246, 0.2)';
                btn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
            }
        } else {
            // Reset inactive state colors
            if (filter === 'all') {
                btn.style.background = 'transparent';
                btn.style.borderColor = '#4b5563';
                btn.style.color = '#9ca3af';
            } else if (filter === 'error') {
                btn.style.background = 'rgba(239, 68, 68, 0.1)';
                btn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            } else if (filter === 'warning') {
                btn.style.background = 'rgba(245, 158, 11, 0.1)';
                btn.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            } else if (filter === 'info') {
                btn.style.background = 'rgba(59, 130, 246, 0.1)';
                btn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            }
        }
    });

    // Filter issues data and update virtual scroller
    if (window.currentIssues && virtualScrollers.issues) {
        let filteredIssues = window.currentIssues;

        if (filterType !== 'all') {
            filteredIssues = window.currentIssues.filter(issue => issue.type === filterType);
        }

        virtualScrollers.issues.setData(filteredIssues);
    }
}

// Filter Management
function toggleFilter(filterType) {
    const filterItems = document.querySelectorAll('.filter-item');
    filterItems.forEach(item => item.classList.remove('active'));

    event.currentTarget.classList.add('active');
    crawlState.filters.active = filterType;

    // Apply filter to tables
    applyFilter(filterType);
}

function applyFilter(filterType) {
    // Set current filter as active
    crawlState.filters.active = filterType;

    // Filter the data arrays and update virtual scrollers
    filterVirtualScrollerData('overview', filterType);
    filterVirtualScrollerData('internal', filterType);
    filterVirtualScrollerData('external', filterType);

    // Update Status Codes table with filtered data
    updateStatusCodesTable(filterType);

    console.log('Applied filter:', filterType);
}

function clearActiveFilters() {
    crawlState.filters.active = null;

    // Reset all virtual scrollers to show full data
    if (virtualScrollers.overview) {
        virtualScrollers.overview.setData(crawlState.urls);
    }
    if (virtualScrollers.internal) {
        const internalUrls = crawlState.urls.filter(url => url.is_internal);
        virtualScrollers.internal.setData(internalUrls);
    }
    if (virtualScrollers.external) {
        const externalUrls = crawlState.urls.filter(url => !url.is_internal);
        virtualScrollers.external.setData(externalUrls);
    }
    if (virtualScrollers.contentAnalysis) {
        virtualScrollers.contentAnalysis.setData(crawlState.urls);
    }
    if (virtualScrollers.linkHealth) {
        virtualScrollers.linkHealth.setData(crawlState.urls);
    }

    // Reset Status Codes table to show all data
    updateStatusCodesTable();
}

function filterVirtualScrollerData(scrollerName, filterType) {
    const scroller = virtualScrollers[scrollerName];
    if (!scroller) return;

    let filteredData = crawlState.urls;

    // Apply base filter for internal/external tables
    if (scrollerName === 'internal') {
        filteredData = filteredData.filter(url => url.is_internal);
    } else if (scrollerName === 'external') {
        filteredData = filteredData.filter(url => !url.is_internal);
    }

    // Apply user-selected filter
    if (filterType) {
        filteredData = filteredData.filter(url => {
            switch (filterType) {
                case 'internal':
                    return isInternalURL(url.url);
                case 'external':
                    return !isInternalURL(url.url);
                case '2xx':
                    return url.status_code >= 200 && url.status_code < 300;
                case '3xx':
                    return url.status_code >= 300 && url.status_code < 400;
                case '4xx':
                    return url.status_code >= 400 && url.status_code < 500;
                case '5xx':
                    return url.status_code >= 500;
                case 'html':
                    return (url.content_type || '').toLowerCase().includes('html');
                case 'css':
                    return (url.content_type || '').toLowerCase().includes('css');
                case 'js':
                    return (url.content_type || '').toLowerCase().includes('javascript');
                case 'images':
                    return (url.content_type || '').toLowerCase().includes('image');
                default:
                    return true;
            }
        });
    }

    scroller.setData(filteredData);
}

// Legacy function - kept for compatibility but no longer used
function filterTable(tableBodyId, filterType) {
    // This function is deprecated in favor of filterVirtualScrollerData
    // Kept for backwards compatibility only
}

function isInternalURL(url) {
    if (!url || !crawlState.baseUrl) return false;
    try {
        const urlObj = new URL(url);
        const baseObj = new URL(crawlState.baseUrl);

        // Normalize domains by removing www prefix for comparison
        const urlDomain = urlObj.hostname.replace('www.', '');
        const baseDomain = baseObj.hostname.replace('www.', '');

        return urlDomain === baseDomain;
    } catch (e) {
        return false;
    }
}

function isStatusCodeRange(statusText, min, max) {
    const status = parseInt(statusText);
    return status >= min && status <= max;
}

function isContentType(contentType, type) {
    if (!contentType) return false;
    return contentType.toLowerCase().includes(type.toLowerCase());
}

function updateFilterCounts() {
    // Count URLs by type and update filter counts
    const counts = {
        internal: 0,
        external: 0,
        '2xx': 0,
        '3xx': 0,
        '4xx': 0,
        '5xx': 0,
        html: 0,
        css: 0,
        js: 0,
        images: 0
    };

    crawlState.urls.forEach(url => {
        // Count by internal/external using corrected logic
        if (isInternalURL(url.url)) counts.internal++;
        else counts.external++;

        // Count by status code
        const statusCode = parseInt(url.status_code);
        if (statusCode >= 200 && statusCode < 300) counts['2xx']++;
        else if (statusCode >= 300 && statusCode < 400) counts['3xx']++;
        else if (statusCode >= 400 && statusCode < 500) counts['4xx']++;
        else if (statusCode >= 500) counts['5xx']++;

        // Count by content type
        const contentType = url.content_type || '';
        if (contentType.includes('html')) counts.html++;
        else if (contentType.includes('css')) counts.css++;
        else if (contentType.includes('javascript')) counts.js++;
        else if (contentType.includes('image')) counts.images++;
    });

    // Update DOM
    Object.keys(counts).forEach(key => {
        const element = document.getElementById(key + '-count');
        if (element) {
            element.textContent = counts[key];
        }
    });
}

function updateStatusCodesTable(filterType = null) {
    const tbody = document.getElementById('statusCodesTableBody');
    if (!tbody) return;

    // Count status codes, respecting current filter
    const statusCounts = {};
    let filteredUrls = crawlState.urls;

    // Apply filter if specified
    if (filterType === 'internal') {
        filteredUrls = crawlState.urls.filter(url => isInternalURL(url.url));
    } else if (filterType === 'external') {
        filteredUrls = crawlState.urls.filter(url => !isInternalURL(url.url));
    } else if (filterType === '2xx') {
        filteredUrls = crawlState.urls.filter(url => {
            const status = parseInt(url.status_code);
            return status >= 200 && status < 300;
        });
    } else if (filterType === '3xx') {
        filteredUrls = crawlState.urls.filter(url => {
            const status = parseInt(url.status_code);
            return status >= 300 && status < 400;
        });
    } else if (filterType === '4xx') {
        filteredUrls = crawlState.urls.filter(url => {
            const status = parseInt(url.status_code);
            return status >= 400 && status < 500;
        });
    } else if (filterType === '5xx') {
        filteredUrls = crawlState.urls.filter(url => {
            const status = parseInt(url.status_code);
            return status >= 500;
        });
    } else if (filterType === 'html') {
        filteredUrls = crawlState.urls.filter(url => (url.content_type || '').includes('html'));
    } else if (filterType === 'css') {
        filteredUrls = crawlState.urls.filter(url => (url.content_type || '').includes('css'));
    } else if (filterType === 'js') {
        filteredUrls = crawlState.urls.filter(url => (url.content_type || '').includes('javascript'));
    } else if (filterType === 'images') {
        filteredUrls = crawlState.urls.filter(url => (url.content_type || '').includes('image'));
    }

    let totalUrls = filteredUrls.length;

    filteredUrls.forEach(url => {
        const statusCode = url.status_code;
        if (statusCounts[statusCode]) {
            statusCounts[statusCode]++;
        } else {
            statusCounts[statusCode] = 1;
        }
    });

    // Clear existing rows
    tbody.innerHTML = '';

    // Add rows for each status code
    Object.keys(statusCounts).sort((a, b) => parseInt(a) - parseInt(b)).forEach(statusCode => {
        const count = statusCounts[statusCode];
        const percentage = totalUrls > 0 ? ((count / totalUrls) * 100).toFixed(1) : 0;
        const statusText = getStatusCodeText(parseInt(statusCode));

        addRowToTable('statusCodesTableBody', [
            statusCode,
            statusText,
            count,
            percentage + '%'
        ]);
    });
}

function getStatusCodeText(statusCode) {
    if (statusCode >= 200 && statusCode < 300) {
        return 'Success';
    } else if (statusCode >= 300 && statusCode < 400) {
        return 'Redirect';
    } else if (statusCode >= 400 && statusCode < 500) {
        return 'Client Error';
    } else if (statusCode >= 500) {
        return 'Server Error';
    } else if (statusCode === 0) {
        return 'Failed/Timeout';
    } else {
        return 'Unknown';
    }
}

function resetStats() {
    crawlState.stats = {
        discovered: 0,
        crawled: 0,
        depth: 0,
        speed: 0
    };
    updateStatsDisplay();
}

// Utility Functions
function normalizeUrl(input) {
    // Remove any whitespace
    input = input.trim();

    // If it already has a protocol, return as-is
    if (input.match(/^https?:\/\//i)) {
        return input;
    }

    // If it looks like a domain or IP, add https://
    if (input.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/) ||
        input.match(/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/) ||
        input.match(/^localhost(:[0-9]+)?$/i) ||
        input.match(/^[a-zA-Z0-9-]+\.(com|org|net|edu|gov|mil|int|co|io|dev|app|tech|info|biz|name|pro|museum|aero|coop|travel|jobs|mobi|tel|asia|cat|post|xxx|local|test)$/i)) {
        return 'https://' + input;
    }

    // If it doesn't match common patterns, try adding https:// anyway
    return 'https://' + input;
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        // Check if it has a valid protocol and hostname
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
    } catch (_) {
        return false;
    }
}

// This is defined in settings.js - no need to redefine here

async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            // Redirect to login page
            window.location.href = '/login';
        } else {
            console.error('Logout failed:', data.message);
            // Still redirect even if logout fails
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Redirect anyway
        window.location.href = '/login';
    }
}

async function loadUserInfo() {
    try {
        const response = await fetch('/api/user/info');
        const data = await response.json();

        if (data.success && data.user) {
            const user = data.user;
            const userInfoElement = document.getElementById('userInfo');

            if (user.tier === 'guest') {
                // Show crawls remaining for guests
                const remaining = user.crawls_remaining;
                userInfoElement.textContent = `Guest (${remaining}/3 crawls remaining)`;
                userInfoElement.style.color = remaining === 0 ? '#dc2626' : '#6b7280';
            } else {
                // Show username and tier for registered users
                userInfoElement.textContent = `${user.username} (${user.tier})`;
                userInfoElement.style.color = '#6b7280';
            }
        }
    } catch (error) {
        console.error('Error loading user info:', error);
    }
}

async function exportData() {
    try {
        // Get current settings to determine export format and fields
        const settingsResponse = await fetch('/api/get_settings');
        const settingsData = await settingsResponse.json();

        if (!settingsData.success) {
            showNotification('Failed to get export settings', 'error');
            return;
        }

        const settings = settingsData.settings;
        const exportFormat = settings.exportFormat || 'csv';
        const exportFields = settings.exportFields || ['url', 'status_code', 'title', 'meta_description', 'h1'];

        // Check if there's data to export - always fetch fresh data from backend
        let hasData = false;
        let exportUrls = [];
        let exportLinks = [];
        let exportIssues = [];

        // Always fetch from backend to ensure we have the latest data including links
        const status = await fetch('/api/crawl_status');
        const statusData = await status.json();

        if (statusData.urls && statusData.urls.length > 0) {
            hasData = true;
            exportUrls = statusData.urls;
            exportLinks = statusData.links || [];
            exportIssues = statusData.issues || [];
        } else if (crawlState.urls && crawlState.urls.length > 0) {
            // Fallback to local state if backend has no data (e.g., loaded crawl)
            hasData = true;
            exportUrls = crawlState.urls;
            // Get links and issues from stored state
            exportLinks = crawlState.links || [];
            exportIssues = crawlState.issues || window.currentIssues || [];
        }

        if (!hasData) {
            showNotification('No crawl data to export', 'error');
            return;
        }

        showNotification('Preparing export...', 'info');

        // Request export from backend, including local data if available
        const exportResponse = await fetch('/api/export_data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                format: exportFormat,
                fields: exportFields,
                // Send local data if we have it (for loaded crawls)
                localData: {
                    urls: exportUrls,
                    links: exportLinks,
                    issues: exportIssues
                }
            })
        });

        const exportData = await exportResponse.json();

        if (!exportData.success) {
            showNotification(exportData.error || 'Export failed', 'error');
            return;
        }

        // Check if we have multiple files to download
        if (exportData.multiple_files && exportData.files) {
            // Download each file separately
            exportData.files.forEach((file, index) => {
                setTimeout(() => {
                    const blob = new Blob([file.content], { type: file.mimetype });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = file.filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, index * 500); // Delay between downloads to avoid browser blocking
            });

            showNotification(`Exporting ${exportData.files.length} files...`, 'success');
        } else {
            // Single file download (original logic)
            const blob = new Blob([exportData.content], { type: exportData.mimetype });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = exportData.filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showNotification(`Export complete: ${exportData.filename}`, 'success');
        }

    } catch (error) {
        console.error('Export error:', error);
        showNotification('Export failed', 'error');
    }
}

// Helper function to escape HTML for safe display
function escapeHtml(text) {
    if (!text) return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showUrlDetails(url) {
    // Find the URL data
    const urlData = crawlState.urls.find(u => u.url === url);
    if (!urlData) {
        showNotification('URL data not found', 'error');
        return;
    }

    // Escape all user-controlled text fields to prevent HTML injection
    const safeUrl = escapeHtml(url);
    const safeTitle = escapeHtml(urlData.title) || 'N/A';
    const safeH1 = escapeHtml(urlData.h1) || 'N/A';
    const safeMetaDesc = escapeHtml(urlData.meta_description) || 'N/A';
    const safeLang = escapeHtml(urlData.lang) || 'N/A';
    const safeCharset = escapeHtml(urlData.charset) || 'N/A';
    const safeCanonical = escapeHtml(urlData.canonical_url) || 'N/A';
    const safeRobots = escapeHtml(urlData.robots) || 'N/A';
    const safeContentType = escapeHtml(urlData.content_type) || 'N/A';
    const safeGa4Id = escapeHtml(urlData.analytics?.ga4_id) || 'N/A';
    const safeGtmId = escapeHtml(urlData.analytics?.gtm_id) || 'N/A';

    // Create modal content
    const modalContent = `
        <div class="details-modal-overlay" onclick="closeUrlDetails()">
            <div class="details-modal" onclick="event.stopPropagation()">
                <div class="details-header">
                    <h3>Comprehensive URL Analysis</h3>
                    <button class="close-btn" onclick="closeUrlDetails()">×</button>
                </div>
                <div class="details-content">
                    <div class="details-url">${safeUrl}</div>

                    <div class="details-sections">
                        <div class="details-section">
                            <h4>🔍 Basic SEO</h4>
                            <div class="details-grid">
                                <div><strong>Title:</strong> ${safeTitle}</div>
                                <div><strong>H1:</strong> ${safeH1}</div>
                                <div><strong>Meta Description:</strong> ${safeMetaDesc}</div>
                                <div><strong>Word Count:</strong> ${urlData.word_count || 0}</div>
                                <div><strong>Language:</strong> ${safeLang}</div>
                                <div><strong>Charset:</strong> ${safeCharset}</div>
                                <div><strong>Canonical URL:</strong> ${safeCanonical}</div>
                                <div><strong>Robots Meta:</strong> ${safeRobots}</div>
                            </div>
                        </div>

                        <div class="details-section">
                            <h4>📊 Analytics & Tracking</h4>
                            <div class="details-grid">
                                <div><strong>Google Analytics:</strong> ${urlData.analytics?.google_analytics ? '✅ Yes' : '❌ No'}</div>
                                <div><strong>GA4/Gtag:</strong> ${urlData.analytics?.gtag ? '✅ Yes' : '❌ No'}</div>
                                <div><strong>GA4 ID:</strong> ${safeGa4Id}</div>
                                <div><strong>GTM ID:</strong> ${safeGtmId}</div>
                                <div><strong>Facebook Pixel:</strong> ${urlData.analytics?.facebook_pixel ? '✅ Yes' : '❌ No'}</div>
                                <div><strong>Hotjar:</strong> ${urlData.analytics?.hotjar ? '✅ Yes' : '❌ No'}</div>
                                <div><strong>Mixpanel:</strong> ${urlData.analytics?.mixpanel ? '✅ Yes' : '❌ No'}</div>
                            </div>
                        </div>

                        <div class="details-section">
                            <h4>📱 Social Media</h4>
                            <div class="details-grid">
                                <div><strong>OpenGraph Tags:</strong> ${Object.keys(urlData.og_tags || {}).length} found</div>
                                <div><strong>Twitter Cards:</strong> ${Object.keys(urlData.twitter_tags || {}).length} found</div>
                            </div>
                            ${Object.keys(urlData.og_tags || {}).length > 0 ? `
                                <div class="details-subsection">
                                    <h5>OpenGraph Tags:</h5>
                                    ${Object.entries(urlData.og_tags || {}).map(([key, value]) =>
        `<div><strong>og:${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`
    ).join('')}
                                </div>
                            ` : ''}
                            ${Object.keys(urlData.twitter_tags || {}).length > 0 ? `
                                <div class="details-subsection">
                                    <h5>Twitter Cards:</h5>
                                    ${Object.entries(urlData.twitter_tags || {}).map(([key, value]) =>
        `<div><strong>twitter:${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`
    ).join('')}
                                </div>
                            ` : ''}
                        </div>

                        <div class="details-section">
                            <h4>🔗 Links & Structure</h4>
                            <div class="details-grid">
                                <div><strong>Internal Links:</strong> ${urlData.internal_links || 0}</div>
                                <div><strong>External Links:</strong> ${urlData.external_links || 0}</div>
                                <div><strong>Images:</strong> ${(urlData.images || []).length}</div>
                                <div><strong>H2 Tags:</strong> ${(urlData.h2 || []).length}</div>
                                <div><strong>H3 Tags:</strong> ${(urlData.h3 || []).length}</div>
                            </div>
                        </div>

                        <div class="details-section">
                            <h4>⚡ Performance</h4>
                            <div class="details-grid">
                                <div><strong>Status Code:</strong> ${urlData.status_code}</div>
                                <div><strong>Response Time:</strong> ${urlData.response_time || 0}ms</div>
                                <div><strong>Content Type:</strong> ${safeContentType}</div>
                                <div><strong>Size:</strong> ${urlData.size || 0} bytes</div>
                            </div>
                        </div>

                        ${(urlData.linked_from && urlData.linked_from.length > 0) ? `
                        <div class="details-section">
                            <h4>🔗 Linked From</h4>
                            <div class="details-grid">
                                <div><strong>Found on ${urlData.linked_from.length} page${urlData.linked_from.length !== 1 ? 's' : ''}:</strong></div>
                            </div>
                            <div class="details-subsection">
                                <ul style="list-style: none; padding: 0; margin: 10px 0;">
                                    ${urlData.linked_from.slice(0, 20).map(sourceUrl => {
        const escapedUrl = escapeHtml(sourceUrl);
        return `<li style="padding: 5px 0; word-break: break-all;"><a href="${escapedUrl}" target="_blank" style="color: #8b5cf6; text-decoration: none;">${escapedUrl}</a></li>`;
    }).join('')}
                                    ${urlData.linked_from.length > 20 ? `<li style="padding: 5px 0; font-style: italic; color: #9ca3af;">... and ${urlData.linked_from.length - 20} more</li>` : ''}
                                </ul>
                            </div>
                        </div>
                        ` : ''}

                        <div class="details-section">
                            <h4>🏗️ Structured Data</h4>
                            <div class="details-grid">
                                <div><strong>JSON-LD Scripts:</strong> ${(urlData.json_ld || []).length}</div>
                                <div><strong>Schema.org Items:</strong> ${(urlData.schema_org || []).length}</div>
                            </div>
                            ${(urlData.json_ld || []).length > 0 ? `
                                <div class="details-subsection">
                                    <h5>JSON-LD Data:</h5>
                                    <pre class="json-preview">${escapeHtml(JSON.stringify(urlData.json_ld, null, 2))}</pre>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalContent);
}

function closeUrlDetails() {
    const modal = document.querySelector('.details-modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Track currently selected row
let selectedRowElement = null;

function selectUrlRow(rowElement, urlData) {
    // Remove selection from previous row
    if (selectedRowElement) {
        selectedRowElement.classList.remove('selected-row');
    }

    // Select new row
    rowElement.classList.add('selected-row');
    selectedRowElement = rowElement;

    // Populate the URL Details panel
    populateUrlDetailsPanel(urlData);
}

function populateUrlDetailsPanel(urlData) {
    const tableBody = document.getElementById('urlDetailsTableBody');
    if (!tableBody) return;

    // Helper function to escape HTML
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    // Build the details rows
    const details = [
        { property: 'URL', value: urlData.url || '', notes: urlData.is_internal ? 'Internal' : 'External' },
        { property: 'Status Code', value: urlData.status_code || '', notes: getStatusCodeDescription(urlData.status_code) },
        { property: 'Content Type', value: urlData.content_type || '', notes: '' },
        { property: 'Size', value: formatBytes(urlData.size || 0), notes: '' },
        { property: 'Response Time', value: `${urlData.response_time || 0}ms`, notes: urlData.response_time > 1000 ? 'Slow' : 'OK' },
        { property: 'Title', value: urlData.title || '', notes: getTitleNotes(urlData.title) },
        { property: 'Meta Description', value: urlData.meta_description || '', notes: getMetaDescNotes(urlData.meta_description) },
        { property: 'H1', value: urlData.h1 || '', notes: urlData.h1 ? '' : 'Missing H1' },
        { property: 'Word Count', value: urlData.word_count || 0, notes: urlData.word_count < 300 ? 'Thin content' : '' },
        { property: 'Canonical URL', value: urlData.canonical_url || '', notes: '' },
        { property: 'Robots', value: urlData.robots || '', notes: '' },
        { property: 'Language', value: urlData.lang || '', notes: '' },
        { property: 'Internal Links', value: urlData.internal_links || 0, notes: '' },
        { property: 'External Links', value: urlData.external_links || 0, notes: '' },
        { property: 'Images', value: (urlData.images || []).length, notes: '' },
        { property: 'Depth', value: urlData.depth || 0, notes: '' }
    ];

    // Add analytics info if present
    if (urlData.analytics) {
        const analyticsItems = [];
        if (urlData.analytics.google_analytics) analyticsItems.push('GA');
        if (urlData.analytics.gtag) analyticsItems.push('Gtag');
        if (urlData.analytics.ga4_id) analyticsItems.push(`GA4: ${urlData.analytics.ga4_id}`);
        if (urlData.analytics.gtm_id) analyticsItems.push(`GTM: ${urlData.analytics.gtm_id}`);
        if (urlData.analytics.facebook_pixel) analyticsItems.push('FB Pixel');
        if (analyticsItems.length > 0) {
            details.push({ property: 'Analytics', value: analyticsItems.join(', '), notes: '' });
        }
    }

    // Add OG tags count
    const ogCount = Object.keys(urlData.og_tags || {}).length;
    if (ogCount > 0) {
        details.push({ property: 'OpenGraph Tags', value: `${ogCount} tags`, notes: '' });
    }

    // Add JSON-LD count
    const jsonLdCount = (urlData.json_ld || []).length;
    if (jsonLdCount > 0) {
        details.push({ property: 'JSON-LD Scripts', value: `${jsonLdCount} scripts`, notes: '' });
    }

    // Add linked from info
    if (urlData.linked_from && urlData.linked_from.length > 0) {
        details.push({ property: 'Linked From', value: `${urlData.linked_from.length} pages`, notes: '' });
    }

    // Generate table HTML
    tableBody.innerHTML = details.map(d => `
        <tr>
            <td><strong>${escapeHtml(d.property)}</strong></td>
            <td style="word-break: break-all;">${escapeHtml(String(d.value))}</td>
            <td style="color: ${d.notes && (d.notes.includes('Missing') || d.notes.includes('Thin') || d.notes.includes('Slow')) ? '#ef4444' : '#9ca3af'};">${escapeHtml(d.notes)}</td>
        </tr>
    `).join('');
}

function getStatusCodeDescription(code) {
    const descriptions = {
        200: 'OK',
        201: 'Created',
        301: 'Moved Permanently',
        302: 'Found (Temporary Redirect)',
        304: 'Not Modified',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable'
    };
    return descriptions[code] || '';
}

function getTitleNotes(title) {
    if (!title) return 'Missing title';
    if (title.length < 30) return 'Title too short';
    if (title.length > 60) return 'Title too long';
    return '';
}

function getMetaDescNotes(desc) {
    if (!desc) return 'Missing meta description';
    if (desc.length < 70) return 'Description too short';
    if (desc.length > 160) return 'Description too long';
    return '';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function displayPageSpeedResults(results) {
    const container = document.getElementById('pagespeedResults');
    if (!container || !results || results.length === 0) {
        return;
    }

    container.innerHTML = '';

    results.forEach(pageResult => {
        const pageCard = document.createElement('div');
        pageCard.className = 'pagespeed-page-card';

        const mobile = pageResult.mobile || {};
        const desktop = pageResult.desktop || {};

        pageCard.innerHTML = `
            <div class="pagespeed-page-header">
                <h4 class="pagespeed-page-url">${pageResult.url}</h4>
                <span class="pagespeed-analysis-date">Analyzed: ${pageResult.analysis_date}</span>
            </div>

            <div class="pagespeed-results-grid">
                <div class="pagespeed-device-result">
                    <h5>📱 Mobile</h5>
                    ${mobile.success ? `
                        <div class="pagespeed-score ${getScoreClass(mobile.performance_score)}">
                            ${mobile.performance_score || 'N/A'}
                        </div>
                        <div class="pagespeed-metrics">
                            <div class="metric">
                                <span class="metric-label">FCP:</span>
                                <span class="metric-value">${mobile.metrics?.first_contentful_paint || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">LCP:</span>
                                <span class="metric-value">${mobile.metrics?.largest_contentful_paint || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">CLS:</span>
                                <span class="metric-value">${mobile.metrics?.cumulative_layout_shift || 'N/A'}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">SI:</span>
                                <span class="metric-value">${mobile.metrics?.speed_index || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">TTI:</span>
                                <span class="metric-value">${mobile.metrics?.time_to_interactive || 'N/A'}s</span>
                            </div>
                        </div>
                    ` : `
                        <div class="pagespeed-error">
                            Error: ${mobile.error || 'Analysis failed'}
                        </div>
                    `}
                </div>

                <div class="pagespeed-device-result">
                    <h5>🖥️ Desktop</h5>
                    ${desktop.success ? `
                        <div class="pagespeed-score ${getScoreClass(desktop.performance_score)}">
                            ${desktop.performance_score || 'N/A'}
                        </div>
                        <div class="pagespeed-metrics">
                            <div class="metric">
                                <span class="metric-label">FCP:</span>
                                <span class="metric-value">${desktop.metrics?.first_contentful_paint || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">LCP:</span>
                                <span class="metric-value">${desktop.metrics?.largest_contentful_paint || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">CLS:</span>
                                <span class="metric-value">${desktop.metrics?.cumulative_layout_shift || 'N/A'}</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">SI:</span>
                                <span class="metric-value">${desktop.metrics?.speed_index || 'N/A'}s</span>
                            </div>
                            <div class="metric">
                                <span class="metric-label">TTI:</span>
                                <span class="metric-value">${desktop.metrics?.time_to_interactive || 'N/A'}s</span>
                            </div>
                        </div>
                    ` : `
                        <div class="pagespeed-error">
                            Error: ${desktop.error || 'Analysis failed'}
                        </div>
                    `}
                </div>
            </div>
        `;

        container.appendChild(pageCard);
    });
}

function getScoreClass(score) {
    if (!score) return 'score-unknown';
    if (score >= 90) return 'score-good';
    if (score >= 50) return 'score-needs-improvement';
    return 'score-poor';
}

// Save/Load Crawl Functions
async function saveCrawl() {
    try {
        if (crawlState.stats.crawled === 0) {
            showNotification('No crawl data to save', 'error');
            return;
        }

        // Get current crawl data from backend or use local state
        let urls = crawlState.urls;
        let links = crawlState.links;
        let issues = crawlState.issues;
        let stats = crawlState.stats;

        // Try to get fresh data from backend if available
        try {
            const status = await fetch('/api/crawl_status');
            const crawlData = await status.json();
            if (crawlData.urls && crawlData.urls.length > 0) {
                urls = crawlData.urls;
                links = crawlData.links || links;
                issues = crawlData.issues || issues;
                // Update stats to include latest PageSpeed results if available
                if (crawlData.stats) {
                    stats = crawlData.stats;
                }
            }
        } catch (e) {
            console.log('Using local state for save:', e);
        }

        // Add metadata
        const saveData = {
            timestamp: new Date().toISOString(),
            baseUrl: crawlState.baseUrl,
            stats: stats,
            urls: urls,
            links: links,
            issues: issues,
            version: '1.1'
        };

        // Create and download the file
        const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        // Generate filename with domain and timestamp
        const domain = crawlState.baseUrl ? new URL(crawlState.baseUrl).hostname : 'crawl';
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        a.download = `wailing_newt_${domain}_${timestamp}.json`;

        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showNotification('Crawl saved successfully', 'success');

    } catch (error) {
        console.error('Save error:', error);
        showNotification('Failed to save crawl', 'error');
    }
}

function loadCrawl() {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async function (event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const saveData = JSON.parse(text);

            // Validate save data
            if (!saveData.version || !saveData.urls || !saveData.stats) {
                showNotification('Invalid crawl file format', 'error');
                return;
            }

            // Clear current data
            clearAllTables();
            resetStats();

            // Load the data
            crawlState.baseUrl = saveData.baseUrl;
            crawlState.stats = saveData.stats;
            crawlState.urls = [];
            crawlState.links = saveData.links || [];
            crawlState.issues = saveData.issues || [];

            // Update UI
            document.getElementById('urlInput').value = saveData.baseUrl || '';
            updateStatsDisplay();

            // Populate tables with loaded data
            if (saveData.urls && saveData.urls.length > 0) {
                console.log(`Loading ${saveData.urls.length} URLs...`);

                // Clear crawlState.urls first to avoid duplicate check issues
                crawlState.urls = [];

                // Add URLs to tables (addUrlToTable will handle adding to crawlState.urls)
                saveData.urls.forEach(url => {
                    // Debug: check if url has is_internal flag
                    if (url.is_internal === undefined) {
                        console.warn('URL missing is_internal flag:', url.url);
                        // Try to determine is_internal based on domain
                        if (crawlState.baseUrl) {
                            try {
                                const urlDomain = new URL(url.url).hostname.replace('www.', '');
                                const baseDomain = new URL(crawlState.baseUrl).hostname.replace('www.', '');
                                url.is_internal = urlDomain === baseDomain;
                            } catch (e) {
                                url.is_internal = false;
                            }
                        }
                    }
                    addUrlToTable(url);
                });

                console.log(`Added ${crawlState.urls.length} URLs to state`);
                console.log('Sample URL data:', crawlState.urls[0]);
            }

            // Load links data
            if (saveData.links && saveData.links.length > 0) {
                console.log(`Loading ${saveData.links.length} links...`);
                crawlState.pendingLinks = saveData.links;
                // If Links tab is currently active, load them immediately
                if (isLinksTabActive()) {
                    updateLinksTable(saveData.links);
                }
            }

            // Load issues data if present - filter them based on current exclusion settings
            if (saveData.issues && saveData.issues.length > 0) {
                console.log(`Loading ${saveData.issues.length} issues...`);

                // Filter issues using current exclusion patterns
                try {
                    const filterResponse = await fetch('/api/filter_issues', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ issues: saveData.issues })
                    });
                    const filterData = await filterResponse.json();

                    const filteredIssues = filterData.success ? filterData.issues : saveData.issues;
                    console.log(`Filtered to ${filteredIssues.length} issues after exclusions`);

                    crawlState.issues = filteredIssues;
                    crawlState.pendingIssues = filteredIssues;

                    // If Issues tab is currently active, load them immediately
                    if (isIssuesTabActive()) {
                        updateIssuesTable(filteredIssues);
                    } else {
                        // Update the badge count even if tab is not active
                        const issuesTabButton = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.textContent.includes('Issues'));
                        if (issuesTabButton) {
                            const errorCount = filteredIssues.filter(i => i.type === 'error').length;
                            const warningCount = filteredIssues.filter(i => i.type === 'warning').length;
                            let badgeColor = '#3b82f6';
                            if (errorCount > 0) badgeColor = '#ef4444';
                            else if (warningCount > 0) badgeColor = '#f59e0b';
                            issuesTabButton.innerHTML = `Issues <span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 12px; font-size: 12px;">${filteredIssues.length}</span>`;
                        }
                    }
                } catch (error) {
                    console.error('Failed to filter issues:', error);
                    // Fall back to unfiltered issues if filtering fails
                    crawlState.issues = saveData.issues;
                    crawlState.pendingIssues = saveData.issues;
                    if (isIssuesTabActive()) {
                        updateIssuesTable(saveData.issues);
                    }
                }
            }

            // Update all secondary data
            updateFilterCounts();
            updateStatusCodesTable();
            updateCrawlButtons();

            // Display PageSpeed results if available
            if (saveData.stats && saveData.stats.pagespeed_results) {
                console.log(`Loading ${saveData.stats.pagespeed_results.length} PageSpeed results...`);
                displayPageSpeedResults(saveData.stats.pagespeed_results);
            }

            // Force refresh of all tables
            setTimeout(() => {
                console.log('Force refreshing tables...');
                const overviewCount = document.getElementById('overviewTableBody').children.length;
                const internalCount = document.getElementById('internalTableBody').children.length;
                const externalCount = document.getElementById('externalTableBody').children.length;
                console.log(`Table counts - Overview: ${overviewCount}, Internal: ${internalCount}, External: ${externalCount}`);
            }, 100);

            // Update visualization if it exists and has been initialized
            if (typeof window.updateVisualizationFromLoadedData === 'function') {
                window.updateVisualizationFromLoadedData(saveData.urls, saveData.links);
            }

            // Notify plugins of loaded data
            if (window.WailingNewtPlugin && window.WailingNewtPlugin.loader) {
                window.WailingNewtPlugin.loader.notifyDataUpdate({
                    urls: crawlState.urls,
                    links: crawlState.links,
                    issues: crawlState.issues,
                    stats: crawlState.stats
                });
            }

            showNotification(`Crawl loaded: ${saveData.stats.crawled} URLs from ${new Date(saveData.timestamp).toLocaleDateString()}`, 'success');

        } catch (error) {
            console.error('Load error:', error);
            showNotification('Failed to load crawl file', 'error');
        }
    });

    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// ========================================
// Virtual Scroller Render Functions
// ========================================

function renderOverviewRow(row, urlData, index) {
    const analyticsInfo = formatAnalyticsInfo(urlData.analytics || {});
    const ogTagsCount = Object.keys(urlData.og_tags || {}).length;
    const jsonLdCount = (urlData.json_ld || []).length;
    const linksInfo = `${urlData.internal_links || 0}/${urlData.external_links || 0}`;
    const imagesCount = (urlData.images || []).length;
    const jsRendered = urlData.javascript_rendered ? '✅ JS' : '';

    const cells = [
        urlData.url,
        urlData.status_code,
        urlData.title || '',
        (urlData.meta_description || '').substring(0, 50) + (urlData.meta_description && urlData.meta_description.length > 50 ? '...' : ''),
        urlData.h1 || '',
        urlData.word_count || 0,
        urlData.response_time || 0,
        analyticsInfo,
        ogTagsCount > 0 ? `${ogTagsCount} tags` : '',
        jsonLdCount > 0 ? `${jsonLdCount} scripts` : '',
        linksInfo,
        imagesCount > 0 ? `${imagesCount} images` : '',
        jsRendered,
        `<button class="details-btn" onclick="event.stopPropagation(); showUrlDetails('${urlData.url.replace(/'/g, "\\'")}')">📊 Details</button>`
    ];

    cells.forEach(cellData => {
        const cell = document.createElement('td');
        if (typeof cellData === 'string' && cellData.includes('<button')) {
            cell.innerHTML = cellData;
        } else {
            cell.textContent = cellData;
        }
        row.appendChild(cell);
    });

    // Add click handler to select row and populate details panel
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => selectUrlRow(row, urlData));
}

function renderInternalRow(row, urlData, index) {
    const activeColumns = TableConfig.getActiveColumns();

    activeColumns.forEach(column => {
        const cell = document.createElement('td');
        const value = getColumnValue(urlData, column.id);

        // Handle potential HTML content or special formatting
        if (column.id === 'url') {
            cell.style.wordBreak = 'break-all';
        }

        cell.textContent = value;
        row.appendChild(cell);
    });

    // Add click handler to select row and populate details panel
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => selectUrlRow(row, urlData));
}

function renderExternalRow(row, urlData, index) {
    const cells = [
        urlData.url,
        urlData.status_code,
        urlData.content_type || '',
        urlData.size || 0,
        urlData.title || ''
    ];

    cells.forEach(cellData => {
        const cell = document.createElement('td');
        cell.textContent = cellData;
        row.appendChild(cell);
    });

    // Add click handler to select row and populate details panel
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => selectUrlRow(row, urlData));
}

function renderInternalLinkRow(row, link, index) {
    const statusBadge = link.target_status ? `<span class="status-badge status-${Math.floor(link.target_status / 100)}xx">${link.target_status}</span>` : '';
    const placement = link.placement ? link.placement.charAt(0).toUpperCase() + link.placement.slice(1) : 'Unknown';

    row.innerHTML = `
        <td style="word-break: break-all;">${link.source_url}</td>
        <td style="word-break: break-all;">${link.target_url}</td>
        <td>${statusBadge}</td>
        <td>${link.anchor_text || ''}</td>
        <td>${placement}</td>
    `;
}

function renderExternalLinkRow(row, link, index) {
    const statusBadge = link.target_status ? `<span class="status-badge status-${Math.floor(link.target_status / 100)}xx">${link.target_status}</span>` : '';
    const placement = link.placement ? link.placement.charAt(0).toUpperCase() + link.placement.slice(1) : 'Unknown';

    row.innerHTML = `
        <td style="word-break: break-all;">${link.source_url}</td>
        <td style="word-break: break-all;">${link.target_url}</td>
        <td>${statusBadge}</td>
        <td>${link.target_domain || ''}</td>
        <td>${placement}</td>
    `;
}

function renderIssueRow(row, issue, index) {
    row.setAttribute('data-issue-type', issue.type);

    // Set row style based on issue type
    if (issue.type === 'error') {
        row.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    } else if (issue.type === 'warning') {
        row.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
    } else {
        row.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    }

    // Create type indicator
    let typeIcon = '';
    let typeColor = '';
    if (issue.type === 'error') {
        typeIcon = '❌';
        typeColor = '#ef4444';
    } else if (issue.type === 'warning') {
        typeIcon = '⚠️';
        typeColor = '#f59e0b';
    } else {
        typeIcon = 'ℹ️';
        typeColor = '#3b82f6';
    }

    row.innerHTML = `
        <td style="word-break: break-all;" title="${issue.url}">${issue.url}</td>
        <td><span style="color: ${typeColor};">${typeIcon}</span> ${issue.type}</td>
        <td>${issue.category}</td>
        <td>${issue.issue}</td>
        <td style="word-break: break-word;" title="${issue.details}">${issue.details}</td>
    `;
}

function renderContentAnalysisRow(row, urlData, index) {
    const metrics = urlData.content_metrics || {};

    const wordCount = urlData.word_count || 0;
    const readability = metrics.flesch_kincaid_grade || '-';
    const readingTime = metrics.reading_time_minutes || (wordCount > 0 ? Math.ceil(wordCount / 200) + ' min' : '-');

    // Status text
    let status = '<span class="status-badge status-good">Good</span>';
    if (metrics.is_thin_content) status = '<span class="status-badge status-error">Thin Content</span>';
    else if (readability > 12) status = '<span class="status-badge status-warning">Complex</span>';

    // Keywords
    let keywordsHtml = '';
    if (metrics.keywords && metrics.keywords.length > 0) {
        keywordsHtml = metrics.keywords.slice(0, 5).map(k =>
            `<span class="keyword-tag" title="${k.count} occurrences">${k.word}</span>`
        ).join(' ');
    }

    row.innerHTML = `
        <td class="url-cell" title="${urlData.url}">${urlData.url}</td>
        <td>${wordCount}</td>
        <td>${readability}</td>
        <td>${metrics.readability_score || '-'}</td>
        <td>${readingTime}</td>
        <td>${keywordsHtml}</td>
        <td>${status}</td>
    `;
}

function renderLinkHealthRow(row, urlData, index) {
    // Determine orphan status
    const isOrphan = (urlData.linked_from && urlData.linked_from.length === 0 && !urlData.is_start_url && urlData.depth > 0);
    const orphanStatus = isOrphan ? '<span class="status-badge status-error">Orphan</span>' : '<span class="status-badge status-good">Linked</span>';

    const equity = urlData.link_equity !== undefined ? parseFloat(urlData.link_equity).toFixed(2) : '-';

    const inboundCount = urlData.linked_from ? urlData.linked_from.length : 0;
    const outboundCount = (urlData.internal_links || 0) + (urlData.external_links || 0);

    const redirectChain = (urlData.redirects && urlData.redirects.length > 0)
        ? `<span class="status-badge status-info">${urlData.redirects.length} hops</span>`
        : '-';

    row.innerHTML = `
        <td class="url-cell" title="${urlData.url}">${urlData.url}</td>
        <td>${orphanStatus}</td>
        <td>${equity}</td>
        <td>${inboundCount}</td>
        <td>${outboundCount}</td>
        <td>${redirectChain}</td>
    `;
}

// New Tab Helpers
function isContentAnalysisTabActive() {
    const tab = document.getElementById('content-analysis-tab');
    return tab && tab.classList.contains('active');
}

function isLinkHealthTabActive() {
    const tab = document.getElementById('link-health-tab');
    return tab && tab.classList.contains('active');
}

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

// Auto-Update Management (Electron desktop app only)
function initializeAutoUpdate() {
    // Check if running in Electron with update API
    if (typeof window.electronAPI === 'undefined' || !window.electronAPI.onUpdateDownloaded) {
        console.log('Auto-update: Not running in Electron or update API not available');
        return;
    }

    console.log('Auto-update: Initializing update listener');

    // Listen for update-downloaded event from main process
    window.electronAPI.onUpdateDownloaded((info) => {
        console.log('Auto-update: Update downloaded', info);
        showUpdateBanner(info.version);
    });

    // Check if an update was already downloaded
    window.electronAPI.getUpdateStatus().then((status) => {
        if (status && status.updateDownloaded) {
            showUpdateBanner();
        }
    }).catch((err) => {
        console.log('Auto-update: Could not get update status', err);
    });
}

function showUpdateBanner(version) {
    // Remove existing banner if present
    const existingBanner = document.getElementById('update-banner');
    if (existingBanner) {
        existingBanner.remove();
    }

    // Create update banner
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: inherit;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
    `;

    const versionText = version ? ` (v${version})` : '';
    banner.innerHTML = `
        <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 4px;">Update Ready${versionText}</div>
            <div style="font-size: 13px; opacity: 0.9;">Restart to apply the latest updates</div>
        </div>
        <button onclick="installUpdate()" style="
            background: white;
            color: #059669;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
        ">Restart Now</button>
        <button onclick="dismissUpdateBanner()" style="
            background: transparent;
            color: white;
            border: none;
            padding: 4px;
            cursor: pointer;
            opacity: 0.7;
            font-size: 18px;
            line-height: 1;
        ">&times;</button>
    `;

    // Add animation keyframes
    if (!document.getElementById('update-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'update-banner-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(banner);
}

function dismissUpdateBanner() {
    const banner = document.getElementById('update-banner');
    if (banner) {
        banner.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => banner.remove(), 300);
    }
}

function installUpdate() {
    if (window.electronAPI && window.electronAPI.installUpdate) {
        window.electronAPI.installUpdate();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    // Cycle through: dark -> light -> newt -> dark
    let newTheme;
    if (currentTheme === 'dark') {
        newTheme = 'light';
    } else if (currentTheme === 'light') {
        newTheme = 'newt';
    } else {
        newTheme = 'dark';
    }

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        if (theme === 'dark') {
            icon.textContent = '🌙';
        } else if (theme === 'light') {
            icon.textContent = '☀️';
        } else if (theme === 'newt') {
            icon.textContent = '🐸';
        }
    }
}

// Keyboard Shortcuts
function initializeShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter to Start/Resume
        if (e.ctrlKey && e.key === 'Enter') {
            toggleCrawl();
        }
        // Esc to Stop
        if (e.key === 'Escape' && crawlState.isRunning) {
            stopCrawl();
        }
    });
}

// Upload Dropdown Menu
function toggleUploadDropdown() {
    const menu = document.getElementById('uploadDropdownMenu');
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        // Close dropdown when clicking outside
        document.addEventListener('click', closeUploadDropdownOnClickOutside);
    } else {
        menu.style.display = 'none';
        document.removeEventListener('click', closeUploadDropdownOnClickOutside);
    }
}

function closeUploadDropdownOnClickOutside(event) {
    const dropdown = document.querySelector('.upload-dropdown');
    if (!dropdown.contains(event.target)) {
        document.getElementById('uploadDropdownMenu').style.display = 'none';
        document.removeEventListener('click', closeUploadDropdownOnClickOutside);
    }
}

function closeUploadDropdown() {
    document.getElementById('uploadDropdownMenu').style.display = 'none';
    document.removeEventListener('click', closeUploadDropdownOnClickOutside);
}

function openFileUpload() {
    closeUploadDropdown();
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.csv,.xml';
    fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const content = e.target.result;
                // Open bulk input modal with file content
                document.getElementById('bulkInputModal').style.display = 'flex';
                document.getElementById('bulkUrlsInput').value = content;
            };
            reader.readAsText(file);
        }
    };
    fileInput.click();
}

async function pasteFromClipboard() {
    closeUploadDropdown();
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            document.getElementById('bulkInputModal').style.display = 'flex';
            document.getElementById('bulkUrlsInput').value = text;
            document.getElementById('bulkUrlsInput').focus();
        }
    } catch (err) {
        alert('Unable to access clipboard. Please use Enter Manually and paste directly.');
        openBulkInputModal();
    }
}

function downloadXMLSitemaps() {
    closeUploadDropdown();
    const url = document.getElementById('urlInput').value.trim();
    if (!url) {
        alert('Please enter a URL first to download its XML sitemaps.');
        return;
    }
    updateStatus('Discovering XML sitemaps...');
    fetch('/api/sitemaps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                alert(data.error || 'Unable to discover XML sitemaps.');
                updateStatus('Ready');
                return;
            }
            if (!data.urls || data.urls.length === 0) {
                alert('No sitemap URLs were discovered for this site.');
                updateStatus('Ready');
                return;
            }
            openBulkModalWithUrls(data.urls);
            updateStatus(`Discovered ${data.urls.length} URLs from XML sitemaps.`);
        })
        .catch(error => {
            console.error('Error discovering sitemaps:', error);
            alert('Failed to discover XML sitemaps. Please try again.');
            updateStatus('Ready');
        });
}

function openGoogleSheetsImport() {
    closeUploadDropdown();
    const sheetUrl = prompt('Enter Google Sheets URL (must be publicly accessible or shared):');
    if (sheetUrl) {
        updateStatus('Importing URLs from Google Sheets...');
        fetch('/api/import/google-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheet_url: sheetUrl })
        })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    alert(data.error || 'Unable to import Google Sheet.');
                    updateStatus('Ready');
                    return;
                }
                openBulkModalWithUrls(data.urls);
                updateStatus(`Imported ${data.urls.length} URLs from Google Sheets.`);
            })
            .catch(error => {
                console.error('Error importing Google Sheet:', error);
                alert('Failed to import Google Sheet. Ensure it is shared publicly.');
                updateStatus('Ready');
            });
    }
}

// Bulk Input Modal
function openBulkInputModal() {
    closeUploadDropdown();
    document.getElementById('bulkInputModal').style.display = 'flex';
    document.getElementById('bulkUrlsInput').focus();
}

function closeBulkInputModal() {
    document.getElementById('bulkInputModal').style.display = 'none';
}

function openBulkModalWithUrls(urls) {
    const uniqueUrls = Array.from(new Set(urls));
    document.getElementById('bulkUrlsInput').value = uniqueUrls.join('\n');
    document.getElementById('bulkInputModal').style.display = 'flex';
    document.getElementById('bulkUrlsInput').focus();
}

function processBulkUrls() {
    const input = document.getElementById('bulkUrlsInput').value;

    // Extract URLs from text - matches http:// or https:// URLs
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = input.match(urlRegex);

    // If no URLs found using regex, fall back to line-by-line processing
    let urls;
    if (matches && matches.length > 0) {
        // Clean up extracted URLs (remove trailing punctuation that might have been caught)
        urls = matches.map(url => {
            // Remove trailing punctuation like ), ], }, etc.
            return url.replace(/[)\]}>.,;:!?]+$/, '');
        }).filter(u => u);
    } else {
        // Fallback: treat each non-empty line as potential URL
        urls = input.split('\n')
            .map(u => u.trim())
            .filter(u => u && (u.startsWith('http://') || u.startsWith('https://')));
    }

    if (urls.length === 0) {
        alert('No valid URLs found. Please enter at least one URL starting with http:// or https://');
        return;
    }

    // Use first URL as base
    const firstUrl = urls[0];
    document.getElementById('urlInput').value = firstUrl;

    startCrawlWithExtraUrls(firstUrl, urls.slice(1));
    closeBulkInputModal();
}

function startCrawlWithExtraUrls(baseUrl, extraUrls) {
    // Similar to startCrawl but passes extra_urls
    const urlInput = document.getElementById('urlInput');
    urlInput.value = baseUrl; // update UI

    // Ensure normalization
    baseUrl = normalizeUrl(baseUrl);

    crawlState.isRunning = true;
    crawlState.isPaused = false;
    crawlState.startTime = new Date();
    crawlState.baseUrl = baseUrl;
    crawlState.urls = [];
    crawlState.links = [];
    crawlState.issues = [];

    // Initialize incremental poller for new crawl
    // Assuming IncrementalPoller is available globally or imported
    if (typeof IncrementalPoller !== 'undefined') {
        if (!incrementalPoller) incrementalPoller = new IncrementalPoller();
        incrementalPoller.reset();
    }

    updateCrawlButtons();
    showProgress();
    updateStatus('Starting bulk crawl...');
    clearAllTables();
    resetStats();

    // Call Python backend
    fetch('/api/start_crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: baseUrl,
            extra_urls: extraUrls
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Crawling in progress...');
                if (data.ga4_discovery && data.ga4_discovery.urls_added > 0) {
                    showNotification(`GA4 added ${data.ga4_discovery.urls_added} URLs before crawl start`, 'info');
                }
                loadUserInfo();
                pollCrawlProgress();
            } else {
                updateStatus('Error: ' + data.error);
                stopCrawl();
            }
        })
        .catch(error => {
            console.error('Error starting crawl:', error);
            stopCrawl();
        });
}

// Crawl Config Modal Functions
function toggleCrawlConfigJSSettings(isEnabled) {
    const jsSettingsGroups = [
        'jsSettings', 'jsTimeoutGroup', 'jsBrowserGroup', 'jsHeadlessGroup',
        'jsUserAgentGroup', 'jsViewportGroup', 'jsConcurrencyGroup', 'jsWarning'
    ];

    jsSettingsGroups.forEach(groupId => {
        const group = document.getElementById(groupId);
        if (group) {
            group.style.display = isEnabled ? 'block' : 'none';
        }
    });
}

function openCrawlConfig() {
    document.getElementById('crawlConfigModal').style.display = 'flex';
    // Load current config values
    loadCrawlConfigValues();

    // Set initial visibility of JS settings based on checkbox state
    const enableJavaScriptCheckbox = document.getElementById('enableJavaScript');
    if (enableJavaScriptCheckbox) {
        toggleCrawlConfigJSSettings(enableJavaScriptCheckbox.checked);
    }
}

function closeCrawlConfig() {
    document.getElementById('crawlConfigModal').style.display = 'none';
}

function toggleConfigSection(sectionId) {
    const items = document.getElementById(sectionId + '-items');
    const arrow = document.getElementById(sectionId + '-arrow');

    if (items.classList.contains('collapsed')) {
        items.classList.remove('collapsed');
        items.style.maxHeight = items.scrollHeight + 'px';
        arrow.innerHTML = '&#x25BC;';
    } else {
        items.classList.add('collapsed');
        items.style.maxHeight = '0';
        arrow.innerHTML = '&#x25B6;';
    }
}

function showConfigPanel(panelId) {
    // Remove active from all items
    document.querySelectorAll('.config-item, .config-item-single').forEach(item => {
        item.classList.remove('active');
    });

    // Hide all panels
    document.querySelectorAll('.config-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Show selected panel
    const panel = document.getElementById('config-panel-' + panelId);
    if (panel) {
        panel.classList.add('active');
    }

    // Update breadcrumb
    const breadcrumb = document.getElementById('configBreadcrumb');
    if (breadcrumb) {
        breadcrumb.textContent = panelId.charAt(0).toUpperCase() + panelId.slice(1).replace(/-/g, ' ');
    }

    // Update description
    const descriptions = {
        'crawl': 'Select link types to crawl and store, and adjust crawling behaviour.',
        'extraction': 'Configure which data to extract from pages during crawling and issues for them.',
        'limits': 'Limit the size and scope of the crawl. This may help focus on key areas and reduce the time it takes to complete a crawl.',
        'rendering': 'Configure JavaScript rendering options for crawling dynamic content.',
        'advanced': 'Adjust a variety of advanced crawler settings. These settings can be used to guide the crawl and can impact the number of URLs discovered, crawled and reported.',
        'preferences': 'Modify parameters used to flag potential issues and populate filters. For example, page title length for the \'Over X Characters\' filter in the Page Titles tab.',
        'speed': 'Control the speed of requests made by the crawler.',
        'user-agent': 'Adjust the user-agent used in crawling.',
        'robots': 'Modify how the crawler interprets robots.txt. By default, robots.txt is respected, which means URLs won\'t be crawled if disallowed.',
        'content-area': 'Configure content area analysis settings.',
        'duplicates': 'Configure duplicate content detection settings.',
        'spelling': 'Configure spelling and grammar checking settings.',
        'embeddings': 'Configure embeddings and similarity settings.',
        'url-rewriting': 'Configure URL rewriting rules.',
        'cdns': 'Configure CDN detection and handling.',
        'include': 'Configure URL patterns to include in the crawl.',
        'exclude': 'Configure URL patterns to exclude from the crawl.',
        'http-header': 'Configure custom HTTP headers to send with requests.',
        'custom-search': 'Configure custom search patterns.',
        'custom-extraction': 'Configure custom data extraction rules.',
        'google-analytics': 'Connect Google Analytics for traffic data.',
        'search-console': 'Connect Google Search Console for search data.',
        'pagespeed': 'Connect PageSpeed Insights for performance metrics.',
        'authentication': 'Login to access and crawl a staging site or logged in area using standards based or web forms based authentication.',
        'auth-standards': 'Configure HTTP Basic or Digest authentication for crawling password-protected pages.',
        'auth-forms': 'Configure web form-based login to access and crawl authenticated areas of a website.',
        'auth-profiles': 'Export and import authentication configurations for scheduled crawls or command line usage.',
        'crawl-analysis': 'Configure crawl analysis and reporting options.'
    };
    const descEl = document.getElementById('configDescription');
    if (descEl && descriptions[panelId]) {
        descEl.textContent = descriptions[panelId];
    }

    // Add active class to clicked item
    if (typeof event !== 'undefined' && event?.target) {
        const activeItem = event.target.closest('.config-item, .config-item-single');
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    if (panelId === 'google-analytics' && window.GA4Config && typeof window.GA4Config.onPanelVisible === 'function') {
        window.GA4Config.onPanelVisible();
    }
}

function filterConfigItems() {
    const searchTerm = document.getElementById('configSearch').value.toLowerCase();
    const items = document.querySelectorAll('.config-item, .config-item-single');

    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function loadCrawlConfigValues() {
    // Load values from current settings if available
    if (typeof currentSettings !== 'undefined') {
        // Helper functions for setting values
        const setCheckbox = (id, key, defaultVal = false) => {
            const el = document.getElementById(id);
            if (el) el.checked = currentSettings[key] !== undefined ? currentSettings[key] : defaultVal;
        };
        const setValue = (id, key, defaultVal = '') => {
            const el = document.getElementById(id);
            if (el && currentSettings[key] !== undefined) el.value = currentSettings[key];
            else if (el && defaultVal) el.value = defaultVal;
        };

        // Speed settings - load from concurrency or maxThreads (concurrency takes precedence)
        const maxThreads = document.getElementById('configMaxThreads');
        if (maxThreads) {
            const threadValue = currentSettings.concurrency || currentSettings.maxThreads || 5;
            maxThreads.value = threadValue;
        }

        setCheckbox('configLimitUrls', 'limitUrlsPerSecond');
        setValue('configMaxUrlsPerSec', 'maxUrlsPerSecond', '2');
        setValue('configCrawlDelay', 'crawlDelay', '0.5');
        setCheckbox('configRespectCrawlDelay', 'respectCrawlDelay', true);
        setValue('configTimeout', 'timeout', '10');
        setValue('configRetries', 'retries', '3');
        setCheckbox('configFollowRedirects', 'followRedirects', true);
        setCheckbox('configCrawlExternalLinks', 'crawlExternalLinks');
        setValue('configMaxDepth', 'maxDepth', '3');
        setValue('configMaxUrls', 'maxUrls', '5000000');
        setValue('configMaxFileSize', 'maxFileSize', '50');
        setValue('configHttpUA', 'userAgent');
        setValue('configRobotsUA', 'robotsUserAgent');
        setValue('robotsMode', 'robotsMode');
        setCheckbox('showInternalBlocked', 'showInternalBlocked', true);
        setCheckbox('showExternalBlocked', 'showExternalBlocked', true);

        // JavaScript Rendering settings
        setCheckbox('enableJavaScript', 'enableJavaScript');
        setValue('jsWaitTime', 'jsWaitTime', '3');
        setValue('jsTimeout', 'jsTimeout', '30');
        setValue('jsBrowser', 'jsBrowser');
        setCheckbox('jsHeadless', 'jsHeadless', true);
        setValue('jsUserAgent', 'jsUserAgent');
        setValue('jsViewportWidth', 'jsViewportWidth', '1920');
        setValue('jsViewportHeight', 'jsViewportHeight', '1080');
        setValue('jsMaxConcurrentPages', 'jsMaxConcurrentPages', '3');

        // Crawl Panel - Resource Links
        setCheckbox('crawlImages', 'crawlImages', true);
        setCheckbox('storeImages', 'storeImages', true);
        setCheckbox('crawlMedia', 'crawlMedia');
        setCheckbox('storeMedia', 'storeMedia');
        setCheckbox('crawlCSS', 'crawlCSS', true);
        setCheckbox('storeCSS', 'storeCSS', true);
        setCheckbox('crawlJS', 'crawlJS', true);
        setCheckbox('storeJS', 'storeJS', true);
        setCheckbox('crawlSWF', 'crawlSWF', true);
        setCheckbox('storeSWF', 'storeSWF', true);

        // Crawl Panel - Crawl Behaviour
        setCheckbox('checkLinksOutside', 'checkLinksOutside', true);
        setCheckbox('crawlOutside', 'crawlOutside', true);
        setCheckbox('crawlSubdomains', 'crawlSubdomains', true);
        setCheckbox('followInternalNofollow', 'followInternalNofollow');
        setCheckbox('followExternalNofollow', 'followExternalNofollow');

        // Crawl Panel - Page Links
        setCheckbox('crawlInternal', 'crawlInternal', true);
        setCheckbox('storeInternal', 'storeInternal', true);
        setCheckbox('crawlExternal', 'crawlExternal', true);
        setCheckbox('storeExternal', 'storeExternal', true);
        setCheckbox('crawlCanonicals', 'crawlCanonicals', true);
        setCheckbox('storeCanonicals', 'storeCanonicals', true);
        setCheckbox('crawlPagination', 'crawlPagination');
        setCheckbox('storePagination', 'storePagination', true);
        setCheckbox('crawlHreflang', 'crawlHreflang');
        setCheckbox('storeHreflang', 'storeHreflang', true);

        // Crawl Panel - XML Sitemaps
        setCheckbox('crawlSitemaps', 'crawlSitemaps', true);
        setCheckbox('autoDiscoverSitemaps', 'autoDiscoverSitemaps');
        setCheckbox('crawlTheseSitemaps', 'crawlTheseSitemaps');
        setValue('sitemapUrls', 'sitemapUrls');

        // Extraction Panel
        setCheckbox('extractPageTitle', 'extractPageTitle', true);
        setCheckbox('extractMetaDescription', 'extractMetaDescription', true);
        setCheckbox('extractMetaKeywords', 'extractMetaKeywords', true);
        setCheckbox('extractH1', 'extractH1', true);
        setCheckbox('extractH2', 'extractH2', true);
        setCheckbox('extractIndexability', 'extractIndexability', true);
        setCheckbox('extractWordCount', 'extractWordCount', true);
        setCheckbox('extractReadability', 'extractReadability', true);
        setCheckbox('extractTextCodeRatio', 'extractTextCodeRatio', true);
        setCheckbox('extractHashValue', 'extractHashValue', true);
        setCheckbox('extractPageSize', 'extractPageSize', true);
        setCheckbox('extractForms', 'extractForms', true);
        setCheckbox('extractAccessibility', 'extractAccessibility');
        setCheckbox('extractResponseTime', 'extractResponseTime', true);
        setCheckbox('extractLastModified', 'extractLastModified', true);
        setCheckbox('extractHTTPHeaders', 'extractHTTPHeaders');
        setCheckbox('extractCookies', 'extractCookies');
        setCheckbox('extractMetaRobots', 'extractMetaRobots', true);
        setCheckbox('extractXRobotsTag', 'extractXRobotsTag', true);
        setCheckbox('extractJSONLD', 'extractJSONLD');
        setCheckbox('extractMicrodata', 'extractMicrodata');
        setCheckbox('extractRDFa', 'extractRDFa');
        setCheckbox('extractSchemaValidation', 'extractSchemaValidation');
        setCheckbox('extractGoogleRichResult', 'extractGoogleRichResult');
        setCheckbox('extractCaseSensitive', 'extractCaseSensitive');
        setCheckbox('extractStoreHTML', 'extractStoreHTML');
        setCheckbox('extractStoreRenderedHTML', 'extractStoreRenderedHTML');
        setCheckbox('extractStorePDF', 'extractStorePDF');
        setCheckbox('extractPDFProperties', 'extractPDFProperties');
        setCheckbox('extractPDFLinkText', 'extractPDFLinkText');

        // Limits Panel
        setCheckbox('limitCrawlTotal', 'limitCrawlTotal', true);
        setValue('limitCrawlTotalValue', 'limitCrawlTotalValue', '500');
        setCheckbox('limitCrawlDepth', 'limitCrawlDepth', true);
        setValue('limitCrawlDepthValue', 'limitCrawlDepthValue', '0');
        setCheckbox('limitUrlsPerDepth', 'limitUrlsPerDepth');
        setValue('limitUrlsPerDepthValue', 'limitUrlsPerDepthValue', '1000');
        setCheckbox('limitMaxFolderDepth', 'limitMaxFolderDepth');
        setValue('limitMaxFolderDepthValue', 'limitMaxFolderDepthValue', '5');
        setCheckbox('limitQueryStrings', 'limitQueryStrings');
        setValue('limitQueryStringsValue', 'limitQueryStringsValue', '5');
        setCheckbox('limitCrawlPerSubdomain', 'limitCrawlPerSubdomain');
        setValue('limitCrawlPerSubdomainValue', 'limitCrawlPerSubdomainValue', '1000');
        setValue('limitMaxRedirects', 'limitMaxRedirects', '10');
        setValue('limitMaxUrlLength', 'limitMaxUrlLength', '10000');
        setValue('limitMaxLinksPerUrl', 'limitMaxLinksPerUrl', '10000');
        setValue('limitMaxPageSize', 'limitMaxPageSize', '50000');

        // Advanced Panel
        setValue('advCookieStorage', 'advCookieStorage');
        setCheckbox('advIgnoreNonIndexable', 'advIgnoreNonIndexable', true);
        setCheckbox('advIgnorePaginated', 'advIgnorePaginated', true);
        setCheckbox('advAlwaysFollowRedirects', 'advAlwaysFollowRedirects');
        setCheckbox('advAlwaysFollowCanonicals', 'advAlwaysFollowCanonicals');
        setCheckbox('advRespectNoindex', 'advRespectNoindex');
        setCheckbox('advRespectCanonicals', 'advRespectCanonicals');
        setCheckbox('advRespectNextPrev', 'advRespectNextPrev');
        setCheckbox('advRespectHSTS', 'advRespectHSTS');
        setCheckbox('advRespectMetaRefresh', 'advRespectMetaRefresh');
        setCheckbox('advExtractImagesSrcset', 'advExtractImagesSrcset');
        setCheckbox('advCrawlFragments', 'advCrawlFragments');
        setCheckbox('advHTMLValidation', 'advHTMLValidation', true);
        setCheckbox('advGreenHosting', 'advGreenHosting');
        setCheckbox('advAssumeHTML', 'advAssumeHTML');
        setValue('advResponseTimeout', 'advResponseTimeout', '20');
        setValue('advResponseRetries', 'advResponseRetries', '0');

        // Preferences Panel
        setValue('prefTitlePixelsMin', 'prefTitlePixelsMin', '200');
        setValue('prefTitlePixelsMax', 'prefTitlePixelsMax', '561');
        setValue('prefTitleCharsMin', 'prefTitleCharsMin', '30');
        setValue('prefTitleCharsMax', 'prefTitleCharsMax', '60');
        setValue('prefMetaPixelsMin', 'prefMetaPixelsMin', '400');
        setValue('prefMetaPixelsMax', 'prefMetaPixelsMax', '585');
        setValue('prefMetaCharsMin', 'prefMetaCharsMin', '70');
        setValue('prefMetaCharsMax', 'prefMetaCharsMax', '155');
        setValue('prefHighExternalOutlinks', 'prefHighExternalOutlinks', '10');
        setValue('prefHighInternalOutlinks', 'prefHighInternalOutlinks', '1000');
        setValue('prefHighCrawlDepth', 'prefHighCrawlDepth', '3');
        setValue('prefNonDescriptiveAnchors', 'prefNonDescriptiveAnchors');
        setValue('prefMaxUrlLength', 'prefMaxUrlLength', '115');
        setValue('prefMaxH1Length', 'prefMaxH1Length', '70');
        setValue('prefMaxH2Length', 'prefMaxH2Length', '70');
        setValue('prefMaxImageAltLength', 'prefMaxImageAltLength', '100');
        setValue('prefMaxImageSizeKb', 'prefMaxImageSizeKb', '100');
        setValue('prefLowContentWordCount', 'prefLowContentWordCount', '200');
        setValue('prefSoft404Phrases', 'prefSoft404Phrases');

        // Authentication settings
        setCheckbox('authStandardsEnabled', 'authStandardsEnabled', false);

        // Load auth standards data
        const standardsTbody = document.getElementById('authStandardsTableBody');
        if (standardsTbody && currentSettings.authStandardsData && Array.isArray(currentSettings.authStandardsData)) {
            standardsTbody.innerHTML = '';
            currentSettings.authStandardsData.forEach(entry => {
                addAuthStandardsEntry();
                const rows = standardsTbody.querySelectorAll('tr');
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                    lastRow.querySelector('.auth-url').value = entry.url || '';
                    lastRow.querySelector('.auth-username').value = entry.username || '';
                    lastRow.querySelector('.auth-password').value = entry.password || '';
                    lastRow.querySelector('.auth-type').value = entry.type || 'basic';
                }
            });
            updateAuthStandardsEmptyState();
        }

        // Load auth forms data
        const formsTbody = document.getElementById('authFormsTableBody');
        if (formsTbody && currentSettings.authFormsData && Array.isArray(currentSettings.authFormsData)) {
            formsTbody.innerHTML = '';
            currentSettings.authFormsData.forEach(entry => {
                addAuthFormsEntry();
                const rows = formsTbody.querySelectorAll('tr');
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                    lastRow.querySelector('.auth-login-url').value = entry.loginUrl || '';
                    lastRow.querySelector('.auth-form-username').value = entry.username || '';
                    lastRow.querySelector('.auth-form-password').value = entry.password || '';
                    lastRow.querySelector('.auth-username-field').value = entry.usernameField || '';
                    lastRow.querySelector('.auth-password-field').value = entry.passwordField || '';
                    lastRow.querySelector('.auth-submit-selector').value = entry.submitSelector || '';
                }
            });
            updateAuthFormsEmptyState();
        }

        // Include/Exclude patterns
        setValue('includePatterns', 'includePatterns');
        setValue('excludePatterns', 'excludePatterns');

        if (window.GA4Config && typeof window.GA4Config.loadFromSettings === 'function') {
            window.GA4Config.loadFromSettings(currentSettings);
        }
    }
}

function saveCrawlConfig() {
    // Collect values from config modal
    const maxThreads = parseInt(document.getElementById('configMaxThreads')?.value) || 5;
    const limitUrlsPerSecond = document.getElementById('configLimitUrls')?.checked || false;
    const maxUrlsPerSec = parseInt(document.getElementById('configMaxUrlsPerSec')?.value) || 2;
    const crawlDelay = parseFloat(document.getElementById('configCrawlDelay')?.value) || 0.5;
    const respectCrawlDelay = document.getElementById('configRespectCrawlDelay')?.checked !== false;
    const timeout = parseInt(document.getElementById('configTimeout')?.value) || 10;
    const retries = parseInt(document.getElementById('configRetries')?.value) || 3;
    const followRedirects = document.getElementById('configFollowRedirects')?.checked !== false;
    const crawlExternalLinks = document.getElementById('configCrawlExternalLinks')?.checked || false;
    const maxDepth = parseInt(document.getElementById('configMaxDepth')?.value) || 3;
    const maxUrls = parseInt(document.getElementById('configMaxUrls')?.value) || 5000000;
    const maxFileSize = parseInt(document.getElementById('configMaxFileSize')?.value) || 50;
    const userAgent = document.getElementById('configHttpUA')?.value || 'WailingNewt/1.0 (Web Crawler)';
    const robotsUserAgent = document.getElementById('configRobotsUA')?.value || 'WailingNewt';

    // Robots.txt settings
    const robotsMode = document.getElementById('robotsMode')?.value || 'respect';
    const respectRobotsTxt = robotsMode === 'respect';
    const showInternalBlocked = document.getElementById('showInternalBlocked')?.checked !== false;
    const showExternalBlocked = document.getElementById('showExternalBlocked')?.checked !== false;

    // Collect JavaScript rendering settings
    const enableJavaScript = document.getElementById('enableJavaScript')?.checked || false;
    const jsWaitTime = parseFloat(document.getElementById('jsWaitTime')?.value) || 3;
    const jsTimeout = parseInt(document.getElementById('jsTimeout')?.value) || 30;
    const jsBrowser = document.getElementById('jsBrowser')?.value || 'chromium';
    const jsHeadless = document.getElementById('jsHeadless')?.checked !== false; // default true
    const jsUserAgent = document.getElementById('jsUserAgent')?.value || 'WailingNewt/1.0 (Web Crawler with JavaScript)';
    const jsViewportWidth = parseInt(document.getElementById('jsViewportWidth')?.value) || 1920;
    const jsViewportHeight = parseInt(document.getElementById('jsViewportHeight')?.value) || 1080;
    const jsMaxConcurrentPages = parseInt(document.getElementById('jsMaxConcurrentPages')?.value) || 3;

    // Crawl Panel - Resource Links
    const crawlImages = document.getElementById('crawlImages')?.checked !== false;
    const storeImages = document.getElementById('storeImages')?.checked !== false;
    const crawlMedia = document.getElementById('crawlMedia')?.checked || false;
    const storeMedia = document.getElementById('storeMedia')?.checked || false;
    const crawlCSS = document.getElementById('crawlCSS')?.checked !== false;
    const storeCSS = document.getElementById('storeCSS')?.checked !== false;
    const crawlJS = document.getElementById('crawlJS')?.checked !== false;
    const storeJS = document.getElementById('storeJS')?.checked !== false;
    const crawlSWF = document.getElementById('crawlSWF')?.checked !== false;
    const storeSWF = document.getElementById('storeSWF')?.checked !== false;

    // Crawl Panel - Crawl Behaviour
    const checkLinksOutside = document.getElementById('checkLinksOutside')?.checked !== false;
    const crawlOutside = document.getElementById('crawlOutside')?.checked !== false;
    const crawlSubdomains = document.getElementById('crawlSubdomains')?.checked !== false;
    const followInternalNofollow = document.getElementById('followInternalNofollow')?.checked || false;
    const followExternalNofollow = document.getElementById('followExternalNofollow')?.checked || false;

    // Crawl Panel - Page Links
    const crawlInternal = document.getElementById('crawlInternal')?.checked !== false;
    const storeInternal = document.getElementById('storeInternal')?.checked !== false;
    const crawlExternal = document.getElementById('crawlExternal')?.checked !== false;
    const storeExternal = document.getElementById('storeExternal')?.checked !== false;
    const crawlCanonicals = document.getElementById('crawlCanonicals')?.checked !== false;
    const storeCanonicals = document.getElementById('storeCanonicals')?.checked !== false;
    const crawlPagination = document.getElementById('crawlPagination')?.checked || false;
    const storePagination = document.getElementById('storePagination')?.checked !== false;
    const crawlHreflang = document.getElementById('crawlHreflang')?.checked || false;
    const storeHreflang = document.getElementById('storeHreflang')?.checked !== false;

    // Crawl Panel - XML Sitemaps
    const crawlSitemaps = document.getElementById('crawlSitemaps')?.checked !== false;
    const autoDiscoverSitemaps = document.getElementById('autoDiscoverSitemaps')?.checked || false;
    const crawlTheseSitemaps = document.getElementById('crawlTheseSitemaps')?.checked || false;
    const sitemapUrls = document.getElementById('sitemapUrls')?.value || '';

    // Extraction Panel
    const extractPageTitle = document.getElementById('extractPageTitle')?.checked !== false;
    const extractMetaDescription = document.getElementById('extractMetaDescription')?.checked !== false;
    const extractMetaKeywords = document.getElementById('extractMetaKeywords')?.checked !== false;
    const extractH1 = document.getElementById('extractH1')?.checked !== false;
    const extractH2 = document.getElementById('extractH2')?.checked !== false;
    const extractIndexability = document.getElementById('extractIndexability')?.checked !== false;
    const extractWordCount = document.getElementById('extractWordCount')?.checked !== false;
    const extractReadability = document.getElementById('extractReadability')?.checked !== false;
    const extractTextCodeRatio = document.getElementById('extractTextCodeRatio')?.checked !== false;
    const extractHashValue = document.getElementById('extractHashValue')?.checked !== false;
    const extractPageSize = document.getElementById('extractPageSize')?.checked !== false;
    const extractForms = document.getElementById('extractForms')?.checked !== false;
    const extractAccessibility = document.getElementById('extractAccessibility')?.checked || false;
    const extractResponseTime = document.getElementById('extractResponseTime')?.checked !== false;
    const extractLastModified = document.getElementById('extractLastModified')?.checked !== false;
    const extractHTTPHeaders = document.getElementById('extractHTTPHeaders')?.checked || false;
    const extractCookies = document.getElementById('extractCookies')?.checked || false;
    const extractMetaRobots = document.getElementById('extractMetaRobots')?.checked !== false;
    const extractXRobotsTag = document.getElementById('extractXRobotsTag')?.checked !== false;
    const extractJSONLD = document.getElementById('extractJSONLD')?.checked || false;
    const extractMicrodata = document.getElementById('extractMicrodata')?.checked || false;
    const extractRDFa = document.getElementById('extractRDFa')?.checked || false;
    const extractSchemaValidation = document.getElementById('extractSchemaValidation')?.checked || false;
    const extractGoogleRichResult = document.getElementById('extractGoogleRichResult')?.checked || false;
    const extractCaseSensitive = document.getElementById('extractCaseSensitive')?.checked || false;
    const extractStoreHTML = document.getElementById('extractStoreHTML')?.checked || false;
    const extractStoreRenderedHTML = document.getElementById('extractStoreRenderedHTML')?.checked || false;
    const extractStorePDF = document.getElementById('extractStorePDF')?.checked || false;
    const extractPDFProperties = document.getElementById('extractPDFProperties')?.checked || false;
    const extractPDFLinkText = document.getElementById('extractPDFLinkText')?.checked || false;

    // Limits Panel
    const limitCrawlTotal = document.getElementById('limitCrawlTotal')?.checked !== false;
    const limitCrawlTotalValue = parseInt(document.getElementById('limitCrawlTotalValue')?.value) || 500;
    const limitCrawlDepth = document.getElementById('limitCrawlDepth')?.checked !== false;
    const limitCrawlDepthValue = parseInt(document.getElementById('limitCrawlDepthValue')?.value) || 0;
    const limitUrlsPerDepth = document.getElementById('limitUrlsPerDepth')?.checked || false;
    const limitUrlsPerDepthValue = parseInt(document.getElementById('limitUrlsPerDepthValue')?.value) || 1000;
    const limitMaxFolderDepth = document.getElementById('limitMaxFolderDepth')?.checked || false;
    const limitMaxFolderDepthValue = parseInt(document.getElementById('limitMaxFolderDepthValue')?.value) || 5;
    const limitQueryStrings = document.getElementById('limitQueryStrings')?.checked || false;
    const limitQueryStringsValue = parseInt(document.getElementById('limitQueryStringsValue')?.value) || 5;
    const limitCrawlPerSubdomain = document.getElementById('limitCrawlPerSubdomain')?.checked || false;
    const limitCrawlPerSubdomainValue = parseInt(document.getElementById('limitCrawlPerSubdomainValue')?.value) || 1000;
    const limitMaxRedirects = parseInt(document.getElementById('limitMaxRedirects')?.value) || 10;
    const limitMaxUrlLength = parseInt(document.getElementById('limitMaxUrlLength')?.value) || 10000;
    const limitMaxLinksPerUrl = parseInt(document.getElementById('limitMaxLinksPerUrl')?.value) || 10000;
    const limitMaxPageSize = parseInt(document.getElementById('limitMaxPageSize')?.value) || 50000;

    // Advanced Panel
    const advCookieStorage = document.getElementById('advCookieStorage')?.value || 'session';
    const advIgnoreNonIndexable = document.getElementById('advIgnoreNonIndexable')?.checked !== false;
    const advIgnorePaginated = document.getElementById('advIgnorePaginated')?.checked !== false;
    const advAlwaysFollowRedirects = document.getElementById('advAlwaysFollowRedirects')?.checked || false;
    const advAlwaysFollowCanonicals = document.getElementById('advAlwaysFollowCanonicals')?.checked || false;
    const advRespectNoindex = document.getElementById('advRespectNoindex')?.checked || false;
    const advRespectCanonicals = document.getElementById('advRespectCanonicals')?.checked || false;
    const advRespectNextPrev = document.getElementById('advRespectNextPrev')?.checked || false;
    const advRespectHSTS = document.getElementById('advRespectHSTS')?.checked || false;
    const advRespectMetaRefresh = document.getElementById('advRespectMetaRefresh')?.checked || false;
    const advExtractImagesSrcset = document.getElementById('advExtractImagesSrcset')?.checked || false;
    const advCrawlFragments = document.getElementById('advCrawlFragments')?.checked || false;
    const advHTMLValidation = document.getElementById('advHTMLValidation')?.checked !== false;
    const advGreenHosting = document.getElementById('advGreenHosting')?.checked || false;
    const advAssumeHTML = document.getElementById('advAssumeHTML')?.checked || false;
    const advResponseTimeout = parseInt(document.getElementById('advResponseTimeout')?.value) || 20;
    const advResponseRetries = parseInt(document.getElementById('advResponseRetries')?.value) || 0;

    // Preferences Panel
    const prefTitlePixelsMin = parseInt(document.getElementById('prefTitlePixelsMin')?.value) || 200;
    const prefTitlePixelsMax = parseInt(document.getElementById('prefTitlePixelsMax')?.value) || 561;
    const prefTitleCharsMin = parseInt(document.getElementById('prefTitleCharsMin')?.value) || 30;
    const prefTitleCharsMax = parseInt(document.getElementById('prefTitleCharsMax')?.value) || 60;
    const prefMetaPixelsMin = parseInt(document.getElementById('prefMetaPixelsMin')?.value) || 400;
    const prefMetaPixelsMax = parseInt(document.getElementById('prefMetaPixelsMax')?.value) || 585;
    const prefMetaCharsMin = parseInt(document.getElementById('prefMetaCharsMin')?.value) || 70;
    const prefMetaCharsMax = parseInt(document.getElementById('prefMetaCharsMax')?.value) || 155;
    const prefHighExternalOutlinks = parseInt(document.getElementById('prefHighExternalOutlinks')?.value) || 10;
    const prefHighInternalOutlinks = parseInt(document.getElementById('prefHighInternalOutlinks')?.value) || 1000;
    const prefHighCrawlDepth = parseInt(document.getElementById('prefHighCrawlDepth')?.value) || 3;
    const prefNonDescriptiveAnchors = document.getElementById('prefNonDescriptiveAnchors')?.value || '';
    const prefMaxUrlLength = parseInt(document.getElementById('prefMaxUrlLength')?.value) || 115;
    const prefMaxH1Length = parseInt(document.getElementById('prefMaxH1Length')?.value) || 70;
    const prefMaxH2Length = parseInt(document.getElementById('prefMaxH2Length')?.value) || 70;
    const prefMaxImageAltLength = parseInt(document.getElementById('prefMaxImageAltLength')?.value) || 100;
    const prefMaxImageSizeKb = parseInt(document.getElementById('prefMaxImageSizeKb')?.value) || 100;
    const prefLowContentWordCount = parseInt(document.getElementById('prefLowContentWordCount')?.value) || 200;
    const prefSoft404Phrases = document.getElementById('prefSoft404Phrases')?.value || '';

    const ga4Settings = (window.GA4Config && typeof window.GA4Config.collectSettings === 'function')
        ? window.GA4Config.collectSettings()
        : {};

    const backendSettings = {
        // Speed settings - map maxThreads to concurrency
        concurrency: maxThreads,
        crawlDelay: crawlDelay,
        limitUrlsPerSecond: limitUrlsPerSecond,
        maxUrlsPerSecond: maxUrlsPerSec,
        respectCrawlDelay: respectCrawlDelay,

        // Request settings
        timeout: timeout,
        retries: retries,
        followRedirects: followRedirects,
        crawlExternalLinks: crawlExternalLinks,

        // Limits settings
        maxDepth: maxDepth,
        maxUrls: maxUrls,
        maxFileSize: maxFileSize,

        // User-Agent settings
        userAgent: userAgent,
        robotsUserAgent: robotsUserAgent,

        // Robots.txt settings
        respectRobotsTxt: respectRobotsTxt,
        robotsMode: robotsMode,
        showInternalBlocked: showInternalBlocked,
        showExternalBlocked: showExternalBlocked,

        // JavaScript rendering settings
        enableJavaScript: enableJavaScript,
        jsWaitTime: jsWaitTime,
        jsTimeout: jsTimeout,
        jsBrowser: jsBrowser,
        jsHeadless: jsHeadless,
        jsUserAgent: jsUserAgent,
        jsViewportWidth: jsViewportWidth,
        jsViewportHeight: jsViewportHeight,
        jsMaxConcurrentPages: jsMaxConcurrentPages,

        // Crawl Panel - Resource Links
        crawlImages, storeImages, crawlMedia, storeMedia,
        crawlCSS, storeCSS, crawlJS, storeJS, crawlSWF, storeSWF,

        // Crawl Panel - Crawl Behaviour
        checkLinksOutside, crawlOutside, crawlSubdomains,
        followInternalNofollow, followExternalNofollow,

        // Crawl Panel - Page Links
        crawlInternal, storeInternal, crawlExternal, storeExternal,
        crawlCanonicals, storeCanonicals, crawlPagination, storePagination,
        crawlHreflang, storeHreflang,

        // Crawl Panel - XML Sitemaps
        crawlSitemaps, autoDiscoverSitemaps, crawlTheseSitemaps, sitemapUrls,

        // Extraction settings
        extractPageTitle, extractMetaDescription, extractMetaKeywords,
        extractH1, extractH2, extractIndexability, extractWordCount,
        extractReadability, extractTextCodeRatio, extractHashValue,
        extractPageSize, extractForms, extractAccessibility,
        extractResponseTime, extractLastModified, extractHTTPHeaders,
        extractCookies, extractMetaRobots, extractXRobotsTag,
        extractJSONLD, extractMicrodata, extractRDFa,
        extractSchemaValidation, extractGoogleRichResult, extractCaseSensitive,
        extractStoreHTML, extractStoreRenderedHTML,
        extractStorePDF, extractPDFProperties, extractPDFLinkText,

        // Limits settings
        limitCrawlTotal, limitCrawlTotalValue,
        limitCrawlDepth, limitCrawlDepthValue,
        limitUrlsPerDepth, limitUrlsPerDepthValue,
        limitMaxFolderDepth, limitMaxFolderDepthValue,
        limitQueryStrings, limitQueryStringsValue,
        limitCrawlPerSubdomain, limitCrawlPerSubdomainValue,
        limitMaxRedirects, limitMaxUrlLength, limitMaxLinksPerUrl, limitMaxPageSize,

        // Advanced settings
        advCookieStorage, advIgnoreNonIndexable, advIgnorePaginated,
        advAlwaysFollowRedirects, advAlwaysFollowCanonicals,
        advRespectNoindex, advRespectCanonicals, advRespectNextPrev, advRespectHSTS,
        advRespectMetaRefresh, advExtractImagesSrcset, advCrawlFragments,
        advHTMLValidation, advGreenHosting, advAssumeHTML,
        advResponseTimeout, advResponseRetries,

        // Preferences settings
        prefTitlePixelsMin, prefTitlePixelsMax, prefTitleCharsMin, prefTitleCharsMax,
        prefMetaPixelsMin, prefMetaPixelsMax, prefMetaCharsMin, prefMetaCharsMax,
        prefHighExternalOutlinks, prefHighInternalOutlinks, prefHighCrawlDepth,
        prefNonDescriptiveAnchors, prefMaxUrlLength, prefMaxH1Length, prefMaxH2Length,
        prefMaxImageAltLength, prefMaxImageSizeKb, prefLowContentWordCount, prefSoft404Phrases,

        // HTTP Headers
        httpHeaders: getEnabledHttpHeaders(),

        // Content Area settings
        contentArea: getContentAreaConfig(),

        // Authentication settings
        authStandardsEnabled: document.getElementById('authStandardsEnabled')?.checked || false,
        authStandardsData: collectAuthStandardsData(),
        authFormsData: collectAuthFormsData(),

        // Include/Exclude patterns
        includePatterns: document.getElementById('includePatterns')?.value || '',
        excludePatterns: document.getElementById('excludePatterns')?.value || '',

        // GA4 settings
        ...ga4Settings
    };

    // Save HTTP headers and content area separately
    saveHttpHeaders();
    saveContentAreaConfig();

    // Also keep in currentSettings for UI consistency
    // Update currentSettings if it exists
    if (typeof currentSettings !== 'undefined') {
        // Map UI names to internal names if necessary
        const configValues = {
            ...backendSettings,
            maxThreads: maxThreads // Ensure UI name is preserved
        };

        Object.assign(currentSettings, configValues);

        // Save to localStorage
        try {
            localStorage.setItem('wailingnewt_settings', JSON.stringify(currentSettings));
        } catch (e) {
            console.error('Failed to save config to localStorage:', e);
        }
    }

    // Sync to backend with properly mapped field names
    fetch('/api/save_settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendSettings)
    }).then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Crawl config saved', 'success');
            } else {
                console.error('Failed to save config:', data.message || data.error);
            }
        }).catch(err => {
            console.error('Failed to save config:', err);
        });

    closeCrawlConfig();
}

function applyConfigPresetUA() {
    const presets = {
        wailingnewt: { http: 'WailingNewt/1.0 (Web Crawler)', robots: 'WailingNewt' },
        googlebot: { http: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', robots: 'Googlebot' },
        bingbot: { http: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', robots: 'bingbot' },
        chrome: { http: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', robots: 'Chrome' },
        firefox: { http: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', robots: 'Firefox' },
        safari: { http: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15', robots: 'Safari' }
    };

    const select = document.getElementById('configPresetUA');
    const preset = presets[select.value];

    if (preset) {
        document.getElementById('configHttpUA').value = preset.http;
        document.getElementById('configRobotsUA').value = preset.robots;
    }
}

// ========================================
// HTTP HEADERS CONFIGURATION FUNCTIONS
// ========================================

const defaultHttpHeaders = [
    { name: 'User-Agent', value: 'WailingNewt/1.0 (Web Crawler)', enabled: true, readonly: true, linked: true },
    { name: 'Accept', value: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', enabled: true, readonly: false },
    { name: 'Accept-Encoding', value: 'gzip, deflate', enabled: true, readonly: false },
    { name: 'Cache-Control', value: 'no-cache', enabled: true, readonly: false },
    { name: 'Pragma', value: 'no-cache', enabled: true, readonly: false }
];

let httpHeaders = [...defaultHttpHeaders];

function initHttpHeaders() {
    // Load from localStorage
    try {
        const saved = localStorage.getItem('wailingnewt_http_headers');
        if (saved) {
            httpHeaders = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load HTTP headers:', e);
    }
    renderHttpHeaders();
}

function renderHttpHeaders() {
    const container = document.getElementById('httpHeadersList');
    if (!container) return;

    container.innerHTML = httpHeaders.map((header, index) => `
        <div class="http-headers-row" data-index="${index}">
            <div class="http-header-name">
                <input type="text" value="${escapeHtml(header.name)}"
                    ${header.readonly ? 'readonly class="header-input-readonly"' : ''}
                    onchange="updateHttpHeader(${index}, 'name', this.value)">
            </div>
            <div class="http-header-value">
                <input type="text" value="${escapeHtml(header.value)}"
                    ${header.linked ? 'id="httpHeaderUserAgent"' : ''}
                    onchange="updateHttpHeader(${index}, 'value', this.value)">
            </div>
            <div class="http-header-enabled">
                <input type="checkbox" ${header.enabled ? 'checked' : ''}
                    onchange="updateHttpHeader(${index}, 'enabled', this.checked)">
            </div>
            <div class="http-header-actions">
                ${header.linked
            ? '<button class="btn-icon" title="Linked to User-Agent config" disabled>&#x1F517;</button>'
            : `<button class="btn-icon btn-delete" onclick="deleteHttpHeader(${index})" title="Delete">&#x1F5D1;</button>`
        }
            </div>
        </div>
    `).join('');
}

function updateHttpHeader(index, field, value) {
    if (httpHeaders[index]) {
        httpHeaders[index][field] = value;
        // Sync User-Agent with main config if it's the User-Agent header
        if (httpHeaders[index].linked && field === 'value') {
            const configUA = document.getElementById('configHttpUA');
            if (configUA) configUA.value = value;
        }
        saveHttpHeaders();
    }
}

function deleteHttpHeader(index) {
    httpHeaders.splice(index, 1);
    renderHttpHeaders();
    saveHttpHeaders();
}

function addHttpHeader() {
    httpHeaders.push({
        name: 'New-Header',
        value: '',
        enabled: true,
        readonly: false
    });
    renderHttpHeaders();
    saveHttpHeaders();
}

function resetHttpHeaders() {
    httpHeaders = [...defaultHttpHeaders];
    // Sync User-Agent with current config value
    const configUA = document.getElementById('configHttpUA');
    if (configUA) {
        httpHeaders[0].value = configUA.value;
    }
    renderHttpHeaders();
    saveHttpHeaders();
}

function saveHttpHeaders() {
    try {
        localStorage.setItem('wailingnewt_http_headers', JSON.stringify(httpHeaders));
    } catch (e) {
        console.error('Failed to save HTTP headers:', e);
    }
}

function getEnabledHttpHeaders() {
    return httpHeaders
        .filter(h => h.enabled)
        .reduce((acc, h) => {
            acc[h.name] = h.value;
            return acc;
        }, {});
}

// Helper function for HTML escaping
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// CONTENT AREA CONFIGURATION FUNCTIONS
// ========================================

function getContentAreaConfig() {
    const mode = document.querySelector('input[name="contentAreaMode"]:checked')?.value || 'exclude';
    const excludeTags = document.getElementById('contentAreaExcludeTags')?.value || '';
    const excludeClasses = document.getElementById('contentAreaExcludeClasses')?.value || '';
    const excludeIds = document.getElementById('contentAreaExcludeIds')?.value || '';
    const checkAltText = document.getElementById('contentAreaCheckAltText')?.checked || false;

    return {
        mode: mode,
        checkAltText: checkAltText,
        excludeTags: excludeTags.split('\n').map(s => s.trim()).filter(s => s),
        excludeClasses: excludeClasses.split('\n').map(s => s.trim()).filter(s => s),
        excludeIds: excludeIds.split('\n').map(s => s.trim()).filter(s => s)
    };
}

function loadContentAreaConfig() {
    try {
        const saved = localStorage.getItem('wailingnewt_content_area');
        if (saved) {
            const config = JSON.parse(saved);

            // Set mode
            const modeRadio = document.querySelector(`input[name="contentAreaMode"][value="${config.mode}"]`);
            if (modeRadio) modeRadio.checked = true;

            // Set checkboxes and textareas
            const checkAltText = document.getElementById('contentAreaCheckAltText');
            if (checkAltText) checkAltText.checked = config.checkAltText || false;

            const excludeTags = document.getElementById('contentAreaExcludeTags');
            if (excludeTags && config.excludeTags) excludeTags.value = config.excludeTags.join('\n');

            const excludeClasses = document.getElementById('contentAreaExcludeClasses');
            if (excludeClasses && config.excludeClasses) excludeClasses.value = config.excludeClasses.join('\n');

            const excludeIds = document.getElementById('contentAreaExcludeIds');
            if (excludeIds && config.excludeIds) excludeIds.value = config.excludeIds.join('\n');
        }
    } catch (e) {
        console.error('Failed to load content area config:', e);
    }
}

function saveContentAreaConfig() {
    try {
        const config = getContentAreaConfig();
        localStorage.setItem('wailingnewt_content_area', JSON.stringify(config));
    } catch (e) {
        console.error('Failed to save content area config:', e);
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', function () {
    initHttpHeaders();
    loadContentAreaConfig();
});

// ========================================
// ROBOTS.TXT CONFIGURATION FUNCTIONS
// ========================================

// Track selected subdomain for robots.txt editing
let selectedRobotsSubdomain = null;
let robotsSubdomains = [];

// Initialize robots.txt editor event listeners
document.addEventListener('DOMContentLoaded', function () {
    const robotsEditor = document.getElementById('robotsEditorContent');
    if (robotsEditor) {
        // Update line numbers when content changes
        robotsEditor.addEventListener('input', updateRobotsLineNumbers);
        robotsEditor.addEventListener('scroll', syncRobotsScroll);

        // Track cursor position
        robotsEditor.addEventListener('keyup', updateRobotsCursorPosition);
        robotsEditor.addEventListener('click', updateRobotsCursorPosition);

        // Parse robots.txt content when it changes
        robotsEditor.addEventListener('input', debounce(parseRobotsContent, 500));
    }

    // Load saved subdomains
    loadRobotsSubdomains();
});

function updateRobotsLineNumbers() {
    const editor = document.getElementById('robotsEditorContent');
    const lineNumbers = document.getElementById('robotsLineNumbers');
    if (!editor || !lineNumbers) return;

    const lines = editor.value.split('\n').length;
    const numbers = [];
    for (let i = 1; i <= Math.max(lines, 1); i++) {
        numbers.push(i);
    }
    lineNumbers.textContent = numbers.join('\n');
}

function syncRobotsScroll() {
    const editor = document.getElementById('robotsEditorContent');
    const lineNumbers = document.getElementById('robotsLineNumbers');
    if (!editor || !lineNumbers) return;

    lineNumbers.scrollTop = editor.scrollTop;
}

function updateRobotsCursorPosition() {
    const editor = document.getElementById('robotsEditorContent');
    if (!editor) return;

    const text = editor.value.substring(0, editor.selectionStart);
    const lines = text.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    const lnEl = document.getElementById('robotsLn');
    const colEl = document.getElementById('robotsCol');
    if (lnEl) lnEl.textContent = line;
    if (colEl) colEl.textContent = col;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function parseRobotsContent() {
    const editor = document.getElementById('robotsEditorContent');
    const analysisContent = document.getElementById('robotsAnalysisContent');
    if (!editor || !analysisContent) return;

    const content = editor.value.trim();
    if (!content) {
        analysisContent.innerHTML = '<p class="robots-analysis-placeholder">Enter robots.txt content to see analysis</p>';
        return;
    }

    // Parse the content locally
    const analysis = analyzeRobotsContent(content);
    displayRobotsAnalysis(analysis);
}

function analyzeRobotsContent(content) {
    const lines = content.split('\n');
    const userAgents = new Set();
    const disallowRules = [];
    const allowRules = [];
    const sitemaps = [];
    let currentUA = '*';

    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (!line) return;

        const [directive, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();

        switch (directive.toLowerCase()) {
            case 'user-agent':
                currentUA = value;
                userAgents.add(value);
                break;
            case 'disallow':
                if (value) disallowRules.push({ ua: currentUA, path: value });
                break;
            case 'allow':
                if (value) allowRules.push({ ua: currentUA, path: value });
                break;
            case 'sitemap':
                if (value) sitemaps.push(value);
                break;
        }
    });

    return {
        userAgents: Array.from(userAgents),
        disallowRules,
        allowRules,
        sitemaps
    };
}

function displayRobotsAnalysis(analysis) {
    const analysisContent = document.getElementById('robotsAnalysisContent');
    if (!analysisContent) return;

    let html = '';

    // User Agents
    if (analysis.userAgents.length > 0) {
        html += `
            <div class="robots-analysis-section">
                <h5>User Agents (${analysis.userAgents.length})</h5>
                <ul class="robots-analysis-list">
                    ${analysis.userAgents.map(ua => `<li>${escapeHtml(ua)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Disallow Rules
    if (analysis.disallowRules.length > 0) {
        html += `
            <div class="robots-analysis-section">
                <h5>Blocked Paths (${analysis.disallowRules.length})</h5>
                <ul class="robots-analysis-list">
                    ${analysis.disallowRules.slice(0, 10).map(r => `<li style="color: #ef4444;">Disallow: ${escapeHtml(r.path)}</li>`).join('')}
                    ${analysis.disallowRules.length > 10 ? `<li>... and ${analysis.disallowRules.length - 10} more</li>` : ''}
                </ul>
            </div>
        `;
    }

    // Allow Rules
    if (analysis.allowRules.length > 0) {
        html += `
            <div class="robots-analysis-section">
                <h5>Allowed Paths (${analysis.allowRules.length})</h5>
                <ul class="robots-analysis-list">
                    ${analysis.allowRules.slice(0, 10).map(r => `<li style="color: #10b981;">Allow: ${escapeHtml(r.path)}</li>`).join('')}
                    ${analysis.allowRules.length > 10 ? `<li>... and ${analysis.allowRules.length - 10} more</li>` : ''}
                </ul>
            </div>
        `;
    }

    // Sitemaps
    if (analysis.sitemaps.length > 0) {
        html += `
            <div class="robots-analysis-section">
                <h5>Sitemaps (${analysis.sitemaps.length})</h5>
                <ul class="robots-analysis-list">
                    ${analysis.sitemaps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (!html) {
        html = '<p class="robots-analysis-placeholder">No valid directives found</p>';
    }

    analysisContent.innerHTML = html;
}

function loadRobotsSubdomains() {
    fetch('/api/robots/custom/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                robotsSubdomains = data.subdomains || [];
                renderRobotsSubdomainsList();
            }
        })
        .catch(err => console.error('Failed to load robots subdomains:', err));
}

function renderRobotsSubdomainsList() {
    const list = document.getElementById('robotsSubdomainsList');
    if (!list) return;

    if (robotsSubdomains.length === 0) {
        list.innerHTML = '<div style="padding: 15px; color: var(--text-tertiary); text-align: center; font-size: 12px;">No custom robots.txt configured</div>';
        return;
    }

    list.innerHTML = robotsSubdomains.map(subdomain => `
        <div class="robots-subdomain-item ${subdomain === selectedRobotsSubdomain ? 'selected' : ''}"
             onclick="selectRobotsSubdomain('${escapeHtml(subdomain)}')">
            ${escapeHtml(subdomain)}
        </div>
    `).join('');
}

function selectRobotsSubdomain(subdomain) {
    selectedRobotsSubdomain = subdomain;
    renderRobotsSubdomainsList();

    // Enable edit/delete buttons
    document.getElementById('robotsDeleteBtn').disabled = false;
    document.getElementById('robotsEditBtn').disabled = false;

    // Load the robots.txt content for this subdomain
    fetch('/api/robots/custom/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const editor = document.getElementById('robotsEditorContent');
                if (editor) {
                    editor.value = data.content || '';
                    updateRobotsLineNumbers();
                    parseRobotsContent();
                }
            }
        })
        .catch(err => console.error('Failed to load robots content:', err));
}

function addRobotsSubdomain() {
    const subdomain = prompt('Enter subdomain (e.g., www.example.com):');
    if (!subdomain) return;

    // Validate subdomain format
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/.test(subdomain)) {
        showNotification('Invalid subdomain format', 'error');
        return;
    }

    // Add to list and save empty content
    fetch('/api/robots/custom/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, content: '' })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                robotsSubdomains.push(subdomain);
                selectedRobotsSubdomain = subdomain;
                renderRobotsSubdomainsList();

                // Clear editor for new subdomain
                const editor = document.getElementById('robotsEditorContent');
                if (editor) {
                    editor.value = '';
                    updateRobotsLineNumbers();
                }

                document.getElementById('robotsDeleteBtn').disabled = false;
                document.getElementById('robotsEditBtn').disabled = false;

                showNotification(`Added ${subdomain}`, 'success');
            } else {
                showNotification(data.error || 'Failed to add subdomain', 'error');
            }
        })
        .catch(err => {
            console.error('Failed to add subdomain:', err);
            showNotification('Failed to add subdomain', 'error');
        });
}

function editRobotsSubdomain() {
    if (!selectedRobotsSubdomain) return;

    const newSubdomain = prompt('Edit subdomain:', selectedRobotsSubdomain);
    if (!newSubdomain || newSubdomain === selectedRobotsSubdomain) return;

    // Delete old, add new with same content
    const editor = document.getElementById('robotsEditorContent');
    const content = editor ? editor.value : '';

    fetch('/api/robots/custom/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: selectedRobotsSubdomain })
    })
        .then(() => {
            return fetch('/api/robots/custom/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subdomain: newSubdomain, content })
            });
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const index = robotsSubdomains.indexOf(selectedRobotsSubdomain);
                if (index > -1) {
                    robotsSubdomains[index] = newSubdomain;
                }
                selectedRobotsSubdomain = newSubdomain;
                renderRobotsSubdomainsList();
                showNotification('Subdomain updated', 'success');
            }
        })
        .catch(err => console.error('Failed to edit subdomain:', err));
}

function deleteRobotsSubdomain() {
    if (!selectedRobotsSubdomain) return;

    if (!confirm(`Delete custom robots.txt for ${selectedRobotsSubdomain}?`)) return;

    fetch('/api/robots/custom/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: selectedRobotsSubdomain })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                robotsSubdomains = robotsSubdomains.filter(s => s !== selectedRobotsSubdomain);
                selectedRobotsSubdomain = null;
                renderRobotsSubdomainsList();

                // Clear editor
                const editor = document.getElementById('robotsEditorContent');
                if (editor) {
                    editor.value = '';
                    updateRobotsLineNumbers();
                }

                // Clear analysis
                const analysisContent = document.getElementById('robotsAnalysisContent');
                if (analysisContent) {
                    analysisContent.innerHTML = '<p class="robots-analysis-placeholder">Select a subdomain or add content to see analysis</p>';
                }

                document.getElementById('robotsDeleteBtn').disabled = true;
                document.getElementById('robotsEditBtn').disabled = true;

                showNotification('Subdomain deleted', 'success');
            }
        })
        .catch(err => console.error('Failed to delete subdomain:', err));
}

function downloadRobotsTxt() {
    const urlInput = document.getElementById('urlInput');
    let baseUrl = urlInput ? urlInput.value.trim() : '';

    if (!baseUrl) {
        baseUrl = prompt('Enter website URL to download robots.txt from:');
        if (!baseUrl) return;
    }

    // Ensure URL has protocol
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'https://' + baseUrl;
    }

    fetch('/api/robots/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: baseUrl })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const editor = document.getElementById('robotsEditorContent');
                if (editor) {
                    editor.value = data.content || '';
                    updateRobotsLineNumbers();
                    parseRobotsContent();
                }
                showNotification('robots.txt downloaded', 'success');
            } else {
                showNotification(data.error || 'Failed to download robots.txt', 'error');
            }
        })
        .catch(err => {
            console.error('Failed to download robots.txt:', err);
            showNotification('Failed to download robots.txt', 'error');
        });
}

function clearRobotsEditor() {
    const editor = document.getElementById('robotsEditorContent');
    if (editor) {
        editor.value = '';
        updateRobotsLineNumbers();
    }

    const analysisContent = document.getElementById('robotsAnalysisContent');
    if (analysisContent) {
        analysisContent.innerHTML = '<p class="robots-analysis-placeholder">Enter robots.txt content to see analysis</p>';
    }
}

function testRobotsPath() {
    const pathInput = document.getElementById('robotsTestPath');
    const resultDiv = document.getElementById('robotsTestResult');
    const editor = document.getElementById('robotsEditorContent');

    if (!pathInput || !resultDiv) return;

    const path = pathInput.value.trim();
    if (!path) {
        showNotification('Please enter a path to test', 'warning');
        return;
    }

    const content = editor ? editor.value : '';

    fetch('/api/robots/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path,
            content,
            user_agent: '*'
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const result = data.data;
                if (result.allowed) {
                    resultDiv.className = 'robots-test-result allowed';
                    resultDiv.innerHTML = `<strong>ALLOWED</strong> - Path "${escapeHtml(path)}" is allowed for crawling.<br><small>${result.reason || ''}</small>`;
                } else {
                    resultDiv.className = 'robots-test-result blocked';
                    resultDiv.innerHTML = `<strong>BLOCKED</strong> - Path "${escapeHtml(path)}" is blocked by robots.txt.<br><small>${result.matched_rule || ''}</small>`;
                }
            } else {
                resultDiv.className = 'robots-test-result';
                resultDiv.innerHTML = `Error: ${data.error || 'Unknown error'}`;
            }
        })
        .catch(err => {
            console.error('Failed to test path:', err);
            resultDiv.className = 'robots-test-result';
            resultDiv.innerHTML = 'Error testing path';
        });
}

// Save robots.txt content when switching subdomains or closing modal
function saveCurrentRobotsContent() {
    if (!selectedRobotsSubdomain) return;

    const editor = document.getElementById('robotsEditorContent');
    if (!editor) return;

    fetch('/api/robots/custom/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            subdomain: selectedRobotsSubdomain,
            content: editor.value
        })
    })
        .catch(err => console.error('Failed to save robots content:', err));
}

// Helper function to escape HTML (if not already defined)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// AUTHENTICATION PANEL FUNCTIONS
// ==========================================

// Storage for authentication data
let authStandardsData = [];
let authFormsData = [];

// Standards Based Authentication Functions
function addAuthStandardsEntry() {
    const tbody = document.getElementById('authStandardsTableBody');
    const emptyState = document.getElementById('authStandardsEmpty');

    if (emptyState) emptyState.style.display = 'none';

    const row = document.createElement('tr');
    const id = Date.now();
    row.id = `auth-standards-row-${id}`;
    row.innerHTML = `
        <td><input type="text" placeholder="https://example.com" class="auth-url" /></td>
        <td><input type="text" placeholder="username" class="auth-username" /></td>
        <td><input type="password" placeholder="password" class="auth-password" /></td>
        <td>
            <select class="auth-type">
                <option value="basic">Basic</option>
                <option value="digest">Digest</option>
            </select>
        </td>
        <td><button class="auth-delete-btn" onclick="removeAuthStandardsEntry('${id}')">✕</button></td>
    `;
    tbody.appendChild(row);
    updateAuthStandardsEmptyState();
}

function removeAuthStandardsEntry(id) {
    const row = document.getElementById(`auth-standards-row-${id}`);
    if (row) row.remove();
    updateAuthStandardsEmptyState();
}

function deleteAllAuthStandards() {
    if (!confirm('Are you sure you want to delete all standards-based authentication entries?')) return;

    const tbody = document.getElementById('authStandardsTableBody');
    if (tbody) tbody.innerHTML = '';
    updateAuthStandardsEmptyState();
}

function updateAuthStandardsEmptyState() {
    const tbody = document.getElementById('authStandardsTableBody');
    const emptyState = document.getElementById('authStandardsEmpty');

    if (emptyState) {
        emptyState.style.display = tbody && tbody.children.length > 0 ? 'none' : 'block';
    }
}

function collectAuthStandardsData() {
    const rows = document.querySelectorAll('#authStandardsTableBody tr');
    const data = [];

    rows.forEach(row => {
        const url = row.querySelector('.auth-url')?.value || '';
        const username = row.querySelector('.auth-username')?.value || '';
        const password = row.querySelector('.auth-password')?.value || '';
        const type = row.querySelector('.auth-type')?.value || 'basic';

        if (url.trim()) {
            data.push({ url, username, password, type });
        }
    });

    return data;
}

// Forms Based Authentication Functions
function addAuthFormsEntry() {
    const tbody = document.getElementById('authFormsTableBody');
    const emptyState = document.getElementById('authFormsEmpty');

    if (emptyState) emptyState.style.display = 'none';

    const row = document.createElement('tr');
    const id = Date.now();
    row.id = `auth-forms-row-${id}`;
    row.innerHTML = `
        <td><input type="text" placeholder="https://example.com/login" class="auth-login-url" /></td>
        <td><input type="text" placeholder="username" class="auth-form-username" /></td>
        <td><input type="password" placeholder="password" class="auth-form-password" /></td>
        <td><input type="text" placeholder="#username" class="auth-username-field" /></td>
        <td><input type="text" placeholder="#password" class="auth-password-field" /></td>
        <td><input type="text" placeholder="button[type='submit']" class="auth-submit-selector" /></td>
        <td><button class="auth-delete-btn" onclick="removeAuthFormsEntry('${id}')">✕</button></td>
    `;
    tbody.appendChild(row);
    updateAuthFormsEmptyState();
}

function removeAuthFormsEntry(id) {
    const row = document.getElementById(`auth-forms-row-${id}`);
    if (row) row.remove();
    updateAuthFormsEmptyState();
}

function deleteAllAuthForms() {
    if (!confirm('Are you sure you want to delete all form-based authentication entries?')) return;

    const tbody = document.getElementById('authFormsTableBody');
    if (tbody) tbody.innerHTML = '';
    updateAuthFormsEmptyState();
}

function updateAuthFormsEmptyState() {
    const tbody = document.getElementById('authFormsTableBody');
    const emptyState = document.getElementById('authFormsEmpty');

    if (emptyState) {
        emptyState.style.display = tbody && tbody.children.length > 0 ? 'none' : 'block';
    }
}

function collectAuthFormsData() {
    const rows = document.querySelectorAll('#authFormsTableBody tr');
    const data = [];

    rows.forEach(row => {
        const loginUrl = row.querySelector('.auth-login-url')?.value || '';
        const username = row.querySelector('.auth-form-username')?.value || '';
        const password = row.querySelector('.auth-form-password')?.value || '';
        const usernameField = row.querySelector('.auth-username-field')?.value || '';
        const passwordField = row.querySelector('.auth-password-field')?.value || '';
        const submitSelector = row.querySelector('.auth-submit-selector')?.value || '';

        if (loginUrl.trim()) {
            data.push({ loginUrl, username, password, usernameField, passwordField, submitSelector });
        }
    });

    return data;
}

// Profile Functions
async function exportAuthProfile() {
    const authStandardsEnabled = document.getElementById('authStandardsEnabled')?.checked || false;
    const standardsData = collectAuthStandardsData();
    const formsData = collectAuthFormsData();

    try {
        // Encrypt credentials using backend
        const response = await fetch('/api/encrypt_auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authStandardsData: standardsData,
                authFormsData: formsData
            })
        });

        const result = await response.json();

        let exportData;
        if (result.success) {
            exportData = {
                authStandardsData: result.data.authStandardsData,
                authFormsData: result.data.authFormsData
            };
        } else {
            // Fallback to unencrypted if encryption fails
            console.warn('Encryption failed, exporting unencrypted:', result.error);
            exportData = {
                authStandardsData: standardsData,
                authFormsData: formsData
            };
        }

        const profile = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            encrypted: result.success,
            authStandardsEnabled,
            ...exportData
        };

        const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `auth-profile-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('Authentication profile exported successfully!');
    } catch (err) {
        console.error('Export error:', err);
        alert('Error exporting profile. Please try again.');
    }
}

function importAuthProfile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                let profile = JSON.parse(e.target.result);

                // Validate profile structure
                if (!profile.version) {
                    throw new Error('Invalid profile format');
                }

                // Decrypt if the profile is encrypted
                if (profile.encrypted) {
                    try {
                        const response = await fetch('/api/decrypt_auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                authStandardsData: profile.authStandardsData,
                                authFormsData: profile.authFormsData
                            })
                        });

                        const result = await response.json();
                        if (result.success) {
                            profile.authStandardsData = result.data.authStandardsData;
                            profile.authFormsData = result.data.authFormsData;
                        } else {
                            console.warn('Decryption failed:', result.error);
                        }
                    } catch (decryptErr) {
                        console.warn('Could not decrypt profile:', decryptErr);
                    }
                }

                // Apply standards based settings
                const enabledCheckbox = document.getElementById('authStandardsEnabled');
                if (enabledCheckbox && profile.authStandardsEnabled !== undefined) {
                    enabledCheckbox.checked = profile.authStandardsEnabled;
                }

                // Clear and repopulate standards data
                const standardsTbody = document.getElementById('authStandardsTableBody');
                if (standardsTbody) {
                    standardsTbody.innerHTML = '';
                    if (profile.authStandardsData && Array.isArray(profile.authStandardsData)) {
                        profile.authStandardsData.forEach(entry => {
                            addAuthStandardsEntry();
                            const rows = standardsTbody.querySelectorAll('tr');
                            const lastRow = rows[rows.length - 1];
                            if (lastRow) {
                                lastRow.querySelector('.auth-url').value = entry.url || '';
                                lastRow.querySelector('.auth-username').value = entry.username || '';
                                lastRow.querySelector('.auth-password').value = entry.password || '';
                                lastRow.querySelector('.auth-type').value = entry.type || 'basic';
                            }
                        });
                    }
                }
                updateAuthStandardsEmptyState();

                // Clear and repopulate forms data
                const formsTbody = document.getElementById('authFormsTableBody');
                if (formsTbody) {
                    formsTbody.innerHTML = '';
                    if (profile.authFormsData && Array.isArray(profile.authFormsData)) {
                        profile.authFormsData.forEach(entry => {
                            addAuthFormsEntry();
                            const rows = formsTbody.querySelectorAll('tr');
                            const lastRow = rows[rows.length - 1];
                            if (lastRow) {
                                lastRow.querySelector('.auth-login-url').value = entry.loginUrl || '';
                                lastRow.querySelector('.auth-form-username').value = entry.username || '';
                                lastRow.querySelector('.auth-form-password').value = entry.password || '';
                                lastRow.querySelector('.auth-username-field').value = entry.usernameField || '';
                                lastRow.querySelector('.auth-password-field').value = entry.passwordField || '';
                                lastRow.querySelector('.auth-submit-selector').value = entry.submitSelector || '';
                            }
                        });
                    }
                }
                updateAuthFormsEmptyState();

                alert('Authentication profile imported successfully!');
            } catch (err) {
                console.error('Failed to import profile:', err);
                alert('Failed to import profile. Please ensure the file is a valid authentication profile.');
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

function setAuthAsDefault() {
    const authStandardsEnabled = document.getElementById('authStandardsEnabled')?.checked || false;
    const standardsData = collectAuthStandardsData();
    const formsData = collectAuthFormsData();

    const profile = {
        authStandardsEnabled,
        authStandardsData: standardsData,
        authFormsData: formsData
    };

    localStorage.setItem('authDefaultProfile', JSON.stringify(profile));
    alert('Current authentication configuration set as default.');
}

function clearAuthDefault() {
    if (!confirm('Are you sure you want to clear the default authentication configuration?')) return;

    localStorage.removeItem('authDefaultProfile');
    alert('Default authentication configuration cleared.');
}

function loadAuthDefaultProfile() {
    const saved = localStorage.getItem('authDefaultProfile');
    if (!saved) return;

    try {
        const profile = JSON.parse(saved);

        // Apply to UI if on auth panels
        const enabledCheckbox = document.getElementById('authStandardsEnabled');
        if (enabledCheckbox && profile.authStandardsEnabled !== undefined) {
            enabledCheckbox.checked = profile.authStandardsEnabled;
        }

        // Load standards data
        if (profile.authStandardsData && Array.isArray(profile.authStandardsData)) {
            const standardsTbody = document.getElementById('authStandardsTableBody');
            if (standardsTbody) {
                standardsTbody.innerHTML = '';
                profile.authStandardsData.forEach(entry => {
                    addAuthStandardsEntry();
                    const rows = standardsTbody.querySelectorAll('tr');
                    const lastRow = rows[rows.length - 1];
                    if (lastRow) {
                        lastRow.querySelector('.auth-url').value = entry.url || '';
                        lastRow.querySelector('.auth-username').value = entry.username || '';
                        lastRow.querySelector('.auth-password').value = entry.password || '';
                        lastRow.querySelector('.auth-type').value = entry.type || 'basic';
                    }
                });
            }
            updateAuthStandardsEmptyState();
        }

        // Load forms data
        if (profile.authFormsData && Array.isArray(profile.authFormsData)) {
            const formsTbody = document.getElementById('authFormsTableBody');
            if (formsTbody) {
                formsTbody.innerHTML = '';
                profile.authFormsData.forEach(entry => {
                    addAuthFormsEntry();
                    const rows = formsTbody.querySelectorAll('tr');
                    const lastRow = rows[rows.length - 1];
                    if (lastRow) {
                        lastRow.querySelector('.auth-login-url').value = entry.loginUrl || '';
                        lastRow.querySelector('.auth-form-username').value = entry.username || '';
                        lastRow.querySelector('.auth-form-password').value = entry.password || '';
                        lastRow.querySelector('.auth-username-field').value = entry.usernameField || '';
                        lastRow.querySelector('.auth-password-field').value = entry.passwordField || '';
                        lastRow.querySelector('.auth-submit-selector').value = entry.submitSelector || '';
                    }
                });
            }
            updateAuthFormsEmptyState();
        }
    } catch (err) {
        console.error('Failed to load default auth profile:', err);
    }
}

// ==========================================
// INCLUDE/EXCLUDE PATTERNS FUNCTIONS
// ==========================================

function testIncludeUrl() {
    const testUrl = document.getElementById('includeTestUrl')?.value || '';
    const encodedUrlEl = document.getElementById('includeEncodedUrl');
    const resultDiv = document.getElementById('includeTestResult');
    const patternsText = document.getElementById('includePatterns')?.value || '';

    // Update encoded URL
    if (encodedUrlEl) {
        try {
            encodedUrlEl.value = testUrl ? encodeURI(testUrl) : '';
        } catch (e) {
            encodedUrlEl.value = testUrl;
        }
    }

    // Get patterns
    const patterns = patternsText.split('\n')
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('#'));

    if (!resultDiv) return;

    // No patterns configured
    if (patterns.length === 0) {
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>ℹ️ Info</strong><br>
                No Includes configured
            </div>
        `;
        return;
    }

    // No test URL
    if (!testUrl) {
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>ℹ️ Info</strong><br>
                Enter a URL to test against ${patterns.length} pattern(s)
            </div>
        `;
        return;
    }

    // Test URL against patterns
    let matchedPattern = null;
    for (const pattern of patterns) {
        try {
            const regex = new RegExp(pattern);
            if (regex.test(testUrl)) {
                matchedPattern = pattern;
                break;
            }
        } catch (e) {
            // Invalid regex, try as literal match
            if (testUrl.includes(pattern)) {
                matchedPattern = pattern;
                break;
            }
        }
    }

    if (matchedPattern) {
        resultDiv.innerHTML = `
            <div class="alert alert-success">
                <strong>✓ Match</strong><br>
                URL matches pattern: <code>${escapeHtml(matchedPattern)}</code>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="alert alert-warning">
                <strong>✗ No Match</strong><br>
                URL does not match any of the ${patterns.length} configured pattern(s)
            </div>
        `;
    }
}

function testExcludeUrl() {
    const testUrl = document.getElementById('excludeTestUrl')?.value || '';
    const encodedUrlEl = document.getElementById('excludeEncodedUrl');
    const resultDiv = document.getElementById('excludeTestResult');
    const patternsText = document.getElementById('excludePatterns')?.value || '';

    // Update encoded URL
    if (encodedUrlEl) {
        try {
            encodedUrlEl.value = testUrl ? encodeURI(testUrl) : '';
        } catch (e) {
            encodedUrlEl.value = testUrl;
        }
    }

    // Get patterns
    const patterns = patternsText.split('\n')
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('#'));

    if (!resultDiv) return;

    // No patterns configured
    if (patterns.length === 0) {
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>ℹ️ Info</strong><br>
                No Excludes configured
            </div>
        `;
        return;
    }

    // No test URL
    if (!testUrl) {
        resultDiv.innerHTML = `
            <div class="alert alert-info">
                <strong>ℹ️ Info</strong><br>
                Enter a URL to test against ${patterns.length} pattern(s)
            </div>
        `;
        return;
    }

    // Test URL against patterns
    let matchedPattern = null;
    for (const pattern of patterns) {
        try {
            const regex = new RegExp(pattern);
            if (regex.test(testUrl)) {
                matchedPattern = pattern;
                break;
            }
        } catch (e) {
            // Invalid regex, try as literal match
            if (testUrl.includes(pattern)) {
                matchedPattern = pattern;
                break;
            }
        }
    }

    if (matchedPattern) {
        resultDiv.innerHTML = `
            <div class="alert alert-warning">
                <strong>✗ Excluded</strong><br>
                URL will be excluded by pattern: <code>${escapeHtml(matchedPattern)}</code>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="alert alert-success">
                <strong>✓ Not Excluded</strong><br>
                URL does not match any exclusion patterns
            </div>
        `;
    }
}

