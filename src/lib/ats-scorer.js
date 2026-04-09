import natural from 'natural';
import { HBS_VERBS } from '../constants/hbs-verbs.js';

const METRIC_REGEX = /\d+[\%\$]?|\$\d+|\d+[xX]|\d+ms|\d+\+|\d+[KkMmBb]|\€\d+/g;

/**
 * CalibrCV's proprietary ATS Scoring Engine.
 * Pure algorithmic scoring — no AI calls, no external APIs.
 * 5 categories, 100 points total.
 */
class ATSScorer {

  /**
   * Score a resume against CalibrCV's quality standards.
   *
   * @param {string} resumeText - Raw text of the resume.
   * @param {object} resumeJSON - Structured JSON resume object.
   * @param {string|null} [jobDescriptionText] - Optional job description for keyword matching.
   * @returns {ScoreReport}
   */
  score(resumeText, resumeJSON, jobDescriptionText = null) {
    const categories = {
      structural: this.scoreStructural(resumeJSON),
      keywords: this.scoreKeywords(resumeJSON, jobDescriptionText),
      content_quality: this.scoreContentQuality(resumeJSON),
      parsability: this.scoreParsability(resumeText),
      completeness: this.scoreCompleteness(resumeJSON),
    };

    const total = Object.values(categories).reduce((sum, c) => sum + c.score, 0);
    const violations = this.detectLawViolations(resumeJSON);
    const recommendations = this.generateRecommendations(categories, violations);
    const letterGrade = this.getLetterGrade(total);

    return {
      total,
      letter_grade: letterGrade,
      categories,
      recommendations,
      calibrcv_law_violations: violations,
    };
  }

  /**
   * STRUCTURAL INTEGRITY: 0-20 points
   * Checks presence and completeness of required resume sections.
   */
  scoreStructural(resumeJSON) {
    let score = 0;
    const issues = [];

    // +5: has education array with ≥1 entry
    if (resumeJSON.education?.length >= 1) {
      score += 5;
    } else {
      issues.push('Missing education section');
    }

    // +5: has experience array with ≥1 entry
    if (resumeJSON.experience?.length >= 1) {
      score += 5;
    } else {
      issues.push('Missing experience section');
    }

    // +5: has skills object with both fields
    if (resumeJSON.skills?.quantitative_stack && resumeJSON.skills?.analytic_domain) {
      score += 5;
    } else {
      issues.push('Missing or incomplete skills section');
    }

    // +5: all experience and education entries have non-empty dates
    const allDated = [
      ...(resumeJSON.experience || []),
      ...(resumeJSON.education || []),
    ].every(entry => entry.dates && entry.dates.trim().length > 0);
    if (allDated) {
      score += 5;
    } else {
      issues.push('Some entries are missing dates');
    }

    return { score, max: 20, label: 'Structural Integrity', issues };
  }

  /**
   * KEYWORD DENSITY: 0-30 points
   * With JD: TF-IDF keyword matching.
   * Without JD: Lexical richness (type/token ratio).
   */
  scoreKeywords(resumeJSON, jobDescriptionText) {
    const allResumeText = this.extractAllText(resumeJSON);

    if (jobDescriptionText && jobDescriptionText.trim().length > 50) {
      return this.scoreKeywordsWithJD(allResumeText, jobDescriptionText);
    }

    return this.scoreKeywordsWithoutJD(allResumeText);
  }

  scoreKeywordsWithJD(resumeText, jdText) {
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(jdText.toLowerCase());
    tfidf.addDocument(resumeText.toLowerCase());

    // Extract top 30 terms from the JD
    const jdTerms = [];
    tfidf.listTerms(0).forEach(item => {
      if (item.term.length > 2 && jdTerms.length < 30) {
        jdTerms.push(item.term);
      }
    });

    const resumeLower = resumeText.toLowerCase();
    const matchedKeywords = [];
    const missingKeywords = [];

    for (const term of jdTerms) {
      if (resumeLower.includes(term)) {
        matchedKeywords.push(term);
      } else {
        missingKeywords.push(term);
      }
    }

    const matchRate = jdTerms.length > 0 ? matchedKeywords.length / jdTerms.length : 0;
    const score = Math.round(matchRate * 30);

    return {
      score: Math.min(score, 30),
      max: 30,
      label: 'Keyword Density',
      matched_keywords: matchedKeywords,
      missing_keywords: missingKeywords.slice(0, 10),
      match_rate: Math.round(matchRate * 100),
    };
  }

