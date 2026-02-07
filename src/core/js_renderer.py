"""JavaScript rendering handler using Playwright"""
import asyncio
import threading
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from urllib.parse import urlparse


class JavaScriptRenderer:
    """Handles JavaScript rendering for dynamic content using Playwright"""

    def __init__(self, config):
        self.config = config
        self.playwright = None
        self.browser = None
        self.page_pool = []
        self.pool_lock = threading.Lock()
        self.auth_cookies = []  # Store cookies from form-based login
        self.is_authenticated = False

    async def initialize(self):
        """Initialize Playwright browser and page pool"""
        try:
            print("Starting Playwright browser...")
            self.playwright = await async_playwright().start()

            # Choose browser based on configuration
            browser_type = self.config.get('js_browser', 'chromium').lower()
            headless = self.config.get('js_headless', True)

            if browser_type == 'firefox':
                self.browser = await self.playwright.firefox.launch(headless=headless)
            elif browser_type == 'webkit':
                self.browser = await self.playwright.webkit.launch(headless=headless)
            else:  # Default to chromium
                args = ['--no-sandbox', '--disable-dev-shm-usage'] if headless else []
                self.browser = await self.playwright.chromium.launch(headless=headless, args=args)

            # Create page pool
            max_pages = self.config.get('js_max_concurrent_pages', 3)
            for i in range(max_pages):
                context = await self.browser.new_context(
                    user_agent=self.config.get('js_user_agent', 'WailingNewt/1.0 (Web Crawler with JavaScript)'),
                    viewport={
                        'width': self.config.get('js_viewport_width', 1920),
                        'height': self.config.get('js_viewport_height', 1080)
                    }
                )
                page = await context.new_page()
                page.set_default_timeout(self.config.get('js_timeout', 30) * 1000)
                self.page_pool.append(page)

            print(f"JavaScript rendering initialized with {len(self.page_pool)} browser pages")

        except Exception as e:
            print(f"Failed to initialize JavaScript rendering: {e}")
            await self.cleanup()
            raise

    async def cleanup(self):
        """Clean up Playwright browser and resources"""
        try:
            if self.page_pool:
                for page in self.page_pool:
                    try:
                        await page.context.close()
                    except:
                        pass
                self.page_pool.clear()

            if self.browser:
                await self.browser.close()
                self.browser = None

            if self.playwright:
                await self.playwright.stop()
                self.playwright = None

            print("JavaScript rendering resources cleaned up")

        except Exception as e:
            print(f"Error during JavaScript cleanup: {e}")

    async def get_page(self):
        """Get an available page from the pool"""
        with self.pool_lock:
            if self.page_pool:
                return self.page_pool.pop()
        return None

    async def return_page(self, page):
        """Return a page to the pool"""
        with self.pool_lock:
            self.page_pool.append(page)

    async def render_page(self, url):
        """
        Render a page with JavaScript and return the HTML content

        Returns:
            tuple: (html_content, status_code, error_message)
        """
        page = None
        try:
            page = await self.get_page()
            if not page:
                return None, 0, "No JavaScript page available"

            # Navigate to the page
            try:
                response = await page.goto(
                    url,
                    wait_until='domcontentloaded',
                    timeout=self.config.get('js_timeout', 30) * 1000
                )

                # Wait for JavaScript to render
                await asyncio.sleep(self.config.get('js_wait_time', 3))

                # Get the rendered HTML content
                html_content = await page.content()
                status_code = response.status if response else 200

                return html_content, status_code, None

            except PlaywrightTimeoutError:
                return None, 0, "JavaScript rendering timeout"
            except Exception as e:
                return None, 0, f"Navigation error: {str(e)}"

        except Exception as e:
            return None, 0, f"JavaScript rendering error: {str(e)}"

        finally:
            if page:
                await self.return_page(page)

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
        Perform form-based authentication using Playwright.
        
        Args:
            auth_entry: dict with keys: loginUrl, username, password, 
                       usernameField, passwordField, submitSelector
        
        Returns:
            tuple: (success: bool, error_message: str or None)
        """
        if not self.browser:
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
            
            # Create a temporary context for login
            context = await self.browser.new_context(
                user_agent=self.config.get('js_user_agent', 'WailingNewt/1.0 (Web Crawler with JavaScript)'),
                viewport={
                    'width': self.config.get('js_viewport_width', 1920),
                    'height': self.config.get('js_viewport_height', 1080)
                }
            )
            page = await context.new_page()
            page.set_default_timeout(self.config.get('js_timeout', 30) * 1000)

            try:
                # Navigate to login page
                await page.goto(login_url, wait_until='domcontentloaded')
                await asyncio.sleep(1)  # Wait for page to stabilize

                # Fill in username field
                if username and username_field:
                    try:
                        await page.fill(username_field, username)
                        print(f"Filled username field: {username_field}")
                    except Exception as e:
                        print(f"Warning: Could not fill username field '{username_field}': {e}")
                        # Try common fallbacks
                        for fallback in ['input[name="username"]', 'input[name="user"]', 'input[name="email"]', 'input[type="email"]', '#email']:
                            try:
                                await page.fill(fallback, username)
                                print(f"Used fallback username field: {fallback}")
                                break
                            except:
                                continue

                # Fill in password field
                if password and password_field:
                    try:
                        await page.fill(password_field, password)
                        print(f"Filled password field: {password_field}")
                    except Exception as e:
                        print(f"Warning: Could not fill password field '{password_field}': {e}")
                        # Try common fallbacks
                        for fallback in ['input[name="password"]', 'input[name="pass"]', 'input[type="password"]']:
                            try:
                                await page.fill(fallback, password)
                                print(f"Used fallback password field: {fallback}")
                                break
                            except:
                                continue

                # Wait a moment before clicking submit
                await asyncio.sleep(0.5)

                # Click submit button
                try:
                    await page.click(submit_selector)
                    print(f"Clicked submit button: {submit_selector}")
                except Exception as e:
                    print(f"Warning: Could not click submit '{submit_selector}': {e}")
                    # Try common fallbacks
                    for fallback in ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign in")']:
                        try:
                            await page.click(fallback)
                            print(f"Used fallback submit button: {fallback}")
                            break
                        except:
                            continue

                # Wait for navigation/login to complete
                await asyncio.sleep(3)

                # Check if login was successful by looking for common failure indicators
                page_content = await page.content()
                if any(indicator in page_content.lower() for indicator in ['invalid password', 'incorrect password', 'login failed', 'authentication failed', 'wrong password']):
                    return False, "Login failed - invalid credentials"

                # Get cookies from the authenticated session
                self.auth_cookies = await context.cookies()
                print(f"Captured {len(self.auth_cookies)} authentication cookies")

                # Apply cookies to all existing page contexts
                for pool_page in self.page_pool:
                    try:
                        await pool_page.context.add_cookies(self.auth_cookies)
                    except Exception as e:
                        print(f"Warning: Could not apply cookies to page pool: {e}")

                self.is_authenticated = True
                print(f"Form-based login successful for {login_url}")
                return True, None

            finally:
                await context.close()

        except PlaywrightTimeoutError:
            return False, "Login timeout - page took too long to load"
        except Exception as e:
            return False, f"Login error: {str(e)}"

    async def perform_all_form_logins(self, auth_forms_data):
        """
        Perform all configured form-based logins.
        
        Args:
            auth_forms_data: list of auth entry dicts
            
        Returns:
            list of tuples: [(success, error_message), ...]
        """
        results = []
        for entry in auth_forms_data:
            if entry.get('loginUrl'):
                success, error = await self.perform_form_login(entry)
                results.append((entry.get('loginUrl'), success, error))
        return results
