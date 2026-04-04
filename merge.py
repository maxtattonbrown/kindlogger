#!/usr/bin/env python3
"""
Kindlogger Merge — combines enriched library data with highlights
into a single AI-ready JSON file.

Usage:
    python3 merge.py kindlogger-enriched.json kindlogger-highlights.json

If no highlights file is provided, outputs the enriched data as-is
with the final Kindlogger format.

Outputs: kindlogger-complete.json in the same directory.
"""
import json
import sys
import os


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 merge.py <enriched.json> [highlights.json]")
        sys.exit(1)

    enriched_path = sys.argv[1]
    highlights_path = sys.argv[2] if len(sys.argv) > 2 else None

    with open(enriched_path, "r") as f:
        enriched = json.load(f)

    # Build ASIN lookup for highlights
    highlights_by_asin = {}
    highlights_by_title = {}
    highlights_meta = None

    if highlights_path:
        with open(highlights_path, "r") as f:
            hl_data = json.load(f)

        highlights_meta = hl_data.get("kindlogger_highlights", {})
        for book in hl_data.get("books", []):
            asin = book.get("asin", "")
            title = book.get("title", "").lower()
            highlights = book.get("highlights", [])
            if asin and asin.startswith("B"):
                highlights_by_asin[asin] = highlights
            if title:
                highlights_by_title[title] = highlights

        print("Loaded {} books with highlights".format(len(hl_data.get("books", []))))

    # Merge highlights into enriched books
    books = enriched.get("books", [])
    books_with_highlights = 0
    total_highlights = 0

    for book in books:
        asin = book.get("asin", "")
        title = book.get("title", "").lower()

        highlights = highlights_by_asin.get(asin) or highlights_by_title.get(title)
        if highlights:
            book["highlights"] = highlights
            books_with_highlights += 1
            total_highlights += len(highlights)

    # Update metadata
    meta = enriched.get("kindlogger", {})
    meta["merged"] = True
    if highlights_meta:
        meta["books_with_highlights"] = books_with_highlights
        meta["total_highlights"] = total_highlights

    output = {
        "kindlogger": meta,
        "books": books
    }

    output_dir = os.path.dirname(enriched_path) or "."
    output_path = os.path.join(output_dir, "kindlogger-complete.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print()
    print("Merged: {} books".format(len(books)))
    if highlights_path:
        print("  {} books with highlights ({} total highlights)".format(
            books_with_highlights, total_highlights))
    enriched_count = sum(1 for b in books if any(k in b for k in ("genres", "pages", "published")))
    print("  {} books with Open Library data".format(enriched_count))
    print()
    print("Saved to: {}".format(output_path))


if __name__ == "__main__":
    main()
