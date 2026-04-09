/**
 * Smart heuristic resume parser.
 * Takes raw PDF text and produces a structured resumeJSON
 * matching the schema expected by atsScorer.score().
 *
 * No AI required — pure regex and pattern matching.
 */

// Section header patterns (case-insensitive)
const SECTION_PATTERNS = [
  { type: 'experience', regex: /^(?:professional\s+)?(?:work\s+)?experience$/i },
  { type: 'education', regex: /^education$/i },
  { type: 'projects', regex: /^projects?\s*(?:&\s*extracurriculars?)?$/i },
  { type: 'skills', regex: /^(?:technical\s+)?skills?$/i },
  { type: 'summary', regex: /^(?:professional\s+)?summary|^(?:objective|profile)$/i },
  { type: 'leadership', regex: /^(?:leadership\s*(?:&\s*activities)?|extracurricular\s*activities?)$/i },
  { type: 'certifications', regex: /^certifications?$/i },
  { type: 'awards', regex: /^(?:awards?|honors?|achievements?)$/i },
];

// Date patterns for detecting entry boundaries
const DATE_REGEX = /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}|(?:Expected\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}|\d{4}\s*[-–—]\s*(?:Present|\d{4})|Present/i;

// Bullet markers
const BULLET_REGEX = /^[\u2022\u25E6\u25AA\u2023•\-\*\>]\s*/;

/**
 * Parse raw PDF text into structured resume JSON.
 * @param {string} rawText
 * @returns {object} resumeJSON matching atsScorer schema
 */
export function parseResume(rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const lines = mergeBulletLines(rawLines);

  const contact = extractContact(lines);
  const sections = detectSections(lines, contact.headerEndIndex);
  const summary = extractSummary(lines, contact.headerEndIndex, sections);

  const education = parseSectionEntries(lines, sections, 'education', parseEducationEntry);
  const experience = parseSectionEntries(lines, sections, 'experience', parseExperienceEntry);
  const projects = parseSectionEntries(lines, sections, 'projects', parseProjectEntry);
  const skills = parseSkills(lines, sections);

  return { contact: contact.info, summary, education, experience, projects, skills };
}

/**
 * Merge bullet markers that pdf-parse puts on separate lines.
 * e.g. line "•" followed by "Engineered Python..." becomes "• Engineered Python..."
 */
function mergeBulletLines(lines) {
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // If line is just a bullet marker, merge with next line
    if (/^[\u2022\u25E6\u25AA\u2023•\-\*\>]$/.test(line) && i + 1 < lines.length) {
      merged.push(`${line} ${lines[i + 1]}`);
      i++; // skip next line
    } else {
      merged.push(line);
    }
  }
  return merged;
}

/**
 * Check if a line is a section header.
 */
