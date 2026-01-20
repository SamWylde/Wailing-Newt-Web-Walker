import csv
from io import StringIO
from urllib.parse import parse_qs, urlparse

import requests
from flask import Blueprint, jsonify, request

from src.app_state import get_or_create_crawler, get_session_settings
from src.auth_utils import login_required
from src.core.sitemap_parser import SitemapParser
from src.utils.url_extract import extract_urls_from_text

imports_bp = Blueprint('imports', __name__)


def build_google_sheets_csv_url(sheet_url):
    parsed = urlparse(sheet_url)
    if 'docs.google.com' not in parsed.netloc:
        return None

    path_parts = parsed.path.split('/')
    if 'spreadsheets' not in path_parts or 'd' not in path_parts:
        return None

    try:
        sheet_id = path_parts[path_parts.index('d') + 1]
    except (ValueError, IndexError):
        return None

    query = parse_qs(parsed.query)
    gid = None
    if 'gid' in query:
        gid = query['gid'][0]

    if parsed.fragment.startswith('gid='):
        gid = parsed.fragment.split('gid=')[1]

    export_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:
        export_url = f"{export_url}&gid={gid}"

    return export_url


def parse_urls_from_csv(csv_text):
    reader = csv.reader(StringIO(csv_text))
    urls = []
    for row in reader:
        if not row:
            continue
        row_text = ' '.join(row)
        urls.extend(extract_urls_from_text(row_text))
    return urls


def dedupe_urls(urls):
    seen = set()
    ordered = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


@imports_bp.route('/api/sitemaps/discover', methods=['POST'])
@login_required
def discover_sitemaps():
    data = request.get_json(silent=True) or {}
    url = data.get('url')

    if not url:
        return jsonify({'success': False, 'error': 'URL is required'}), 400

    if not url.startswith(('http://', 'https://')):
        url = f"https://{url}"

    crawler = get_or_create_crawler()
    settings_manager = get_session_settings()

    try:
        crawler_config = settings_manager.get_crawler_config()
        crawler.update_config(crawler_config)
    except Exception as e:
        print(f"Warning: Could not apply settings: {e}")

    parsed = urlparse(url)
    base_domain = f"{parsed.scheme}://{parsed.netloc}"

    parser = SitemapParser(crawler.session, parsed.netloc, crawler.config.get('timeout', 10))

    try:
        urls = parser.discover_sitemaps(base_domain)
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to discover sitemaps: {e}"}), 500

    urls = dedupe_urls(urls)

    return jsonify({
        'success': True,
        'count': len(urls),
        'urls': urls
    })


@imports_bp.route('/api/import/google-sheets', methods=['POST'])
@login_required
def import_google_sheets():
    data = request.get_json(silent=True) or {}
    sheet_url = data.get('sheet_url')

    if not sheet_url:
        return jsonify({'success': False, 'error': 'Sheet URL is required'}), 400

    csv_url = None
    if sheet_url.endswith('.csv') or 'format=csv' in sheet_url:
        csv_url = sheet_url
    else:
        csv_url = build_google_sheets_csv_url(sheet_url)

    if not csv_url:
        return jsonify({'success': False, 'error': 'Unsupported Google Sheets URL'}), 400

    try:
        response = requests.get(csv_url, timeout=15)
    except requests.RequestException as e:
        return jsonify({'success': False, 'error': f"Unable to fetch sheet: {e}"}), 500

    if response.status_code != 200:
        return jsonify({'success': False, 'error': 'Unable to access sheet. Ensure it is shared publicly.'}), 400

    urls = parse_urls_from_csv(response.text)
    urls = dedupe_urls(urls)

    if not urls:
        return jsonify({'success': False, 'error': 'No URLs found in the sheet.'}), 400

    return jsonify({
        'success': True,
        'count': len(urls),
        'urls': urls
    })
