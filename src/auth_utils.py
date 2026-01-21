import secrets
import sqlite3
import string
from functools import wraps

from flask import current_app, jsonify, redirect, request, session, url_for

from src.auth_db import hash_password


def generate_random_password(length=16):
    """Generate a random password with letters, digits, and symbols."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def auto_login_local_mode():
    """Auto-login for local mode - creates or logs into 'local' admin account."""
    try:
        conn = sqlite3.connect('users.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, username, tier FROM users WHERE username = ?', ('local',))
        user = cursor.fetchone()

        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['tier'] = 'admin'
            session.permanent = True
            print(f"Auto-logged in as existing 'local' user (ID: {user['id']})")
        else:
            random_password = generate_random_password()
            password_hash = hash_password(random_password)

            cursor.execute('''
                INSERT INTO users (username, email, password_hash, verified, tier)
                VALUES (?, ?, ?, 1, 'admin')
            ''', ('local', 'local@localhost', password_hash))
            conn.commit()

            user_id = cursor.lastrowid
            session['user_id'] = user_id
            session['username'] = 'local'
            session['tier'] = 'admin'
            session.permanent = True

            print(f"Created and auto-logged in as new 'local' admin user (ID: {user_id})")
            print(f"Generated password: {random_password}")

        conn.close()
        return True
    except Exception as e:
        print(f"Error in auto_login_local_mode: {e}")
        return False


def get_client_ip():
    """Get the real client IP address, checking Cloudflare headers first."""
    if 'CF-Connecting-IP' in request.headers:
        return request.headers['CF-Connecting-IP']
    if 'X-Forwarded-For' in request.headers:
        return request.headers['X-Forwarded-For'].split(',')[0].strip()
    if 'X-Real-IP' in request.headers:
        return request.headers['X-Real-IP']
    return request.remote_addr


def login_required(view_func):
    """Decorator to require login for routes."""
    @wraps(view_func)
    def decorated_function(*args, **kwargs):
        if current_app.config.get('LOCAL_MODE') and 'user_id' not in session:
            auto_login_local_mode()
        elif 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'success': False, 'error': 'Authentication required'}), 401
            return redirect(url_for('auth.login_page'))
        return view_func(*args, **kwargs)

    return decorated_function
