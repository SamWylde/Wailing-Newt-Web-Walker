"""
API endpoints for robots.txt configuration and analysis.
"""
from flask import Blueprint, jsonify, request, session
from src.app_state import get_crawler_for_session
from src.core.robots_parser import RobotsParser, CustomRobotsManager

robots_bp = Blueprint('robots', __name__)

# Store custom robots managers per session
_custom_robots_managers = {}


def get_custom_robots_manager(session_id: str) -> CustomRobotsManager:
    """Get or create a CustomRobotsManager for the session."""
    if session_id not in _custom_robots_managers:
        _custom_robots_managers[session_id] = CustomRobotsManager()
    return _custom_robots_managers[session_id]


@robots_bp.route('/api/robots/fetch', methods=['POST'])
def fetch_robots():
    """Fetch and parse robots.txt from a URL."""
    try:
        data = request.get_json()
        url = data.get('url')
        user_agent = data.get('user_agent', 'WailingNewt/1.0')

        if not url:
            return jsonify({'success': False, 'error': 'URL is required'}), 400

        parser = RobotsParser()
        success = parser.fetch_and_parse(url, user_agent)

        if success:
            analysis = parser.get_analysis(user_agent)
            return jsonify({
                'success': True,
                'data': analysis
            })
        else:
            return jsonify({
                'success': False,
                'error': parser.parse_errors[0] if parser.parse_errors else 'Failed to fetch robots.txt'
            })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/parse', methods=['POST'])
