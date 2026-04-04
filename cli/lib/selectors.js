// ABOUTME: Shared CSS selectors for Amazon's Kindle pages.
// ABOUTME: Centralised here so both scraper and highlights modules use the same selectors.

module.exports = {
  // Content list page (Manage Your Content)
  library: {
    checkbox: 'input[id$=":KindleEBook"], input[id$=":KindleBook"], input[id$=":Sample"]',
    title: '[id^="content-title-"]',
    author: '[id^="content-author-"]',
    acquiredDate: '[id^="content-acquired-date-"]',
    readBadge: '#content-read-badge',
    coverImage: 'img',
    pagination: {
      container: '#pagination',
      pageItem: '#pagination a.page-item',
      activePage: '#pagination a.page-item.active',
      nextButton: '#page-RIGHT_PAGE',
      pageById: function(n) { return '#page-' + n; }
    }
  },

  // Notebook page (Kindle Cloud Reader)
  notebook: {
    bookItem: '.kp-notebook-library-each-book',
    bookTitle: 'h2.kp-notebook-searchable, h2',
    bookAuthor: 'p.kp-notebook-searchable, p',
    highlight: '#highlight, .kp-notebook-highlight',
    note: '#note',
    highlightColor: '.kp-notebook-highlight',
    annotationRow: '.a-row.a-spacing-base',
    metadata: '.kp-notebook-metadata, [id*="annotationHighlightHeader"]',
    nextPageToken: '.kp-notebook-annotations-next-page-start'
  }
};
