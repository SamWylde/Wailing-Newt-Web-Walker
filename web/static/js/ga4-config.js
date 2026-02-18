
(function () {
    const fallbackCatalog = {
        metrics: [
            { id: 'sessions', label: 'Sessions', group: 'Session', required: true, defaultSelected: true },
            { id: 'screenPageViews', label: 'Screen/Page Views', group: 'Page / Screen', defaultSelected: true },
            { id: 'engagedSessions', label: 'Engaged Sessions', group: 'Session', defaultSelected: true },
            { id: 'engagementRate', label: 'Engagement Rate', group: 'Session', defaultSelected: true },
            { id: 'keyEvents', label: 'Key Events', group: 'Event', defaultSelected: true },
            { id: 'eventCount', label: 'Event Count', group: 'Event', defaultSelected: true },
            { id: 'totalRevenue', label: 'Total Revenue', group: 'Revenue', defaultSelected: true },
            { id: 'addToCarts', label: 'Add To Carts', group: 'Ecommerce' },
            { id: 'checkouts', label: 'Checkouts', group: 'Ecommerce' },
            { id: 'ecommercePurchases', label: 'Ecommerce Purchases', group: 'Ecommerce' }
        ],
        dimensions: [
            { id: 'landingPagePlusQueryString', label: 'Landing Page + Query String', urlMappable: true, defaultSelected: true },
            { id: 'pagePathPlusQueryString', label: 'Page Path + Query String', urlMappable: true },
            { id: 'pagePath', label: 'Page Path', urlMappable: true },
            { id: 'pageLocation', label: 'Page Location', urlMappable: true }
        ],
        filterDimensionTypes: [
            { id: '', label: 'None' },
            { id: 'sessionDefaultChannelGroup', label: 'Session Default Channel Group' },
            { id: 'firstUserDefaultChannelGroup', label: 'First User Default Channel Group' },
            { id: 'country', label: 'Country' },
            { id: 'deviceCategory', label: 'Device Category' },
            { id: 'sessionSourceMedium', label: 'Session Source / Medium' }
        ],
        dateRangePresets: [
            { id: 'last_7_days', label: 'Last 7 days' },
            { id: 'last_30_days', label: 'Last 30 days' },
            { id: 'last_90_days', label: 'Last 90 days' },
            { id: 'custom', label: 'Custom' }
        ],
        defaultMetrics: ['sessions', 'screenPageViews', 'engagedSessions', 'engagementRate', 'keyEvents', 'eventCount', 'totalRevenue'],
        defaultMetricDimensions: {
            sessions: 'landingPagePlusQueryString',
            screenPageViews: 'landingPagePlusQueryString',
            engagedSessions: 'landingPagePlusQueryString',
            engagementRate: 'landingPagePlusQueryString',
            keyEvents: 'landingPagePlusQueryString',
            eventCount: 'landingPagePlusQueryString',
            totalRevenue: 'landingPagePlusQueryString',
            addToCarts: 'landingPagePlusQueryString',
            checkouts: 'landingPagePlusQueryString',
            ecommercePurchases: 'landingPagePlusQueryString'
        }
    };

    const metricAliasToInternal = {
        sessions: 'ga4_sessions',
        screenPageViews: 'ga4_screen_page_views',
        engagedSessions: 'ga4_engaged_sessions',
        engagementRate: 'ga4_engagement_rate',
        keyEvents: 'ga4_key_events',
        eventCount: 'ga4_event_count',
        totalRevenue: 'ga4_total_revenue'
    };

    const GA4Config = {
        catalog: null,
        accounts: [],
        streamsByProperty: {},
        selectedMetrics: [],
        metricDimensions: {},
        statusSnapshot: {
            last_sync_at: '',
            last_sync_status: '',
            last_sync_error: ''
        },
        setupSnapshot: {
            setup_required: false,
            has_credentials: false,
            credential_source: 'none',
            suggested_redirect_uri: '',
            config_path: 'ga4_oauth.local.json',
            setup_error: '',
            setup_steps: []
        },
        oauthPollTimer: null,
        initialized: false,

        init: async function () {
            if (this.initialized) {
                return;
            }
            this.initialized = true;

            this.bindEvents();
            await this.loadCatalog();
            await this.refreshOAuthStatus(false);
            this.loadFromSettings(this.getCurrentSettings());
        },

        getCurrentSettings: function () {
            if (window.currentSettings && typeof window.currentSettings === 'object') {
                return window.currentSettings;
            }
            if (typeof currentSettings !== 'undefined' && currentSettings && typeof currentSettings === 'object') {
                return currentSettings;
            }
            return {};
        },

        getCrawlState: function () {
            if (window.crawlState && typeof window.crawlState === 'object') {
                return window.crawlState;
            }
            if (typeof crawlState !== 'undefined' && crawlState && typeof crawlState === 'object') {
                return crawlState;
            }
            return { urls: [], stats: {} };
        },

        bindEvents: function () {
            const panel = document.getElementById('config-panel-google-analytics');
            if (!panel) {
                return;
            }

            panel.querySelectorAll('.ga4-subtab-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.switchSubtab(btn.dataset.tab);
                });
            });

            const connectBtn = document.getElementById('ga4ConnectBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', () => this.startOAuth());
            }

            const disconnectBtn = document.getElementById('ga4DisconnectBtn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => this.disconnectOAuth());
            }

            const copyRedirectBtn = document.getElementById('ga4CopyRedirectUriBtn');
            if (copyRedirectBtn) {
                copyRedirectBtn.addEventListener('click', () => this.copyRedirectUri());
            }

            const saveSetupBtn = document.getElementById('ga4SaveSetupBtn');
            if (saveSetupBtn) {
                saveSetupBtn.addEventListener('click', () => this.saveOAuthSetup());
            }

            const accountSelect = document.getElementById('ga4AccountSelect');
            if (accountSelect) {
                accountSelect.addEventListener('change', () => this.handleAccountChanged());
            }

            const propertySelect = document.getElementById('ga4PropertySelect');
            if (propertySelect) {
                propertySelect.addEventListener('change', () => this.handlePropertyChanged());
            }

            const datePreset = document.getElementById('ga4DateRangePreset');
            if (datePreset) {
                datePreset.addEventListener('change', () => this.updateDateRangeMode());
            }

            const limitToggle = document.getElementById('ga4LimitMaxResults');
            if (limitToggle) {
                limitToggle.addEventListener('change', () => this.updateMaxResultsMode());
            }

            const metricsContainer = document.getElementById('ga4MetricsGroups');
            if (metricsContainer) {
                metricsContainer.addEventListener('change', (event) => {
                    const target = event.target;
                    if (!target || !target.matches('input[type="checkbox"][data-ga4-metric]')) {
                        return;
                    }

                    const metricId = target.getAttribute('data-ga4-metric');
                    if (metricId === 'sessions') {
                        target.checked = true;
                        return;
                    }

                    this.selectedMetrics = this.getSelectedMetricsFromUI();
                    this.renderDimensionsTable();
                    const state = this.getCrawlState();
                    this.renderAnalyticsTab(state.urls || [], state.stats || {});
                });
            }

            const dimensionsBody = document.getElementById('ga4DimensionsTableBody');
            if (dimensionsBody) {
                dimensionsBody.addEventListener('change', (event) => {
                    const target = event.target;
                    if (!target || !target.matches('select[data-ga4-metric-dimension]')) {
                        return;
                    }
                    const metric = target.getAttribute('data-ga4-metric-dimension');
                    this.metricDimensions[metric] = target.value;
                });
            }
        },

        switchSubtab: function (tabId) {
            const panel = document.getElementById('config-panel-google-analytics');
            if (!panel) {
                return;
            }

            panel.querySelectorAll('.ga4-subtab-btn').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.tab === tabId);
            });
            panel.querySelectorAll('.ga4-subtab-content').forEach((content) => {
                content.classList.toggle('active', content.dataset.tabContent === tabId);
            });
        },

        loadCatalog: async function () {
            try {
                const response = await fetch('/api/ga4/catalog');
                const payload = await response.json();
                if (payload.success && payload.catalog) {
                    this.catalog = payload.catalog;
                    this.populateDatePresetOptions();
                    this.populateFilterDimensionOptions();
                    return;
                }
            } catch (error) {
                console.warn('Failed to load GA4 catalog, using fallback catalog', error);
            }

            this.catalog = JSON.parse(JSON.stringify(fallbackCatalog));
            this.populateDatePresetOptions();
            this.populateFilterDimensionOptions();
        },

        populateDatePresetOptions: function () {
            const select = document.getElementById('ga4DateRangePreset');
            if (!select || !this.catalog) {
                return;
            }

            select.innerHTML = (this.catalog.dateRangePresets || []).map((preset) => (
                `<option value="${this.escapeAttr(preset.id)}">${this.escapeText(preset.label)}</option>`
            )).join('');
        },

        populateFilterDimensionOptions: function () {
            const select = document.getElementById('ga4FilterDimensionType');
            if (!select || !this.catalog) {
                return;
            }

            select.innerHTML = (this.catalog.filterDimensionTypes || []).map((item) => (
                `<option value="${this.escapeAttr(item.id)}">${this.escapeText(item.label)}</option>`
            )).join('');
        },
        loadFromSettings: function (settings) {
            const source = settings || {};

            this.selectedMetrics = Array.isArray(source.ga4SelectedMetrics)
                ? source.ga4SelectedMetrics.slice()
                : (this.catalog?.defaultMetrics || fallbackCatalog.defaultMetrics).slice();
            if (!this.selectedMetrics.includes('sessions')) {
                this.selectedMetrics.unshift('sessions');
            }
            this.selectedMetrics = [...new Set(this.selectedMetrics.filter(Boolean))];

            this.metricDimensions = Object.assign({}, this.catalog?.defaultMetricDimensions || fallbackCatalog.defaultMetricDimensions);
            if (source.ga4MetricDimensions && typeof source.ga4MetricDimensions === 'object') {
                Object.assign(this.metricDimensions, source.ga4MetricDimensions);
            }

            this.setCheckbox('ga4Enabled', !!source.ga4Enabled);
            this.setCheckbox('ga4MatchTrailingSlash', source.ga4MatchTrailingSlash !== false);
            this.setCheckbox('ga4MatchCase', !!source.ga4MatchCase);
            this.setCheckbox('ga4LimitMaxResults', source.ga4LimitMaxResults !== false);
            this.setCheckbox('ga4CrawlNewUrls', !!source.ga4CrawlNewUrls);

            this.setValue('ga4DateRangePreset', source.ga4DateRangePreset || 'last_30_days');
            this.setValue('ga4DateStart', source.ga4DateStart || '');
            this.setValue('ga4DateEnd', source.ga4DateEnd || '');
            this.setValue('ga4FilterDimensionType', source.ga4FilterDimensionType || '');
            this.setValue('ga4FilterValue', source.ga4FilterValue || '');
            this.setValue('ga4MaxResults', source.ga4MaxResults || 100000);

            this.renderMetricsChecklist();
            this.renderDimensionsTable();
            this.updateDateRangeMode();
            this.updateMaxResultsMode();
            this.applyStatusFromSettings(source);
            this.populateSavedSelections(source);
            const state = this.getCrawlState();
            this.renderAnalyticsTab(state.urls || [], state.stats || {});
        },

        applyStatusFromSettings: function (settings) {
            const status = {
                connected: !!settings.ga4Connected,
                account_id: settings.ga4AccountId || '',
                account_name: settings.ga4AccountName || '',
                property_id: settings.ga4PropertyId || '',
                property_name: settings.ga4PropertyName || '',
                stream_id: settings.ga4DataStreamId || '',
                stream_name: settings.ga4DataStreamName || '',
                last_sync_at: settings.ga4LastSyncAt || '',
                last_sync_status: settings.ga4LastSyncStatus || '',
                last_sync_error: settings.ga4LastSyncError || ''
            };
            this.statusSnapshot = {
                last_sync_at: status.last_sync_at || '',
                last_sync_status: status.last_sync_status || '',
                last_sync_error: status.last_sync_error || ''
            };
            this.updateSetupUI();
            this.updateConnectionUI(status);
            this.updateSyncSummary(status);
        },

        populateSavedSelections: function (settings) {
            const accountSelect = document.getElementById('ga4AccountSelect');
            const propertySelect = document.getElementById('ga4PropertySelect');
            const streamSelect = document.getElementById('ga4StreamSelect');

            if (accountSelect) {
                accountSelect.innerHTML = settings.ga4AccountId
                    ? `<option value="${this.escapeAttr(settings.ga4AccountId)}" selected>${this.escapeText(settings.ga4AccountName || settings.ga4AccountId)}</option>`
                    : '<option value="">Select account...</option>';
            }
            if (propertySelect) {
                propertySelect.innerHTML = settings.ga4PropertyId
                    ? `<option value="${this.escapeAttr(settings.ga4PropertyId)}" selected>${this.escapeText(settings.ga4PropertyName || settings.ga4PropertyId)}</option>`
                    : '<option value="">Select property...</option>';
            }
            if (streamSelect) {
                streamSelect.innerHTML = settings.ga4DataStreamId
                    ? `<option value="${this.escapeAttr(settings.ga4DataStreamId)}" selected>${this.escapeText(settings.ga4DataStreamName || settings.ga4DataStreamId)}</option>`
                    : '<option value="">Select web stream...</option>';
            }
        },

        setCheckbox: function (id, value) {
            const element = document.getElementById(id);
            if (element) {
                element.checked = !!value;
            }
        },

        setValue: function (id, value) {
            const element = document.getElementById(id);
            if (element) {
                element.value = value;
            }
        },

        renderMetricsChecklist: function () {
            const container = document.getElementById('ga4MetricsGroups');
            if (!container || !this.catalog) {
                return;
            }

            const grouped = {};
            (this.catalog.metrics || []).forEach((metric) => {
                const group = metric.group || 'Other';
                if (!grouped[group]) {
                    grouped[group] = [];
                }
                grouped[group].push(metric);
            });

            const html = Object.keys(grouped).sort().map((groupName) => {
                const rows = grouped[groupName].map((metric) => {
                    const checked = this.selectedMetrics.includes(metric.id) || metric.required;
                    const disabled = metric.required ? 'disabled' : '';
                    const requiredLabel = metric.required ? '<span class="ga4-required">Required</span>' : '';
                    return `
                        <label class="ga4-metric-item">
                            <input type="checkbox" data-ga4-metric="${this.escapeAttr(metric.id)}" ${checked ? 'checked' : ''} ${disabled}>
                            <span class="ga4-metric-name">${this.escapeText(metric.label)}</span>
                            ${requiredLabel}
                        </label>
                    `;
                }).join('');

                return `
                    <div class="ga4-metric-group">
                        <h5>${this.escapeText(groupName)}</h5>
                        <div class="ga4-metric-list">${rows}</div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        },

        renderDimensionsTable: function () {
            const body = document.getElementById('ga4DimensionsTableBody');
            if (!body || !this.catalog) {
                return;
            }

            this.selectedMetrics = this.getSelectedMetricsFromUI();
            const dimensions = (this.catalog.dimensions || []).filter((item) => item.urlMappable !== false);

            if (this.selectedMetrics.length === 0) {
                body.innerHTML = '<tr><td colspan="2" class="ga4-empty-row">Select at least one metric.</td></tr>';
                return;
            }

            body.innerHTML = this.selectedMetrics.map((metricId) => {
                const metric = (this.catalog.metrics || []).find((item) => item.id === metricId);
                const label = metric ? metric.label : metricId;
                const selectedDimension = this.metricDimensions[metricId]
                    || this.catalog.defaultMetricDimensions?.[metricId]
                    || dimensions[0]?.id
                    || '';

                this.metricDimensions[metricId] = selectedDimension;

                const options = dimensions.map((dimension) => (
                    `<option value="${this.escapeAttr(dimension.id)}" ${dimension.id === selectedDimension ? 'selected' : ''}>${this.escapeText(dimension.label)}</option>`
                )).join('');

                return `
                    <tr>
                        <td>${this.escapeText(label)}</td>
                        <td>
                            <select data-ga4-metric-dimension="${this.escapeAttr(metricId)}">${options}</select>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        getSelectedMetricsFromUI: function () {
            const selected = Array.from(document.querySelectorAll('#ga4MetricsGroups input[type="checkbox"][data-ga4-metric]:checked'))
                .map((checkbox) => checkbox.getAttribute('data-ga4-metric'))
                .filter(Boolean);

            if (!selected.includes('sessions')) {
                selected.unshift('sessions');
            }
            return [...new Set(selected)];
        },

        updateDateRangeMode: function () {
            const preset = document.getElementById('ga4DateRangePreset')?.value || 'last_30_days';
            const custom = preset === 'custom';
            const startInput = document.getElementById('ga4DateStart');
            const endInput = document.getElementById('ga4DateEnd');

            if (startInput) {
                startInput.disabled = !custom;
            }
            if (endInput) {
                endInput.disabled = !custom;
            }
        },

        updateMaxResultsMode: function () {
            const enabled = document.getElementById('ga4LimitMaxResults')?.checked !== false;
            const input = document.getElementById('ga4MaxResults');
            if (input) {
                input.disabled = !enabled;
            }
        },

        applySetupStatus: function (status) {
            const fallbackRedirect = `${window.location.origin}/api/ga4/oauth/callback`;
            const hasSetupRequired = typeof status?.setup_required === 'boolean'
                ? status.setup_required
                : this.setupSnapshot.setup_required;
            const hasCredentials = typeof status?.has_credentials === 'boolean'
                ? status.has_credentials
                : this.setupSnapshot.has_credentials;
            this.setupSnapshot = {
                setup_required: !!hasSetupRequired,
                has_credentials: !!hasCredentials,
                credential_source: status?.credential_source || this.setupSnapshot.credential_source || 'none',
                suggested_redirect_uri: status?.suggested_redirect_uri || this.setupSnapshot.suggested_redirect_uri || fallbackRedirect,
                config_path: status?.config_path || this.setupSnapshot.config_path || 'ga4_oauth.local.json',
                setup_error: status?.setup_error || this.setupSnapshot.setup_error || '',
                setup_steps: Array.isArray(status?.setup_steps) ? status.setup_steps.slice() : (this.setupSnapshot.setup_steps || [])
            };

            this.updateSetupUI();
        },

        updateSetupUI: function () {
            const setupCard = document.getElementById('ga4SetupCard');
            const redirectInput = document.getElementById('ga4SetupRedirectUri');
            const redirectDisplay = document.getElementById('ga4SetupRedirectUriDisplay');
            const statusEl = document.getElementById('ga4SetupStatusText');
            const pathHint = document.getElementById('ga4SetupPathHint');

            if (setupCard) {
                setupCard.style.display = this.setupSnapshot.setup_required ? 'block' : 'none';
            }

            const redirectUri = this.setupSnapshot.suggested_redirect_uri || `${window.location.origin}/api/ga4/oauth/callback`;
            if (redirectInput) {
                redirectInput.value = redirectUri;
            }
            if (redirectDisplay) {
                redirectDisplay.textContent = redirectUri;
            }

            if (pathHint) {
                pathHint.textContent = `Credentials are saved locally to ${this.setupSnapshot.config_path}.`;
            }

            if (!this.setupSnapshot.setup_required && statusEl) {
                statusEl.textContent = '';
                statusEl.className = 'ga4-setup-status';
            } else if (this.setupSnapshot.setup_required && this.setupSnapshot.setup_error) {
                this.setSetupStatusMessage(this.setupSnapshot.setup_error, 'error');
            }
        },

        setSetupStatusMessage: function (message, level) {
            const statusEl = document.getElementById('ga4SetupStatusText');
            if (!statusEl) {
                return;
            }

            const normalizedLevel = ['success', 'error', 'info'].includes(level) ? level : 'info';
            statusEl.textContent = message || '';
            statusEl.className = `ga4-setup-status ${normalizedLevel}`.trim();
        },

        copyToClipboard: async function (text) {
            const value = String(text || '');
            if (!value) {
                return false;
            }

            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                try {
                    await navigator.clipboard.writeText(value);
                    return true;
                } catch (error) {
                    console.debug('Clipboard API write failed, using fallback copy', error);
                }
            }

            const tempInput = document.createElement('textarea');
            tempInput.value = value;
            tempInput.setAttribute('readonly', 'readonly');
            tempInput.style.position = 'fixed';
            tempInput.style.left = '-9999px';
            document.body.appendChild(tempInput);
            tempInput.select();
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (error) {
                copied = false;
            }
            document.body.removeChild(tempInput);
            return copied;
        },

        copyRedirectUri: async function () {
            const redirectInput = document.getElementById('ga4SetupRedirectUri');
            const value = redirectInput?.value || this.setupSnapshot.suggested_redirect_uri;
            const copied = await this.copyToClipboard(value);
            if (copied) {
                this.setSetupStatusMessage('Redirect URI copied.', 'success');
            } else {
                this.setSetupStatusMessage('Copy failed. Please copy the Redirect URI manually.', 'error');
            }
        },

        saveOAuthSetup: async function () {
            const clientId = document.getElementById('ga4SetupClientId')?.value?.trim() || '';
            const clientSecret = document.getElementById('ga4SetupClientSecret')?.value?.trim() || '';
            const redirectUri = document.getElementById('ga4SetupRedirectUri')?.value?.trim() || '';

            if (!clientId || !clientSecret) {
                this.setSetupStatusMessage('Enter both Client ID and Client Secret to continue.', 'error');
                return;
            }
            if (!redirectUri) {
                this.setSetupStatusMessage('Redirect URI is required.', 'error');
                return;
            }

            this.setSetupStatusMessage('Saving setup...', 'info');
            try {
                const response = await fetch('/api/ga4/oauth/configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri
                    })
                });
                const payload = await response.json();
                this.applySetupStatus(payload);

                if (!payload.success) {
                    this.setSetupStatusMessage(payload.error || 'Could not save setup.', 'error');
                    return;
                }

                const secretInput = document.getElementById('ga4SetupClientSecret');
                if (secretInput) {
                    secretInput.value = '';
                }
                this.setSetupStatusMessage('Setup saved. Opening Google sign-in...', 'success');
                await this.startOAuth({ silent: true });
            } catch (error) {
                console.error('Failed to save GA4 setup', error);
                this.setSetupStatusMessage('Could not save setup. Please try again.', 'error');
            }
        },

        onPanelVisible: async function () {
            const status = await this.refreshOAuthStatus(true);
            if (status?.connected) {
                await this.loadAccountsHierarchy();
            }
        },
        startOAuth: async function (options) {
            const silent = options?.silent || false;
            try {
                const response = await fetch('/api/ga4/oauth/start');
                const payload = await response.json();
                if (!payload.success) {
                    this.applySetupStatus(payload);
                    if (payload.setup_required) {
                        this.switchSubtab('account');
                        this.setSetupStatusMessage(
                            payload.setup_error || 'Complete the one-time setup above, then try sign-in again.',
                            payload.setup_error ? 'error' : 'info'
                        );
                        showNotification('Google sign-in needs one-time setup. Follow the steps in Account Information.', 'info');
                        return;
                    }
                    showNotification(payload.error || 'Failed to start Google sign-in', 'error');
                    return;
                }

                this.applySetupStatus(payload);
                const opened = window.open(payload.auth_url, '_blank');

                if (!opened && !window.electronAPI) {
                    // Regular browser with popups blocked — URL was NOT opened
                    showNotification('Pop-up was blocked. Please allow pop-ups for this site and try again.', 'error');
                    return;
                }

                // In Electron, setWindowOpenHandler opens in default browser (returns null).
                // In regular browser, opened is the new window ref. Either way, URL was opened.
                if (!silent) {
                    showNotification('Complete sign-in in the browser window that just opened.', 'info');
                }

                this.beginOAuthPolling();
            } catch (error) {
                console.error('Failed to start GA4 OAuth', error);
                showNotification('Failed to start Google sign-in', 'error');
            }
        },

        beginOAuthPolling: function () {
            if (this.oauthPollTimer) {
                clearInterval(this.oauthPollTimer);
            }

            let attempts = 0;
            this.oauthPollTimer = setInterval(async () => {
                attempts += 1;
                const status = await this.refreshOAuthStatus(false);
                if (status?.connected) {
                    clearInterval(this.oauthPollTimer);
                    this.oauthPollTimer = null;
                    await this.loadAccountsHierarchy();
                    showNotification('Google Analytics connected', 'success');
                    return;
                }

                if (attempts >= 90) {
                    clearInterval(this.oauthPollTimer);
                    this.oauthPollTimer = null;
                }
            }, 2000);
        },

        refreshOAuthStatus: async function (loadAccountsWhenConnected) {
            try {
                const response = await fetch('/api/ga4/oauth/status');
                const payload = await response.json();
                if (!payload.success) {
                    return null;
                }

                this.statusSnapshot = {
                    last_sync_at: payload.last_sync_at || '',
                    last_sync_status: payload.last_sync_status || '',
                    last_sync_error: payload.last_sync_error || ''
                };
                this.applySetupStatus(payload);
                this.updateConnectionUI(payload);
                this.updateSyncSummary(payload);

                if (loadAccountsWhenConnected && payload.connected) {
                    await this.loadAccountsHierarchy();
                }

                return payload;
            } catch (error) {
                console.warn('Failed to refresh GA4 status', error);
                return null;
            }
        },

        updateConnectionUI: function (status) {
            const badge = document.getElementById('ga4ConnectionBadge');
            const text = status.connected ? 'Connected' : 'Not Connected';
            if (badge) {
                badge.textContent = text;
                badge.classList.toggle('connected', !!status.connected);
                badge.classList.toggle('disconnected', !status.connected);
                badge.dataset.connected = status.connected ? 'true' : 'false';
            }

            const connectBtn = document.getElementById('ga4ConnectBtn');
            const disconnectBtn = document.getElementById('ga4DisconnectBtn');
            const accountSelect = document.getElementById('ga4AccountSelect');
            const propertySelect = document.getElementById('ga4PropertySelect');
            const streamSelect = document.getElementById('ga4StreamSelect');
            const needsSetup = !!this.setupSnapshot.setup_required;
            if (connectBtn) {
                connectBtn.disabled = !!status.connected;
                connectBtn.textContent = needsSetup ? 'Set up and Sign in with Google' : 'Sign in with Google';
            }
            if (disconnectBtn) {
                disconnectBtn.disabled = !status.connected;
            }
            if (accountSelect) {
                accountSelect.disabled = !status.connected;
            }
            if (propertySelect) {
                propertySelect.disabled = !status.connected;
            }
            if (streamSelect) {
                streamSelect.disabled = !status.connected;
            }
        },

        updateSyncSummary: function (status) {
            const lastSyncText = status.last_sync_at || 'Never';
            const syncStatus = status.last_sync_status || 'idle';
            const syncError = status.last_sync_error || '';

            const lastSync = document.getElementById('ga4LastSyncLabel');
            const lastStatus = document.getElementById('ga4LastSyncStatusLabel');
            const lastError = document.getElementById('ga4LastSyncErrorLabel');

            if (lastSync) {
                lastSync.textContent = `Last Sync: ${lastSyncText}`;
            }
            if (lastStatus) {
                lastStatus.textContent = `Status: ${syncStatus}`;
            }
            if (lastError) {
                lastError.textContent = syncError ? `Error: ${syncError}` : '';
            }
        },

        disconnectOAuth: async function () {
            try {
                const response = await fetch('/api/ga4/oauth/disconnect', { method: 'POST' });
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Failed to disconnect Google Analytics', 'error');
                    return;
                }

                this.accounts = [];
                this.streamsByProperty = {};
                this.populateSavedSelections({});
                await this.refreshOAuthStatus(false);
                showNotification('Google Analytics disconnected', 'info');
            } catch (error) {
                console.error('Failed to disconnect GA4', error);
                showNotification('Failed to disconnect Google Analytics', 'error');
            }
        },

        loadAccountsHierarchy: async function () {
            try {
                const response = await fetch('/api/ga4/accounts');
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Failed to load GA4 accounts', 'error');
                    return;
                }

                this.accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
                this.populateAccountSelect();
                this.handleAccountChanged();
            } catch (error) {
                console.error('Failed to load GA4 accounts', error);
            }
        },

        populateAccountSelect: function () {
            const select = document.getElementById('ga4AccountSelect');
            if (!select) {
                return;
            }

            const settings = this.getCurrentSettings();
            const currentValue = select.value || settings.ga4AccountId || '';
            const options = ['<option value="">Select account...</option>']
                .concat(this.accounts.map((account) => (
                    `<option value="${this.escapeAttr(account.id)}">${this.escapeText(account.name || account.id)}</option>`
                )));
            select.innerHTML = options.join('');

            if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
                select.value = currentValue;
            }
        },

        handleAccountChanged: function () {
            const accountId = document.getElementById('ga4AccountSelect')?.value || '';
            const propertySelect = document.getElementById('ga4PropertySelect');
            const streamSelect = document.getElementById('ga4StreamSelect');

            if (!propertySelect || !streamSelect) {
                return;
            }

            const selectedAccount = this.accounts.find((account) => account.id === accountId);
            const properties = selectedAccount?.properties || [];
            const settings = this.getCurrentSettings();
            const savedPropertyId = settings.ga4PropertyId || propertySelect.value || '';

            propertySelect.innerHTML = ['<option value="">Select property...</option>']
                .concat(properties.map((property) => (
                    `<option value="${this.escapeAttr(property.id)}">${this.escapeText(property.name || property.id)}</option>`
                )))
                .join('');

            if (savedPropertyId && Array.from(propertySelect.options).some((option) => option.value === savedPropertyId)) {
                propertySelect.value = savedPropertyId;
            }

            streamSelect.innerHTML = '<option value="">Select web stream...</option>';
            this.handlePropertyChanged();
        },

        handlePropertyChanged: async function () {
            const propertyId = document.getElementById('ga4PropertySelect')?.value || '';
            const streamSelect = document.getElementById('ga4StreamSelect');
            if (!streamSelect) {
                return;
            }

            if (!propertyId) {
                streamSelect.innerHTML = '<option value="">Select web stream...</option>';
                return;
            }

            if (this.streamsByProperty[propertyId]) {
                this.populateStreamSelect(propertyId, this.streamsByProperty[propertyId]);
                return;
            }

            try {
                const response = await fetch(`/api/ga4/properties/${encodeURIComponent(propertyId)}/streams`);
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Failed to load GA4 streams', 'error');
                    return;
                }

                this.streamsByProperty[propertyId] = Array.isArray(payload.streams) ? payload.streams : [];
                this.populateStreamSelect(propertyId, this.streamsByProperty[propertyId]);
            } catch (error) {
                console.error('Failed to load GA4 streams', error);
            }
        },

        populateStreamSelect: function (propertyId, streams) {
            const streamSelect = document.getElementById('ga4StreamSelect');
            if (!streamSelect) {
                return;
            }

            const settings = this.getCurrentSettings();
            const savedStreamId = settings.ga4DataStreamId || streamSelect.value || '';
            streamSelect.innerHTML = ['<option value="">Select web stream...</option>']
                .concat((streams || []).map((stream) => (
                    `<option value="${this.escapeAttr(stream.id)}">${this.escapeText(stream.name || stream.id)}</option>`
                )))
                .join('');

            if (savedStreamId && Array.from(streamSelect.options).some((option) => option.value === savedStreamId)) {
                streamSelect.value = savedStreamId;
            }
        },

        collectSettings: function () {
            this.selectedMetrics = this.getSelectedMetricsFromUI();

            const dimensions = {};
            this.selectedMetrics.forEach((metric) => {
                const select = document.querySelector(`select[data-ga4-metric-dimension="${metric}"]`);
                dimensions[metric] = select?.value
                    || this.metricDimensions[metric]
                    || this.catalog?.defaultMetricDimensions?.[metric]
                    || 'landingPagePlusQueryString';
            });
            this.metricDimensions = dimensions;

            const accountSelect = document.getElementById('ga4AccountSelect');
            const propertySelect = document.getElementById('ga4PropertySelect');
            const streamSelect = document.getElementById('ga4StreamSelect');

            const connectedBadge = document.getElementById('ga4ConnectionBadge');
            const connected = connectedBadge?.dataset.connected === 'true';

            return {
                ga4Enabled: document.getElementById('ga4Enabled')?.checked || false,
                ga4Connected: connected,
                ga4AccountId: accountSelect?.value || '',
                ga4AccountName: accountSelect?.selectedOptions?.[0]?.textContent || '',
                ga4PropertyId: propertySelect?.value || '',
                ga4PropertyName: propertySelect?.selectedOptions?.[0]?.textContent || '',
                ga4DataStreamId: streamSelect?.value || '',
                ga4DataStreamName: streamSelect?.selectedOptions?.[0]?.textContent || '',
                ga4DateRangePreset: document.getElementById('ga4DateRangePreset')?.value || 'last_30_days',
                ga4DateStart: document.getElementById('ga4DateStart')?.value || '',
                ga4DateEnd: document.getElementById('ga4DateEnd')?.value || '',
                ga4SelectedMetrics: this.selectedMetrics,
                ga4MetricDimensions: dimensions,
                ga4FilterDimensionType: document.getElementById('ga4FilterDimensionType')?.value || '',
                ga4FilterValue: document.getElementById('ga4FilterValue')?.value || '',
                ga4MatchTrailingSlash: document.getElementById('ga4MatchTrailingSlash')?.checked !== false,
                ga4MatchCase: document.getElementById('ga4MatchCase')?.checked || false,
                ga4LimitMaxResults: document.getElementById('ga4LimitMaxResults')?.checked !== false,
                ga4MaxResults: parseInt(document.getElementById('ga4MaxResults')?.value, 10) || 100000,
                ga4CrawlNewUrls: document.getElementById('ga4CrawlNewUrls')?.checked || false,
                ga4LastSyncAt: this.statusSnapshot.last_sync_at || '',
                ga4LastSyncStatus: this.statusSnapshot.last_sync_status || '',
                ga4LastSyncError: this.statusSnapshot.last_sync_error || ''
            };
        },
        getMetricValue: function (urlData, metricName) {
            const ga4Metrics = this.getGa4Metrics(urlData);
            if (ga4Metrics && Object.prototype.hasOwnProperty.call(ga4Metrics, metricName)) {
                return ga4Metrics[metricName];
            }

            const internalField = metricAliasToInternal[metricName];
            if (internalField && typeof urlData.analytics === 'object' && urlData.analytics) {
                return urlData.analytics[internalField];
            }

            return undefined;
        },

        getGa4Metrics: function (urlData) {
            if (!urlData || typeof urlData !== 'object') {
                return {};
            }

            if (urlData.ga4 && typeof urlData.ga4.metrics === 'object') {
                return urlData.ga4.metrics;
            }

            if (urlData.analytics && typeof urlData.analytics === 'object' && urlData.analytics.ga4 && typeof urlData.analytics.ga4.metrics === 'object') {
                return urlData.analytics.ga4.metrics;
            }

            return {};
        },

        renderAnalyticsTab: function (urls, stats) {
            const table = document.getElementById('ga4AnalyticsTable');
            const head = document.getElementById('ga4AnalyticsHead');
            const body = document.getElementById('ga4AnalyticsBody');
            const empty = document.getElementById('ga4AnalyticsEmpty');

            if (!table || !head || !body || !empty) {
                return;
            }

            const rows = Array.isArray(urls) ? urls : [];
            const settings = this.getCurrentSettings();
            const selectedMetrics = (settings.ga4SelectedMetrics && settings.ga4SelectedMetrics.length > 0)
                ? settings.ga4SelectedMetrics
                : (this.catalog?.defaultMetrics || fallbackCatalog.defaultMetrics);

            const enriched = rows.filter((row) => {
                const metrics = this.getGa4Metrics(row);
                return metrics && Object.keys(metrics).length > 0;
            });

            const headers = ['Address']
                .concat(selectedMetrics.map((metricId) => this.getMetricLabel(metricId)))
                .concat(['Sync Status']);
            head.innerHTML = `<tr>${headers.map((label) => `<th>${this.escapeText(label)}</th>`).join('')}</tr>`;

            if (enriched.length === 0) {
                body.innerHTML = '';
                table.style.display = 'none';
                empty.style.display = 'block';
            } else {
                table.style.display = 'table';
                empty.style.display = 'none';

                const sorted = enriched.slice().sort((a, b) => {
                    const aSessions = Number(this.getMetricValue(a, 'sessions') || 0);
                    const bSessions = Number(this.getMetricValue(b, 'sessions') || 0);
                    return bSessions - aSessions;
                });

                body.innerHTML = sorted.map((row) => {
                    const ga4Block = row.ga4 || row.analytics?.ga4 || {};
                    const syncStatus = ga4Block.sync_status || '-';

                    const metricCells = selectedMetrics.map((metricId) => {
                        const value = this.getMetricValue(row, metricId);
                        return `<td>${this.formatMetricValue(value)}</td>`;
                    }).join('');

                    return `
                        <tr>
                            <td class="ga4-url-cell">${this.escapeText(row.url || '')}</td>
                            ${metricCells}
                            <td>${this.escapeText(syncStatus)}</td>
                        </tr>
                    `;
                }).join('');
            }

            this.updateAnalyticsSummary(stats, enriched.length);
        },

        clearAnalyticsTab: function () {
            const body = document.getElementById('ga4AnalyticsBody');
            const table = document.getElementById('ga4AnalyticsTable');
            const empty = document.getElementById('ga4AnalyticsEmpty');
            if (body) {
                body.innerHTML = '';
            }
            if (table) {
                table.style.display = 'none';
            }
            if (empty) {
                empty.style.display = 'block';
            }

            this.updateAnalyticsSummary({}, 0);
        },

        updateAnalyticsSummary: function (stats, fallbackMatchedCount) {
            const sync = stats?.ga4_sync || {};
            if (sync.last_sync_at || sync.status || sync.error) {
                this.statusSnapshot = {
                    last_sync_at: sync.last_sync_at || this.statusSnapshot.last_sync_at || '',
                    last_sync_status: sync.status || this.statusSnapshot.last_sync_status || '',
                    last_sync_error: sync.error || this.statusSnapshot.last_sync_error || ''
                };
            }
            const matched = Number(sync.matched_urls ?? fallbackMatchedCount ?? 0);
            const unmatched = Number(sync.unmatched_urls ?? 0);
            const status = sync.status || this.statusSnapshot.last_sync_status || 'idle';
            const lastSync = sync.last_sync_at || this.statusSnapshot.last_sync_at || 'Never';
            const error = sync.error || this.statusSnapshot.last_sync_error || '';

            const statusEl = document.getElementById('ga4AnalyticsSyncStatus');
            const matchedEl = document.getElementById('ga4AnalyticsMatchedCount');
            const unmatchedEl = document.getElementById('ga4AnalyticsUnmatchedCount');
            const lastSyncEl = document.getElementById('ga4AnalyticsLastSync');
            const errorEl = document.getElementById('ga4AnalyticsError');

            if (statusEl) {
                statusEl.textContent = status;
            }
            if (matchedEl) {
                matchedEl.textContent = String(matched);
            }
            if (unmatchedEl) {
                unmatchedEl.textContent = String(unmatched);
            }
            if (lastSyncEl) {
                lastSyncEl.textContent = String(lastSync);
            }
            if (errorEl) {
                errorEl.textContent = error;
                errorEl.style.display = error ? 'block' : 'none';
            }
        },

        getMetricLabel: function (metricId) {
            const metric = (this.catalog?.metrics || []).find((item) => item.id === metricId);
            return metric ? metric.label : metricId;
        },

        formatMetricValue: function (value) {
            if (value === null || value === undefined || value === '') {
                return '-';
            }
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) {
                    return '-';
                }
                if (Math.abs(value) >= 1000 && Number.isInteger(value)) {
                    return value.toLocaleString();
                }
                if (!Number.isInteger(value)) {
                    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
                }
            }
            return String(value);
        },

        escapeText: function (text) {
            const div = document.createElement('div');
            div.textContent = String(text ?? '');
            return div.innerHTML;
        },

        escapeAttr: function (text) {
            return this.escapeText(text).replace(/"/g, '&quot;');
        }
    };

    window.GA4Config = GA4Config;

    document.addEventListener('DOMContentLoaded', function () {
        GA4Config.init();
    });
})();
