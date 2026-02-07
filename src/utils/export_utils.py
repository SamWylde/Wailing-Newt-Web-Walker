import csv
import json
import time
import xml.etree.ElementTree as ET
from io import StringIO

GA4_EXPORT_METRIC_ALIASES = {
    'ga4_sessions': 'sessions',
    'ga4_screen_page_views': 'screenPageViews',
    'ga4_engaged_sessions': 'engagedSessions',
    'ga4_engagement_rate': 'engagementRate',
    'ga4_key_events': 'keyEvents',
    'ga4_event_count': 'eventCount',
    'ga4_total_revenue': 'totalRevenue',
}


def _get_nested_value(data, path_parts):
    current = data
    for part in path_parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _get_ga4_block(url_data):
    analytics = url_data.get('analytics', {})
    if not isinstance(analytics, dict):
        analytics = {}
    ga4 = url_data.get('ga4')
    if not isinstance(ga4, dict):
        ga4 = analytics.get('ga4', {})
    if not isinstance(ga4, dict):
        ga4 = {}
    return ga4


def _get_export_field_value(url_data, field):
    # Support explicit GA4 metric field ids in exports.
    if field in GA4_EXPORT_METRIC_ALIASES:
        metric_name = GA4_EXPORT_METRIC_ALIASES[field]
        ga4_metrics = _get_ga4_block(url_data).get('metrics', {})
        if isinstance(ga4_metrics, dict) and metric_name in ga4_metrics:
            return ga4_metrics.get(metric_name)
        analytics = url_data.get('analytics', {})
        if isinstance(analytics, dict):
            return analytics.get(field, '')
        return ''

    if field.startswith('ga4.metrics.'):
        metric_name = field.split('.', 2)[2]
        ga4_metrics = _get_ga4_block(url_data).get('metrics', {})
        if isinstance(ga4_metrics, dict):
            return ga4_metrics.get(metric_name, '')
        return ''

    if field == 'ga4_last_sync_at':
        return _get_ga4_block(url_data).get('last_sync_at', '')
    if field == 'ga4_sync_status':
        return _get_ga4_block(url_data).get('sync_status', '')
    if field == 'ga4_matched_dimension_value':
        return _get_ga4_block(url_data).get('matched_dimension_value', '')
    if field == 'ga4':
        return _get_ga4_block(url_data)

    # Support nested selectors (e.g. ga4.metrics.sessions)
    if '.' in field:
        nested_value = _get_nested_value(url_data, field.split('.'))
        if nested_value is not None:
            return nested_value

    return url_data.get(field, '')


def generate_csv_export(urls, fields):
    """Generate CSV export content."""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()

    for url_data in urls:
        row = {}
        for field in fields:
            value = _get_export_field_value(url_data, field)

            if field == 'analytics' and isinstance(value, dict):
                analytics_list = []
                if value.get('gtag') or value.get('ga4_id'):
                    analytics_list.append('GA4')
                if value.get('google_analytics'):
                    analytics_list.append('GA')
                if value.get('gtm_id'):
                    analytics_list.append('GTM')
                if value.get('facebook_pixel'):
                    analytics_list.append('FB')
                if value.get('hotjar'):
                    analytics_list.append('HJ')
                if value.get('mixpanel'):
                    analytics_list.append('MP')
                if isinstance(value.get('ga4'), dict) and value['ga4'].get('metrics'):
                    analytics_list.append('GA4 Data')
                row[field] = ', '.join(analytics_list)
            elif field == 'og_tags' and isinstance(value, dict):
                row[field] = f"{len(value)} tags" if value else ''
            elif field == 'twitter_tags' and isinstance(value, dict):
                row[field] = f"{len(value)} tags" if value else ''
            elif field == 'json_ld' and isinstance(value, list):
                row[field] = f"{len(value)} scripts" if value else ''
            elif field == 'images' and isinstance(value, list):
                row[field] = f"{len(value)} images" if value else ''
            elif field == 'internal_links' and isinstance(value, (int, float)):
                row[field] = f"{int(value)} internal links" if value else '0 internal links'
            elif field == 'external_links' and isinstance(value, (int, float)):
                row[field] = f"{int(value)} external links" if value else '0 external links'
            elif field == 'h2' and isinstance(value, list):
                row[field] = ', '.join(value[:3]) + ('...' if len(value) > 3 else '')
            elif field == 'h3' and isinstance(value, list):
                row[field] = ', '.join(value[:3]) + ('...' if len(value) > 3 else '')
            elif isinstance(value, (dict, list)):
                row[field] = json.dumps(value)
            else:
                row[field] = value

        writer.writerow(row)

    return output.getvalue()


