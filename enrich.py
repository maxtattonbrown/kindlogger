#!/usr/bin/env python3
"""
Kindlogger Enrichment — adds genres, page counts, and publication year
from Open Library to your Kindlogger export.

Usage:
    python3 enrich.py kindlogger-export.json

Outputs: kindlogger-enriched.json in the same directory.
"""
import json
import sys
import time
import urllib.request
import urllib.parse
import os

RATE_LIMIT_DELAY = 0.35  # ~3 requests/sec
USER_AGENT = "Kindlogger/1.0 (https://github.com/maxtattonbrown/kindlogger)"

def fetch_json(url):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None

def search_open_library(title, author):
    """Search Open Library by title and author, return best match."""
    # Clean title — remove subtitle after colon for better matching
    clean_title = title.split(":")[0].strip()
    # Also remove series info in parentheses
    import re
    clean_title = re.sub(r"\s*\([^)]*\)\s*$", "", clean_title)

    params = urllib.parse.urlencode({
        "title": clean_title,
        "author": author,
        "limit": 1,
        "fields": "key,title,author_name,first_publish_year,subject,number_of_pages_median"
    })
    url = "https://openlibrary.org/search.json?" + params
    data = fetch_json(url)
    if not data or data.get("numFound", 0) == 0:
        return None
    return data["docs"][0]

def get_work_details(work_key):
    """Fetch full work details for description."""
    url = "https://openlibrary.org" + work_key + ".json"
    return fetch_json(url)

def enrich_book(book):
    """Enrich a single book with Open Library data."""
    title = book.get("title", "")
    author = book.get("author", "")
    if not title:
        return book

    result = search_open_library(title, author)
    time.sleep(RATE_LIMIT_DELAY)

    if not result:
        return book

    enriched = dict(book)

    # Add subjects/genres (take first 5)
    subjects = result.get("subject", [])
    if subjects:
        skip = {"fiction", "in library", "accessible book", "protected daisy",
                "lending library", "large type books", "english language",
                "english fiction", "open library staff picks", "literature",
                "general", "fiction, general", "reading level-grade 11",
                "reading level-grade 12", "children's fiction"}
        import re as _re
        filtered = []
        for s in subjects:
            low = s.lower()
            # Skip generic, metadata-like, or non-English subjects
            if low in skip:
                continue
            if _re.match(r"nyt:", low):  # NYT bestseller tags
                continue
            if _re.match(r"fiction,\s", low):  # "Fiction, science fiction, general"
                continue
            if len(s) < 3 or len(s) > 50:
                continue
            filtered.append(s)
        if filtered:
            enriched["genres"] = filtered[:5]

    # Add page count
    pages = result.get("number_of_pages_median")
    if pages:
        enriched["pages"] = pages

    # Add first publication year
    year = result.get("first_publish_year")
    if year:
        enriched["published"] = year

    # Fetch work details for description
    work_key = result.get("key")
    if work_key:
        work = get_work_details(work_key)
        time.sleep(RATE_LIMIT_DELAY)
        if work:
            desc = work.get("description")
            if isinstance(desc, dict):
                desc = desc.get("value", "")
            if isinstance(desc, str) and len(desc) > 10:
                # Truncate very long descriptions
                if len(desc) > 500:
                    desc = desc[:497] + "..."
                enriched["description"] = desc

    return enriched


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 enrich.py kindlogger-export.json")
        sys.exit(1)

    input_path = sys.argv[1]
    with open(input_path, "r") as f:
        data = json.load(f)

    books = data.get("books", [])
    total = len(books)
    enriched_count = 0
    not_found = 0

    print("Kindlogger Enrich: processing {} books...".format(total))
    print("Estimated time: {:.0f} minutes".format(total * 0.7 / 60))
    print()

    enriched_books = []
    for i, book in enumerate(books):
        enriched = enrich_book(book)
        enriched_books.append(enriched)

        has_new_data = any(k in enriched for k in ("genres", "pages", "published", "description"))
        if has_new_data:
            enriched_count += 1
        else:
            not_found += 1

        if (i + 1) % 25 == 0 or i == total - 1:
            pct = ((i + 1) / total) * 100
            print("  {}/{} ({:.0f}%) — {} enriched, {} not found".format(
                i + 1, total, pct, enriched_count, not_found))

    # Update output
    data["books"] = enriched_books
    data["kindlogger"]["enriched"] = True
    data["kindlogger"]["enriched_count"] = enriched_count
    data["kindlogger"]["enrichment_source"] = "Open Library (openlibrary.org)"

    output_dir = os.path.dirname(input_path) or "."
    output_path = os.path.join(output_dir, "kindlogger-enriched.json")
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print()
    print("DONE: {}/{} books enriched".format(enriched_count, total))
    print("Saved to: {}".format(output_path))


if __name__ == "__main__":
    main()
