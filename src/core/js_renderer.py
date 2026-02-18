"""JavaScript rendering handler using Crawl4AI browser engine"""
import asyncio
import time
from urllib.parse import urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode


class JavaScriptRenderer:
    """Handles page rendering using Crawl4AI's browser engine.

    Replaces the original Playwright-based renderer while keeping the same
    public API so crawler.py call sites don't change.
    """

    def __init__(self, config):
        self.config = config
        self.crawler = None
        self.auth_cookies = []
        self.is_authenticated = False
        self._session_id = f"wailing-newt-{id(self)}"
        self._browser_config = self._build_browser_config()
        self._run_config_template = self._build_run_config()

    def _build_browser_config(self):
        """Map our crawler config to Crawl4AI BrowserConfig."""
        browser_type = self.config.get('js_browser', 'chromium').lower()
        headless = self.config.get('js_headless', True)
        stealth = self.config.get('stealth_mode', False)
        resource_mode = self.config.get('resource_mode', 'full')

        # Determine user agent
        user_agent = self.config.get('js_user_agent', '')
        if not user_agent:
            user_agent = self.config.get('custom_user_agent', '')
        user_agent_mode = "random" if self.config.get('random_user_agent', False) else ""

        # Proxy configuration
        proxy_config = None
        if self.config.get('enable_proxy', False):
            proxy_url = self.config.get('proxy_url', '')
            if proxy_url:
                proxy_config = {"server": proxy_url}

        # Custom headers
        headers = {}
        custom_headers = self.config.get('custom_headers', {})
        if isinstance(custom_headers, dict):
            headers = custom_headers
        elif isinstance(custom_headers, str) and custom_headers.strip():
            # Parse "Key: Value" format
            for line in custom_headers.strip().split('\n'):
                if ':' in line:
                    key, val = line.split(':', 1)
                    headers[key.strip()] = val.strip()

        # HTTP Basic/Digest auth → Authorization header
        if self.config.get('auth_standards_enabled', False):
            auth_data = self.config.get('auth_standards_data', [])
            for entry in auth_data:
                if entry.get('username'):
                    import base64
                    creds = base64.b64encode(
                        f"{entry['username']}:{entry.get('password', '')}".encode()
                    ).decode()
                    headers['Authorization'] = f"Basic {creds}"
                    break  # Use first auth entry for browser headers

        return BrowserConfig(
            browser_type=browser_type,
            headless=headless,
            enable_stealth=stealth,
            viewport_width=self.config.get('js_viewport_width', 1920),
            viewport_height=self.config.get('js_viewport_height', 1080),
            user_agent=user_agent if user_agent else None,
            user_agent_mode=user_agent_mode if user_agent_mode else None,
            proxy_config=proxy_config,
            headers=headers,
            java_script_enabled=self.config.get('enable_javascript', True),
            text_mode=(resource_mode == 'text'),
            light_mode=(resource_mode == 'light'),
            verbose=False,
        )

    def _build_run_config(self):
        """Build a CrawlerRunConfig template from our settings."""
        # Wait strategy
        wait_for = None
        wait_strategy = self.config.get('wait_strategy', 'fixed')
        if wait_strategy == 'css':
            selector = self.config.get('wait_for_selector', '')
            if selector:
                wait_for = f"css:{selector}"
        elif wait_strategy == 'js':
            expression = self.config.get('wait_for_expression', '')
            if expression:
                wait_for = f"js:{expression}"

        # Delay before return (fixed wait time)
        delay_before_return = self.config.get('js_wait_time', 3)

        return {
            'page_timeout': self.config.get('js_timeout', 30) * 1000,
            'wait_for': wait_for,
            'delay_before_return_html': float(delay_before_return),
            'semaphore_count': self.config.get('concurrency', 5),
            'mean_delay': float(self.config.get('delay', 1.0)),
            'scan_full_page': self.config.get('scan_full_page', False),
            'scroll_delay': float(self.config.get('scroll_delay', 0.2)),
            'max_scroll_steps': self.config.get('max_scroll_steps', 0) or None,
            'override_navigator': self.config.get('override_navigator', False),
            'simulate_user': self.config.get('simulate_user', False),
            'magic': self.config.get('magic_mode', False),
            'check_robots_txt': self.config.get('respect_robots', True),
        }

    def _make_run_config(self, **overrides):
        """Create a CrawlerRunConfig instance, optionally overriding template values."""
        params = {**self._run_config_template, **overrides}
        # Filter out None values for optional params
        max_scroll = params.pop('max_scroll_steps', None)
        return CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            session_id=self._session_id,
            page_timeout=params['page_timeout'],
            wait_for=params.get('wait_for'),
            delay_before_return_html=params['delay_before_return_html'],
            semaphore_count=params['semaphore_count'],
            mean_delay=params['mean_delay'],
            scan_full_page=params['scan_full_page'],
            scroll_delay=params['scroll_delay'],
            max_scroll_steps=max_scroll,
            override_navigator=params['override_navigator'],
            simulate_user=params['simulate_user'],
            magic=params['magic'],
            check_robots_txt=params['check_robots_txt'],
            verbose=False,
        )

    async def initialize(self):
        """Initialize the Crawl4AI browser engine."""
        try:
            print("Starting Crawl4AI browser engine...")
            self.crawler = AsyncWebCrawler(config=self._browser_config)
            await self.crawler.start()
            print(f"Crawl4AI browser engine initialized ({self._browser_config.browser_type}, "
                  f"headless={self._browser_config.headless}, "
                  f"stealth={self._browser_config.enable_stealth})")
        except Exception as e:
            print(f"Failed to initialize Crawl4AI browser engine: {e}")
            await self.cleanup()
            raise

    async def cleanup(self):
        """Clean up Crawl4AI browser and resources."""
        try:
            if self.crawler:
                await self.crawler.close()
                self.crawler = None
            print("Crawl4AI browser engine cleaned up")
        except Exception as e:
            print(f"Error during Crawl4AI cleanup: {e}")

    async def render_page(self, url):
        """
        Render a page using Crawl4AI and return content + metadata.

        Returns:
            dict with keys: html, status_code, content_type, size,
                           response_headers, redirected_url, response_time,
                           error, markdown_raw, markdown_with_citations,
                           markdown_references, markdown_fit, fit_html,
                           javascript_engine
            Returns None on complete failure.
        """
        if not self.crawler:
            return {
                'html': None,
                'status_code': 0,
                'content_type': '',
                'size': 0,
                'response_headers': {},
                'redirected_url': None,
                'response_time': 0,
                'error': 'Crawl4AI browser not initialized',
                'markdown_raw': '',
                'markdown_with_citations': '',
                'markdown_references': '',
                'markdown_fit': '',
                'fit_html': '',
                'javascript_engine': 'crawl4ai',
            }

        start_time = time.time()

        try:
            run_config = self._make_run_config()
            result = await self.crawler.arun(url=url, config=run_config)

            response_time = round((time.time() - start_time) * 1000, 2)

            if not result.success:
                return {
                    'html': None,
                    'status_code': result.status_code or 0,
                    'content_type': '',
                    'size': 0,
                    'response_headers': result.response_headers or {},
                    'redirected_url': result.redirected_url,
                    'response_time': response_time,
                    'error': result.error_message or 'Unknown crawl error',
                    'markdown_raw': '',
                    'markdown_with_citations': '',
                    'markdown_references': '',
                    'markdown_fit': '',
                    'fit_html': '',
                    'javascript_engine': 'crawl4ai',
                }

            # Extract markdown artifacts
            markdown_raw = ''
            markdown_with_citations = ''
            markdown_references = ''
            markdown_fit = ''
            if hasattr(result, 'markdown') and result.markdown:
                md = result.markdown
                if hasattr(md, 'raw_markdown'):
                    markdown_raw = md.raw_markdown or ''
                if hasattr(md, 'markdown_with_citations'):
                    markdown_with_citations = md.markdown_with_citations or ''
                if hasattr(md, 'references_markdown'):
                    markdown_references = md.references_markdown or ''
                if hasattr(md, 'fit_markdown'):
                    markdown_fit = md.fit_markdown or ''

            html_content = result.html or ''
            content_type = 'text/html'
            if result.response_headers:
                content_type = result.response_headers.get('content-type', 'text/html').split(';')[0]

            return {
                'html': html_content,
                'status_code': result.status_code or 200,
                'content_type': content_type,
                'size': len(html_content.encode('utf-8')) if html_content else 0,
                'response_headers': result.response_headers or {},
                'redirected_url': result.redirected_url,
                'response_time': response_time,
                'error': None,
                'markdown_raw': markdown_raw,
                'markdown_with_citations': markdown_with_citations,
                'markdown_references': markdown_references,
                'markdown_fit': markdown_fit,
                'fit_html': result.fit_html or '' if hasattr(result, 'fit_html') else '',
                'javascript_engine': 'crawl4ai',
            }

        except Exception as e:
            response_time = round((time.time() - start_time) * 1000, 2)
            return {
                'html': None,
                'status_code': 0,
                'content_type': '',
                'size': 0,
                'response_headers': {},
                'redirected_url': None,
                'response_time': response_time,
                'error': f'Crawl4AI rendering error: {str(e)}',
                'markdown_raw': '',
                'markdown_with_citations': '',
                'markdown_references': '',
                'markdown_fit': '',
                'fit_html': '',
                'javascript_engine': 'crawl4ai',
            }

    def should_use_javascript(self, url):
        """Determine if a URL should use JavaScript rendering"""
        parsed = urlparse(url)
        path = parsed.path.lower()

        # Skip if it's clearly a non-HTML resource
        if path.endswith(('.pdf', '.jpg', '.jpeg', '.png', '.gif', '.css', '.js', '.xml', '.txt', '.zip')):
            return False

        return True

    async def perform_form_login(self, auth_entry):
        """
        Perform form-based authentication using Crawl4AI.

        Uses js_code to fill and submit the login form, with the session_id
        persisting cookies across subsequent requests.

        Args:
            auth_entry: dict with keys: loginUrl, username, password,
                       usernameField, passwordField, submitSelector

        Returns:
            tuple: (success: bool, error_message: str or None)
        """
        if not self.crawler:
            return False, "Browser not initialized"

        login_url = auth_entry.get('loginUrl', '')
        username = auth_entry.get('username', '')
        password = auth_entry.get('password', '')
        username_field = auth_entry.get('usernameField', '#username')
        password_field = auth_entry.get('passwordField', '#password')
        submit_selector = auth_entry.get('submitSelector', 'button[type="submit"]')

        if not login_url:
            return False, "No login URL provided"

        try:
            print(f"Performing form-based login at {login_url}")

            # Build JS code for form fill with fallback selectors
            # Escape user inputs for safe JS injection
            safe_username = username.replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"')
            safe_password = password.replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"')

            username_selectors = [username_field]
            if username_field not in ['input[name="username"]', 'input[name="user"]', 'input[name="email"]', 'input[type="email"]', '#email']:
                username_selectors.extend([
                    'input[name="username"]', 'input[name="user"]',
                    'input[name="email"]', 'input[type="email"]', '#email'
                ])

            password_selectors = [password_field]
            if password_field not in ['input[name="password"]', 'input[name="pass"]', 'input[type="password"]']:
                password_selectors.extend([
                    'input[name="password"]', 'input[name="pass"]',
                    'input[type="password"]'
                ])

            submit_selectors = [submit_selector]
            if submit_selector not in ['button[type="submit"]', 'input[type="submit"]']:
                submit_selectors.extend([
                    'button[type="submit"]', 'input[type="submit"]'
                ])

            js_code = f"""
            (async () => {{
                // Helper: try multiple selectors to fill a field
                async function fillField(selectors, value) {{
                    for (const sel of selectors) {{
                        const el = document.querySelector(sel);
                        if (el) {{
                            el.value = '';
                            el.focus();
                            el.value = value;
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            return true;
                        }}
                    }}
                    return false;
                }}

                // Helper: try multiple selectors to click
                async function clickButton(selectors) {{
                    for (const sel of selectors) {{
                        const el = document.querySelector(sel);
                        if (el) {{
                            el.click();
                            return true;
                        }}
                    }}
                    return false;
                }}

                // Fill username
                await fillField({self._js_array(username_selectors)}, '{safe_username}');
                await new Promise(r => setTimeout(r, 300));

                // Fill password
                await fillField({self._js_array(password_selectors)}, '{safe_password}');
                await new Promise(r => setTimeout(r, 300));

                // Click submit
                await clickButton({self._js_array(submit_selectors)});

                // Wait for navigation
                await new Promise(r => setTimeout(r, 3000));
            }})();
            """

            run_config = self._make_run_config(
                delay_before_return_html=4.0,
            )
            # Override js_code on the config
            run_config.js_code = js_code

            result = await self.crawler.arun(url=login_url, config=run_config)

            if result.success and result.html:
                # Check for login failure indicators
                html_lower = result.html.lower()
                failure_indicators = [
                    'invalid password', 'incorrect password', 'login failed',
                    'authentication failed', 'wrong password', 'invalid credentials'
                ]
                if any(indicator in html_lower for indicator in failure_indicators):
                    return False, "Login failed - invalid credentials"

                self.is_authenticated = True
                print(f"Form-based login successful for {login_url}")
                return True, None
            else:
                return False, result.error_message or "Login page failed to load"

        except Exception as e:
            return False, f"Login error: {str(e)}"

    def _js_array(self, selectors):
        """Convert Python list of selectors to JS array literal."""
        escaped = [s.replace("'", "\\'") for s in selectors]
        items = ", ".join(f"'{s}'" for s in escaped)
        return f"[{items}]"

    async def perform_all_form_logins(self, auth_forms_data):
        """
        Perform all configured form-based logins.

        Args:
            auth_forms_data: list of auth entry dicts

        Returns:
            list of tuples: [(login_url, success, error_message), ...]
        """
        results = []
        for entry in auth_forms_data:
            if entry.get('loginUrl'):
                success, error = await self.perform_form_login(entry)
                results.append((entry.get('loginUrl'), success, error))
        return results