def generate_json_export(urls, fields):
    """Generate JSON export content."""
    filtered_urls = []
    for url_data in urls:
        filtered_data = {}
        for field in fields:
            filtered_data[field] = _get_export_field_value(url_data, field)
        filtered_urls.append(filtered_data)

    return json.dumps({
        'export_date': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_urls': len(filtered_urls),
        'fields': fields,
        'data': filtered_urls
    }, indent=2, default=str)


def generate_xml_export(urls, fields):
    """Generate XML export content."""
    root = ET.Element('wailingnewt_export')
    root.set('export_date', time.strftime('%Y-%m-%d %H:%M:%S'))
    root.set('total_urls', str(len(urls)))

    urls_element = ET.SubElement(root, 'urls')

    for url_data in urls:
        url_element = ET.SubElement(urls_element, 'url')
        for field in fields:
            field_element = ET.SubElement(url_element, field)
            value = _get_export_field_value(url_data, field)
            if isinstance(value, (dict, list)):
                field_element.text = json.dumps(value)
            else:
                field_element.text = str(value)

    return ET.tostring(root, encoding='unicode')


def generate_links_csv_export(links):
    """Generate CSV export for links data."""
    output = StringIO()
    fieldnames = ['source_url', 'target_url', 'anchor_text', 'is_internal', 'target_domain', 'target_status', 'placement']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for link in links:
        row = {
            'source_url': link.get('source_url', ''),
            'target_url': link.get('target_url', ''),
            'anchor_text': link.get('anchor_text', ''),
            'is_internal': 'Yes' if link.get('is_internal') else 'No',
            'target_domain': link.get('target_domain', ''),
            'target_status': link.get('target_status', 'Not crawled'),
            'placement': link.get('placement', 'body')
        }
        writer.writerow(row)

    return output.getvalue()


def generate_links_json_export(links):
    """Generate JSON export for links data."""
    return json.dumps(links, indent=2)


def generate_issues_csv_export(issues):
    """Generate CSV export for issues data."""
    output = StringIO()
    fieldnames = ['url', 'type', 'category', 'issue', 'details']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for issue in issues:
        row = {
            'url': issue.get('url', ''),
            'type': issue.get('type', ''),
            'category': issue.get('category', ''),
            'issue': issue.get('issue', ''),
            'details': issue.get('details', '')
        }
        writer.writerow(row)

    return output.getvalue()


def generate_issues_json_export(issues):
    """Generate JSON export for issues data."""
    issues_by_url = {}
    for issue in issues:
        url = issue.get('url', '')
        if url not in issues_by_url:
            issues_by_url[url] = []
        issues_by_url[url].append({
            'type': issue.get('type', ''),
            'category': issue.get('category', ''),
            'issue': issue.get('issue', ''),
            'details': issue.get('details', '')
        })

    return json.dumps({
        'export_date': time.strftime('%Y-%m-%d %H:%M:%S'),
        'total_issues': len(issues),
        'total_urls_with_issues': len(issues_by_url),
        'issues_by_url': issues_by_url,
        'all_issues': issues
    }, indent=2)
