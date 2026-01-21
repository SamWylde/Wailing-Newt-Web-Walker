import argparse
import os
import threading
import time
import webbrowser

from dotenv import load_dotenv
from flask import Flask
from flask_compress import Compress

from src.app_state import crawler_instances, instances_lock, start_cleanup_thread
from src.auth_db import init_db
from src.blueprints.auth import auth_bp
from src.blueprints.crawl import crawl_bp
from src.blueprints.debug import debug_bp
from src.blueprints.export import export_bp
from src.blueprints.history import history_bp
from src.blueprints.imports import imports_bp
from src.blueprints.pages import pages_bp
from src.blueprints.robots import robots_bp
from src.blueprints.settings import settings_bp

load_dotenv()

parser = argparse.ArgumentParser(description='Wailing Newt Web Walker - SEO Spider Tool')
parser.add_argument('--local', '-l', action='store_true',
                    help='Run in local mode (all users get admin tier, no rate limits)')
parser.add_argument('--disable-register', '-dr', action='store_true',
                    help='Disable new user registrations')
parser.add_argument('--no-browser', '-nb', action='store_true',
                    help='Do not open browser on startup (used when running inside Electron)')
args = parser.parse_args()

LOCAL_MODE = args.local
DISABLE_REGISTER = args.disable_register
NO_BROWSER = args.no_browser


def create_app():
    app = Flask(__name__, template_folder='web/templates', static_folder='web/static')
    app.secret_key = 'wailingnewt-secret-key-change-in-production'

    app.config['LOCAL_MODE'] = LOCAL_MODE
    app.config['DISABLE_REGISTER'] = DISABLE_REGISTER
    app.config['NO_BROWSER'] = NO_BROWSER
    app.config['WORKSHOP_APP_URL'] = os.getenv('WORKSHOP_APP_URL', 'https://wailingnewt.com/workshop')

    Compress(app)

    init_db()

    app.register_blueprint(auth_bp)
    app.register_blueprint(pages_bp)
    app.register_blueprint(crawl_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(debug_bp)
    app.register_blueprint(imports_bp)
    app.register_blueprint(robots_bp)

    return app


def recover_crashed_crawls():
    """Check for and recover any crashed crawls on startup."""
    try:
        from src.crawl_db import get_crashed_crawls, set_crawl_status

        crashed = get_crashed_crawls()

        if crashed:
            print("\n" + "=" * 60)
            print("CRASH RECOVERY")
            print("=" * 60)
            for crawl in crashed:
                set_crawl_status(crawl['id'], 'failed')
                print(f"Found crashed crawl: {crawl['base_url']} (ID: {crawl['id']})")
                print("  → Marked as failed. User can resume from dashboard.")
            print("=" * 60 + "\n")
    except Exception as e:
        print(f"Error during crash recovery: {e}")


def graceful_shutdown(signum, frame):
    """Save all active crawls before shutdown."""
    print("\n" + "=" * 60)
    print("GRACEFUL SHUTDOWN")
    print("=" * 60)
    print("Saving all active crawls...")

    try:
        with instances_lock:
            for session_id, instance_data in list(crawler_instances.items()):
                crawler = instance_data['crawler']
                if crawler.is_running and crawler.crawl_id and crawler.db_save_enabled:
                    print(f"  → Saving crawl {crawler.crawl_id}...")
                    try:
                        crawler._save_batch_to_db(force=True)
                        crawler._save_queue_checkpoint()
                        from src.crawl_db import set_crawl_status
                        set_crawl_status(crawler.crawl_id, 'paused')
                    except Exception as e:
                        print(f"    Error saving crawl {crawler.crawl_id}: {e}")

        print("All crawls saved successfully")
        print("=" * 60)
    except Exception as e:
        print(f"Error during shutdown: {e}")

    print("Goodbye!")
    import sys
    sys.exit(0)


def main():
    import signal
    import sys
    import io

    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    signal.signal(signal.SIGINT, graceful_shutdown)
    signal.signal(signal.SIGTERM, graceful_shutdown)

    app = create_app()
    recover_crashed_crawls()
    start_cleanup_thread()

    print("=" * 60)
    print("Wailing Newt Web Walker - SEO Spider")
    print("=" * 60)
    print(f"\n🚀 Server starting on http://0.0.0.0:5000")
    print("🌐 Access from browser: http://localhost:5000")
    print("📱 Access from network: http://<your-ip>:5000")
    print("\n✨ Multi-tenancy enabled - each browser session is isolated")
    print("💾 Settings stored in browser localStorage")
    print("\nPress Ctrl+C to stop the server\n")
    print("=" * 60 + "\n")

    if not NO_BROWSER:
        def open_browser():
            time.sleep(1.5)
            webbrowser.open('http://localhost:5000')

        browser_thread = threading.Thread(target=open_browser, daemon=True)
        browser_thread.start()

    from waitress import serve
    print("Starting Wailing Newt Web Walker on http://localhost:5000")
    print("Using Waitress WSGI server with multi-threading support")
    serve(app, host='0.0.0.0', port=5000, threads=8)


if __name__ == '__main__':
    if LOCAL_MODE:
        print("=" * 60)
        print("LOCAL MODE ENABLED")
        print("All users will have admin tier access")
        print("No rate limits or tier restrictions")
        print("Auto-login enabled with 'local' admin account")
        print("=" * 60)

    if DISABLE_REGISTER:
        print("=" * 60)
        print("REGISTRATION DISABLED")
        print("New user registrations are not allowed")
        print("=" * 60)

    main()
