"""
Main web crawler orchestrator with smooth rate limiting and modular architecture.
Refactored for better code practices and maintainability.
"""
import requests
import threading
import time
import asyncio
import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from urllib.robotparser import RobotFileParser
import nest_asyncio

from src.core.rate_limiter import RateLimiter
from src.core.seo_extractor import SEOExtractor
from src.core.link_manager import LinkManager
from src.core.js_renderer import JavaScriptRenderer
from src.core.sitemap_parser import SitemapParser
from src.core.issue_detector import IssueDetector
from src.core.memory_monitor import MemoryMonitor
from src.core.crawler_defaults import get_default_crawler_config
from src.core.ga4_service import GA4Service
from src.core.search_console_service import SearchConsoleService
from src.settings_manager import SettingsManager


class WebCrawler:
    """
    Main web crawler with smooth rate limiting and comprehensive SEO analysis.
    Uses modular architecture with separate components for different responsibilities.
    """

    def __init__(self, crawl_id=None, resume_from_db=False):
        # HTTP session
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'WailingNewt/1.0 (Web Crawler)'
        })

        # Base URL tracking
        self.base_url = None
        self.base_domain = None
        self.user_id = None
        self.session_id = None
        self.user_tier = 'guest'

        # Component instances (initialized on demand)
        self.rate_limiter = None
        self.link_manager = None
        self.js_renderer = None
        self.sitemap_parser = None
        self.issue_detector = None
        self.seo_extractor = SEOExtractor()
        self.memory_monitor = MemoryMonitor()

        # Results storage
        self.crawl_results = []
        self.results_lock = threading.Lock()
        self.stats_lock = threading.Lock()

        # State flags
        self.is_running = False
        self.is_paused = False
        self.is_running_pagespeed = False
        self.force_full_refresh = False

        # Configuration
        self.config = self._get_default_config()

        # Statistics
        self.stats = {
            'discovered': 0,
            'crawled': 0,
            'depth': 0,
            'speed': 0.0,
            'start_time': None,
            'urls_per_depth': {},
            'urls_per_subdomain': {}
        }

        # Thread reference
        self.crawl_thread = None

        # Robots.txt cache
        self._robots_cache = {}

        # Database persistence
        self.crawl_id = crawl_id
        self.resume_mode = resume_from_db
        self.auto_save_interval = 30  # seconds
        self.batch_save_size = 50  # URLs before triggering save
        self.last_save_time = time.time()
        self.unsaved_urls = []
        self.unsaved_links = []
        self.unsaved_issues = []
        self.auto_save_thread = None
        self.db_save_enabled = False  # Only enable when crawl_id is set

        # Enable nested asyncio for thread compatibility
        nest_asyncio.apply()

    def _get_default_config(self):
        """Get default configuration"""
        return get_default_crawler_config()

    def start_crawl(self, url, user_id=None, session_id=None, extra_urls=None, user_tier='guest'):
        """Start crawling from the given URL"""
        if self.is_running:
            return False, "Crawl already in progress"

        try:
            # Validate and normalize URL
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url

            parsed = urlparse(url)
            self.base_url = f"{parsed.scheme}://{parsed.netloc}"
            self.base_domain = parsed.netloc
            self.start_url = url
            self.user_id = user_id
            self.session_id = session_id
            self.user_tier = user_tier or 'guest'

            # Note: max_depth from user settings is respected - no override
            print(f"Starting crawl from {url} with max_depth={self.config.get('max_depth', 3)}")

            # Create database crawl record if session_id provided
            if session_id:
                from src.crawl_db import create_crawl
                self.crawl_id = create_crawl(
                    user_id=user_id,
                    session_id=session_id,
                    base_url=self.base_url,
                    base_domain=self.base_domain,
                    config_snapshot=self.config
                )
                if self.crawl_id:
                    self.db_save_enabled = True
                    print(f"Database persistence enabled for crawl {self.crawl_id}")

            # Initialize components
            self._initialize_components()

            # Reset state
            self._reset_state()

            # Apply session settings (UA, Proxy)
            self._apply_session_settings()

            # Add initial URL
            # Add initial URL
            self.link_manager.add_url(url, 0)
            
            # Add extra URLs from bulk input
            if extra_urls:
                for extra in extra_urls:
                    if not extra.startswith(('http://', 'https://')):
                        extra = 'https://' + extra
                    
                    if self._should_crawl_url(extra, 0):
                        self.link_manager.add_url(extra, 0)
                    
            with self.stats_lock:
                self.stats['discovered'] = self.link_manager.get_stats()['discovered']

            # Discover sitemaps if enabled
            if self.config.get('crawl_sitemaps', True):
                # 1. Auto-discover sitemaps if enabled
                if self.config.get('auto_discover_sitemaps', False):
                    print(f"Starting auto-discovery of sitemaps for {url}")
                    self._discover_and_add_sitemap_urls(url)
                
                # 2. Process specific sitemap URLs if provided
                if self.config.get('crawl_these_sitemaps', False):
                    custom_sitemaps = self.config.get('sitemap_urls', [])
                    if custom_sitemaps:
                        print(f"Processing {len(custom_sitemaps)} custom sitemap URLs")
                        self._discover_and_add_sitemap_urls(url, custom_sitemaps)
                
                print(f"Sitemap processing completed. Total discovered URLs: {self.stats['discovered']}")

            # Start auto-save thread if DB enabled
            if self.db_save_enabled:
                self._start_auto_save_thread()

            # Start crawling in separate thread
            self.is_running = True
            self.crawl_thread = threading.Thread(target=self._crawl_worker)
            self.crawl_thread.start()

            return True, "Crawl started successfully"

        except Exception as e:
            return False, f"Error starting crawl: {str(e)}"

    def _apply_session_settings(self):
        """Apply user agent and proxy settings to the HTTP session"""
        # 1. User Agent Logic
        ua_mode = self.config.get('user_agent_dropdown', 'Default')
        custom_ua = self.config.get('custom_user_agent', '')
        
        ua_map = {
            'Googlebot': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Bingbot': 'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'Desktop Chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mobile Chrome': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
            'Screaming Frog SEO Spider': 'Screaming Frog SEO Spider/19.1',
            'Wailing Newt Web Walker': 'WailingNewt/1.0 (Web Crawler)',
            'Default': 'WailingNewt/1.0 (Web Crawler)'
        }
        
        final_ua = ua_map.get(ua_mode, ua_map['Default'])
        if ua_mode == 'Custom' and custom_ua:
            final_ua = custom_ua
            
        self.session.headers.update({'User-Agent': final_ua})
        
        # 2. Proxy Logic
        if self.config.get('enable_proxy', False) or self.config.get('use_standard_proxy', False):
            proxy_url = self.config.get('proxy_url')
            if proxy_url:
                self.session.proxies = {
                    'http': proxy_url,
                    'https': proxy_url
                }
        else:
            self.session.proxies = {}

        # 3. HTTP Basic/Digest Authentication
        self._auth_credentials = {}
        if self.config.get('auth_standards_enabled', False):
            auth_data = self.config.get('auth_standards_data', [])
            for entry in auth_data:
                if entry.get('url') and entry.get('username'):
                    self._auth_credentials[entry['url']] = {
                        'username': entry.get('username', ''),
                        'password': entry.get('password', ''),
                        'type': entry.get('type', 'basic')
                    }
            if self._auth_credentials:
                print(f"HTTP authentication configured for {len(self._auth_credentials)} URL(s)")

    def _initialize_components(self):
        """Initialize all crawler components"""
        # Calculate requests per second from delay
        if self.config['delay'] > 0:
            requests_per_second = 1.0 / self.config['delay']
        else:
            # If delay is 0, set high rate but still smooth
            requests_per_second = 100.0

        self.rate_limiter = RateLimiter(requests_per_second)
        self.link_manager = LinkManager(self.base_domain)
        self.sitemap_parser = SitemapParser(self.session, self.base_domain, self.config['timeout'])
        self.issue_detector = IssueDetector(self.config.get('issue_exclusion_patterns', []), self.config)

        # Initialize Crawl4AI renderer (used for all crawling)
        self.js_renderer = JavaScriptRenderer(self.config)

    def _reset_state(self):
        """Reset crawler state"""
        if self.link_manager:
            self.link_manager.reset()
        if self.issue_detector:
            self.issue_detector.reset()

        self.crawl_results.clear()
        self.force_full_refresh = False
        with self.stats_lock:
            self.stats = {
                'discovered': 0,
                'crawled': 0,
                'depth': 0,
                'speed': 0.0,
                'start_time': time.time(),
                'urls_per_depth': {},
                'urls_per_subdomain': {}
            }

        # Start memory monitoring
        self.memory_monitor.start_monitoring()

    def _discover_and_add_sitemap_urls(self, base_url, specific_sitemaps=None):
        """Discover sitemaps and add URLs to crawl queue"""
        if specific_sitemaps:
            # Parse only the provided sitemap URLs
            sitemap_urls = []
            for sitemap_url in specific_sitemaps:
                try:
                    urls = self.sitemap_parser._parse_sitemap(sitemap_url, depth=1)
                    sitemap_urls.extend(urls)
                except Exception as e:
                    print(f"Failed to parse custom sitemap {sitemap_url}: {e}")
        else:
            # Auto-discover
            sitemap_urls = self.sitemap_parser.discover_sitemaps(base_url)

        added_count = 0
        filtered_count = 0

        for url in sitemap_urls:
            if self._should_crawl_url(url, 0):
                self.link_manager.add_url(url, 0)
                added_count += 1
            else:
                filtered_count += 1

        with self.stats_lock:
            self.stats['discovered'] = self.link_manager.get_stats()['discovered']
        print(f"Sitemap processing: {added_count} added, {filtered_count} filtered")

    def stop_crawl(self):
        """Stop the current crawl"""
        self.is_running = False
        self.is_paused = False
        self.is_running_pagespeed = False

        if self.crawl_thread and self.crawl_thread.is_alive():
            self.crawl_thread.join(timeout=5)

        # Save final data to database
        if self.db_save_enabled and self.crawl_id:
            self._save_batch_to_db(force=True)
            from src.crawl_db import set_crawl_status
            set_crawl_status(self.crawl_id, 'stopped')

        # Clean up Crawl4AI browser resources
        if self.js_renderer:
            try:
                asyncio.run(self.js_renderer.cleanup())
            except RuntimeError:
                # Event loop may already be closed
                pass
            self.js_renderer = None

        return True, "Crawl and PageSpeed analysis stopped"

    def pause_crawl(self):
        """Pause the current crawl"""
        if not self.is_running:
            return False, "No crawl in progress"
        self.is_paused = True

        # Save checkpoint when pausing
        if self.db_save_enabled and self.crawl_id:
            self._save_batch_to_db(force=True)
            self._save_queue_checkpoint()
            from src.crawl_db import set_crawl_status
            set_crawl_status(self.crawl_id, 'paused')

        return True, "Crawl paused"

    def resume_crawl(self):
        """Resume the paused crawl"""
        if not self.is_running:
            return False, "No crawl in progress"
        if not self.is_paused:
            return False, "Crawl is not paused"
        self.is_paused = False

        # Update status in database
        if self.db_save_enabled and self.crawl_id:
            from src.crawl_db import set_crawl_status
            set_crawl_status(self.crawl_id, 'running')

        return True, "Crawl resumed"

    def resume_from_database(self, crawl_id, user_id=None, session_id=None, user_tier='guest'):
        """Resume a previously interrupted crawl from database"""
        if self.is_running:
            return False, "Crawl already in progress"

        try:
            from src.crawl_db import get_resume_data, load_crawled_urls, set_crawl_status
            from collections import deque

            # Load crawl data
            crawl_data = get_resume_data(crawl_id)

            if not crawl_data:
                return False, "Cannot resume this crawl - not found"

            if crawl_data['status'] not in ['paused', 'failed', 'running']:
                return False, f"Cannot resume crawl with status: {crawl_data['status']}"

            # Verify user owns this crawl (if not guest)
            if user_id and crawl_data.get('user_id') != user_id:
                return False, "Unauthorized - you don't own this crawl"

            # Restore basic state
            self.crawl_id = crawl_id
            self.base_url = crawl_data['base_url']
            self.base_domain = crawl_data['base_domain']
            self.start_url = crawl_data['base_url']  # Needed by find_orphan_pages()
            self.user_id = user_id
            self.session_id = session_id
            self.user_tier = user_tier or 'guest'
            self.config = crawl_data.get('config_snapshot', self._get_default_config())
            self.db_save_enabled = True

            # Initialize components
            self._initialize_components()

            # Load already crawled URLs from database
            from src.crawl_db import load_crawl_links, load_crawl_issues

            print(f"Loading crawled data from database...")
            self.crawl_results = load_crawled_urls(crawl_id)

            # Mark all crawled URLs as discovered to prevent re-discovery
            for url_data in self.crawl_results:
                url = url_data.get('url')
                if url:
                    self.link_manager.all_discovered_urls.add(url)

            # Load links and restore to link manager
            loaded_links = load_crawl_links(crawl_id)
            if loaded_links:
                self.link_manager.all_links = loaded_links
                # Rebuild links_set for duplicate detection
                for link in loaded_links:
                    link_key = f"{link['source_url']}|{link['target_url']}"
                    self.link_manager.links_set.add(link_key)

            # Load issues and restore to issue detector
            loaded_issues = load_crawl_issues(crawl_id)
            if loaded_issues:
                self.issue_detector.detected_issues = loaded_issues

            print(f"Loaded {len(self.crawl_results)} URLs, {len(loaded_links)} links, {len(loaded_issues)} issues from database")

            # Restore statistics
            self.stats['crawled'] = len(self.crawl_results)
            self.stats['discovered'] = crawl_data.get('urls_discovered', 0)
            self.stats['depth'] = crawl_data.get('max_depth_reached', 0)
            self.stats['start_time'] = time.time()  # New start time for resume

            # Restore queue state from checkpoint
            checkpoint = crawl_data.get('resume_checkpoint', {})
            if checkpoint:
                # Restore discovered URLs queue
                if 'discovered_urls' in checkpoint:
                    discovered_list = checkpoint['discovered_urls']
                    self.link_manager.discovered_urls = deque(discovered_list)

                # Restore visited URLs set
                if 'visited_urls' in checkpoint:
                    self.link_manager.visited_urls = set(checkpoint['visited_urls'])

                print(f"Restored queue: {len(self.link_manager.discovered_urls)} pending, "
                      f"{len(self.link_manager.visited_urls)} visited")

            # If queue is empty (no checkpoint or crawl crashed early), rebuild queue from links
            if not self.link_manager.discovered_urls:
                print("Queue is empty - rebuilding from discovered links")

                # Get all URLs from loaded links that haven't been crawled yet
                crawled_urls = set(url_data.get('url') for url_data in self.crawl_results)

                # Add any linked URLs that haven't been crawled yet
                added_count = 0
                for link in loaded_links:
                    target_url = link.get('target_url')
                    if target_url and target_url not in crawled_urls and link.get('is_internal'):
                        self.link_manager.add_url(target_url, link.get('depth', 1))
                        added_count += 1

                print(f"Added {added_count} pending URLs to queue from links")

                # If still empty, crawl is complete
                if not self.link_manager.discovered_urls:
                    print("No pending URLs found - crawl was already complete")

                self.stats['discovered'] = len(self.link_manager.all_discovered_urls)

            # Update status to running
            set_crawl_status(crawl_id, 'running')

            # Start auto-save thread
            self._start_auto_save_thread()

            # Start crawling
            self.is_running = True
            self.crawl_thread = threading.Thread(target=self._crawl_worker)
            self.crawl_thread.start()

            return True, f"Resumed crawl from {self.stats['crawled']} URLs"

        except Exception as e:
            print(f"Error resuming crawl: {e}")
            import traceback
            traceback.print_exc()
            return False, f"Error resuming crawl: {str(e)}"

    def get_status(self):
        """Get current crawl status and results"""
        # Snapshots for return
        stats_snapshot = {}
        with self.stats_lock:
            # Calculate speed
            if self.stats['start_time']:
                elapsed = time.time() - self.stats['start_time']
                self.stats['speed'] = round(self.stats['crawled'] / max(elapsed, 1), 2)
            
            # Create a shallow copy of stats for return
            stats_snapshot = self.stats.copy()
            # Deep copy the nested dicts to be extra safe
            stats_snapshot['urls_per_depth'] = self.stats['urls_per_depth'].copy()
            stats_snapshot['urls_per_subdomain'] = self.stats['urls_per_subdomain'].copy()

        if self.is_running:
            status = 'running'
        elif stats_snapshot['crawled'] > 0:
            status = 'completed'
        elif stats_snapshot.get('start_time') is not None:
            # Crawl was started but scraped 0 URLs — treat as completed (error)
            # so the frontend stops polling instead of spinning forever
            status = 'completed'
        else:
            status = 'idle'

        # Get link manager stats
        link_stats = self.link_manager.get_stats() if self.link_manager else {'discovered': 0}

        # Update link statuses before returning (ensures all crawled URLs have their status)
        if self.link_manager:
            self.link_manager.update_link_statuses(self.crawl_results)

        # Update memory stats
        self.memory_monitor.update()

        # Get actual data size for accurate estimates
        from src.core.memory_profiler import MemoryProfiler
        data_sizes = MemoryProfiler.get_crawler_data_size(
            self.crawl_results,
            self.link_manager.all_links if self.link_manager else [],
            self.issue_detector.detected_issues if self.issue_detector else []
        )

        print(f"get_status called - crawl_results length: {len(self.crawl_results)}, status: {status}, crawled: {stats_snapshot['crawled']}")

        return {
            'status': status,
            'stats': {
                **stats_snapshot,
                'discovered': link_stats['discovered']
            },
            'urls': self.crawl_results.copy(),
            'links': self.link_manager.all_links.copy() if self.link_manager else [],
            'issues': self.issue_detector.get_issues() if self.issue_detector else [],
            'progress': min(100, (self.stats['crawled'] / max(link_stats['discovered'], 1)) * 100),
            'is_running_pagespeed': self.is_running_pagespeed,
            'memory': self.memory_monitor.get_stats(),
            'memory_data': data_sizes
        }

    def consume_force_full_refresh(self):
        """Return and reset the one-shot full refresh flag."""
        if self.force_full_refresh:
            self.force_full_refresh = False
            return True
        return False

    def _save_batch_to_db(self, force=False):
        """Save batched data to database"""
        if not self.db_save_enabled or not self.crawl_id:
            return

        from src.crawl_db import save_url_batch, save_links_batch, save_issues_batch, update_crawl_stats

        try:
            # Save URLs
            if self.unsaved_urls:
                save_url_batch(self.crawl_id, self.unsaved_urls)
                self.unsaved_urls.clear()

            # Save links
            if self.unsaved_links:
                save_links_batch(self.crawl_id, self.unsaved_links)
                self.unsaved_links.clear()

            # Save issues
            if self.unsaved_issues:
                save_issues_batch(self.crawl_id, self.unsaved_issues)
                self.unsaved_issues.clear()

            # Update statistics
            memory_stats = self.memory_monitor.get_stats()
            with self.stats_lock:
                update_crawl_stats(
                    self.crawl_id,
                    discovered=self.stats['discovered'],
                    crawled=self.stats['crawled'],
                    max_depth=self.stats['depth'],
                    peak_memory_mb=memory_stats.get('peak_mb', 0),
                    estimated_size_mb=memory_stats.get('estimated_crawl_mb', 0)
                )

            self.last_save_time = time.time()
            print(f"Saved batch to database for crawl {self.crawl_id}")

        except Exception as e:
            print(f"Error saving batch to database: {e}")
            import traceback
            traceback.print_exc()

    def _save_queue_checkpoint(self):
        """Save current queue state for crash recovery"""
        if not self.db_save_enabled or not self.crawl_id or not self.link_manager:
            return

        from src.crawl_db import save_checkpoint

        try:
            # Get discovered URLs from link manager
            discovered_urls = []
            if hasattr(self.link_manager, 'discovered_urls'):
                discovered_urls = list(self.link_manager.discovered_urls)[:1000]  # Limit to prevent huge checkpoints

            # Get visited URLs
            visited_urls = []
            if hasattr(self.link_manager, 'visited_urls'):
                visited_urls = list(self.link_manager.visited_urls)

            checkpoint = {
                'discovered_urls': discovered_urls,
                'visited_urls': visited_urls,
                'pending_count': self.link_manager.get_stats().get('pending', 0)
            }

            save_checkpoint(self.crawl_id, checkpoint)
            print(f"Saved queue checkpoint for crawl {self.crawl_id}")

        except Exception as e:
            print(f"Error saving checkpoint: {e}")

    def _start_auto_save_thread(self):
        """Background thread for periodic saves"""
        def auto_save_worker():
            while self.is_running:
                time.sleep(5)  # Check every 5 seconds
                if time.time() - self.last_save_time >= self.auto_save_interval:
                    self._save_batch_to_db()
                    self._save_queue_checkpoint()

        self.auto_save_thread = threading.Thread(target=auto_save_worker, daemon=True)
        self.auto_save_thread.start()
        print("Auto-save thread started")

    def update_config(self, new_config):
        """Update crawler configuration"""
        self.config.update(new_config)

        # Update session headers
        self.session.headers.update({
            'User-Agent': self.config['user_agent'],
            'Accept-Language': self.config['accept_language']
        })

        # Add custom headers
        if self.config['custom_headers']:
            self.session.headers.update(self.config['custom_headers'])

        # Configure proxy if enabled
        if self.config['enable_proxy'] and self.config['proxy_url']:
            self.session.proxies = {
                'http': self.config['proxy_url'],
                'https': self.config['proxy_url']
            }
        else:
            self.session.proxies = {}

        # Update rate limiter if it exists
        if self.rate_limiter:
            if self.config['delay'] > 0:
                self.rate_limiter.update_rate(1.0 / self.config['delay'])
            else:
                self.rate_limiter.update_rate(100.0)

    def _crawl_worker(self):
        """Main crawling worker - always uses async Crawl4AI engine."""
        asyncio.run(self._crawl_async_worker())

    async def _crawl_async_worker(self):
        """Unified async crawl loop using Crawl4AI browser engine."""
        try:
            # Initialize the Crawl4AI renderer
            await self.js_renderer.initialize()

            # Perform form-based authentication if configured
            auth_forms_data = self.config.get('auth_forms_data', [])
            if auth_forms_data:
                print(f"Performing {len(auth_forms_data)} form-based login(s)...")
                results = await self.js_renderer.perform_all_form_logins(auth_forms_data)
                for login_url, success, error in results:
                    if success:
                        print(f"Form login successful: {login_url}")
                    else:
                        print(f"Form login failed: {login_url} - {error}")

            max_workers = self.config.get('concurrency', 5)
            active_tasks = set()

            # Calculate effective max URLs (lowest of configured limits)
            effective_max_urls = self.config['max_urls']
            if self.config.get('limit_crawl_total', False):
                limit_total = self.config.get('limit_crawl_total_value', 500)
                effective_max_urls = min(effective_max_urls, limit_total)

            while self.is_running and self.stats['crawled'] < effective_max_urls:
                # Check if paused
                if self.is_paused:
                    await asyncio.sleep(1)
                    continue

                # Submit new tasks - fill ALL available slots
                while len(active_tasks) < max_workers:
                    url_info = self.link_manager.get_next_url()
                    if not url_info:
                        break

                    current_url, depth = url_info

                    if depth <= self.config['max_depth']:
                        # Rate limiting (async-safe to avoid blocking the event loop)
                        if self.config.get('delay', 0) > 0 and self.rate_limiter:
                            sleep_time = self.rate_limiter.get_delay()
                            if sleep_time > 0:
                                await asyncio.sleep(sleep_time)

                        task = asyncio.create_task(self._crawl_url(current_url, depth))
                        active_tasks.add(task)

                # Process completed tasks
                if active_tasks:
                    done, active_tasks = await asyncio.wait(
                        active_tasks, timeout=0.01,
                        return_when=asyncio.FIRST_COMPLETED
                    )

                    for task in done:
                        try:
                            result = await task
                            if result:
                                with self.results_lock:
                                    self.crawl_results.append(result)
                                    print(f"Crawled: {result['url']} - Total: {len(self.crawl_results)}")

                                self.link_manager.mark_visited(result['url'])

                                with self.stats_lock:
                                    self.stats['crawled'] += 1
                                    self.stats['depth'] = max(self.stats['depth'], result.get('depth', 0))

                                # Detect issues
                                issues_before = len(self.issue_detector.detected_issues)
                                self.issue_detector.detect_issues(result)
                                issues_after = len(self.issue_detector.detected_issues)

                                if self.db_save_enabled and issues_after > issues_before:
                                    new_issues = self.issue_detector.detected_issues[issues_before:issues_after]
                                    self.unsaved_issues.extend(new_issues)
                        except Exception as e:
                            print(f"Error in crawl task: {e}")

                # Check completion
                link_stats = self.link_manager.get_stats()
                if link_stats['pending'] == 0 and len(active_tasks) == 0:
                    print("No more URLs to crawl")
                    break

                await asyncio.sleep(0.001)

        except Exception as e:
            print(f"Error in crawl worker: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # === POST-CRAWL PROCESSING ===

            # Run PageSpeed analysis if enabled
            if self.config.get('enable_pagespeed', False):
                print("Running PageSpeed analysis...")
                self.is_running_pagespeed = True
                self._run_pagespeed_analysis()
                self.is_running_pagespeed = False

            # Check external links if enabled
            if self.config.get('check_external_links', False) and self.is_running:
                self._check_external_links()

            # Link Analysis Enhancements
            if self.link_manager:
                print("Running advanced link analysis...")
                orphans = self.link_manager.find_orphan_pages(self.start_url)
                if orphans and self.issue_detector:
                    self.issue_detector.detect_orphan_issues(orphans)
                    print(f"Found {len(orphans)} orphan pages")

                link_equity = self.link_manager.calculate_link_equity()
                if link_equity:
                    for result in self.crawl_results:
                        if result['url'] in link_equity:
                            result['link_equity'] = round(link_equity[result['url']], 2)
                    print("Link equity calculation complete")

            # Update all linked_from fields before completing
            self._update_all_linked_from()

            # Run batch detection (duplication, hreflang, cannibalization)
            if self.issue_detector:
                print("Running batch issue detection (duplication, hreflang, cannibalization)...")
                issues_before = len(self.issue_detector.detected_issues)
                self.issue_detector.detect_batch_issues(self.crawl_results)
                issues_after = len(self.issue_detector.detected_issues)
                print(f"Batch detection complete. Found {issues_after - issues_before} new issues.")

                if self.db_save_enabled and issues_after > issues_before:
                    new_issues = self.issue_detector.detected_issues[issues_before:issues_after]
                    self.unsaved_issues.extend(new_issues)

            # Run GA4 enrichment after crawl + issue processing
            self._run_ga4_enrichment()
            self._run_search_console_enrichment()

            # Save final data and mark as complete
            if self.db_save_enabled and self.crawl_id:
                self._save_batch_to_db(force=True)
                from src.crawl_db import set_crawl_status
                set_crawl_status(self.crawl_id, 'completed')

            # Clean up Crawl4AI browser
            if self.js_renderer:
                await self.js_renderer.cleanup()

            self.is_running = False
            print(f"Crawl completed. Discovered: {self.stats['discovered']}, Crawled: {self.stats['crawled']}")

    async def _crawl_url(self, url, depth):
        """Crawl a single URL using Crawl4AI and extract SEO data."""
        try:
            # Render page via Crawl4AI
            render_result = await self.js_renderer.render_page(url)

            if render_result.get('error') and not render_result.get('html'):
                return self.seo_extractor.create_empty_result(
                    url, depth, render_result.get('status_code', 0),
                    render_result['error']
                )

            html_content = render_result.get('html', '')
            is_internal = self.link_manager.is_internal(url)

            # Create result structure
            result = {
                'url': url,
                'status_code': render_result.get('status_code', 200),
                'content_type': render_result.get('content_type', 'text/html'),
                'size': render_result.get('size', 0),
                'is_internal': is_internal,
                'depth': depth,
                'title': '',
                'meta_description': '',
                'h1': '',
                'h2': [],
                'h3': [],
                'word_count': 0,
                'meta_tags': {},
                'og_tags': {},
                'twitter_tags': {},
                'canonical_url': '',
                'lang': '',
                'charset': '',
                'viewport': '',
                'robots': '',
                'author': '',
                'keywords': '',
                'generator': '',
                'theme_color': '',
                'json_ld': [],
                'analytics': {
                    'google_analytics': False,
                    'gtag': False,
                    'ga4_id': '',
                    'gtm_id': '',
                    'facebook_pixel': False,
                    'hotjar': False,
                    'mixpanel': False
                },
                'images': [],
                'external_links': 0,
                'internal_links': 0,
                'response_time': render_result.get('response_time', 0),
                'redirects': [],
                'hreflang': [],
                'schema_org': [],
                'linked_from': [],
                'javascript_rendered': True,
                'javascript_engine': render_result.get('javascript_engine', 'crawl4ai'),
                # Markdown artifacts from Crawl4AI
                'markdown_raw': render_result.get('markdown_raw', ''),
                'markdown_with_citations': render_result.get('markdown_with_citations', ''),
                'markdown_references': render_result.get('markdown_references', ''),
                'markdown_fit': render_result.get('markdown_fit', ''),
                'fit_html': render_result.get('fit_html', ''),
            }

            # Handle redirects from Crawl4AI
            if render_result.get('redirected_url') and render_result['redirected_url'] != url:
                result['redirects'] = [{'url': render_result['redirected_url'], 'status_code': 301}]

            # Only parse HTML content
            if html_content and 'text/html' in result['content_type']:
                soup = BeautifulSoup(html_content, 'html.parser')

                # Extract SEO data - same pipeline as before
                self.seo_extractor.extract_basic_seo_data(soup, result)

                if self.config.get('extract_meta_robots', True) or self.config.get('extract_meta_keywords', True):
                    self.seo_extractor.extract_meta_tags(soup, result)

                self.seo_extractor.extract_opengraph_tags(soup, result)
                self.seo_extractor.extract_twitter_tags(soup, result)

                if self.config.get('extract_json_ld', False):
                    self.seo_extractor.extract_json_ld(soup, result)

                self.seo_extractor.extract_analytics_tracking(soup, html_content, result)

                if self.config.get('crawl_images', True):
                    self.seo_extractor.extract_images(soup, url, result)

                self.seo_extractor.extract_link_counts(soup, result, self.base_domain)

                if self.config.get('crawl_hreflang', False) or self.config.get('store_hreflang', True):
                    self.seo_extractor.extract_hreflang(soup, result)

                if self.config.get('extract_microdata', False):
                    self.seo_extractor.extract_schema_org(soup, result)

                # Collect all links
                links_before = len(self.link_manager.all_links)
                self.link_manager.collect_all_links(soup, url, self.crawl_results, self.config)
                links_after = len(self.link_manager.all_links)

                if self.db_save_enabled and links_after > links_before:
                    new_links = self.link_manager.all_links[links_before:links_after]
                    self.unsaved_links.extend(new_links)

                # Extract links for further crawling
                should_extract = (
                    (is_internal and depth < self.config['max_depth']) or
                    (self.config['crawl_external'] and depth < self.config['max_depth'])
                )

                if should_extract:
                    self.link_manager.extract_links(soup, url, depth + 1, self._should_crawl_url, self.config)

            # Populate linked_from
            result['linked_from'] = self.link_manager.get_source_pages(url)

            # Add to unsaved batch if DB persistence enabled
            if self.db_save_enabled:
                self.unsaved_urls.append(result)
                if len(self.unsaved_urls) >= self.batch_save_size:
                    self._save_batch_to_db()

            return result

        except Exception as e:
            return self.seo_extractor.create_empty_result(url, depth, 0, f'Crawl error: {str(e)}')

    def _update_all_linked_from(self):
        """Update linked_from field for all crawled URLs based on collected source_pages data"""
        print("Updating linked_from data for all URLs...")
        updated_count = 0

        for result in self.crawl_results:
            url = result['url']
            sources = self.link_manager.get_source_pages(url)
            if sources:
                result['linked_from'] = sources
                updated_count += 1

        print(f"Updated linked_from data for {updated_count} URLs")

    def _should_crawl_url(self, url, depth, skip_increment=False):
        """Check if URL should be crawled based on settings"""
        parsed = urlparse(url)
        subdomain = parsed.netloc.lower()

        # 1. Stateless / Static Checks (Cheap)
        
        # Check URL length limit
        max_url_length = self.config.get('limit_max_url_length', 10000)
        if len(url) > max_url_length:
            return False

        # Check folder depth limit
        if self.config.get('limit_max_folder_depth', False):
            max_folder_depth = self.config.get('limit_max_folder_depth_value', 5)
            path_segments = [s for s in parsed.path.split('/') if s]
            if len(path_segments) > max_folder_depth:
                return False

        # Check query string parameter count limit
        if self.config.get('limit_query_strings', False):
            max_query_params = self.config.get('limit_query_strings_value', 5)
            query_params = parsed.query.split('&') if parsed.query else []
            if len([p for p in query_params if p]) > max_query_params:
                return False

        # Check subdomain crawling policy
        if not self.config.get('crawl_subdomains', True):
            # Only allow URLs on the exact same domain (no subdomains)
            if self.base_domain:
                url_domain = parsed.netloc.lower()
                if url_domain != self.base_domain and url_domain.endswith('.' + self.base_domain):
                    return False

        # Check external domain policy
        if not self.config['crawl_external']:
            if not self.link_manager.is_internal(url):
                return False

        # Check file extensions
        path = parsed.path.lower()
        if '.' in path:
            extension = path.split('.')[-1]
            if extension in self.config['exclude_extensions']:
                return False
            if self.config['include_extensions'] and extension not in self.config['include_extensions']:
                return False

        # Check URL patterns
        if self.config['exclude_patterns']:
            for pattern in self.config['exclude_patterns']:
                if pattern:
                    try:
                        if re.search(pattern, url):
                            return False
                    except re.error:
                        # Invalid regex - skip this pattern
                        pass

        if self.config['include_patterns']:
            pattern_match = False
            for pattern in self.config['include_patterns']:
                if pattern:
                    try:
                        if re.search(pattern, url):
                            pattern_match = True
                            break
                    except re.error:
                        # Invalid regex - skip this pattern
                        pass
            if not pattern_match:
                return False

        # Check if URL fragments should be crawled
        if parsed.fragment and not self.config.get('adv_crawl_fragments', False):
            pass

        # 2. robots.txt Check (semi-expensive, self-cached)
        if self.config['respect_robots']:
            if not self._check_robots_txt(url):
                return False

        # 3. State-dependent Checks (Transactional)
        with self.stats_lock:
            # Check URLs per depth limit
            if self.config.get('limit_urls_per_depth', False):
                max_urls_per_depth = self.config.get('limit_urls_per_depth_value', 1000)
                if self.stats['urls_per_depth'].get(depth, 0) >= max_urls_per_depth:
                    return False

            # Check URLs per subdomain limit
            if self.config.get('limit_crawl_per_subdomain', False):
                max_per_subdomain = self.config.get('limit_crawl_per_subdomain_value', 1000)
                if self.stats['urls_per_subdomain'].get(subdomain, 0) >= max_per_subdomain:
                    return False

            # If all checks pass and we're not just probing, increment the state
            if not skip_increment:
                self.stats['urls_per_depth'][depth] = self.stats['urls_per_depth'].get(depth, 0) + 1
                self.stats['urls_per_subdomain'][subdomain] = self.stats['urls_per_subdomain'].get(subdomain, 0) + 1

        return True

    def _check_robots_txt(self, url):
        """Check if URL is allowed by robots.txt"""
        try:
            parsed = urlparse(url)
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

            if robots_url not in self._robots_cache:
                rp = RobotFileParser()
                rp.set_url(robots_url)
                try:
                    rp.read()
                    self._robots_cache[robots_url] = rp
                except:
                    return True

            rp = self._robots_cache[robots_url]
            user_agent = self.config.get('user_agent', '*')
            return rp.can_fetch(user_agent, url)

        except Exception:
            return True

    def _run_ga4_enrichment(self):
        """Attach GA4 metrics to crawled URLs after crawl completion."""
        if not self.config.get('ga4_enabled', False):
            return
        if not self.config.get('ga4_connected', False):
            return
        if not self.config.get('ga4_property_id'):
            return
        if not self.crawl_results:
            return

        print("Running GA4 enrichment...")
        settings_manager = SettingsManager(
            session_id=self.session_id,
            user_id=self.user_id,
            tier=self.user_tier or 'guest'
        )

        try:
            summary = GA4Service.enrich_crawl_results(settings_manager, self.crawl_results, self.config)
            with self.stats_lock:
                self.stats['ga4_sync'] = summary

            status = summary.get('status', 'error')
            if status == 'success':
                self.force_full_refresh = True
                sync_payload = {
                    'ga4LastSyncAt': summary.get('last_sync_at', ''),
                    'ga4LastSyncStatus': 'success',
                    'ga4LastSyncError': ''
                }

                if self.db_save_enabled and self.crawl_id:
                    try:
                        from src.crawl_db import update_url_analytics_batch
                        analytics_rows = [
                            {'url': row.get('url'), 'analytics': row.get('analytics', {})}
                            for row in self.crawl_results
                            if row.get('url')
                        ]
                        update_url_analytics_batch(self.crawl_id, analytics_rows)
                    except Exception as db_exc:
                        print(f"Failed to persist GA4 enrichment to DB: {db_exc}")
            elif status == 'skipped':
                sync_payload = {
                    'ga4LastSyncStatus': f"skipped:{summary.get('reason', 'unknown')}",
                    'ga4LastSyncError': ''
                }
            else:
                sync_payload = {
                    'ga4LastSyncStatus': status,
                    'ga4LastSyncError': summary.get('error', '')
                }

            settings_manager.save_settings(sync_payload)
            print(f"GA4 enrichment complete: {summary}")
        except Exception as exc:
            with self.stats_lock:
                self.stats['ga4_sync'] = {'status': 'error', 'error': str(exc)}
            settings_manager.save_settings(
                {
                    'ga4LastSyncStatus': 'error',
                    'ga4LastSyncError': str(exc)
                }
            )
            print(f"GA4 enrichment failed: {exc}")

    def _run_search_console_enrichment(self):
        """Attach Search Console data to crawled URLs after crawl completion."""
        if not self.config.get('gsc_enabled', False):
            return
        if not self.config.get('gsc_connected', False):
            return
        if not self.config.get('gsc_site_url'):
            return
        if not self.crawl_results:
            return

        print("Running Search Console enrichment...")
        settings_manager = SettingsManager(
            session_id=self.session_id,
            user_id=self.user_id,
            tier=self.user_tier or 'guest'
        )

        try:
            summary = SearchConsoleService.enrich_crawl_results(settings_manager, self.crawl_results, self.config)
            inspection = summary.get('inspection', {}) if isinstance(summary.get('inspection'), dict) else {}
            with self.stats_lock:
                self.stats['gsc_sync'] = summary
                self.stats['gsc_inspection_sync'] = inspection

            status = summary.get('status', 'error')
            if status == 'success':
                self.force_full_refresh = True
                sync_payload = {
                    'gscLastSyncAt': summary.get('last_sync_at', ''),
                    'gscLastSyncStatus': 'success',
                    'gscLastSyncError': '',
                    'gscLastInspectionAt': inspection.get('last_inspection_at', ''),
                    'gscLastInspectionStatus': inspection.get('status', ''),
                    'gscLastInspectionError': inspection.get('error', ''),
                }

                if self.db_save_enabled and self.crawl_id:
                    try:
                        from src.crawl_db import update_url_analytics_batch
                        analytics_rows = [
                            {'url': row.get('url'), 'analytics': row.get('analytics', {})}
                            for row in self.crawl_results
                            if row.get('url')
                        ]
                        update_url_analytics_batch(self.crawl_id, analytics_rows)
                    except Exception as db_exc:
                        print(f"Failed to persist Search Console enrichment to DB: {db_exc}")
            elif status == 'skipped':
                sync_payload = {
                    'gscLastSyncStatus': f"skipped:{summary.get('reason', 'unknown')}",
                    'gscLastSyncError': '',
                }
                if inspection:
                    sync_payload.update(
                        {
                            'gscLastInspectionAt': inspection.get('last_inspection_at', ''),
                            'gscLastInspectionStatus': inspection.get('status', ''),
                            'gscLastInspectionError': inspection.get('error', ''),
                        }
                    )
            else:
                sync_payload = {
                    'gscLastSyncStatus': status,
                    'gscLastSyncError': summary.get('error', ''),
                    'gscLastInspectionAt': inspection.get('last_inspection_at', ''),
                    'gscLastInspectionStatus': inspection.get('status', ''),
                    'gscLastInspectionError': inspection.get('error', ''),
                }

            settings_manager.save_settings(sync_payload)
            print(f"Search Console enrichment complete: {summary}")
        except Exception as exc:
            with self.stats_lock:
                self.stats['gsc_sync'] = {'status': 'error', 'error': str(exc)}
                self.stats['gsc_inspection_sync'] = {'status': 'error', 'error': str(exc)}
            settings_manager.save_settings(
                {
                    'gscLastSyncStatus': 'error',
                    'gscLastSyncError': str(exc),
                    'gscLastInspectionStatus': 'error',
                    'gscLastInspectionError': str(exc),
                }
            )
            print(f"Search Console enrichment failed: {exc}")

    def _check_external_links(self):
        """Verify external links with HEAD requests to detect broken links"""
        if not self.link_manager:
            return

        # Collect unique external target URLs
        external_targets = {}
        for link in self.link_manager.all_links:
            if link.get('is_internal'):
                continue
            target = link.get('target_url', '')
            if target and target not in external_targets:
                external_targets[target] = link.get('source_url', '')

        if not external_targets:
            return

        print(f"Checking {len(external_targets)} external links...")
        checked = 0

        for target_url, source_url in external_targets.items():
            if not self.is_running:
                break
            try:
                resp = self.session.head(
                    target_url, timeout=10, allow_redirects=True
                )
                if resp.status_code >= 400 and self.issue_detector:
                    self.issue_detector.detected_issues.append({
                        'url': target_url,
                        'type': 'error',
                        'category': 'Links',
                        'issue': f'Broken External Link ({resp.status_code})',
                        'details': f'Linked from: {source_url}'
                    })
            except Exception:
                if self.issue_detector:
                    self.issue_detector.detected_issues.append({
                        'url': target_url,
                        'type': 'error',
                        'category': 'Links',
                        'issue': 'Unreachable External Link',
                        'details': f'Connection failed. Linked from: {source_url}'
                    })

            checked += 1
            if checked % 25 == 0:
                print(f"  Checked {checked}/{len(external_targets)} external links")
            time.sleep(0.5)  # Rate limit

        print(f"External link check complete: {checked} links verified")

    def _run_pagespeed_analysis(self):
        """Run PageSpeed analysis on selected pages"""
        try:
            selected_pages = self._select_pages_for_pagespeed()
            selected_devices = self._get_pagespeed_selected_devices()

            if not selected_pages:
                print("No suitable pages found for PageSpeed analysis")
                with self.stats_lock:
                    self.stats['pagespeed_sync'] = {'status': 'skipped', 'reason': 'no_pages'}
                return

            print(
                f"Running PageSpeed analysis on {len(selected_pages)} pages "
                f"({', '.join(selected_devices)})..."
            )

            pagespeed_results = []
            updated_rows = []
            for i, page_url in enumerate(selected_pages):
                if not self.is_running:
                    print("PageSpeed analysis cancelled")
                    return

                print(f"Analyzing page {i+1}/{len(selected_pages)}: {page_url}")

                page_result = {
                    'url': page_url,
                    'analysis_date': time.strftime('%Y-%m-%d %H:%M:%S')
                }
                device_results = {}
                for device_index, device in enumerate(selected_devices):
                    result = self._call_pagespeed_api(page_url, device)
                    page_result[device] = result
                    device_results[device] = result

                    if device_index < len(selected_devices) - 1:
                        time.sleep(2)
                        if not self.is_running:
                            return

                pagespeed_results.append(page_result)
                updated_row = self._attach_pagespeed_to_crawl_row(page_url, device_results)
                if updated_row:
                    updated_rows.append(updated_row)

                if i < len(selected_pages) - 1:
                    time.sleep(3)

            self.stats['pagespeed_results'] = pagespeed_results
            successful = sum(
                1
                for item in pagespeed_results
                if any((item.get(device) or {}).get('success') for device in selected_devices)
            )
            sync_summary = {
                'status': 'success' if successful == len(pagespeed_results) else 'partial',
                'analyzed_pages': len(pagespeed_results),
                'successful_pages': successful,
                'devices': selected_devices,
                'last_sync_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            }
            with self.stats_lock:
                self.stats['pagespeed_sync'] = sync_summary
            print(f"PageSpeed analysis completed for {len(pagespeed_results)} pages")

            if self.crawl_id and updated_rows:
                from src.crawl_db import update_url_analytics_batch

                update_url_analytics_batch(
                    self.crawl_id,
                    [
                        {'url': row.get('url'), 'analytics': row.get('analytics', {})}
                        for row in updated_rows
                        if row.get('url')
                    ]
                )
                self.force_full_refresh = True

            try:
                settings_manager = SettingsManager(
                    session_id=self.session_id,
                    user_id=self.user_id,
                    tier=self.user_tier
                )
                settings_manager.save_settings(
                    {
                        'pagespeedLastSyncAt': sync_summary.get('last_sync_at', ''),
                        'pagespeedLastSyncStatus': sync_summary.get('status', ''),
                        'pagespeedLastSyncError': '',
                    }
                )
            except Exception:
                pass

        except Exception as e:
            print(f"Error running PageSpeed analysis: {e}")
            with self.stats_lock:
                self.stats['pagespeed_sync'] = {'status': 'error', 'error': str(e)}
            try:
                settings_manager = SettingsManager(
                    session_id=self.session_id,
                    user_id=self.user_id,
                    tier=self.user_tier
                )
                settings_manager.save_settings(
                    {
                        'pagespeedLastSyncStatus': 'error',
                        'pagespeedLastSyncError': str(e),
                    }
                )
            except Exception:
                pass

    def _select_pages_for_pagespeed(self):
        """Select homepage and 2 category pages for PageSpeed analysis"""
        selected_pages = []

        # Find homepage
        homepage = None
        min_path_length = float('inf')

        for result in self.crawl_results:
            if result.get('status_code') == 200 and result.get('is_internal'):
                url = result['url']
                parsed = urlparse(url)
                path = parsed.path.rstrip('/')

                if path == '' or path == '/':
                    homepage = url
                    break
                elif len(path) < min_path_length:
                    homepage = url
                    min_path_length = len(path)

        if homepage:
            selected_pages.append(homepage)

        # Find category pages
        category_pages = []
        for result in self.crawl_results:
            if result.get('status_code') == 200 and result.get('is_internal'):
                url = result['url']
                parsed = urlparse(url)
                path = parsed.path.strip('/')

                if path and '/' not in path and url != homepage:
                    category_pages.append(url)

        selected_pages.extend(category_pages[:2])
        return selected_pages

    def _get_pagespeed_selected_devices(self):
        devices = self.config.get('pagespeed_selected_devices', ['mobile', 'desktop'])
        if isinstance(devices, str):
            devices = [d.strip() for d in devices.split(',') if d.strip()]
        if not isinstance(devices, list):
            devices = ['mobile', 'desktop']

        normalized = []
        for device in devices:
            d = str(device).strip().lower()
            if d in {'mobile', 'desktop'} and d not in normalized:
                normalized.append(d)

        return normalized or ['mobile', 'desktop']

    def _build_pagespeed_summary(self, device_results):
        preferred_order = self._get_pagespeed_selected_devices()
        primary_device = next((d for d in preferred_order if d in device_results), None)
        if not primary_device and device_results:
            primary_device = next(iter(device_results.keys()))

        primary_result = device_results.get(primary_device, {}) if primary_device else {}
        primary_metrics = (
            primary_result.get('metrics', {})
            if isinstance(primary_result.get('metrics', {}), dict)
            else {}
        )

        return {
            'strategy': primary_device or '',
            'performance_score': primary_result.get('performance_score'),
            'performance': primary_result.get('performance_score'),
            'metrics': primary_metrics,
            'devices': device_results,
            'updated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        }

    def _attach_pagespeed_to_crawl_row(self, page_url, device_results):
        for row in self.crawl_results:
            if row.get('url') != page_url:
                continue

            summary = self._build_pagespeed_summary(device_results)
            row['pagespeed'] = summary
            analytics = row.setdefault('analytics', {})
            if not isinstance(analytics, dict):
                analytics = {}
                row['analytics'] = analytics
            analytics['pagespeed'] = summary
            return row
        return None

    def _call_pagespeed_api(self, url, strategy='mobile', retries=3):
        """Call Google PageSpeed Insights API"""
        import random

        try:
            api_url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
            params = {
                'url': url,
                'strategy': strategy,
                'category': 'performance'
            }

            if self.config.get('google_api_key'):
                params['key'] = self.config['google_api_key']

            for attempt in range(retries + 1):
                try:
                    response = requests.get(api_url, params=params, timeout=60)

                    if response.status_code == 200:
                        data = response.json()
                        lighthouse_result = data.get('lighthouseResult', {})
                        audits = lighthouse_result.get('audits', {})
                        categories = lighthouse_result.get('categories', {})

                        performance_score = None
                        if 'performance' in categories:
                            score = categories['performance'].get('score')
                            if score is not None:
                                performance_score = int(score * 100)

                        metrics = {}

                        if 'first-contentful-paint' in audits:
                            fcp = audits['first-contentful-paint'].get('numericValue')
                            metrics['first_contentful_paint'] = round(fcp / 1000, 2) if fcp else None

                        if 'largest-contentful-paint' in audits:
                            lcp = audits['largest-contentful-paint'].get('numericValue')
                            metrics['largest_contentful_paint'] = round(lcp / 1000, 2) if lcp else None

                        if 'cumulative-layout-shift' in audits:
                            cls = audits['cumulative-layout-shift'].get('numericValue')
                            metrics['cumulative_layout_shift'] = round(cls, 3) if cls else None

                        if 'max-potential-fid' in audits:
                            fid = audits['max-potential-fid'].get('numericValue')
                            metrics['first_input_delay'] = round(fid, 2) if fid else None

                        if 'speed-index' in audits:
                            si = audits['speed-index'].get('numericValue')
                            metrics['speed_index'] = round(si / 1000, 2) if si else None

                        if 'interactive' in audits:
                            tti = audits['interactive'].get('numericValue')
                            metrics['time_to_interactive'] = round(tti / 1000, 2) if tti else None

                        if 'total-blocking-time' in audits:
                            tbt = audits['total-blocking-time'].get('numericValue')
                            metrics['total_blocking_time'] = round(tbt, 2) if tbt else None

                        return {
                            'success': True,
                            'performance_score': performance_score,
                            'metrics': metrics,
                            'strategy': strategy
                        }

                    elif response.status_code == 429:
                        if attempt < retries:
                            delay = (2 ** attempt) * random.uniform(0.5, 1.5)
                            print(f"Rate limited, retrying in {delay:.1f} seconds...")
                            time.sleep(delay)
                            continue

                    return {
                        'success': False,
                        'error': f"API returned status {response.status_code}",
                        'strategy': strategy
                    }

                except requests.exceptions.RequestException as e:
                    if attempt < retries:
                        time.sleep(3)
                        continue
                    return {
                        'success': False,
                        'error': f"Network error: {str(e)}",
                        'strategy': strategy
                    }

        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'strategy': strategy
            }
