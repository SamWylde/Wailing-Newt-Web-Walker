(function () {
    const fallbackCatalog = {
        sources: [{ id: 'remote', label: 'Remote (Google PageSpeed Insights API)' }],
        devices: [
            { id: 'mobile', label: 'Mobile', defaultSelected: true },
            { id: 'desktop', label: 'Desktop', defaultSelected: true }
        ],
        metricGroups: [
            { id: 'overview', label: 'Overview', defaultSelected: true },
            { id: 'crux_metrics', label: 'CrUX Metrics', defaultSelected: true },
            { id: 'lighthouse_metrics', label: 'Lighthouse Metrics', defaultSelected: true },
            { id: 'insights', label: 'Insights', defaultSelected: true },
            { id: 'diagnostics', label: 'Diagnostics', defaultSelected: true },
            { id: 'mobile_friendly', label: 'Mobile Friendly', defaultSelected: true },
            { id: 'accessibility', label: 'Accessibility', defaultSelected: true }
        ],
        defaultDevices: ['mobile', 'desktop'],
        defaultMetricGroups: [
            'overview',
            'crux_metrics',
            'lighthouse_metrics',
            'insights',
            'diagnostics',
            'mobile_friendly',
            'accessibility'
        ],
        setupSteps: [
            'Open Google Cloud Console and create an API key.',
            'Enable the PageSpeed Insights API for your project.',
            'Paste your API key below and click Connect API Key.'
        ]
    };

    const PageSpeedConfig = {
        catalog: null,
        statusSnapshot: {
            connected: false,
            has_api_key: false,
            api_key_masked: '',
            source: 'remote',
            enabled: false,
            auto_connect: true,
            selected_devices: ['mobile', 'desktop'],
            selected_metric_groups: fallbackCatalog.defaultMetricGroups.slice(),
            last_sync_at: '',
            last_sync_status: '',
            last_sync_error: ''
        },
        initialized: false,

        init: async function () {
            if (this.initialized) {
                return;
            }
            this.initialized = true;

            this.bindEvents();
            await this.loadCatalog();
            this.loadFromSettings(this.getCurrentSettings());
            await this.refreshStatus();
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

        bindEvents: function () {
            const panel = document.getElementById('config-panel-pagespeed');
            if (!panel) {
                return;
            }

            panel.querySelectorAll('.ga4-subtab-btn').forEach((btn) => {
                btn.addEventListener('click', () => this.switchSubtab(btn.dataset.tab));
            });

            const connectBtn = document.getElementById('psConnectBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', () => this.connect());
            }

            const disconnectBtn = document.getElementById('psDisconnectBtn');
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => this.disconnect());
            }
        },

        switchSubtab: function (tabId) {
            const panel = document.getElementById('config-panel-pagespeed');
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
                const response = await fetch('/api/pagespeed/catalog');
                const payload = await response.json();
                if (payload.success && payload.catalog) {
                    this.catalog = payload.catalog;
                } else {
                    this.catalog = JSON.parse(JSON.stringify(fallbackCatalog));
                }
            } catch (error) {
                console.warn('Failed to load PageSpeed catalog, using fallback', error);
                this.catalog = JSON.parse(JSON.stringify(fallbackCatalog));
            }

            this.renderCatalogOptions();
        },

        renderCatalogOptions: function () {
            const sourceSelect = document.getElementById('psSourceSelect');
            if (sourceSelect) {
                const sources = this.catalog?.sources || fallbackCatalog.sources;
                sourceSelect.innerHTML = sources.map((source) => (
                    `<option value="${this.escapeAttr(source.id)}">${this.escapeText(source.label)}</option>`
                )).join('');
            }

            const setupSteps = document.getElementById('psSetupSteps');
            if (setupSteps) {
                const steps = this.catalog?.setupSteps || fallbackCatalog.setupSteps;
                setupSteps.innerHTML = steps.map((step) => `<li>${this.escapeText(step)}</li>`).join('');
            }

            this.renderDeviceChecklist();
            this.renderMetricGroupChecklist();
        },

        renderDeviceChecklist: function () {
            const container = document.getElementById('psDevicesList');
            if (!container) {
                return;
            }

            const devices = this.catalog?.devices || fallbackCatalog.devices;
            const selected = this.getSelectedDevices();
            container.innerHTML = devices.map((device) => {
                const checked = selected.includes(device.id);
                return `
                    <label class="ga4-metric-item">
                        <input type="checkbox" data-ps-device="${this.escapeAttr(device.id)}" ${checked ? 'checked' : ''}>
                        <span>${this.escapeText(device.label)}</span>
                    </label>
                `;
            }).join('');
        },

        renderMetricGroupChecklist: function () {
            const container = document.getElementById('psMetricGroupsList');
            if (!container) {
                return;
            }

            const groups = this.catalog?.metricGroups || fallbackCatalog.metricGroups;
            const selected = this.getSelectedMetricGroups();
            container.innerHTML = groups.map((group) => {
                const checked = selected.includes(group.id);
                return `
                    <label class="ga4-metric-item">
                        <input type="checkbox" data-ps-group="${this.escapeAttr(group.id)}" ${checked ? 'checked' : ''}>
                        <span>${this.escapeText(group.label)}</span>
                    </label>
                `;
            }).join('');
        },

        getSelectedDevices: function () {
            const selected = this.statusSnapshot.selected_devices;
            if (Array.isArray(selected) && selected.length > 0) {
                return selected.slice();
            }
            return (this.catalog?.defaultDevices || fallbackCatalog.defaultDevices).slice();
        },

        getSelectedMetricGroups: function () {
            const selected = this.statusSnapshot.selected_metric_groups;
            if (Array.isArray(selected) && selected.length > 0) {
                return selected.slice();
            }
            return (this.catalog?.defaultMetricGroups || fallbackCatalog.defaultMetricGroups).slice();
        },

        getCheckedValues: function (selector, defaults) {
            const checked = Array.from(document.querySelectorAll(selector))
                .filter((checkbox) => checkbox.checked)
                .map((checkbox) => checkbox.value || checkbox.getAttribute(selector.includes('device') ? 'data-ps-device' : 'data-ps-group'))
                .filter(Boolean);
            if (checked.length > 0) {
                return checked;
            }
            return defaults.slice();
        },

        loadFromSettings: function (settings) {
            const source = settings || {};

            const enabled = source.pagespeedEnabled !== undefined ? !!source.pagespeedEnabled : !!source.enablePageSpeed;
            const sourceType = source.pagespeedSource || 'remote';
            const autoConnect = source.pagespeedAutoConnect !== undefined ? !!source.pagespeedAutoConnect : true;
            const apiKey = source.pagespeedApiKey || source.googleApiKey || '';
            const selectedDevices = Array.isArray(source.pagespeedSelectedDevices)
                ? source.pagespeedSelectedDevices.slice()
                : (this.catalog?.defaultDevices || fallbackCatalog.defaultDevices).slice();
            const selectedGroups = Array.isArray(source.pagespeedSelectedMetricGroups)
                ? source.pagespeedSelectedMetricGroups.slice()
                : (this.catalog?.defaultMetricGroups || fallbackCatalog.defaultMetricGroups).slice();

            this.statusSnapshot = {
                ...this.statusSnapshot,
                connected: !!source.pagespeedConnected && !!apiKey,
                has_api_key: !!apiKey,
                source: sourceType,
                enabled: enabled,
                auto_connect: autoConnect,
                selected_devices: selectedDevices,
                selected_metric_groups: selectedGroups,
                last_sync_at: source.pagespeedLastSyncAt || '',
                last_sync_status: source.pagespeedLastSyncStatus || '',
                last_sync_error: source.pagespeedLastSyncError || ''
            };

            const sourceSelect = document.getElementById('psSourceSelect');
            if (sourceSelect) {
                sourceSelect.value = sourceType;
            }

            const apiInput = document.getElementById('psApiKey');
            if (apiInput) {
                apiInput.value = apiKey;
            }

            const enabledInput = document.getElementById('pagespeedEnabled');
            if (enabledInput) {
                enabledInput.checked = enabled;
            }

            const autoConnectInput = document.getElementById('psAutoConnect');
            if (autoConnectInput) {
                autoConnectInput.checked = autoConnect;
            }

            const verifyUrl = document.getElementById('psVerifyUrl');
            if (verifyUrl && !verifyUrl.value) {
                verifyUrl.value = 'https://www.example.com';
            }

            this.renderDeviceChecklist();
            this.renderMetricGroupChecklist();
            this.updateConnectionUI();
            this.updateSyncUI();
        },

        onPanelVisible: async function () {
            await this.refreshStatus();
        },

        refreshStatus: async function () {
            try {
                const response = await fetch('/api/pagespeed/status');
                const payload = await response.json();
                if (!payload.success) {
                    return null;
                }

                this.statusSnapshot = {
                    ...this.statusSnapshot,
                    connected: !!payload.connected,
                    has_api_key: !!payload.has_api_key,
                    api_key_masked: payload.api_key_masked || '',
                    source: payload.source || this.statusSnapshot.source || 'remote',
                    enabled: payload.enabled !== undefined ? !!payload.enabled : this.statusSnapshot.enabled,
                    auto_connect: payload.auto_connect !== undefined ? !!payload.auto_connect : this.statusSnapshot.auto_connect,
                    selected_devices: Array.isArray(payload.selected_devices) ? payload.selected_devices : this.statusSnapshot.selected_devices,
                    selected_metric_groups: Array.isArray(payload.selected_metric_groups)
                        ? payload.selected_metric_groups
                        : this.statusSnapshot.selected_metric_groups,
                    last_sync_at: payload.last_sync_at || '',
                    last_sync_status: payload.last_sync_status || '',
                    last_sync_error: payload.last_sync_error || ''
                };

                const sourceSelect = document.getElementById('psSourceSelect');
                if (sourceSelect) {
                    sourceSelect.value = this.statusSnapshot.source || 'remote';
                }
                const enabledInput = document.getElementById('pagespeedEnabled');
                if (enabledInput) {
                    enabledInput.checked = !!this.statusSnapshot.enabled;
                }
                const autoConnectInput = document.getElementById('psAutoConnect');
                if (autoConnectInput) {
                    autoConnectInput.checked = this.statusSnapshot.auto_connect !== false;
                }
                this.renderDeviceChecklist();
                this.renderMetricGroupChecklist();
                this.updateConnectionUI();
                this.updateSyncUI();
                return payload;
            } catch (error) {
                console.warn('Failed to refresh PageSpeed status', error);
                return null;
            }
        },

        updateConnectionUI: function () {
            const connected = !!this.statusSnapshot.connected;
            const badge = document.getElementById('psConnectionBadge');
            if (badge) {
                badge.textContent = connected ? 'Connected' : 'Not Connected';
                badge.dataset.connected = connected ? 'true' : 'false';
                badge.classList.toggle('connected', connected);
                badge.classList.toggle('disconnected', !connected);
            }

            const connectBtn = document.getElementById('psConnectBtn');
            if (connectBtn) {
                connectBtn.disabled = false;
            }
            const disconnectBtn = document.getElementById('psDisconnectBtn');
            if (disconnectBtn) {
                disconnectBtn.disabled = !connected;
            }

            const apiInput = document.getElementById('psApiKey');
            if (apiInput && !apiInput.value && this.statusSnapshot.has_api_key) {
                apiInput.placeholder = `Saved key (${this.statusSnapshot.api_key_masked || 'configured'})`;
            }
        },

        updateSyncUI: function () {
            const syncAt = document.getElementById('psLastSyncLabel');
            const syncStatus = document.getElementById('psLastSyncStatusLabel');
            const syncError = document.getElementById('psLastSyncErrorLabel');

            if (syncAt) {
                syncAt.textContent = `Last Sync: ${this.statusSnapshot.last_sync_at || 'Never'}`;
            }
            if (syncStatus) {
                syncStatus.textContent = `Status: ${this.statusSnapshot.last_sync_status || 'idle'}`;
            }
            if (syncError) {
                syncError.textContent = this.statusSnapshot.last_sync_error
                    ? `Error: ${this.statusSnapshot.last_sync_error}`
                    : '';
            }
        },

        connect: async function () {
            const source = document.getElementById('psSourceSelect')?.value || 'remote';
            const apiKey = document.getElementById('psApiKey')?.value?.trim() || '';
            const verifyUrl = document.getElementById('psVerifyUrl')?.value?.trim() || 'https://www.example.com';
            const enabled = document.getElementById('pagespeedEnabled')?.checked || false;
            const autoConnect = document.getElementById('psAutoConnect')?.checked !== false;

            if (!apiKey) {
                showNotification('Paste your PageSpeed API key before connecting.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/pagespeed/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: source,
                        api_key: apiKey,
                        verify_url: verifyUrl,
                        enabled: enabled,
                        auto_connect: autoConnect
                    })
                });
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Could not connect PageSpeed API key', 'error');
                    return;
                }

                this.statusSnapshot = {
                    ...this.statusSnapshot,
                    connected: !!payload.connected,
                    has_api_key: !!payload.has_api_key,
                    api_key_masked: payload.api_key_masked || '',
                    source: payload.source || source,
                    enabled: payload.enabled !== undefined ? !!payload.enabled : enabled,
                    auto_connect: payload.auto_connect !== undefined ? !!payload.auto_connect : autoConnect,
                    last_sync_status: payload.last_sync_status || 'connected',
                    last_sync_error: payload.last_sync_error || ''
                };
                this.updateConnectionUI();
                this.updateSyncUI();

                if (window.currentSettings && typeof window.currentSettings === 'object') {
                    window.currentSettings.pagespeedConnected = true;
                    window.currentSettings.pagespeedApiKey = apiKey;
                    window.currentSettings.googleApiKey = apiKey;
                    window.currentSettings.pagespeedEnabled = enabled;
                    window.currentSettings.enablePageSpeed = enabled;
                }

                showNotification(payload.message || 'PageSpeed API key connected', 'success');
            } catch (error) {
                console.error('Failed to connect PageSpeed API key', error);
                showNotification('Failed to connect PageSpeed API key', 'error');
            }
        },

        disconnect: async function () {
            try {
                const response = await fetch('/api/pagespeed/disconnect', { method: 'POST' });
                const payload = await response.json();
                if (!payload.success) {
                    showNotification(payload.error || 'Could not disconnect PageSpeed', 'error');
                    return;
                }

                this.statusSnapshot = {
                    ...this.statusSnapshot,
                    connected: false,
                    has_api_key: false,
                    api_key_masked: '',
                    last_sync_status: payload.last_sync_status || 'disconnected',
                    last_sync_error: ''
                };
                this.updateConnectionUI();
                this.updateSyncUI();

                const apiInput = document.getElementById('psApiKey');
                if (apiInput) {
                    apiInput.value = '';
                }
                const enabledInput = document.getElementById('pagespeedEnabled');
                if (enabledInput) {
                    enabledInput.checked = false;
                }

                if (window.currentSettings && typeof window.currentSettings === 'object') {
                    window.currentSettings.pagespeedConnected = false;
                    window.currentSettings.pagespeedApiKey = '';
                    window.currentSettings.googleApiKey = '';
                    window.currentSettings.pagespeedEnabled = false;
                    window.currentSettings.enablePageSpeed = false;
                }

                showNotification(payload.message || 'PageSpeed disconnected', 'info');
            } catch (error) {
                console.error('Failed to disconnect PageSpeed', error);
                showNotification('Failed to disconnect PageSpeed', 'error');
            }
        },

        isConnected: function () {
            return document.getElementById('psConnectionBadge')?.dataset.connected === 'true';
        },

        collectSettings: function () {
            const settings = this.getCurrentSettings();
            const typedKey = document.getElementById('psApiKey')?.value?.trim() || '';
            const existingKey = settings.pagespeedApiKey || settings.googleApiKey || '';
            const apiKey = typedKey || (this.isConnected() ? existingKey : '');

            const enabled = document.getElementById('pagespeedEnabled')?.checked || false;
            const autoConnect = document.getElementById('psAutoConnect')?.checked !== false;
            const source = document.getElementById('psSourceSelect')?.value || 'remote';

            const defaultDevices = (this.catalog?.defaultDevices || fallbackCatalog.defaultDevices).slice();
            const defaultGroups = (this.catalog?.defaultMetricGroups || fallbackCatalog.defaultMetricGroups).slice();
            const selectedDevices = this.getCheckedValues('input[data-ps-device]', defaultDevices);
            const selectedMetricGroups = this.getCheckedValues('input[data-ps-group]', defaultGroups);

            return {
                enablePageSpeed: enabled,
                googleApiKey: apiKey,
                pagespeedEnabled: enabled,
                pagespeedConnected: this.isConnected(),
                pagespeedSource: source,
                pagespeedApiKey: apiKey,
                pagespeedAutoConnect: autoConnect,
                pagespeedSelectedDevices: selectedDevices,
                pagespeedSelectedMetricGroups: selectedMetricGroups,
                pagespeedLastSyncAt: this.statusSnapshot.last_sync_at || '',
                pagespeedLastSyncStatus: this.statusSnapshot.last_sync_status || '',
                pagespeedLastSyncError: this.statusSnapshot.last_sync_error || ''
            };
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

    window.PageSpeedConfig = PageSpeedConfig;

    document.addEventListener('DOMContentLoaded', function () {
        PageSpeedConfig.init();
    });
})();
