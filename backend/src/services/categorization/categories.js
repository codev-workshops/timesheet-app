const UNCATEGORIZED = 'uncategorized';

const CATEGORIES = [
  { name: 'development', description: 'Writing, fixing, reviewing or deploying code' },
  { name: 'meetings', description: 'Standups, calls, syncs, planning and other meetings' },
  { name: 'design', description: 'UI/UX, mockups, wireframes and architecture design' },
  { name: 'testing', description: 'QA, writing or running tests, test automation' },
  { name: 'documentation', description: 'Writing docs, specs, READMEs and guides' },
  { name: 'research', description: 'Investigation, spikes, prototyping and learning' },
  { name: 'support', description: 'Customer or internal support, tickets and incidents' },
  { name: 'admin', description: 'Administrative work: timesheets, email, invoicing, HR' },
  { name: UNCATEGORIZED, description: 'Description missing or not attributable to a category' }
];

const CATEGORY_NAMES = CATEGORIES.map(c => c.name);

module.exports = {
  CATEGORIES,
  CATEGORY_NAMES,
  UNCATEGORIZED
};
