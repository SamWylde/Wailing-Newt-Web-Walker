/**
 * SEO Reports Module
 * Self-contained module for generating and displaying SEO audit reports
 */

const ReportsModule = {
    // Report type definitions
    reportTypes: [
        { id: 'crawl-overview', label: 'Crawl Overview', icon: '📊', description: 'Summary statistics of the crawl' },
        { id: 'issues-overview', label: 'Issues Overview', icon: '⚠️', description: 'All SEO issues by severity' },
        { id: 'redirects', label: 'Redirects', icon: '↪️', description: '3xx redirect chain analysis' },
        { id: 'canonicals', label: 'Canonicals', icon: '🔗', description: 'Canonical tag analysis' },
        { id: 'insecure-content', label: 'Insecure Content', icon: '🔓', description: 'Mixed HTTP/HTTPS issues' },
        { id: 'orphan-pages', label: 'Orphan Pages', icon: '👻', description: 'Pages with no internal inlinks' },
        { id: 'structured-data', label: 'Structured Data', icon: '📋', description: 'JSON-LD/Schema markup summary' }
    ],

    currentReport: 'crawl-overview',
    initialized: false,

    /**
     * Initialize the reports module
     */
    init() {
        if (this.initialized) return;

        this.renderSidebar();
        this.renderReport(this.currentReport);
        this.initialized = true;
    },

    /**
     * Refresh reports with latest crawl data
     */
    refresh() {
        this.renderReport(this.currentReport);
    },

    /**
     * Render the reports sidebar navigation
     */
    renderSidebar() {
        const sidebar = document.getElementById('reports-nav');
        if (!sidebar) return;

        sidebar.innerHTML = this.reportTypes.map(report => `
            <button class="reports-nav-item ${report.id === this.currentReport ? 'active' : ''}" 
                    data-report="${report.id}"
                    title="${report.description}">
                <span class="reports-nav-icon">${report.icon}</span>
                <span class="reports-nav-label">${report.label}</span>
            </button>
        `).join('');

        // Add click handlers
        sidebar.querySelectorAll('.reports-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectReport(btn.dataset.report);
            });
        });
    },

    /**
     * Select and display a report
     */
    selectReport(reportId) {
        this.currentReport = reportId;

        // Update active state in sidebar
        document.querySelectorAll('.reports-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.report === reportId);
        });

        this.renderReport(reportId);
    },

    /**
     * Render the selected report content
     */
    renderReport(reportId) {
        const content = document.getElementById('reports-content');
        if (!content) return;

        // Get crawl data from app state
        const crawlData = this.getCrawlData();

        if (!crawlData || crawlData.urls.length === 0) {
            content.innerHTML = `
                <div class="reports-empty">
                    <div class="reports-empty-icon">📊</div>
                    <h3>No Crawl Data Available</h3>
                    <p>Complete a crawl to generate SEO reports.</p>
                </div>
            `;
            return;
        }

        // Generate report based on type
        switch (reportId) {
            case 'crawl-overview':
                content.innerHTML = this.generateCrawlOverview(crawlData);
                break;
            case 'issues-overview':
                content.innerHTML = this.generateIssuesOverview(crawlData);
                break;
            case 'redirects':
                content.innerHTML = this.generateRedirectsReport(crawlData);
                break;
            case 'canonicals':
                content.innerHTML = this.generateCanonicalsReport(crawlData);
                break;
            case 'insecure-content':
                content.innerHTML = this.generateInsecureContentReport(crawlData);
                break;
            case 'orphan-pages':
                content.innerHTML = this.generateOrphanPagesReport(crawlData);
                break;
            case 'structured-data':
                content.innerHTML = this.generateStructuredDataReport(crawlData);
                break;
            default:
                content.innerHTML = '<p>Report not found.</p>';
        }
    },

    /**
     * Get crawl data from the global app state
     */
    getCrawlData() {
        if (typeof crawlState !== 'undefined') {
            return {
                urls: crawlState.urls || [],
                issues: crawlState.issues || [],
                stats: crawlState.stats || {},
                links: crawlState.links || []
            };
        }
        return null;
    },

    /**
     * Generate Crawl Overview report
     */
    generateCrawlOverview(data) {
        const urls = data.urls;
        const stats = data.stats;

        // Calculate status code distribution
        const statusCodes = {};
        urls.forEach(url => {
            const status = url.status_code || 'Unknown';
            statusCodes[status] = (statusCodes[status] || 0) + 1;
        });

        // Calculate content types
        const contentTypes = {};
        urls.forEach(url => {
            const type = url.content_type || 'Unknown';
            const simpleType = type.split(';')[0].trim();
            contentTypes[simpleType] = (contentTypes[simpleType] || 0) + 1;
        });

        return `
            <div class="report-header">
                <h2>📊 Crawl Overview</h2>
                <p class="report-subtitle">Summary statistics for ${urls.length} crawled URLs</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card">
                    <div class="stat-value">${urls.length}</div>
                    <div class="stat-label">Total URLs</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${stats.discovered || 0}</div>
                    <div class="stat-label">Discovered</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${stats.crawled || 0}</div>
                    <div class="stat-label">Crawled</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${stats.depth || 0}</div>
                    <div class="stat-label">Max Depth</div>
                </div>
            </div>

            <div class="report-section">
                <h3>Status Code Distribution</h3>
                <div class="report-table-container">
                    <table class="report-table">
                        <thead>
                            <tr><th>Status Code</th><th>Count</th><th>Percentage</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(statusCodes)
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => `
                                    <tr>
                                        <td><span class="status-badge status-${Math.floor(code / 100)}xx">${code}</span></td>
                                        <td>${count}</td>
                                        <td>${((count / urls.length) * 100).toFixed(1)}%</td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="report-section">
                <h3>Content Types</h3>
                <div class="report-table-container">
                    <table class="report-table">
                        <thead>
                            <tr><th>Content Type</th><th>Count</th><th>Percentage</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(contentTypes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([type, count]) => `
                                    <tr>
                                        <td>${type}</td>
                                        <td>${count}</td>
                                        <td>${((count / urls.length) * 100).toFixed(1)}%</td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    /**
     * Generate Issues Overview report
     */
    generateIssuesOverview(data) {
        const issues = data.issues;

        // Group by severity
        const bySeverity = { error: [], warning: [], info: [] };
        issues.forEach(issue => {
            const severity = issue.severity || 'info';
            if (bySeverity[severity]) {
                bySeverity[severity].push(issue);
            }
        });

        // Group by category
        const byCategory = {};
        issues.forEach(issue => {
            const cat = issue.category || 'Other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(issue);
        });

        return `
            <div class="report-header">
                <h2>⚠️ Issues Overview</h2>
                <p class="report-subtitle">${issues.length} issues found across ${data.urls.length} URLs</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card stat-error">
                    <div class="stat-value">${bySeverity.error.length}</div>
                    <div class="stat-label">Errors</div>
                </div>
                <div class="report-stat-card stat-warning">
                    <div class="stat-value">${bySeverity.warning.length}</div>
                    <div class="stat-label">Warnings</div>
                </div>
                <div class="report-stat-card stat-info">
                    <div class="stat-value">${bySeverity.info.length}</div>
                    <div class="stat-label">Info</div>
                </div>
            </div>

            <div class="report-section">
                <h3>Issues by Category</h3>
                <div class="report-table-container">
                    <table class="report-table">
                        <thead>
                            <tr><th>Category</th><th>Count</th><th>Top Issue</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(byCategory)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([cat, catIssues]) => `
                                    <tr>
                                        <td><strong>${cat}</strong></td>
                                        <td>${catIssues.length}</td>
                                        <td>${catIssues[0]?.message || '-'}</td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            ${issues.length === 0 ? '<div class="report-success"><span>✅</span> No issues found!</div>' : ''}
        `;
    },

    /**
     * Generate Redirects report
     */
    generateRedirectsReport(data) {
        const redirects = data.urls.filter(url =>
            url.status_code >= 300 && url.status_code < 400
        );

        // Group by status code
        const byStatus = {};
        redirects.forEach(url => {
            const code = url.status_code;
            if (!byStatus[code]) byStatus[code] = [];
            byStatus[code].push(url);
        });

        return `
            <div class="report-header">
                <h2>↪️ Redirects</h2>
                <p class="report-subtitle">${redirects.length} redirects found</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card">
                    <div class="stat-value">${byStatus[301]?.length || 0}</div>
                    <div class="stat-label">301 Permanent</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${byStatus[302]?.length || 0}</div>
                    <div class="stat-label">302 Temporary</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${byStatus[307]?.length || 0}</div>
                    <div class="stat-label">307 Temporary</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${byStatus[308]?.length || 0}</div>
                    <div class="stat-label">308 Permanent</div>
                </div>
            </div>

            <div class="report-section">
                <h3>All Redirects</h3>
                <div class="report-table-container">
                    <table class="report-table">
                        <thead>
                            <tr><th>Status</th><th>URL</th><th>Redirects To</th></tr>
                        </thead>
                        <tbody>
                            ${redirects.slice(0, 100).map(url => `
                                <tr>
                                    <td><span class="status-badge status-3xx">${url.status_code}</span></td>
                                    <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                    <td class="url-cell" title="${url.redirect_url || '-'}">${this.truncateUrl(url.redirect_url || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${redirects.length > 100 ? `<p class="report-note">Showing first 100 of ${redirects.length} redirects</p>` : ''}
            </div>

            ${redirects.length === 0 ? '<div class="report-success"><span>✅</span> No redirects found!</div>' : ''}
        `;
    },

    /**
     * Generate Canonicals report
     */
    generateCanonicalsReport(data) {
        const withCanonical = data.urls.filter(url => url.canonical_url);
        const selfReferencing = withCanonical.filter(url => url.canonical_url === url.url);
        const pointing = withCanonical.filter(url => url.canonical_url !== url.url);
        const missing = data.urls.filter(url => !url.canonical_url && url.status_code === 200);

        return `
            <div class="report-header">
                <h2>🔗 Canonicals</h2>
                <p class="report-subtitle">Canonical tag analysis for ${data.urls.length} URLs</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card">
                    <div class="stat-value">${withCanonical.length}</div>
                    <div class="stat-label">Has Canonical</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${selfReferencing.length}</div>
                    <div class="stat-label">Self-Referencing</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${pointing.length}</div>
                    <div class="stat-label">Points to Other</div>
                </div>
                <div class="report-stat-card stat-warning">
                    <div class="stat-value">${missing.length}</div>
                    <div class="stat-label">Missing Canonical</div>
                </div>
            </div>

            ${missing.length > 0 ? `
                <div class="report-section">
                    <h3>URLs Missing Canonical Tag</h3>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>Title</th></tr>
                            </thead>
                            <tbody>
                                ${missing.slice(0, 50).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td>${url.title || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${missing.length > 50 ? `<p class="report-note">Showing first 50 of ${missing.length}</p>` : ''}
                </div>
            ` : '<div class="report-success"><span>✅</span> All pages have canonical tags!</div>'}

            ${pointing.length > 0 ? `
                <div class="report-section">
                    <h3>Canonicalized URLs (Point to Other)</h3>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>Canonical Target</th></tr>
                            </thead>
                            <tbody>
                                ${pointing.slice(0, 50).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td class="url-cell" title="${url.canonical_url}">${this.truncateUrl(url.canonical_url)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}
        `;
    },

    /**
     * Generate Insecure Content report
     */
    generateInsecureContentReport(data) {
        // Find HTTP URLs on HTTPS site
        const httpsUrls = data.urls.filter(url => url.url?.startsWith('https://'));
        const httpUrls = data.urls.filter(url => url.url?.startsWith('http://') && !url.url?.startsWith('https://'));

        // Find security-related issues
        const securityIssues = data.issues.filter(issue =>
            issue.category === 'Security' ||
            issue.message?.toLowerCase().includes('insecure') ||
            issue.message?.toLowerCase().includes('http://')
        );

        return `
            <div class="report-header">
                <h2>🔓 Insecure Content</h2>
                <p class="report-subtitle">Security analysis for ${data.urls.length} URLs</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card">
                    <div class="stat-value">${httpsUrls.length}</div>
                    <div class="stat-label">HTTPS URLs</div>
                </div>
                <div class="report-stat-card stat-warning">
                    <div class="stat-value">${httpUrls.length}</div>
                    <div class="stat-label">HTTP URLs</div>
                </div>
                <div class="report-stat-card stat-error">
                    <div class="stat-value">${securityIssues.length}</div>
                    <div class="stat-label">Security Issues</div>
                </div>
            </div>

            ${httpUrls.length > 0 ? `
                <div class="report-section">
                    <h3>HTTP URLs (Not Secure)</h3>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                ${httpUrls.slice(0, 50).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td><span class="status-badge">${url.status_code || '-'}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${httpUrls.length > 50 ? `<p class="report-note">Showing first 50 of ${httpUrls.length}</p>` : ''}
                </div>
            ` : ''}

            ${securityIssues.length > 0 ? `
                <div class="report-section">
                    <h3>Security Issues</h3>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>Severity</th><th>Issue</th><th>URL</th></tr>
                            </thead>
                            <tbody>
                                ${securityIssues.slice(0, 50).map(issue => `
                                    <tr>
                                        <td><span class="severity-badge severity-${issue.severity}">${issue.severity}</span></td>
                                        <td>${issue.message}</td>
                                        <td class="url-cell" title="${issue.url}">${this.truncateUrl(issue.url)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            ${httpUrls.length === 0 && securityIssues.length === 0 ?
                '<div class="report-success"><span>✅</span> All content is served securely over HTTPS!</div>' : ''}
        `;
    },

    /**
     * Generate Orphan Pages report
     */
    generateOrphanPagesReport(data) {
        // Find pages with no internal inlinks
        const urlsWithInlinks = new Set();

        // Check links to find which URLs are linked to
        data.links.forEach(link => {
            if (link.target_url) {
                urlsWithInlinks.add(link.target_url);
            }
        });

        // URLs also have inlink counts
        data.urls.forEach(url => {
            if (url.internal_inlinks && url.internal_inlinks > 0) {
                urlsWithInlinks.add(url.url);
            }
        });

        // Find orphans (200 OK pages with no inlinks)
        const orphans = data.urls.filter(url =>
            url.status_code === 200 &&
            !urlsWithInlinks.has(url.url) &&
            (url.internal_inlinks === 0 || url.internal_inlinks === undefined)
        );

        return `
            <div class="report-header">
                <h2>👻 Orphan Pages</h2>
                <p class="report-subtitle">Pages with no internal inlinks</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card stat-warning">
                    <div class="stat-value">${orphans.length}</div>
                    <div class="stat-label">Orphan Pages</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${data.urls.filter(u => u.status_code === 200).length - orphans.length}</div>
                    <div class="stat-label">Linked Pages</div>
                </div>
            </div>

            ${orphans.length > 0 ? `
                <div class="report-section">
                    <h3>Orphan Pages (No Internal Links)</h3>
                    <p class="report-description">These pages have no internal links pointing to them, making them hard to discover.</p>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>Title</th><th>Word Count</th></tr>
                            </thead>
                            <tbody>
                                ${orphans.slice(0, 50).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td>${url.title || '-'}</td>
                                        <td>${url.word_count || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ${orphans.length > 50 ? `<p class="report-note">Showing first 50 of ${orphans.length}</p>` : ''}
                </div>
            ` : '<div class="report-success"><span>✅</span> No orphan pages found! All pages have internal links.</div>'}
        `;
    },

    /**
     * Generate Structured Data report
     */
    generateStructuredDataReport(data) {
        const withStructuredData = data.urls.filter(url =>
            (url.json_ld_count && url.json_ld_count > 0) ||
            (url.microdata_count && url.microdata_count > 0)
        );
        const withJsonLd = data.urls.filter(url => url.json_ld_count && url.json_ld_count > 0);
        const withMicrodata = data.urls.filter(url => url.microdata_count && url.microdata_count > 0);
        const without = data.urls.filter(url =>
            url.status_code === 200 &&
            (!url.json_ld_count || url.json_ld_count === 0) &&
            (!url.microdata_count || url.microdata_count === 0)
        );

        return `
            <div class="report-header">
                <h2>📋 Structured Data</h2>
                <p class="report-subtitle">JSON-LD and Schema.org markup analysis</p>
            </div>

            <div class="report-stats-grid">
                <div class="report-stat-card">
                    <div class="stat-value">${withStructuredData.length}</div>
                    <div class="stat-label">Has Structured Data</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${withJsonLd.length}</div>
                    <div class="stat-label">JSON-LD</div>
                </div>
                <div class="report-stat-card">
                    <div class="stat-value">${withMicrodata.length}</div>
                    <div class="stat-label">Microdata</div>
                </div>
                <div class="report-stat-card stat-info">
                    <div class="stat-value">${without.length}</div>
                    <div class="stat-label">No Structured Data</div>
                </div>
            </div>

            ${withStructuredData.length > 0 ? `
                <div class="report-section">
                    <h3>Pages with Structured Data</h3>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>JSON-LD</th><th>Microdata</th></tr>
                            </thead>
                            <tbody>
                                ${withStructuredData.slice(0, 50).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td>${url.json_ld_count || 0}</td>
                                        <td>${url.microdata_count || 0}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            ${without.length > 0 && without.length < 50 ? `
                <div class="report-section">
                    <h3>Pages Without Structured Data</h3>
                    <p class="report-description">Consider adding JSON-LD markup for rich search results.</p>
                    <div class="report-table-container">
                        <table class="report-table">
                            <thead>
                                <tr><th>URL</th><th>Title</th></tr>
                            </thead>
                            <tbody>
                                ${without.slice(0, 20).map(url => `
                                    <tr>
                                        <td class="url-cell" title="${url.url}">${this.truncateUrl(url.url)}</td>
                                        <td>${url.title || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            ${withStructuredData.length === 0 ?
                '<div class="report-info"><span>ℹ️</span> No structured data found. Consider adding JSON-LD markup for better search visibility.</div>' : ''}
        `;
    },

    /**
     * Helper to truncate long URLs
     */
    truncateUrl(url, maxLength = 60) {
        if (!url || url === '-') return '-';
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.ReportsModule = ReportsModule;
}
