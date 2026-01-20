import re

URL_REGEX = re.compile(r'https?://[^\s,]+', re.IGNORECASE)


def extract_urls_from_text(text):
    """Extract URLs from text content."""
    matches = URL_REGEX.findall(text or '')

    if matches:
        urls = [url.rstrip(')]}>.,;:!?') for url in matches]
        return [url for url in urls if url]

    urls = []
    for line in (text or '').splitlines():
        candidate = line.strip()
        if candidate.startswith(('http://', 'https://')):
            urls.append(candidate)

    return urls