function isSectionHeader(line) {
  const cleaned = line.replace(/[─━═\-_*#:]/g, '').trim();
  return SECTION_PATTERNS.some(p => p.regex.test(cleaned));
}

/**
 * Detect section boundaries in the document.
 * Returns array of { type, startLine, endLine }.
 */
function detectSections(lines, startFrom) {
  const sections = [];

  for (let i = startFrom; i < lines.length; i++) {
    const cleaned = lines[i].replace(/[─━═\-_*#:]/g, '').trim();
    for (const pattern of SECTION_PATTERNS) {
      if (pattern.regex.test(cleaned)) {
        sections.push({ type: pattern.type, startLine: i + 1 }); // content starts after header
        break;
      }
    }
  }

  // Set endLine for each section (until next section starts or EOF)
  for (let i = 0; i < sections.length; i++) {
    sections[i].endLine = (i + 1 < sections.length)
      ? sections[i + 1].startLine - 1
      : lines.length;
  }

  return sections;
}

/**
 * Extract summary text between contact block and first section.
 */
function extractSummary(lines, headerEndIndex, sections) {
  const firstSectionLine = sections.length > 0 ? sections[0].startLine - 1 : lines.length;
  const summaryLines = [];

  for (let i = headerEndIndex; i < firstSectionLine; i++) {
    const line = lines[i];
    if (line.length > 10 && !isSectionHeader(line)) {
      summaryLines.push(line);
    }
  }

  return summaryLines.join(' ').trim();
}

/**
 * Extract contact info from the top of the resume.
 * Returns { info: { name, phone, email, linkedin, location }, headerEndIndex }
 */
function extractContact(lines) {
  const info = { name: '', phone: '', email: '', linkedin: '', location: '' };
  let headerEndIndex = 0;

  // First line is typically the name
  if (lines.length > 0) {
    info.name = lines[0];
    headerEndIndex = 1;
  }

  // Scan next ~8 lines for contact details
  const scanLimit = Math.min(lines.length, 10);
  for (let i = 1; i < scanLimit; i++) {
    const line = lines[i];

    // Stop if we hit a section header
    if (isSectionHeader(line)) break;

    // Email
    const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch && !info.email) {
      info.email = emailMatch[0];
      headerEndIndex = Math.max(headerEndIndex, i + 1);
    }

    // Phone
    const phoneMatch = line.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}/);
    if (phoneMatch && !info.phone && phoneMatch[0].replace(/\D/g, '').length >= 7) {
      info.phone = phoneMatch[0].trim();
      headerEndIndex = Math.max(headerEndIndex, i + 1);
    }

    // LinkedIn — full URL or icon-based slug (e.g., "|ï  username" from PDF icon fonts)
    const linkedinUrl = line.match(/linkedin\.com\/in\/([\w-]+)/i);
    const linkedinIcon = line.match(/[|]\s*[\uf0e1ï]\s+([\w-]{3,})/);
    const linkedinMatch = linkedinUrl || linkedinIcon;
    if (linkedinMatch && !info.linkedin) {
      info.linkedin = linkedinMatch[1];
      headerEndIndex = Math.max(headerEndIndex, i + 1);
    }

    // Location — line with "City, State/Country" pattern, not email/phone/linkedin
    if (!info.location && !emailMatch && !linkedinMatch) {
      const locMatch = line.match(/^([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+)$/);
      if (locMatch) {
        info.location = locMatch[1].trim();
        headerEndIndex = Math.max(headerEndIndex, i + 1);
      }
    }
  }

  return { info, headerEndIndex };
}

/**
 * Generic section parser — splits a section into entries and parses each.
 */
function parseSectionEntries(lines, sections, sectionType, entryParser) {
  const section = sections.find(s => s.type === sectionType);
  if (!section) return [];

  const sectionLines = lines.slice(section.startLine, section.endLine);
  const entries = splitIntoEntries(sectionLines);
  return entries.map(entryParser).filter(Boolean);
}

/**
 * Split section lines into entry groups.
 * Each entry starts with a non-bullet line (title/institution line).
 */
function splitIntoEntries(sectionLines) {
  const entries = [];
  let currentEntry = [];

  for (const line of sectionLines) {
    const isBullet = BULLET_REGEX.test(line);

    if (!isBullet && currentEntry.length > 0) {
      const lastHasBullets = currentEntry.some(l => BULLET_REGEX.test(l));
      if (lastHasBullets && !isBulletContinuation(line, currentEntry)) {
        entries.push(currentEntry);
        currentEntry = [line];
        continue;
      }
    }
    currentEntry.push(line);
  }

  if (currentEntry.length > 0) entries.push(currentEntry);
  return entries;
}

/**
 * Check if a non-bullet line is a continuation of the previous entry
 * (e.g., company line after title line) rather than a new entry.
 */
function isBulletContinuation(line, prevEntry) {
  // If line has a date, it's likely a new entry
  if (DATE_REGEX.test(line)) return false;
  // If line has a location pattern (City, Country), likely a new entry header
  if (/[A-Z][a-z]+,\s*[A-Z][a-zA-Z\s]+\s*$/.test(line)) {
    // But only if previous entry already had bullets (complete entry)
    const hasBullets = prevEntry.some(l => BULLET_REGEX.test(l));
    if (hasBullets) return false;
  }
  return true;
}

/**
 * Extract bullets from an entry's lines.
 */
function extractBullets(entryLines) {
  return entryLines
    .filter(l => BULLET_REGEX.test(l))
    .map(l => l.replace(BULLET_REGEX, '').trim());
}

/**
 * Extract dates from a line.
 */
function extractDates(line) {
  const matches = line.match(new RegExp(DATE_REGEX.source, 'gi'));
  if (!matches) return '';
  if (matches.length >= 2) return `${matches[0]} - ${matches[1]}`;
  return matches[0];
}

/**
 * Parse an education entry from its lines.
 */
function parseEducationEntry(entryLines) {
  if (entryLines.length === 0) return null;

  const nonBullets = entryLines.filter(l => !BULLET_REGEX.test(l));
  const bullets = extractBullets(entryLines);

  let institution = '', location = '', degree = '', dates = '';

  // First non-bullet line: institution + location
  if (nonBullets.length >= 1) {
    const parts = splitByLocation(nonBullets[0]);
    institution = parts.main;
    location = parts.location;
  }

  // Second non-bullet line: degree + dates
  if (nonBullets.length >= 2) {
    dates = extractDates(nonBullets[1]);
    degree = nonBullets[1].replace(new RegExp(DATE_REGEX.source, 'gi'), '')
      .replace(/[-–—]/g, '').replace(/\s+/g, ' ').trim();
  }

  // If dates not found on second line, check first line
  if (!dates && nonBullets.length >= 1) {
    dates = extractDates(nonBullets[0]);
  }

  return { institution, location, degree, dates, bullets };
}

/**
 * Parse an experience entry from its lines.
 */
function parseExperienceEntry(entryLines) {
  if (entryLines.length === 0) return null;

  const nonBullets = entryLines.filter(l => !BULLET_REGEX.test(l));
  const bullets = extractBullets(entryLines);

  let title = '', dates = '', company = '', location = '';

  // First non-bullet line: title + dates
  if (nonBullets.length >= 1) {
    dates = extractDates(nonBullets[0]);
    title = nonBullets[0].replace(new RegExp(DATE_REGEX.source, 'gi'), '')
      .replace(/[-–—|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // Clean trailing/leading junk from concatenated PDF text
    title = title.replace(/\s*-\s*$/, '').trim();
  }

  // Second non-bullet line: company + location
  if (nonBullets.length >= 2) {
    const parts = splitByLocation(nonBullets[1]);
    company = parts.main;
    location = parts.location;
    // If first line had no dates, check second
    if (!dates) dates = extractDates(nonBullets[1]);
  }

  return { title, dates, company, location, bullets };
}

/**
 * Parse a project entry from its lines.
 */
function parseProjectEntry(entryLines) {
  if (entryLines.length === 0) return null;

  const nonBullets = entryLines.filter(l => !BULLET_REGEX.test(l));
  const bullets = extractBullets(entryLines);

  let name = '', label = '', date = '';

  if (nonBullets.length >= 1) {
    const line = nonBullets[0];
    date = extractDates(line);

    // Split by | to get name and label
    const pipeParts = line.split('|').map(p => p.trim());
    name = (pipeParts[0] || '').replace(new RegExp(DATE_REGEX.source, 'gi'), '')
      .replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    if (pipeParts.length > 1) {
      label = pipeParts[1].replace(new RegExp(DATE_REGEX.source, 'gi'), '')
        .replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return { name, label, date, bullets };
}

/**
 * Parse the skills section.
 */
function parseSkills(lines, sections) {
  const section = sections.find(s => s.type === 'skills');
  const defaultSkills = { quantitative_stack: '', analytic_domain: '' };
  if (!section) return defaultSkills;

  const sectionLines = lines.slice(section.startLine, section.endLine);
  let quantitative = '', analytic = '';

  for (const line of sectionLines) {
    const lower = line.toLowerCase();
    if (lower.includes('quantitative') || lower.includes('technical') || lower.includes('programming')) {
      quantitative = line.replace(/^[^:]+:\s*/i, '').trim();
    } else if (lower.includes('analytic') || lower.includes('domain') || lower.includes('frameworks')) {
      analytic = line.replace(/^[^:]+:\s*/i, '').trim();
    }
  }

  // Fallback: if no labeled rows, use first two lines
  if (!quantitative && !analytic && sectionLines.length >= 1) {
    quantitative = sectionLines[0].replace(/^[^:]+:\s*/i, '').trim();
    if (sectionLines.length >= 2) {
      analytic = sectionLines[1].replace(/^[^:]+:\s*/i, '').trim();
    }
  }

  return { quantitative_stack: quantitative, analytic_domain: analytic };
}

/**
 * Split a line into main content and location (City, State/Country).
 * Handles concatenated text from pdf-parse (e.g., "Robert CollegeIstanbul, Turkey").
 */
function splitByLocation(line) {
  // Pattern: text followed by "City, Country/State" possibly concatenated
  const locMatch = line.match(/^(.+?)([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*[A-Z][a-zA-Z\s]+)\s*$/);
  if (locMatch && locMatch[2].length < 40) {
    return { main: locMatch[1].trim(), location: locMatch[2].trim() };
  }
  return { main: line.trim(), location: '' };
}

export default parseResume;
