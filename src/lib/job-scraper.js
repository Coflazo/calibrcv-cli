import * as cheerio from 'cheerio';

/**
 * Scrape a job description from a URL. Cheerio-only, no browser automation.
 * Supports LinkedIn public API and generic HTML pages.
 *
 * @param {string} url - Job posting URL.
 * @returns {Promise<{ title: string, company: string, description: string }>}
 */
export async function scrapeJobUrl(url) {
  // LinkedIn: try public guest API first
  const linkedInMatch = url.match(/linkedin\.com\/jobs\/view\/(\d+)/);
  if (linkedInMatch) {
    try {
      return await scrapeLinkedInPublic(linkedInMatch[1]);
    } catch (_) {
      // Fall through to generic scraper
    }
  }

  return await scrapeGeneric(url);
}

async function scrapeLinkedInPublic(jobId) {
  const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
  });

  if (!resp.ok) {
    throw new Error(`LinkedIn API returned ${resp.status}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  const title = $('.top-card-layout__title').text().trim()
    || $('h1').first().text().trim()
    || 'Unknown Title';

  const company = $('.topcard__org-name-link').text().trim()
    || $('.top-card-layout__second-subline span').first().text().trim()
    || 'Unknown Company';

  const description = $('.description__text').text().trim()
    || $('.show-more-less-html__markup').text().trim()
    || $('article').text().trim()
    || '';

  return {
    title,
    company,
    description: description.slice(0, 8000),
  };
}

async function scrapeGeneric(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
    redirect: 'follow',
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, nav, footer, header, iframe').remove();

  const title = $('h1').first().text().trim() || $('title').text().trim() || 'Unknown Title';
  const company = $('meta[property="og:site_name"]').attr('content') || '';

  // Try common job description selectors
  let description = '';
  const selectors = [
    '.job-description', '#job-description', '[data-testid="job-description"]',
    '.description', '.posting-details', '.job-details', 'article', 'main',
  ];
  for (const sel of selectors) {
    const text = $(sel).text().trim();
    if (text.length > 100) {
      description = text;
      break;
    }
  }

  if (!description) {
    description = $('body').text().trim();
  }

  return {
    title,
    company,
    description: description.slice(0, 8000),
  };
}
