"""
Advanced robots.txt parser with comprehensive analysis capabilities.
Supports custom robots.txt per subdomain and path testing.
"""
import re
import requests
from urllib.parse import urlparse, urljoin
from typing import Dict, List, Optional, Tuple


class RobotsDirective:
    """Represents a single robots.txt directive (allow/disallow)."""

    def __init__(self, path: str, allow: bool = False):
        self.path = path
        self.allow = allow
        self.pattern = self._compile_pattern(path)

    def _compile_pattern(self, path: str) -> re.Pattern:
        """Convert robots.txt path pattern to regex."""
        # Escape special regex characters except * and $
        escaped = re.escape(path)
        # Convert robots.txt wildcards to regex
        escaped = escaped.replace(r'\*', '.*')
        escaped = escaped.replace(r'\$', '$')
        # If pattern doesn't end with $ or .*, add .* to match subpaths
        if not escaped.endswith('$') and not escaped.endswith('.*'):
            escaped += '.*'
        return re.compile('^' + escaped)

    def matches(self, path: str) -> bool:
        """Check if this directive matches the given path."""
        return bool(self.pattern.match(path))

    def __repr__(self):
        directive_type = 'Allow' if self.allow else 'Disallow'
        return f"{directive_type}: {self.path}"


class UserAgentRules:
    """Holds all rules for a specific user agent."""

    def __init__(self, user_agent: str):
        self.user_agent = user_agent
        self.directives: List[RobotsDirective] = []
        self.crawl_delay: Optional[float] = None
        self.request_rate: Optional[Tuple[int, int]] = None  # (requests, seconds)
        self.sitemaps: List[str] = []

    def add_directive(self, path: str, allow: bool):
        """Add a directive to this user agent's rules."""
        self.directives.append(RobotsDirective(path, allow))

    def is_allowed(self, path: str) -> bool:
        """Check if the path is allowed for this user agent."""
        if not self.directives:
            return True

        # Find the most specific matching rule
        best_match = None
        best_length = -1

        for directive in self.directives:
            if directive.matches(path):
                # More specific paths (longer) take precedence
                if len(directive.path) > best_length:
                    best_match = directive
                    best_length = len(directive.path)

        if best_match is None:
            return True

        return best_match.allow

    def get_blocked_paths(self) -> List[str]:
        """Get list of blocked paths."""
        return [d.path for d in self.directives if not d.allow]

    def get_allowed_paths(self) -> List[str]:
        """Get list of explicitly allowed paths."""
        return [d.path for d in self.directives if d.allow]


