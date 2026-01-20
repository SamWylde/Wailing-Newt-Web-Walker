from flask import Blueprint, current_app, jsonify, request, session

from src.app_state import get_or_create_crawler, get_session_settings
from src.auth_db import get_guest_crawls_last_24h, log_crawl_start, log_guest_crawl
from src.auth_utils import get_client_ip, login_required
from src.utils.issue_filters import filter_issues_by_exclusion_patterns

crawl_bp = Blueprint('crawl', __name__)


@crawl_bp.route('/api/start_crawl', methods=['POST'])
@login_required
def start_crawl():
    data = request.get_json(silent=True) or {}
    url = data.get('url')
    extra_urls = data.get('extra_urls', [])

    if not url:
        return jsonify({'success': False, 'error': 'URL is required'})

    user_id = session.get('user_id')
    tier = session.get('tier', 'guest')

    if tier == 'guest' and not current_app.config.get('LOCAL_MODE'):
        client_ip = get_client_ip()
        crawls_from_ip = get_guest_crawls_last_24h(client_ip)

        if crawls_from_ip >= 3:
            return jsonify({
                'success': False,
                'error': 'Guest limit reached: 3 crawls per 24 hours from your IP address. Please register for unlimited crawls.'
            })

        log_guest_crawl(client_ip)

    crawler = get_or_create_crawler()
    settings_manager = get_session_settings()
    session_id = session.get('session_id')

    try:
        crawler_config = settings_manager.get_crawler_config()
        crawler.update_config(crawler_config)
    except Exception as e:
        print(f"Warning: Could not apply settings: {e}")

    success, message = crawler.start_crawl(url, user_id=user_id, session_id=session_id, extra_urls=extra_urls)

    if success and crawler.crawl_id:
        session['current_crawl_id'] = crawler.crawl_id
        log_crawl_start(user_id, url)

    return jsonify({'success': success, 'message': message, 'crawl_id': crawler.crawl_id})


@crawl_bp.route('/api/stop_crawl', methods=['POST'])
@login_required
def stop_crawl():
    crawler = get_or_create_crawler()
    success, message = crawler.stop_crawl()
    return jsonify({'success': success, 'message': message})


@crawl_bp.route('/api/crawl_status')
@login_required
def crawl_status():
    crawler = get_or_create_crawler()
    settings_manager = get_session_settings()

    url_since = request.args.get('url_since', type=int)
    link_since = request.args.get('link_since', type=int)
    issue_since = request.args.get('issue_since', type=int)

    status_data = crawler.get_status()

    if crawler.base_url and 'stats' in status_data:
        status_data['stats']['baseUrl'] = crawler.base_url

    force_full = session.pop('force_full_refresh', False)

    if not force_full:
        if url_since is not None:
            status_data['urls'] = status_data.get('urls', [])[url_since:]
        if link_since is not None:
            status_data['links'] = status_data.get('links', [])[link_since:]
        if issue_since is not None:
            status_data['issues'] = status_data.get('issues', [])[issue_since:]

    issues = status_data.get('issues', [])
    if issues:
        current_settings = settings_manager.get_settings()
        exclusion_patterns_text = current_settings.get('issueExclusionPatterns', '')
        exclusion_patterns = [p.strip() for p in exclusion_patterns_text.split('\n') if p.strip()]
        filtered_issues = filter_issues_by_exclusion_patterns(issues, exclusion_patterns)
        status_data['issues'] = filtered_issues

    return jsonify(status_data)


@crawl_bp.route('/api/visualization_data')
@login_required
def visualization_data():
    """Get graph data for site structure visualization."""
    try:
        crawler = get_or_create_crawler()
        status_data = crawler.get_status()

        crawled_pages = status_data.get('urls', [])
        all_links = status_data.get('links', [])

        nodes = []
        edges = []
        url_to_id = {}

        max_nodes = 500
        pages_to_visualize = crawled_pages[:max_nodes]

        for idx, page in enumerate(pages_to_visualize):
            url = page.get('url', '')
            status_code = page.get('status_code', 0)

            if 200 <= status_code < 300:
                color = '#10b981'
            elif 300 <= status_code < 400:
                color = '#3b82f6'
            elif 400 <= status_code < 500:
                color = '#f59e0b'
            elif 500 <= status_code < 600:
                color = '#ef4444'
            else:
                color = '#6b7280'

            node = {
                'data': {
                    'id': f'node-{idx}',
                    'label': url.split('/')[-1] or url.split('//')[-1],
                    'url': url,
                    'status_code': status_code,
                    'title': page.get('title', ''),
                    'color': color,
                    'size': 30 if idx == 0 else 20
                }
            }
            nodes.append(node)
            url_to_id[url] = f'node-{idx}'

        edges_set = set()
        for link in all_links:
            if link.get('is_internal'):
                source_url = link.get('source_url', '')
                target_url = link.get('target_url', '')

                source_id = url_to_id.get(source_url)
                target_id = url_to_id.get(target_url)

                if source_id and target_id and source_id != target_id:
                    edge_key = f'{source_id}-{target_id}'
                    if edge_key not in edges_set:
                        edges_set.add(edge_key)
                        edge = {
                            'data': {
                                'id': f'edge-{edge_key}',
                                'source': source_id,
                                'target': target_id
                            }
                        }
                        edges.append(edge)

        return jsonify({
            'success': True,
            'nodes': nodes,
            'edges': edges,
            'total_pages': len(crawled_pages),
            'visualized_pages': len(nodes),
            'truncated': len(crawled_pages) > max_nodes
        })

    except Exception as e:
        import traceback
        print(f"Error generating visualization data: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'nodes': [],
            'edges': []
        })


@crawl_bp.route('/api/pause_crawl', methods=['POST'])
@login_required
def pause_crawl():
    try:
        crawler = get_or_create_crawler()
        success, message = crawler.pause_crawl()
        return jsonify({'success': success, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@crawl_bp.route('/api/resume_crawl', methods=['POST'])
@login_required
def resume_crawl():
    try:
        crawler = get_or_create_crawler()
        success, message = crawler.resume_crawl()
        return jsonify({'success': success, 'message': message})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
