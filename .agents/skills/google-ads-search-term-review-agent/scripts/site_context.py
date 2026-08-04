from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from html import unescape
from urllib.parse import urldefrag, urljoin, urlparse
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup


@dataclass
class CrawledPage:
    url: str
    title: str
    text: str
    depth: int
    ok: bool = True
    error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SiteContext:
    destination_url: str
    domain: str
    primary_page: CrawledPage | None
    pages: list[CrawledPage]
    crawl_limited: bool
    errors: list[str]

    def combined_text(self, max_chars: int = 30000) -> str:
        chunks: list[str] = []
        if self.primary_page:
            chunks.append(f"Primary URL: {self.primary_page.url}\nTitle: {self.primary_page.title}\nText: {self.primary_page.text}")
        for page in self.pages:
            if self.primary_page and page.url == self.primary_page.url:
                continue
            chunks.append(f"Supporting URL: {page.url}\nTitle: {page.title}\nText: {page.text}")
        return "\n\n".join(chunks)[:max_chars]

    def to_dict(self) -> dict:
        return {
            "destinationUrl": self.destination_url,
            "domain": self.domain,
            "primaryPage": self.primary_page.to_dict() if self.primary_page else None,
            "pages": [page.to_dict() for page in self.pages],
            "crawlLimited": self.crawl_limited,
            "errors": self.errors,
        }


def normalize_url(url: str) -> str:
    clean, _ = urldefrag(str(url or "").strip())
    return clean.rstrip("/")


def same_domain(url: str, domain: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host == domain or host.endswith(f".{domain}")


def page_text_from_html(url: str, html: str, depth: int) -> CrawledPage:
    soup = BeautifulSoup(html, "html.parser")
    for node in soup(["script", "style", "noscript", "svg"]):
        node.decompose()
    title = " ".join((soup.title.string or "").split()) if soup.title and soup.title.string else ""
    meta = " ".join(
        tag.get("content", "")
        for tag in soup.find_all("meta")
        if str(tag.get("name", tag.get("property", ""))).lower() in {"description", "og:description"}
    )
    headings = " ".join(" ".join(tag.get_text(" ").split()) for tag in soup.find_all(re.compile("^h[1-3]$")))
    body = " ".join(unescape(soup.get_text(" ")).split())
    text = " ".join(part for part in [title, meta, headings, body] if part).strip()[:12000]
    return CrawledPage(url=url, title=title, text=text, depth=depth, ok=True)


def links_from_html(base_url: str, html: str, domain: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links: list[str] = []
    for tag in soup.find_all("a", href=True):
        href = str(tag.get("href", "")).strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        url = normalize_url(urljoin(base_url, href))
        if urlparse(url).scheme in {"http", "https"} and same_domain(url, domain):
            links.append(url)
    return list(dict.fromkeys(links))


def sitemap_urls(base_url: str, domain: str, timeout_seconds: float) -> list[str]:
    parsed = urlparse(base_url)
    sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
            res = client.get(sitemap_url, headers={"User-Agent": "GoogleAdsSearchTermReviewAgent/1.0"})
        if res.status_code >= 400:
            return []
        root = ElementTree.fromstring(res.text.encode("utf-8"))
    except Exception:
        return []
    urls: list[str] = []
    for loc in root.iter():
        if loc.tag.endswith("loc") and loc.text:
            url = normalize_url(loc.text)
            if urlparse(url).scheme in {"http", "https"} and same_domain(url, domain):
                urls.append(url)
    return list(dict.fromkeys(urls))


def crawl_site(destination_url: str, max_pages: int = 50, max_depth: int = 2, timeout_seconds: float = 15.0) -> SiteContext:
    destination_url = normalize_url(destination_url)
    parsed = urlparse(destination_url)
    domain = parsed.netloc.lower()
    if not destination_url or parsed.scheme not in {"http", "https"} or not domain:
        return SiteContext(destination_url=destination_url, domain=domain, primary_page=None, pages=[], crawl_limited=True, errors=["missing_or_invalid_destination_url"])

    queue: list[tuple[str, int]] = [(destination_url, 0)]
    queue.extend((url, 1) for url in sitemap_urls(destination_url, domain, timeout_seconds)[: max_pages // 2])
    seen: set[str] = set()
    pages: list[CrawledPage] = []
    errors: list[str] = []

    with httpx.Client(timeout=timeout_seconds, follow_redirects=True) as client:
        while queue and len(pages) < max_pages:
            url, depth = queue.pop(0)
            url = normalize_url(url)
            if url in seen or depth > max_depth or not same_domain(url, domain):
                continue
            seen.add(url)
            try:
                res = client.get(url, headers={"User-Agent": "GoogleAdsSearchTermReviewAgent/1.0", "Accept": "text/html,application/xhtml+xml"})
                content_type = res.headers.get("content-type", "")
                if res.status_code >= 400 or "html" not in content_type.lower():
                    errors.append(f"{url}: status={res.status_code} content_type={content_type}")
                    continue
                html = res.text
                pages.append(page_text_from_html(str(res.url), html, depth))
                if depth < max_depth:
                    for link in links_from_html(str(res.url), html, domain):
                        if link not in seen and len(queue) + len(pages) < max_pages * 2:
                            queue.append((link, depth + 1))
            except Exception as exc:
                errors.append(f"{url}: {exc}")

    primary = next((page for page in pages if normalize_url(page.url) == destination_url), pages[0] if pages else None)
    return SiteContext(
        destination_url=destination_url,
        domain=domain,
        primary_page=primary,
        pages=pages,
        crawl_limited=bool(queue) or len(pages) >= max_pages or not pages,
        errors=errors,
    )


def fixture_site_context(destination_url: str) -> SiteContext:
    page = CrawledPage(
        url=destination_url,
        title="Business Loan Application",
        text="Business loan and SME financing application for companies that need working capital. Apply online for financing support.",
        depth=0,
    )
    return SiteContext(destination_url=destination_url, domain=urlparse(destination_url).netloc, primary_page=page, pages=[page], crawl_limited=False, errors=[])
