import sqlite3

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, session, url_for

from src.auth_db import (
    authenticate_user,
    create_user,
    create_verification_token,
    get_user_by_email,
    get_guest_crawls_last_24h,
    get_crawls_last_24h,
    set_user_tier,
    verify_token,
    verify_user,
)
from src.email_service import send_verification_email, send_welcome_email
from src.auth_utils import auto_login_local_mode, get_client_ip, login_required


auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login')
def login_page():
    if current_app.config.get('LOCAL_MODE'):
        auto_login_local_mode()
        return redirect(url_for('pages.index'))
    if 'user_id' in session:
        return redirect(url_for('pages.index'))
    return render_template('login.html', registration_disabled=current_app.config.get('DISABLE_REGISTER'))


@auth_bp.route('/register')
def register_page():
    if 'user_id' in session:
        return redirect(url_for('pages.index'))
    return render_template('register.html', registration_disabled=current_app.config.get('DISABLE_REGISTER'))


@auth_bp.route('/verify')
def verify_email():
    token = request.args.get('token')

    if not token:
        return render_template(
            'verification_result.html',
            success=False,
            message='Invalid verification link',
            app_source='main'
        )

    success, message, app_source, user_email = verify_token(token)

    if success and user_email:
        try:
            user = get_user_by_email(user_email)
            if user:
                send_welcome_email(user_email, user['username'], app_source or 'main')
        except Exception as e:
            print(f"Error sending welcome email: {e}")

    redirect_url = None
    if success:
        if app_source == 'workshop':
            redirect_url = current_app.config.get('WORKSHOP_APP_URL', 'https://wailingnewt.com/workshop')
        else:
            redirect_url = url_for('auth.login_page')

    return render_template(
        'verification_result.html',
        success=success,
        message=message,
        app_source=app_source or 'main',
        redirect_url=redirect_url
    )


@auth_bp.route('/api/register', methods=['POST'])
def register():
    if current_app.config.get('DISABLE_REGISTER'):
        return jsonify({'success': False, 'message': 'Registration is currently disabled'})

    data = request.get_json(silent=True) or {}
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    success, message, user_id = create_user(username, email, password)

    if success and current_app.config.get('LOCAL_MODE'):
        try:
            conn = sqlite3.connect('users.db')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
            user = cursor.fetchone()
            conn.close()

            if user:
                verify_user(user['id'])
                set_user_tier(user['id'], 'admin')
                message = 'Account created and verified! You have admin access in local mode.'
        except Exception as e:
            print(f"Error during local mode auto-verification: {e}")
    elif success:
        is_resend = (message == 'resend')
        try:
            token = create_verification_token(user_id, app_source='main')
            if token:
                email_success, email_message = send_verification_email(
                    email, username, token, app_source='main', is_resend=is_resend
                )
                if email_success:
                    if is_resend:
                        message = (
                            'A verification email was already sent to this address. '
                            "We've updated your account details and sent a new verification link."
                        )
                    else:
                        message = 'Registration successful! Please check your email to verify your account.'
                else:
                    message = 'Account created, but we could not send the verification email. Please contact support.'
                    print(f"Email error: {email_message}")
            else:
                message = 'Account created, but verification token generation failed. Please contact support.'
        except Exception as e:
            print(f"Error sending verification email: {e}")
            message = 'Account created, but we could not send the verification email. Please contact support.'

    return jsonify({'success': success, 'message': message})


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')

    success, message, user_data = authenticate_user(username, password)

    if success:
        session['user_id'] = user_data['id']
        session['username'] = user_data['username']
        session['tier'] = 'admin' if current_app.config.get('LOCAL_MODE') else user_data['tier']
        session.permanent = True

    return jsonify({'success': success, 'message': message})


@auth_bp.route('/api/guest-login', methods=['POST'])
def guest_login():
    session['user_id'] = None
    session['username'] = 'Guest'
    session['tier'] = 'admin' if current_app.config.get('LOCAL_MODE') else 'guest'
    session.permanent = False

    return jsonify({'success': True, 'message': 'Logged in as guest'})


@auth_bp.route('/api/logout', methods=['POST'])
@login_required
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully'})


@auth_bp.route('/api/user/info')
@login_required
def user_info():
    user_id = session.get('user_id')
    tier = session.get('tier', 'guest')
    username = session.get('username')

    crawls_today = 0
    if tier == 'guest':
        client_ip = get_client_ip()
        crawls_today = get_guest_crawls_last_24h(client_ip)
    else:
        crawls_today = get_crawls_last_24h(user_id)

    return jsonify({
        'success': True,
        'user': {
            'id': user_id,
            'username': username,
            'tier': tier,
            'crawls_today': crawls_today,
            'crawls_remaining': max(0, 3 - crawls_today) if tier == 'guest' else -1
        }
    })
