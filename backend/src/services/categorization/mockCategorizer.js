const { UNCATEGORIZED } = require('./categories');

// Ordered by priority: on equal keyword hits the earlier category wins.
const KEYWORD_RULES = [
  { category: 'meetings', pattern: /\b(stand-?ups?|meetings?|calls?|syncs?|1:1|one-on-one|retros?(pective)?|sprint planning|kick-?off)\b|réunion|reunión|besprechung|会議/giu },
  { category: 'development', pattern: /\b(fix(e[sd]|ing)?|bugs?|code|coding|implement\w*|refactor\w*|feature|deploy\w*|merge[sd]?|endpoints?|api|backend|frontend|debug\w*)\b|programmier/giu },
  { category: 'design', pattern: /\b(design\w*|mock-?ups?|wireframes?|figma|ui|ux|layout)\b/giu },
  { category: 'testing', pattern: /\b(test\w*|qa|regression|e2e|coverage)\b|pruebas/giu },
  { category: 'documentation', pattern: /\b(doc|docs|document\w*|readme|wiki|specs?|changelog|guide)\b|documentación/giu },
  { category: 'research', pattern: /\b(research\w*|investigat\w*|spike|explor\w*|evaluat\w*|poc|proof of concept|prototyp\w*)\b|recherche/giu },
  { category: 'support', pattern: /\b(support\w*|tickets?|incidents?|customers?|helpdesk|on-?call|outage|escalation)\b/giu },
  { category: 'admin', pattern: /\b(admin\w*|timesheets?|invoic\w*|emails?|expenses?|hr|payroll|onboarding)\b/giu }
];

function scoreDescription(description) {
  const text = String(description || '');
  let best = { category: UNCATEGORIZED, score: 0 };
  for (const rule of KEYWORD_RULES) {
    const matches = text.match(rule.pattern);
    const score = matches ? matches.length : 0;
    if (score > best.score) best = { category: rule.category, score };
  }
  return best;
}

class MockCategorizer {
  constructor() {
    this.provider = 'mock';
    this.model = 'mock-keyword-v1';
    this.promptVersion = 'mock-v1';
  }

  async categorizeBatch(descriptions, allowedCategories) {
    return descriptions.map((description) => {
      const { category, score } = scoreDescription(description);
      const resolved = allowedCategories.includes(category) ? category : UNCATEGORIZED;
      return {
        category: resolved,
        confidence: score > 0 ? Math.min(0.95, 0.6 + 0.1 * score) : 0.2
      };
    });
  }
}

module.exports = {
  MockCategorizer,
  KEYWORD_RULES,
  scoreDescription
};