def parse_robots():
    """Parse robots.txt content directly."""
    try:
        data = request.get_json()
        content = data.get('content', '')
        user_agent = data.get('user_agent', '*')

        parser = RobotsParser()
        parser.parse(content)

        analysis = parser.get_analysis(user_agent)
        return jsonify({
            'success': True,
            'data': analysis
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/test', methods=['POST'])
def test_path():
    """Test if a path is allowed by robots.txt."""
    try:
        data = request.get_json()
        url = data.get('url')
        path = data.get('path')
        content = data.get('content')
        user_agent = data.get('user_agent', '*')

        parser = RobotsParser()

        if content:
            # Use provided robots.txt content
            parser.parse(content)
        elif url:
            # Fetch from URL
            if not parser.fetch_and_parse(url, user_agent):
                return jsonify({
                    'success': False,
                    'error': parser.parse_errors[0] if parser.parse_errors else 'Failed to fetch robots.txt'
                })
        else:
            return jsonify({'success': False, 'error': 'URL or content is required'}), 400

        if not path:
            return jsonify({'success': False, 'error': 'Path is required'}), 400

        result = parser.test_path(path, user_agent)
        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/download', methods=['POST'])
def download_robots():
    """Download robots.txt content from a URL."""
    try:
        data = request.get_json()
        url = data.get('url')

        if not url:
            return jsonify({'success': False, 'error': 'URL is required'}), 400

        parser = RobotsParser()
        success = parser.fetch_and_parse(url)

        if success:
            return jsonify({
                'success': True,
                'content': parser.raw_content,
                'url': parser.url
            })
        else:
            return jsonify({
                'success': False,
                'error': parser.parse_errors[0] if parser.parse_errors else 'Failed to fetch robots.txt'
            })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/custom/list', methods=['GET'])
def list_custom_subdomains():
    """List all subdomains with custom robots.txt."""
    try:
        session_id = session.get('session_id', 'default')
        manager = get_custom_robots_manager(session_id)

        subdomains = manager.get_all_subdomains()
        return jsonify({
            'success': True,
            'subdomains': subdomains
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/custom/get', methods=['POST'])
def get_custom_robots():
    """Get custom robots.txt content for a subdomain."""
    try:
        session_id = session.get('session_id', 'default')
        manager = get_custom_robots_manager(session_id)

        data = request.get_json()
        subdomain = data.get('subdomain')

        if not subdomain:
            return jsonify({'success': False, 'error': 'Subdomain is required'}), 400

        content = manager.get_subdomain_content(subdomain)

        if content is not None:
            return jsonify({
                'success': True,
                'subdomain': subdomain,
                'content': content
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Subdomain not found'
            }), 404

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/custom/save', methods=['POST'])
def save_custom_robots():
    """Save custom robots.txt for a subdomain."""
    try:
        session_id = session.get('session_id', 'default')
        manager = get_custom_robots_manager(session_id)

        data = request.get_json()
        subdomain = data.get('subdomain')
        content = data.get('content', '')

        if not subdomain:
            return jsonify({'success': False, 'error': 'Subdomain is required'}), 400

        manager.add_subdomain(subdomain, content)

        return jsonify({
            'success': True,
            'message': f'Custom robots.txt saved for {subdomain}'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/custom/delete', methods=['POST'])
def delete_custom_robots():
    """Delete custom robots.txt for a subdomain."""
    try:
        session_id = session.get('session_id', 'default')
        manager = get_custom_robots_manager(session_id)

        data = request.get_json()
        subdomain = data.get('subdomain')

        if not subdomain:
            return jsonify({'success': False, 'error': 'Subdomain is required'}), 400

        if manager.remove_subdomain(subdomain):
            return jsonify({
                'success': True,
                'message': f'Custom robots.txt deleted for {subdomain}'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Subdomain not found'
            }), 404

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/custom/test', methods=['POST'])
def test_custom_robots():
    """Test a path against custom robots.txt for a subdomain."""
    try:
        session_id = session.get('session_id', 'default')
        manager = get_custom_robots_manager(session_id)

        data = request.get_json()
        subdomain = data.get('subdomain')
        path = data.get('path')
        user_agent = data.get('user_agent', '*')

        if not subdomain:
            return jsonify({'success': False, 'error': 'Subdomain is required'}), 400

        if not path:
            return jsonify({'success': False, 'error': 'Path is required'}), 400

        result = manager.test_path(subdomain, path, user_agent)
        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/blocked', methods=['GET'])
def get_blocked_urls():
    """Get list of URLs blocked by robots.txt during crawl."""
    try:
        session_id = session.get('session_id', 'default')
        crawler = get_crawler_for_session(session_id)

        if not crawler:
            return jsonify({
                'success': True,
                'data': {
                    'internal': [],
                    'external': [],
                    'counts': {'internal': 0, 'external': 0, 'total': 0}
                }
            })

        # Get blocked URLs from crawler if tracking is enabled
        blocked_tracker = getattr(crawler, 'robots_blocked_tracker', None)

        if blocked_tracker:
            return jsonify({
                'success': True,
                'data': {
                    'internal': blocked_tracker.get_blocked_internal(),
                    'external': blocked_tracker.get_blocked_external(),
                    'counts': blocked_tracker.get_blocked_count()
                }
            })
        else:
            return jsonify({
                'success': True,
                'data': {
                    'internal': [],
                    'external': [],
                    'counts': {'internal': 0, 'external': 0, 'total': 0}
                }
            })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/settings', methods=['GET'])
def get_robots_settings():
    """Get current robots.txt settings."""
    try:
        session_id = session.get('session_id', 'default')
        crawler = get_crawler_for_session(session_id)

        settings = {
            'robotsMode': 'respect',
            'showInternalBlocked': True,
            'showExternalBlocked': True,
            'customRobotsEnabled': False,
            'userAgent': 'WailingNewt/1.0'
        }

        if crawler and hasattr(crawler, 'config'):
            settings['robotsMode'] = 'respect' if crawler.config.get('respect_robots', True) else 'ignore'
            settings['userAgent'] = crawler.config.get('user_agent', 'WailingNewt/1.0')

        # Get custom robots manager settings
        manager = get_custom_robots_manager(session_id)
        settings['customRobotsEnabled'] = len(manager.get_all_subdomains()) > 0

        return jsonify({
            'success': True,
            'settings': settings
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@robots_bp.route('/api/robots/settings', methods=['POST'])
def save_robots_settings():
    """Save robots.txt settings."""
    try:
        session_id = session.get('session_id', 'default')
        crawler = get_crawler_for_session(session_id)

        data = request.get_json()

        if crawler:
            robots_mode = data.get('robotsMode', 'respect')
            crawler.config['respect_robots'] = robots_mode == 'respect'

            if 'userAgent' in data:
                crawler.config['user_agent'] = data['userAgent']

            # Update session headers
            crawler.session.headers.update({
                'User-Agent': crawler.config['user_agent']
            })

        return jsonify({
            'success': True,
            'message': 'Robots settings saved'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
