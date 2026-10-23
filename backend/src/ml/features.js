// Pure feature engineering shared by training and inference (no DB access).

const KEYWORD_GROUPS = {
  bug: ['bug', 'bugs', 'fix', 'fixed', 'fixes', 'hotfix', 'bugfix'],
  deploy: ['deploy', 'deployed', 'deployment', 'release', 'rollout'],
  meeting: ['meeting', 'meetings', 'sync', 'call', 'standup'],
  review: ['review', 'reviewed', 'reviews', 'reviewing'],
  docs: ['doc', 'docs', 'documentation', 'documented'],
  feature: ['feature', 'features', 'implement', 'implemented', 'built', 'build'],
  test: ['test', 'tests', 'testing', 'qa', 'regression']
};
const KEYWORDS = Object.keys(KEYWORD_GROUPS);
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseDate(date) {
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  if (typeof date === 'string') {
    if (/^\d+$/.test(date)) return new Date(Number(date));
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T00:00:00Z`);
    return new Date(date);
  }
  return new Date(NaN);
}

function normalizeDepartment(department) {
  return typeof department === 'string' ? department.trim().toLowerCase() : '';
}

function buildFeatures({ clientId, department, description, date }) {
  const d = parseDate(date);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
  const text = typeof description === 'string' ? description.trim().toLowerCase() : '';
  const tokens = new Set(text.match(/[a-z0-9]+/g) || []);
  const keywords = {};
  for (const k of KEYWORDS) keywords[k] = KEYWORD_GROUPS[k].some((w) => tokens.has(w)) ? 1 : 0;

  return {
    clientId: Number(clientId),
    department: normalizeDepartment(department),
    dayOfWeek: d.getUTCDay(),
    month: d.getUTCMonth() + 1,
    descriptionLength: text.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    isEmptyDescription: text ? 0 : 1,
    keywords
  };
}

function featureNames(meta) {
  return [
    ...meta.clientIds.map((id) => `client=${id}`),
    ...meta.departments.map((dep) => `department=${dep}`),
    ...WEEKDAYS.map((w) => `dow=${w}`),
    'month_sin',
    'month_cos',
    'log_description_length',
    'word_count',
    'empty_description',
    ...KEYWORDS.map((k) => `kw=${k}`)
  ];
}

// One-hot categorical encoding against the training vocabulary; unseen clients or
// departments encode as all zeros so the model falls back to the remaining features.
function toVector(features, meta) {
  const angle = (2 * Math.PI * (features.month - 1)) / 12;
  return [
    ...meta.clientIds.map((id) => (id === features.clientId ? 1 : 0)),
    ...meta.departments.map((dep) => (dep === features.department ? 1 : 0)),
    ...WEEKDAYS.map((_, i) => (i === features.dayOfWeek ? 1 : 0)),
    Math.sin(angle),
    Math.cos(angle),
    Math.log1p(features.descriptionLength),
    features.wordCount,
    features.isEmptyDescription,
    ...KEYWORDS.map((k) => features.keywords[k])
  ];
}

function buildVocabulary(rows) {
  const clientIds = [...new Set(rows.map((r) => Number(r.clientId)))].sort((a, b) => a - b);
  const departments = [...new Set(rows.map((r) => normalizeDepartment(r.department)).filter(Boolean))].sort();
  return { clientIds, departments };
}

module.exports = { buildFeatures, toVector, featureNames, buildVocabulary, parseDate, KEYWORD_GROUPS };