class RobotsParser:
    """
    Comprehensive robots.txt parser with analysis capabilities.
    """

    def __init__(self, timeout: int = 10):
        self.timeout = timeout
        self.user_agent_rules: Dict[str, UserAgentRules] = {}
        self.sitemaps: List[str] = []
        self.raw_content: str = ""
        self.parse_errors: List[str] = []
        self.url: Optional[str] = None
        self.last_fetched: Optional[str] = None

    def fetch_and_parse(self, url: str, user_agent: str = "WailingNewt/1.0") -> bool:
        """Fetch robots.txt from URL and parse it."""
        try:
            parsed = urlparse(url)
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            self.url = robots_url

            response = requests.get(
                robots_url,
                timeout=self.timeout,
                headers={'User-Agent': user_agent},
                allow_redirects=True
            )

            if response.status_code == 200:
                self.raw_content = response.text
                self.parse(response.text)
                import datetime
                self.last_fetched = datetime.datetime.now().isoformat()
                return True
            elif response.status_code == 404:
                # No robots.txt means everything is allowed
                self.raw_content = ""
                return True
            else:
                self.parse_errors.append(f"HTTP {response.status_code}")
                return False

        except requests.exceptions.Timeout:
            self.parse_errors.append("Request timed out")
            return False
        except requests.exceptions.RequestException as e:
            self.parse_errors.append(f"Network error: {str(e)}")
            return False
        except Exception as e:
            self.parse_errors.append(f"Error: {str(e)}")
            return False

    def parse(self, content: str):
        """Parse robots.txt content."""
        self.raw_content = content
        self.user_agent_rules = {}
        self.sitemaps = []
        self.parse_errors = []

        current_user_agents: List[str] = []

        for line_num, line in enumerate(content.split('\n'), 1):
            # Remove comments and whitespace
            line = line.split('#')[0].strip()
            if not line:
                continue

            # Parse directive
            if ':' not in line:
                self.parse_errors.append(f"Line {line_num}: Invalid syntax")
                continue

            directive, value = line.split(':', 1)
            directive = directive.strip().lower()
            value = value.strip()

            if directive == 'user-agent':
                # Start new user agent block
                if value not in self.user_agent_rules:
                    self.user_agent_rules[value] = UserAgentRules(value)

                # Check if this is a new block or continuation
                if current_user_agents and self.user_agent_rules.get(current_user_agents[0]) and \
                   self.user_agent_rules[current_user_agents[0]].directives:
                    # Previous block had directives, start fresh
                    current_user_agents = [value]
                else:
                    # Multiple user-agents can share rules
                    current_user_agents.append(value)

            elif directive in ('disallow', 'allow'):
                if not current_user_agents:
                    self.parse_errors.append(f"Line {line_num}: Directive without user-agent")
                    continue

                is_allow = directive == 'allow'

                for ua in current_user_agents:
                    if ua not in self.user_agent_rules:
                        self.user_agent_rules[ua] = UserAgentRules(ua)
                    self.user_agent_rules[ua].add_directive(value, is_allow)

            elif directive == 'crawl-delay':
                try:
                    delay = float(value)
                    for ua in current_user_agents:
                        if ua in self.user_agent_rules:
                            self.user_agent_rules[ua].crawl_delay = delay
                except ValueError:
                    self.parse_errors.append(f"Line {line_num}: Invalid crawl-delay value")

            elif directive == 'request-rate':
                # Format: requests/seconds (e.g., 1/5)
                try:
                    parts = value.split('/')
                    if len(parts) == 2:
                        requests_count = int(parts[0])
                        seconds = int(parts[1])
                        for ua in current_user_agents:
                            if ua in self.user_agent_rules:
                                self.user_agent_rules[ua].request_rate = (requests_count, seconds)
                except ValueError:
                    self.parse_errors.append(f"Line {line_num}: Invalid request-rate value")

            elif directive == 'sitemap':
                if value and value not in self.sitemaps:
                    self.sitemaps.append(value)

            elif directive == 'host':
                # Some robots.txt files include host directive (Yandex)
                pass

            else:
                self.parse_errors.append(f"Line {line_num}: Unknown directive '{directive}'")

    def is_allowed(self, url: str, user_agent: str = "*") -> bool:
        """Check if URL is allowed for the given user agent."""
        parsed = urlparse(url)
        path = parsed.path
        if parsed.query:
            path += '?' + parsed.query

        # Check for exact user agent match first
        if user_agent in self.user_agent_rules:
            return self.user_agent_rules[user_agent].is_allowed(path)

        # Check for wildcard rules
        if '*' in self.user_agent_rules:
            return self.user_agent_rules['*'].is_allowed(path)

        # No rules means everything is allowed
        return True

    def get_rules_for_user_agent(self, user_agent: str) -> Optional[UserAgentRules]:
        """Get rules for a specific user agent."""
        if user_agent in self.user_agent_rules:
            return self.user_agent_rules[user_agent]
        if '*' in self.user_agent_rules:
            return self.user_agent_rules['*']
        return None

    def get_all_user_agents(self) -> List[str]:
        """Get all user agents defined in robots.txt."""
        return list(self.user_agent_rules.keys())

    def get_crawl_delay(self, user_agent: str = "*") -> Optional[float]:
        """Get crawl delay for user agent."""
        rules = self.get_rules_for_user_agent(user_agent)
        return rules.crawl_delay if rules else None

    def test_path(self, path: str, user_agent: str = "*") -> Dict:
        """Test if a path is allowed and return detailed result."""
        # Ensure path starts with /
        if not path.startswith('/'):
            path = '/' + path

        rules = self.get_rules_for_user_agent(user_agent)

        if not rules:
            return {
                'path': path,
                'allowed': True,
                'user_agent': user_agent,
                'matched_rule': None,
                'reason': 'No rules defined for this user agent'
            }

        # Find matching rule
        best_match = None
        best_length = -1

        for directive in rules.directives:
            if directive.matches(path):
                if len(directive.path) > best_length:
                    best_match = directive
                    best_length = len(directive.path)

        if best_match is None:
            return {
                'path': path,
                'allowed': True,
                'user_agent': user_agent,
                'matched_rule': None,
                'reason': 'No matching rules found'
            }

        return {
            'path': path,
            'allowed': best_match.allow,
            'user_agent': user_agent,
            'matched_rule': str(best_match),
            'reason': f"Matched by rule: {best_match}"
        }

    def get_analysis(self, user_agent: str = "*") -> Dict:
        """Get comprehensive analysis of robots.txt for a user agent."""
        rules = self.get_rules_for_user_agent(user_agent)

        analysis = {
            'url': self.url,
            'last_fetched': self.last_fetched,
            'raw_content': self.raw_content,
            'user_agents': self.get_all_user_agents(),
            'sitemaps': self.sitemaps,
            'parse_errors': self.parse_errors,
            'selected_user_agent': user_agent,
            'rules': {
                'blocked_paths': [],
                'allowed_paths': [],
                'crawl_delay': None,
                'request_rate': None
            }
        }

        if rules:
            analysis['rules']['blocked_paths'] = rules.get_blocked_paths()
            analysis['rules']['allowed_paths'] = rules.get_allowed_paths()
            analysis['rules']['crawl_delay'] = rules.crawl_delay
            analysis['rules']['request_rate'] = rules.request_rate

        return analysis


