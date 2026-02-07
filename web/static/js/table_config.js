/**
 * Table Configuration Manager
 * Defines column groups (sub-tabs) and individual columns for data tables.
 */

const TableConfig = {
    // Current visibility state
    visibility: {
        groups: {},
        columns: {}
    },

    // Default column groups (tabs)
    groups: [
        { id: 'internal', label: 'Internal', default: true },
        { id: 'external', label: 'External', default: true },
        { id: 'security', label: 'Security', default: true },
        { id: 'response_codes', label: 'Response Codes', default: true },
        { id: 'url', label: 'URL', default: true },
        { id: 'page_titles', label: 'Page Titles', default: true },
        { id: 'meta_description', label: 'Meta Description', default: true },
        { id: 'meta_keywords', label: 'Meta Keywords', default: true },
        { id: 'h1', label: 'H1', default: true },
        { id: 'h2', label: 'H2', default: true },
        { id: 'content', label: 'Content', default: true },
        { id: 'images', label: 'Images', default: true },
        { id: 'canonicals', label: 'Canonicals', default: true },
        { id: 'pagination', label: 'Pagination', default: true },
        { id: 'directives', label: 'Directives', default: true },
        { id: 'hreflang', label: 'Hreflang', default: true },
        { id: 'javascript', label: 'JavaScript', default: true },
        { id: 'links', label: 'Links', default: true },
        { id: 'amp', label: 'AMP', default: false },
        { id: 'structured_data', label: 'Structured Data', default: false },
        { id: 'sitemaps', label: 'Sitemaps', default: false },
        { id: 'pagespeed', label: 'PageSpeed', default: false },
        { id: 'mobile', label: 'Mobile', default: false },
        { id: 'accessibility', label: 'Accessibility', default: false },
        { id: 'custom_search', label: 'Custom Search', default: false },
        { id: 'custom_extraction', label: 'Custom Extraction', default: false },
        { id: 'analytics', label: 'Analytics', default: false },
        { id: 'search_console', label: 'Search Console', default: false },
        { id: 'validation', label: 'Validation', default: false },
        { id: 'link_metrics', label: 'Link Metrics', default: false },
        { id: 'ai', label: 'AI', default: false }
    ],

    // Mapping of groups to columns
    columnMapping: {
        'internal': ['url', 'status_code', 'content_type', 'size', 'title'],
        'external': ['url', 'status_code', 'content_type', 'size'],
        'security': ['url', 'security_status', 'hsts', 'x_content_type_options', 'x_frame_options', 'x_xss_protection'],
        'response_codes': ['url', 'status_code', 'status_text', 'redirect_url', 'redirect_type'],
        'url': ['url', 'url_length', 'depth', 'query_count'],
        'page_titles': ['url', 'title', 'title_length', 'title_pixel_width'],
        'meta_description': ['url', 'meta_description', 'meta_description_length', 'meta_description_pixel_width'],
        'meta_keywords': ['url', 'meta_keywords', 'meta_keywords_count'],
        'h1': ['url', 'h1', 'h1_length', 'h1_count'],
        'h2': ['url', 'h2', 'h2_length', 'h2_count'],
        'content': ['url', 'word_count', 'text_code_ratio', 'readability_score', 'hash_value'],
        'images': ['url', 'images_count', 'images_missing_alt', 'images_total_size'],
        'canonicals': ['url', 'canonical_url', 'canonical_status'],
        'pagination': ['url', 'prev_link', 'next_link'],
        'directives': ['url', 'meta_robots', 'x_robots_tag', 'canonical_link'],
        'hreflang': ['url', 'hreflang_count', 'hreflang_tags'],
        'javascript': ['url', 'js_rendered', 'js_errors', 'js_warnings'],
        'links': ['url', 'internal_links_count', 'external_links_count', 'total_links_count'],
        'amp': ['url', 'amp_url', 'amp_status'],
        'structured_data': ['url', 'json_ld_count', 'microdata_count', 'rdfa_count', 'schema_validation'],
        'sitemaps': ['url', 'in_sitemap', 'sitemap_url'],
        'pagespeed': ['url', 'performance_score', 'lcp', 'fid', 'cls', 'tbt'],
        'mobile': ['url', 'mobile_friendly', 'viewport'],
        'accessibility': ['url', 'aria_count', 'contrast_issues', 'alt_missing'],
        'custom_search': ['url', 'search_match_count'],
        'custom_extraction': ['url', 'extraction_results'],
        'analytics': [
            'url',
            'ga_id',
            'gtm_id',
            'fb_pixel',
            'ga4_sessions',
            'ga4_screen_page_views',
            'ga4_engaged_sessions',
            'ga4_engagement_rate',
            'ga4_key_events',
            'ga4_event_count',
            'ga4_total_revenue'
        ],
        'search_console': ['url', 'sc_clicks', 'sc_impressions', 'sc_ctr', 'sc_position'],
        'validation': ['url', 'html_errors', 'html_warnings', 'css_errors'],
        'link_metrics': ['url', 'inlinks', 'outlinks', 'moz_da', 'moz_pa'],
        'ai': ['url', 'ai_summary', 'ai_sentiment', 'ai_entities']
    },

    // Column labels
    columnLabels: {
        'url': 'Address',
        'status_code': 'Status Code',
        'content_type': 'Content Type',
        'size': 'Size (B)',
        'title': 'Title',
        'status_text': 'Status',
        'redirect_url': 'Redirect URL',
        'redirect_type': 'Redirect Type',
        'security_status': 'Security',
        'hsts': 'HSTS',
        'x_content_type_options': 'X-Content-Type',
        'x_frame_options': 'X-Frame',
        'x_xss_protection': 'X-XSS',
        'url_length': 'URL Length',
        'depth': 'Depth',
        'query_count': 'Query Count',
        'title_length': 'Title Length',
        'title_pixel_width': 'Title Pixels',
        'meta_description': 'Meta Description',
        'meta_description_length': 'Desc Length',
        'meta_description_pixel_width': 'Desc Pixels',
        'meta_keywords': 'Meta Keywords',
        'meta_keywords_count': 'Keywords Count',
        'h1': 'H1',
        'h1_length': 'H1 Length',
        'h1_count': 'H1 Count',
        'h2': 'H2',
        'h2_length': 'H2 Length',
        'h2_count': 'H2 Count',
        'word_count': 'Word Count',
        'text_code_ratio': 'Text/Code Ratio',
        'readability_score': 'Readability',
        'hash_value': 'Hash',
        'images_count': 'Images',
        'images_missing_alt': 'Missing Alt',
        'images_total_size': 'Images Size',
        'canonical_url': 'Canonical URL',
        'canonical_status': 'Canonical Status',
        'prev_link': 'Rel=Prev',
        'next_link': 'Rel=Next',
        'meta_robots': 'Meta Robots',
        'x_robots_tag': 'X-Robots-Tag',
        'canonical_link': 'Link Canonical',
        'hreflang_count': 'Hreflang Count',
        'hreflang_tags': 'Hreflang Tags',
        'js_rendered': 'JS Rendered',
        'js_errors': 'JS Errors',
        'js_warnings': 'JS Warnings',
        'internal_links_count': 'Int. Links',
        'external_links_count': 'Ext. Links',
        'total_links_count': 'Total Links',
        'amp_url': 'AMP URL',
        'amp_status': 'AMP Status',
        'json_ld_count': 'JSON-LD',
        'microdata_count': 'Microdata',
        'rdfa_count': 'RDFa',
        'schema_validation': 'Schema valid',
        'in_sitemap': 'In Sitemap',
        'sitemap_url': 'Sitemap URL',
        'performance_score': 'Perf Score',
        'lcp': 'LCP',
        'fid': 'FID',
        'cls': 'CLS',
        'tbt': 'TBT',
        'mobile_friendly': 'Mobile Friendly',
        'viewport': 'Viewport',
        'aria_count': 'ARIA Count',
        'contrast_issues': 'Contrast Issues',
        'alt_missing': 'Alt Missing',
        'search_match_count': 'Search Matches',
        'extraction_results': 'Extraction Results',
        'ga_id': 'GA ID',
        'gtm_id': 'GTM ID',
        'fb_pixel': 'FB Pixel',
        'ga4_sessions': 'GA4 Sessions',
        'ga4_screen_page_views': 'GA4 Views',
        'ga4_engaged_sessions': 'GA4 Engaged Sessions',
        'ga4_engagement_rate': 'GA4 Engagement Rate',
        'ga4_key_events': 'GA4 Key Events',
        'ga4_event_count': 'GA4 Event Count',
        'ga4_total_revenue': 'GA4 Revenue',
        'sc_clicks': 'Clicks',
        'sc_impressions': 'Impressions',
        'sc_ctr': 'CTR',
        'sc_position': 'Position',
        'html_errors': 'HTML Errors',
        'html_warnings': 'HTML Warnings',
        'css_errors': 'CSS Errors',
        'inlinks': 'Inlinks',
        'outlinks': 'Outlinks',
        'moz_da': 'Moz DA',
        'moz_pa': 'Moz PA',
        'ai_summary': 'AI Summary',
        'ai_sentiment': 'Sentiment',
        'ai_entities': 'Entities'
    },

    /**
     * Initialize configuration from localStorage or defaults
     */
    init() {
        const saved = localStorage.getItem('wailingnewt_table_visibility');
        if (saved) {
            try {
                this.visibility = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse table visibility settings', e);
                this.resetToDefaults();
            }
        } else {
            this.resetToDefaults();
        }
    },

    /**
     * Reset visibility to defaults
     */
    resetToDefaults() {
        this.visibility.groups = {};
        this.groups.forEach(g => {
            this.visibility.groups[g.id] = g.default;
        });

        // Initially show internal group columns
        this.updateActiveColumns('internal');
        this.save();
    },

    /**
     * Save current visibility state
     */
    save() {
        localStorage.setItem('wailingnewt_table_visibility', JSON.stringify(this.visibility));
    },

    /**
     * Update active columns based on a selected group
     * @param {string} groupId 
     */
    updateActiveColumns(groupId) {
        // This logic can be more complex if we want multi-group views
        // For now, we mirror the Screaming Frog sub-tab behavior
        const columns = this.columnMapping[groupId] || [];
        this.visibility.activeColumns = columns;
        this.visibility.activeGroup = groupId;
    },

    /**
     * Toggle a group's presence in the sub-nav
     * @param {string} groupId 
     */
    toggleGroup(groupId) {
        if (this.visibility.groups[groupId] !== undefined) {
            this.visibility.groups[groupId] = !this.visibility.groups[groupId];
            this.save();
        }
    },

    /**
     * Get columns for a specific table
     * @returns {Array} List of column objects {id, label}
     */
    getActiveColumns() {
        const columns = this.visibility.activeColumns || this.columnMapping['internal'];
        return columns.map(id => ({
            id: id,
            label: this.columnLabels[id] || id
        }));
    }
};

// Auto-init
TableConfig.init();
