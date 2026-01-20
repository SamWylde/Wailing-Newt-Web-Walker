from flask import Blueprint, current_app, redirect, render_template, session, url_for

from src.auth_utils import auto_login_local_mode, login_required

pages_bp = Blueprint('pages', __name__)


@pages_bp.route('/')
def index():
    if current_app.config.get('LOCAL_MODE') and 'user_id' not in session:
        auto_login_local_mode()
    elif 'user_id' not in session:
        return redirect(url_for('auth.login_page'))
    return render_template('index.html')


@pages_bp.route('/dashboard')
@login_required
def dashboard():
    """Crawl history dashboard."""
    return render_template('dashboard.html')


@pages_bp.route('/debug/memory')
@login_required
def debug_memory_page():
    """Debug page with UI for memory monitoring."""
    return render_template('debug_memory.html')