class CustomRobotsManager:
    """
    Manages custom robots.txt content per subdomain.
    Allows users to specify custom robots.txt rules for crawling.
    """

    def __init__(self):
        self.custom_robots: Dict[str, str] = {}  # subdomain -> robots.txt content
        self.parsers: Dict[str, RobotsParser] = {}  # subdomain -> parser

    def add_subdomain(self, subdomain: str, content: str = ""):
        """Add or update custom robots.txt for a subdomain."""
        self.custom_robots[subdomain] = content

        # Parse the content
        parser = RobotsParser()
        parser.parse(content)
        self.parsers[subdomain] = parser

    def remove_subdomain(self, subdomain: str) -> bool:
        """Remove custom robots.txt for a subdomain."""
        if subdomain in self.custom_robots:
            del self.custom_robots[subdomain]
            if subdomain in self.parsers:
                del self.parsers[subdomain]
            return True
        return False

    def get_subdomain_content(self, subdomain: str) -> Optional[str]:
        """Get custom robots.txt content for a subdomain."""
        return self.custom_robots.get(subdomain)

    def get_all_subdomains(self) -> List[str]:
        """Get all subdomains with custom robots.txt."""
        return list(self.custom_robots.keys())

    def is_allowed(self, url: str, user_agent: str = "*") -> bool:
        """Check if URL is allowed using custom robots.txt rules."""
        parsed = urlparse(url)
        subdomain = parsed.netloc

        if subdomain in self.parsers:
            return self.parsers[subdomain].is_allowed(url, user_agent)

        # No custom rules, allow by default
        return True

    def test_path(self, subdomain: str, path: str, user_agent: str = "*") -> Dict:
        """Test a path against custom robots.txt for a subdomain."""
        if subdomain not in self.parsers:
            return {
                'path': path,
                'allowed': True,
                'user_agent': user_agent,
                'matched_rule': None,
                'reason': 'No custom robots.txt for this subdomain'
            }

        return self.parsers[subdomain].test_path(path, user_agent)

    def to_dict(self) -> Dict:
        """Serialize to dictionary for storage."""
        return {
            'custom_robots': self.custom_robots
        }

    def from_dict(self, data: Dict):
        """Load from dictionary."""
        self.custom_robots = {}
        self.parsers = {}

        for subdomain, content in data.get('custom_robots', {}).items():
            self.add_subdomain(subdomain, content)

    def clear(self):
        """Clear all custom robots.txt entries."""
        self.custom_robots = {}
        self.parsers = {}


class RobotsBlockedTracker:
    """
    Tracks URLs blocked by robots.txt during crawling.
    """

    def __init__(self):
        self.blocked_internal: List[Dict] = []
        self.blocked_external: List[Dict] = []

    def add_blocked(self, url: str, reason: str, is_internal: bool):
        """Record a blocked URL."""
        entry = {
            'url': url,
            'reason': reason,
            'is_internal': is_internal
        }

        if is_internal:
            self.blocked_internal.append(entry)
        else:
            self.blocked_external.append(entry)

    def get_blocked_internal(self) -> List[Dict]:
        """Get list of blocked internal URLs."""
        return self.blocked_internal

    def get_blocked_external(self) -> List[Dict]:
        """Get list of blocked external URLs."""
        return self.blocked_external

    def get_blocked_count(self) -> Dict:
        """Get count of blocked URLs."""
        return {
            'internal': len(self.blocked_internal),
            'external': len(self.blocked_external),
            'total': len(self.blocked_internal) + len(self.blocked_external)
        }

    def clear(self):
        """Clear all tracked blocked URLs."""
        self.blocked_internal = []
        self.blocked_external = []

    def to_dict(self) -> Dict:
        """Serialize to dictionary."""
        return {
            'blocked_internal': self.blocked_internal,
            'blocked_external': self.blocked_external
        }