  scoreKeywordsWithoutJD(resumeText) {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(resumeText.toLowerCase());

    if (tokens.length === 0) {
      return { score: 0, max: 30, label: 'Keyword Density', match_rate: 0 };
    }

    const uniqueTokens = new Set(tokens);
    const richness = uniqueTokens.size / tokens.length;

    // Richness typically ranges 0.3-0.7 for resumes
    // Normalize: 0.3 = 0 points, 0.6+ = 30 points
    const normalized = Math.min(Math.max((richness - 0.3) / 0.3, 0), 1);
    const score = Math.round(normalized * 30);

    return {
      score: Math.min(score, 30),
      max: 30,
      label: 'Keyword Density',
      lexical_richness: Math.round(richness * 100),
      unique_terms: uniqueTokens.size,
      total_terms: tokens.length,
    };
  }

  /**
   * CONTENT QUALITY: 0-25 points
   * HBS verb compliance, metric presence, bullet length sweet spot.
   */
  scoreContentQuality(resumeJSON) {
    const allBullets = [
      ...(resumeJSON.experience?.flatMap(e => e.bullets || []) || []),
      ...(resumeJSON.projects?.flatMap(p => p.bullets || []) || []),
    ];

    if (allBullets.length === 0) {
      return { score: 0, max: 25, label: 'Content Quality', verb_compliance_rate: 0, metric_rate: 0, avg_bullet_length: 0 };
    }

    const total = allBullets.length;

    // HBS Verb compliance (0-10)
    let compliantCount = 0;
    for (const bullet of allBullets) {
      const firstWord = bullet.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      if (HBS_VERBS.includes(firstWord)) {
        compliantCount++;
      }
    }
    const verbScore = Math.round((compliantCount / total) * 10);
    const verbComplianceRate = Math.round((compliantCount / total) * 100);

    // Metric presence (0-10)
    let bulletsWithMetrics = 0;
    for (const bullet of allBullets) {
      if (METRIC_REGEX.test(bullet)) {
        bulletsWithMetrics++;
      }
      METRIC_REGEX.lastIndex = 0; // Reset regex state
    }
    const metricScore = Math.round((bulletsWithMetrics / total) * 10);
    const metricRate = Math.round((bulletsWithMetrics / total) * 100);

    // Length sweet spot (0-5)
    const totalLength = allBullets.reduce((sum, b) => sum + b.length, 0);
    const avgLength = Math.round(totalLength / total);
    let lengthScore = 0;
    if (avgLength >= 55 && avgLength <= 100) {
      lengthScore = 5;
    } else if (avgLength >= 45 && avgLength <= 120) {
      lengthScore = 3;
    }

    return {
      score: verbScore + metricScore + lengthScore,
      max: 25,
      label: 'Content Quality',
      verb_compliance_rate: verbComplianceRate,
      metric_rate: metricRate,
      avg_bullet_length: avgLength,
    };
  }

  /**
   * PARSABILITY: 0-15 points
   * Deducts for characters that break ATS parsers.
   */
  scoreParsability(resumeText) {
    let score = 15;
    const issuesFound = [];

    // -5: box-drawing characters
    if (/[│┤├─┼╌╎]/g.test(resumeText)) {
      score -= 5;
      issuesFound.push('Box-drawing characters found (breaks ATS parsers)');
    }

    // -5: em dashes
    if (/—/.test(resumeText)) {
      score -= 5;
      issuesFound.push('Em dashes found (use hyphens or semicolons instead)');
    }

    // -3: smart/curly quotes
    if (/[\u2018\u2019\u201C\u201D]/.test(resumeText)) {
      score -= 3;
      issuesFound.push('Smart/curly quotes found (use straight quotes)');
    }

    // -2: null bytes or control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(resumeText)) {
      score -= 2;
      issuesFound.push('Control characters found (indicates corrupted text)');
    }

