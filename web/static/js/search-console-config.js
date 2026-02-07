(function () {
    const fallbackCatalog = {
        dateRangePresets: [
            { id: 'last_7_days', label: 'Last 7 days' },
            { id: 'last_30_days', label: 'Last 30 days' },
            { id: 'last_90_days', label: 'Last 90 days' },
            { id: 'custom', label: 'Custom' }
        ],
        deviceFilters: [
            { id: 'all', label: 'All devices' },
            { id: 'desktop', label: 'Desktop' },
            { id: 'mobile', label: 'Mobile' },
            { id: 'tablet', label: 'Tablet' }
        ],
        typeFilters: [
            { id: 'web', label: 'Web' },
            { id: 'image', label: 'Image' },
            { id: 'video', label: 'Video' },
            { id: 'news', label: 'News' },
            { id: 'discover', label: 'Discover' },
            { id: 'googleNews', label: 'Google News' }
        ],
        queryFilterOperators: [
            { id: 'none', label: 'None' },
            { id: 'contains', label: 'Contains' },
            { id: 'not_contains', label: 'Does not contain' },
            { id: 'equals', label: 'Equals' },
            { id: 'not_equals', label: 'Does not equal' },
            { id: 'including_regex', label: 'Matches regex' },
            { id: 'excluding_regex', label: 'Does not match regex' }
        ],
        countryFilters: [
            { id: '', label: 'None' },
            { id: 'usa', label: 'United States' },
            { id: 'gbr', label: 'United Kingdom' },
            { id: 'can', label: 'Canada' }
        ],
        inspectionLanguages: [
            { id: 'en-US', label: 'English (US)' },
            { id: 'en-GB', label: 'English (UK)' }
        ]
    };

    const SearchConsoleConfig = {
        catalog: null,
        sites: [],
        statusSnapshot: {
            last_sync_at: '',
            last_sync_status: '',
            last_sync_error: '',
            last_inspection_at: '',
            last_inspection_status: '',
            last_inspection_error: ''
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
            const panel = document.getElementById('config-panel-search-console');
            if (!panel) {
                return;
            }

            panel.querySelectorAll('.ga4-subtab-btn').forEach((btn) => {
                btn.addEventListener('click', () => this.switchSubtab(btn.dataset.tab));
            });

            const connectBtn = document.getElementById('gscConnectBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', () => this.startOAuth());
            }

            const disconnectBtn = document.getElementById('gscDisconnectBtn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => this.disconnectOAuth());
            }

            const copyRedirectBtn = document.getElementById('gscCopyRedirectUriBtn');
            if (copyRedirectBtn) {
                copyRedirectBtn.addEventListener('click', () => this.copyRedirectUri());
            }

            const saveSetupBtn = document.getElementById('gscSaveSetupBtn');
            if (saveSetupBtn) {
                saveSetupBtn.addEventListener('click', () => this.saveOAuthSetup());
            }

            const redirectInput = document.getElementById('gscSetupRedirectUri');
            if (redirectInput) {
                redirectInput.addEventListener('input', () => {
                    redirectInput.dataset.autofill = 'false';
                });
            }

            const datePreset = document.getElementById('gscDateRangePreset');
            if (datePreset) {
                datePreset.addEventListener('change', () => this.updateDateRangeMode());
            }

            const limitToggle = document.getElementById('gscLimitMaxResults');
            if (limitToggle) {
                limitToggle.addEventListener('change', () => this.updateMaxResultsMode());
            }

            const inspectionToggle = document.getElementById('gscEnableUrlInspection');
            if (inspectionToggle) {
                inspectionToggle.addEventListener('change', () => this.updateInspectionMode());
            }
        },

        switchSubtab: function (tabId) {
            const panel = document.getElementById('config-panel-search-console');
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
                const response = await fetch('/api/search_console/catalog');
                const payload = await response.json();
                if (payload.success && payload.catalog) {
                    this.catalog = payload.catalog;
                    this.populateSelectOptions();
                    return;
                }
            } catch (error) {
                console.warn('Failed to load Search Console catalog, using fallback', error);
            }

            this.catalog = JSON.parse(JSON.stringify(fallbackCatalog));
            this.populateSelectOptions();
        },

        populateSelectOptions: function () {
            const setOptions = (elementId, values) => {
                const select = document.getElementById(elementId);
                if (!select) {
                    return;
                }
                select.innerHTML = (values || []).map((item) => (
                    `<option value="${this.escapeAttr(item.id)}">${this.escapeText(item.label)}</option>`
                )).join('');
            };

            setOptions('gscDateRangePreset', this.catalog?.dateRangePresets || fallbackCatalog.dateRangePresets);
            setOptions('gscDeviceFilter', this.catalog?.deviceFilters || fallbackCatalog.deviceFilters);
            setOptions('gscCountryFilter', this.catalog?.countryFilters || fallbackCatalog.countryFilters);
            setOptions('gscTypeFilter', this.catalog?.typeFilters || fallbackCatalog.typeFilters);
            setOptions('gscQueryFilterOperator', this.catalog?.queryFilterOperators || fallbackCatalog.queryFilterOperators);
            setOptions('gscInspectionLanguageCode', this.catalog?.inspectionLanguages || fallbackCatalog.inspectionLanguages);
        },

        loadFromSettings: function (settings) {
            const source = settings || {};

            this.setCheckbox('gscEnabled', !!source.gscEnabled);
            this.setCheckbox('gscMatchTrailingSlash', source.gscMatchTrailingSlash !== false);
            this.setCheckbox('gscMatchCase', !!source.gscMatchCase);
            this.setCheckbox('gscLimitMaxResults', source.gscLimitMaxResults !== false);
            this.setCheckbox('gscCrawlNewUrls', !!source.gscCrawlNewUrls);
            this.setCheckbox('gscEnableUrlInspection', !!source.gscEnableUrlInspection);
            this.setCheckbox('gscIgnoreNonIndexableUrls', !!source.gscIgnoreNonIndexableUrls);
            this.setCheckbox('gscUseMultipleProperties', !!source.gscUseMultipleProperties);

            this.setValue('gscDateRangePreset', source.gscDateRangePreset || 'last_30_days');
            this.setValue('gscDateStart', source.gscDateStart || '');
            this.setValue('gscDateEnd', source.gscDateEnd || '');
            this.setValue('gscDeviceFilter', source.gscDeviceFilter || 'all');
            this.setValue('gscCountryFilter', source.gscCountryFilter || '');
            this.setValue('gscTypeFilter', source.gscTypeFilter || 'web');
            this.setValue('gscQueryFilterOperator', source.gscQueryFilterOperator || 'none');
            this.setValue('gscQueryFilterValue', source.gscQueryFilterValue || '');
            this.setValue('gscMaxResults', source.gscMaxResults || 100000);
            this.setValue('gscInspectionLanguageCode', source.gscInspectionLanguageCode || 'en-US');
            this.setValue('gscInspectionMaxUrls', source.gscInspectionMaxUrls || 200);

            this.applyStatusFromSettings(source);
            this.populateSavedSelections(source);
            this.updateDateRangeMode();
            this.updateMaxResultsMode();
            this.updateInspectionMode();

            const state = this.getCrawlState();
            this.renderSearchConsoleTab(state.urls || [], state.stats || {});
        },

        applyStatusFromSettings: function (settings) {
            const status = {
                connected: !!settings.gscConnected,
                site_url: settings.gscSiteUrl || '',
                site_name: settings.gscSiteName || '',
                last_sync_at: settings.gscLastSyncAt || '',
                last_sync_status: settings.gscLastSyncStatus || '',
                last_sync_error: settings.gscLastSyncError || '',
                last_inspection_at: settings.gscLastInspectionAt || '',
                last_inspection_status: settings.gscLastInspectionStatus || '',
                last_inspection_error: settings.gscLastInspectionError || ''
            };
            this.statusSnapshot = {
                last_sync_at: status.last_sync_at || '',
                last_sync_status: status.last_sync_status || '',
                last_sync_error: status.last_sync_error || '',
                last_inspection_at: status.last_inspection_at || '',
                last_inspection_status: status.last_inspection_status || '',
                last_inspection_error: status.last_inspection_error || ''
            };
            this.updateSetupUI();
            this.updateConnectionUI(status);
            this.updateSyncSummary(status);
        },

        populateSavedSelections: function (settings) {
            const siteSelect = document.getElementById('gscSiteSelect');
            if (!siteSelect) {
                return;
            }

            siteSelect.innerHTML = settings.gscSiteUrl
                ? `<option value="${this.escapeAttr(settings.gscSiteUrl)}" selected>${this.escapeText(settings.gscSiteName || settings.gscSiteUrl)}</option>`
                : '<option value="">Select property...</option>';
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

        updateDateRangeMode: function () {
            const preset = document.getElementById('gscDateRangePreset')?.value || 'last_30_days';
            const custom = preset === 'custom';
            const startInput = document.getElementById('gscDateStart');
            const endInput = document.getElementById('gscDateEnd');

            if (startInput) {
                startInput.disabled = !custom;
            }
            if (endInput) {
                endInput.disabled = !custom;
            }
        },

        updateMaxResultsMode: function () {
            const enabled = document.getElementById('gscLimitMaxResults')?.checked !== false;
            const input = document.getElementById('gscMaxResults');
            if (input) {
                input.disabled = !enabled;
            }
        },

        updateInspectionMode: function () {
            const enabled = document.getElementById('gscEnableUrlInspection')?.checked === true;
            const maxUrls = document.getElementById('gscInspectionMaxUrls');
            const language = document.getElementById('gscInspectionLanguageCode');
            const ignoreNonIndexable = document.getElementById('gscIgnoreNonIndexableUrls');
            const useMultiple = document.getElementById('gscUseMultipleProperties');

            [maxUrls, language, ignoreNonIndexable, useMultiple].forEach((el) => {
                if (el) {
                    el.disabled = !enabled;
                }
            });
        },

        applySetupStatus: function (status) {
            const fallbackRedirect = `${window.location.origin}/api/search_console/oauth/callback`;
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
            const setupCard = document.getElementById('gscSetupCard');
            const setupSteps = document.getElementById('gscSetupSteps');
            const redirectInput = document.getElementById('gscSetupRedirectUri');
            const statusEl = document.getElementById('gscSetupStatusText');
            const pathHint = document.getElementById('gscSetupPathHint');

            if (setupCard) {
                setupCard.style.display = this.setupSnapshot.setup_required ? 'block' : 'none';
            }

            if (setupSteps) {
                const steps = this.setupSnapshot.setup_steps && this.setupSnapshot.setup_steps.length > 0
                    ? this.setupSnapshot.setup_steps
                    : [
                        'Open Google Cloud Console and create an OAuth 2.0 Client ID.',
                        'Add the Redirect URI shown below in Google Cloud Console.',
                        'Paste your Client ID and Client Secret below, then click Save setup.'
                    ];
                setupSteps.innerHTML = steps.map((step) => `<li>${this.escapeText(step)}</li>`).join('');
            }

            if (redirectInput) {
                const shouldAutofill = !redirectInput.value || redirectInput.dataset.autofill !== 'false';
                if (shouldAutofill) {
                    redirectInput.value = this.setupSnapshot.suggested_redirect_uri || `${window.location.origin}/api/search_console/oauth/callback`;
                    redirectInput.dataset.autofill = 'true';
                }
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
            const statusEl = document.getElementById('gscSetupStatusText');
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
            const redirectInput = document.getElementById('gscSetupRedirectUri');
            const value = redirectInput?.value || this.setupSnapshot.suggested_redirect_uri;
            const copied = await this.copyToClipboard(value);
            if (copied) {
                this.setSetupStatusMessage('Redirect URI copied.', 'success');
            } else {
                this.setSetupStatusMessage('Copy failed. Please copy the Redirect URI manually.', 'error');
            }
        },

        saveOAuthSetup: async function () {
            const clientId = document.getElementById('gscSetupClientId')?.value?.trim() || '';
            const clientSecret = document.getElementById('gscSetupClientSecret')?.value?.trim() || '';
            const redirectUri = document.getElementById('gscSetupRedirectUri')?.value?.trim() || '';

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
                const response = await fetch('/api/search_console/oauth/configure', {
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

                const secretInput = document.getElementById('gscSetupClientSecret');
                if (secretInput) {
                    secretInput.value = '';
                }
                this.setSetupStatusMessage('Setup saved. Opening Google sign-in...', 'success');
                showNotification('Setup saved. Continue in the Google sign-in window.', 'success');
                await this.startOAuth();
            } catch (error) {
                console.error('Failed to save Search Console setup', error);
                this.setSetupStatusMessage('Could not save setup. Please try again.', 'error');
            }
        },

        onPanelVisible: async function () {
            const status = await this.refreshOAuthStatus(true);
            if (status?.connected) {
                await this.loadSites();
            }
        },

        startOAuth: async function () {
            try {
                const response = await fetch('/api/search_console/oauth/start');
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
                if (!opened) {
                    window.location.href = payload.auth_url;
                }

                this.beginOAuthPolling();
            } catch (error) {
                console.error('Failed to start Search Console OAuth', error);
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
                    await this.loadSites();
                    showNotification('Google Search Console connected', 'success');
                    return;
                }

                if (attempts >= 90) {
                    clearInterval(this.oauthPollTimer);
                    this.oauthPollTimer = null;
                }
            }, 2000);
        },

        refreshOAuthStatus: async function (loadSitesWhenConnected) {
            try {
                const response = await fetch('/api/search_console/oauth/status');
                const payload = await response.json();
                if (!payload.success) {
                    return null;
                }

                this.statusSnapshot = {
                    last_sync_at: payload.last_sync_at || '',
                    last_sync_status: payload.last_sync_status || '',
                    last_sync_error: payload.last_sync_error || '',
                    last_inspection_at: payload.last_inspection_at || '',
                    last_inspection_status: payload.last_inspection_status || '',
                    last_inspection_error: payload.last_inspection_error || ''
                };
                this.applySetupStatus(payload);
                this.updateConnectionUI(payload);
                this.updateSyncSummary(payload);

                if (loadSitesWhenConnected && payload.connected) {
                    await this.loadSites();
                }

                return payload;
            } catch (error) {
                console.warn('Failed to refresh Search Console status', error);
                return null;
            }
        },

        updateConnectionUI: function (status) {
            const badge = document.getElementById('gscConnectionBadge');
            const text = status.connected ? 'Connected' : 'Not Connected';
            if (badge) {
                badge.textContent = text;
                badge.classList.toggle('connected', !!status.connected);
                badge.classList.toggle('disconnected', !status.connected);
                badge.dataset.connected = status.connected ? 'true' : 'false';
            }

            const connectBtn = document.getElementById('gscConnectBtn');
            const disconnectBtn = document.getElementById('gscDisconnectBtn');
            const siteSelect = document.getElementById('gscSiteSelect');
            const needsSetup = !!this.setupSnapshot.setup_required;

            if (connectBtn) {
                connectBtn.disabled = !!status.connected;
                connectBtn.textContent = needsSetup ? 'Set up and Sign in with Google' : 'Sign in with Google';
            }
            if (disconnectBtn) {
                disconnectBtn.disabled = !status.connected;
            }
            if (siteSelect) {
                siteSelect.disabled = !status.connected;
            }
        },

        updateSyncSummary: function (status) {
            const lastSyncText = status.last_sync_at || 'Never';
            const syncStatus = status.last_sync_status || 'idle';
            const syncError = status.last_sync_error || '';
            const inspectionStatus = status.last_inspection_status || '';
            const inspectionError = status.last_inspection_error || '';

            const lastSync = document.getElementById('gscLastSyncLabel');
            const lastStatus = document.getElementById('gscLastSyncStatusLabel');
            const lastError = document.getElementById('gscLastSyncErrorLabel');

            if (lastSync) {
                lastSync.textContent = `Last Sync: ${lastSyncText}`;
            }
            if (lastStatus) {
                lastStatus.textContent = inspectionStatus
                    ? `Status: ${syncStatus} | Inspection: ${inspectionStatus}`
                    : `Status: ${syncStatus}`;
            }
            if (lastError) {
                const message = syncError || inspectionError;
                lastError.textContent = message ? `Error: ${message}` : '';
            }
        },

        disconnectOAuth: async function () {
            try {
                const response = await fetch('/api/search_console/oauth/disconnect', { method: 'POST' });
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Failed to disconnect Search Console', 'error');
                    return;
                }

                this.sites = [];
                this.populateSavedSelections({});
                await this.refreshOAuthStatus(false);
                showNotification('Google Search Console disconnected', 'info');
            } catch (error) {
                console.error('Failed to disconnect Search Console', error);
                showNotification('Failed to disconnect Search Console', 'error');
            }
        },

        loadSites: async function () {
            try {
                const response = await fetch('/api/search_console/sites');
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Failed to load Search Console properties', 'error');
                    return;
                }

                this.sites = Array.isArray(payload.sites) ? payload.sites : [];
                this.populateSiteSelect();
            } catch (error) {
                console.error('Failed to load Search Console properties', error);
            }
        },

        populateSiteSelect: function () {
            const select = document.getElementById('gscSiteSelect');
            if (!select) {
                return;
            }

            const settings = this.getCurrentSettings();
            const currentValue = settings.gscSiteUrl || select.value || '';
            const options = ['<option value="">Select property...</option>']
                .concat(this.sites.map((site) => (
                    `<option value="${this.escapeAttr(site.siteUrl)}">${this.escapeText(site.name || site.siteUrl)}</option>`
                )));
            select.innerHTML = options.join('');

            if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
                select.value = currentValue;
            }
        },

        collectSettings: function () {
            const siteSelect = document.getElementById('gscSiteSelect');
            const selectedSite = this.sites.find((site) => site.siteUrl === siteSelect?.value);

            return {
                gscEnabled: document.getElementById('gscEnabled')?.checked || false,
                gscConnected: document.getElementById('gscConnectionBadge')?.dataset.connected === 'true',
                gscSiteUrl: siteSelect?.value || '',
                gscSiteName: selectedSite?.name || siteSelect?.selectedOptions?.[0]?.textContent || '',
                gscDateRangePreset: document.getElementById('gscDateRangePreset')?.value || 'last_30_days',
                gscDateStart: document.getElementById('gscDateStart')?.value || '',
                gscDateEnd: document.getElementById('gscDateEnd')?.value || '',
                gscDeviceFilter: document.getElementById('gscDeviceFilter')?.value || 'all',
                gscCountryFilter: document.getElementById('gscCountryFilter')?.value || '',
                gscTypeFilter: document.getElementById('gscTypeFilter')?.value || 'web',
                gscQueryFilterOperator: document.getElementById('gscQueryFilterOperator')?.value || 'none',
                gscQueryFilterValue: document.getElementById('gscQueryFilterValue')?.value?.trim() || '',
                gscMatchTrailingSlash: document.getElementById('gscMatchTrailingSlash')?.checked !== false,
                gscMatchCase: document.getElementById('gscMatchCase')?.checked || false,
                gscLimitMaxResults: document.getElementById('gscLimitMaxResults')?.checked !== false,
                gscMaxResults: Math.max(1, parseInt(document.getElementById('gscMaxResults')?.value, 10) || 100000),
                gscCrawlNewUrls: document.getElementById('gscCrawlNewUrls')?.checked || false,
                gscEnableUrlInspection: document.getElementById('gscEnableUrlInspection')?.checked || false,
                gscIgnoreNonIndexableUrls: document.getElementById('gscIgnoreNonIndexableUrls')?.checked || false,
                gscUseMultipleProperties: document.getElementById('gscUseMultipleProperties')?.checked || false,
                gscInspectionLanguageCode: document.getElementById('gscInspectionLanguageCode')?.value || 'en-US',
                gscInspectionMaxUrls: Math.max(1, Math.min(2000, parseInt(document.getElementById('gscInspectionMaxUrls')?.value, 10) || 200)),
                gscLastSyncAt: this.statusSnapshot.last_sync_at || '',
                gscLastSyncStatus: this.statusSnapshot.last_sync_status || '',
                gscLastSyncError: this.statusSnapshot.last_sync_error || '',
                gscLastInspectionAt: this.statusSnapshot.last_inspection_at || '',
                gscLastInspectionStatus: this.statusSnapshot.last_inspection_status || '',
                gscLastInspectionError: this.statusSnapshot.last_inspection_error || ''
            };
        },

        renderSearchConsoleTab: function (urls, stats) {
            const body = document.getElementById('searchConsoleAnalyticsBody');
            const head = document.getElementById('searchConsoleAnalyticsHead');
            const table = document.getElementById('searchConsoleAnalyticsTable');
            const empty = document.getElementById('searchConsoleAnalyticsEmpty');
            if (!body || !head || !table || !empty) {
                return;
            }

            const list = Array.isArray(urls) ? urls : [];
            const enriched = list.filter((row) => {
                const analytics = row?.analytics || {};
                const scMetrics = analytics?.search_console?.metrics || {};
                return analytics.sc_clicks !== undefined
                    || analytics.sc_impressions !== undefined
                    || analytics.sc_ctr !== undefined
                    || analytics.sc_position !== undefined
                    || Object.keys(scMetrics).length > 0;
            });

            if (enriched.length === 0) {
                table.style.display = 'none';
                empty.style.display = 'block';
                body.innerHTML = '';
                this.updateSearchConsoleSummary(stats, 0);
                return;
            }

            empty.style.display = 'none';
            table.style.display = 'table';

            head.innerHTML = `
                <tr>
                    <th>URL</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                    <th>CTR</th>
                    <th>Position</th>
                    <th>Inspection</th>
                </tr>
            `;

            const sorted = enriched.slice().sort((a, b) => {
                const aClicks = Number(a.analytics?.sc_clicks ?? a.analytics?.search_console?.metrics?.clicks ?? 0);
                const bClicks = Number(b.analytics?.sc_clicks ?? b.analytics?.search_console?.metrics?.clicks ?? 0);
                return bClicks - aClicks;
            });

            body.innerHTML = sorted.map((row) => {
                const clicks = this.formatMetricValue(row.analytics?.sc_clicks ?? row.analytics?.search_console?.metrics?.clicks);
                const impressions = this.formatMetricValue(row.analytics?.sc_impressions ?? row.analytics?.search_console?.metrics?.impressions);
                const ctr = this.formatMetricValue(row.analytics?.sc_ctr ?? row.analytics?.search_console?.metrics?.ctr);
                const position = this.formatMetricValue(row.analytics?.sc_position ?? row.analytics?.search_console?.metrics?.position);
                const inspection = row.analytics?.search_console?.inspection || {};
                const inspectionText = inspection.status === 'success'
                    ? (inspection.verdict || 'success')
                    : (inspection.status || '-');

                return `
                    <tr>
                        <td class="ga4-url-cell">${this.escapeText(row.url || '')}</td>
                        <td>${this.escapeText(clicks)}</td>
                        <td>${this.escapeText(impressions)}</td>
                        <td>${this.escapeText(ctr)}</td>
                        <td>${this.escapeText(position)}</td>
                        <td>${this.escapeText(inspectionText)}</td>
                    </tr>
                `;
            }).join('');

            this.updateSearchConsoleSummary(stats, enriched.length);
        },

        clearSearchConsoleTab: function () {
            const body = document.getElementById('searchConsoleAnalyticsBody');
            const table = document.getElementById('searchConsoleAnalyticsTable');
            const empty = document.getElementById('searchConsoleAnalyticsEmpty');
            if (body) {
                body.innerHTML = '';
            }
            if (table) {
                table.style.display = 'none';
            }
            if (empty) {
                empty.style.display = 'block';
            }
            this.updateSearchConsoleSummary({}, 0);
        },

        updateSearchConsoleSummary: function (stats, fallbackMatchedCount) {
            const sync = stats?.gsc_sync || {};
            const inspection = stats?.gsc_inspection_sync || sync.inspection || {};
            if (sync.last_sync_at || sync.status || sync.error) {
                this.statusSnapshot = {
                    ...this.statusSnapshot,
                    last_sync_at: sync.last_sync_at || this.statusSnapshot.last_sync_at || '',
                    last_sync_status: sync.status || this.statusSnapshot.last_sync_status || '',
                    last_sync_error: sync.error || this.statusSnapshot.last_sync_error || '',
                    last_inspection_at: inspection.last_inspection_at || this.statusSnapshot.last_inspection_at || '',
                    last_inspection_status: inspection.status || this.statusSnapshot.last_inspection_status || '',
                    last_inspection_error: inspection.error || this.statusSnapshot.last_inspection_error || ''
                };
            }

            const matched = Number(sync.matched_urls ?? fallbackMatchedCount ?? 0);
            const unmatched = Number(sync.unmatched_urls ?? 0);
            const inspected = Number(inspection.inspected_urls ?? sync.inspected_urls ?? 0);
            const status = sync.status || this.statusSnapshot.last_sync_status || 'idle';
            const lastSync = sync.last_sync_at || this.statusSnapshot.last_sync_at || 'Never';
            const error = sync.error || inspection.error || this.statusSnapshot.last_sync_error || this.statusSnapshot.last_inspection_error || '';

            const statusEl = document.getElementById('searchConsoleSyncStatus');
            const matchedEl = document.getElementById('searchConsoleMatchedCount');
            const unmatchedEl = document.getElementById('searchConsoleUnmatchedCount');
            const inspectedEl = document.getElementById('searchConsoleInspectedCount');
            const lastSyncEl = document.getElementById('searchConsoleLastSync');
            const errorEl = document.getElementById('searchConsoleAnalyticsError');

            if (statusEl) {
                statusEl.textContent = status;
            }
            if (matchedEl) {
                matchedEl.textContent = String(matched);
            }
            if (unmatchedEl) {
                unmatchedEl.textContent = String(unmatched);
            }
            if (inspectedEl) {
                inspectedEl.textContent = String(inspected);
            }
            if (lastSyncEl) {
                lastSyncEl.textContent = String(lastSync);
            }
            if (errorEl) {
                errorEl.textContent = error;
                errorEl.style.display = error ? 'block' : 'none';
            }
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

    window.SearchConsoleConfig = SearchConsoleConfig;

    document.addEventListener('DOMContentLoaded', function () {
        SearchConsoleConfig.init();
    });
})();