    return {
      score: Math.max(0, score),
      max: 15,
      label: 'Parsability',
      issues_found: issuesFound,
    };
  }

  /**
   * COMPLETENESS: 0-10 points
   * Checks presence of contact info and skills breadth.
   */
  scoreCompleteness(resumeJSON) {
    let score = 0;
    const missingFields = [];

    // +2: email
    if (resumeJSON.contact?.email?.trim()) {
      score += 2;
    } else {
      missingFields.push('email');
    }

    // +2: phone
    if (resumeJSON.contact?.phone?.trim()) {
      score += 2;
    } else {
      missingFields.push('phone');
    }

    // +2: linkedin
    if (resumeJSON.contact?.linkedin?.trim()) {
      score += 2;
    } else {
      missingFields.push('linkedin');
    }

    // +2: location
    if (resumeJSON.contact?.location?.trim()) {
      score += 2;
    } else {
      missingFields.push('location');
    }

    // +2: skills breadth (≥3 comma-separated values in quantitative_stack)
    const stackSkills = resumeJSON.skills?.quantitative_stack?.split(',').filter(s => s.trim().length > 0);
    if (stackSkills?.length >= 3) {
      score += 2;
    } else {
      missingFields.push('quantitative_stack (needs ≥3 skills)');
    }

    return {
      score,
      max: 10,
      label: 'Completeness',
      missing_fields: missingFields,
    };
  }

  /**
   * Detect violations of CalibrCV's 8 Laws.
   * @returns {string[]}
   */
  detectLawViolations(resumeJSON) {
    const violations = [];
    const allBullets = [
      ...(resumeJSON.experience?.flatMap(e => e.bullets || []) || []),
      ...(resumeJSON.projects?.flatMap(p => p.bullets || []) || []),
    ];

    allBullets.forEach((bullet, i) => {
      // LAW 1: 100-character limit
      if (bullet.length >= 100) {
        violations.push(`LAW 1: Bullet ${i + 1} is ${bullet.length} chars: "${bullet.slice(0, 40)}..."`);
      }

      // LAW 5: No em dashes
      if (/—/.test(bullet)) {
        violations.push(`LAW 5: Em dash in bullet ${i + 1}: "${bullet.slice(0, 40)}..."`);
      }

      // LAW 2: HBS verb start
      const firstWord = bullet.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      if (firstWord && !HBS_VERBS.includes(firstWord)) {
        violations.push(`LAW 2: Bullet ${i + 1} starts with non-HBS verb "${firstWord}"`);
      }
    });

    // LAW 3: Summary pronouns
    if (resumeJSON.summary) {
      const pronounPatterns = [
        { regex: /\bI\b/, label: 'I' },
        { regex: /\bmy\b/i, label: 'my' },
        { regex: /\bme\b/i, label: 'me' },
        { regex: /\bour\b/i, label: 'our' },
        { regex: /\bwe\b/i, label: 'we' },
      ];

      for (const { regex, label } of pronounPatterns) {
        if (regex.test(resumeJSON.summary)) {
          violations.push(`LAW 3: Pronoun "${label}" found in summary`);
        }
      }

      // LAW 5: Em dash in summary
      if (/—/.test(resumeJSON.summary)) {
        violations.push('LAW 5: Em dash in summary');
      }
    }

    // LAW 6: Skills section — exactly two rows
    if (resumeJSON.skills) {
      const keys = Object.keys(resumeJSON.skills);
      if (keys.length !== 2) {
        violations.push(`LAW 6: Skills section has ${keys.length} rows instead of exactly 2`);
      }
    }

    // LAW 7: Bullet counts
    if (resumeJSON.experience) {
      for (const exp of resumeJSON.experience) {
        const count = exp.bullets?.length || 0;
        if (count < 2 || count > 3) {
          violations.push(`LAW 7: Experience "${exp.title}" has ${count} bullets (should be 2-3)`);
        }
      }
    }
    if (resumeJSON.projects) {
      for (const proj of resumeJSON.projects) {
        const count = proj.bullets?.length || 0;
        if (count !== 2) {
          violations.push(`LAW 7: Project "${proj.name}" has ${count} bullets (should be exactly 2)`);
        }
      }
    }

    return violations;
  }

  /**
   * Generate top 5 actionable recommendations.
   */
  generateRecommendations(categories, violations) {
    const recommendations = [];

    // If there are law violations, that's priority #1
    if (violations.length > 0) {
      recommendations.push(`Fix ${violations.length} CalibrCV Law violation(s) first — these directly hurt your ATS score.`);
    }

    // Sort categories by deficit (max - score) descending
    const sorted = Object.entries(categories)
      .map(([key, cat]) => ({ key, ...cat, deficit: cat.max - cat.score }))
      .sort((a, b) => b.deficit - a.deficit);

    for (const cat of sorted) {
      if (recommendations.length >= 5) break;

      if (cat.key === 'structural' && cat.deficit > 0) {
        if (cat.issues?.length > 0) {
          recommendations.push(`Improve structure: ${cat.issues[0]}.`);
        }
      }

      if (cat.key === 'keywords' && cat.deficit > 5) {
        if (cat.missing_keywords?.length > 0) {
          recommendations.push(`Add missing keywords: ${cat.missing_keywords.slice(0, 3).join(', ')}. These appear in the job description but not your resume.`);
        } else {
          recommendations.push('Increase keyword diversity — use more varied, industry-specific terminology.');
        }
      }

      if (cat.key === 'content_quality' && cat.deficit > 5) {
        if (cat.verb_compliance_rate < 70) {
          recommendations.push('Start more bullets with strong HBS action verbs (e.g., Architected, Engineered, Deployed).');
        }
        if (cat.metric_rate < 50) {
          recommendations.push('Quantify more achievements — add specific numbers, percentages, or dollar amounts to bullets.');
        }
      }

      if (cat.key === 'parsability' && cat.deficit > 0) {
        recommendations.push(`Fix parsability issues: ${cat.issues_found?.join('; ') || 'Remove special characters that break ATS parsers'}.`);
      }

      if (cat.key === 'completeness' && cat.deficit > 0) {
        if (cat.missing_fields?.length > 0) {
          recommendations.push(`Add missing contact info: ${cat.missing_fields.join(', ')}.`);
        }
      }
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Map numeric score to letter grade.
   */
  getLetterGrade(score) {
    if (score >= 90) return { grade: 'A+', label: 'Exceptional' };
    if (score >= 80) return { grade: 'A', label: 'Strong' };
    if (score >= 70) return { grade: 'B', label: 'Good' };
    if (score >= 60) return { grade: 'C', label: 'Average' };
    return { grade: 'D', label: 'Needs Work' };
  }

  /**
   * Extract all meaningful text from a resume JSON for analysis.
   */
  extractAllText(resumeJSON) {
    return [
      resumeJSON.summary || '',
      ...(resumeJSON.experience?.flatMap(e => [e.title || '', ...(e.bullets || [])]) || []),
      ...(resumeJSON.projects?.flatMap(p => [p.name || '', ...(p.bullets || [])]) || []),
      ...(resumeJSON.education?.flatMap(e => [e.institution || '', e.degree || '', ...(e.bullets || [])]) || []),
      resumeJSON.skills?.quantitative_stack || '',
      resumeJSON.skills?.analytic_domain || '',
    ].join(' ');
  }
}

export const atsScorer = new ATSScorer();
export { ATSScorer };
