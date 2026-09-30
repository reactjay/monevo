/**
 * Category inference and normalization module.
 */

interface CategoryRule {
  category: string;
  keywords: string[];
  type?: 'income' | 'expense';
}

const CATEGORY_RULES: CategoryRule[] = [
  // ── Fuel ────────────────────────────────────────────────────
  { category: 'fuel', keywords: ['fuel', 'petrol', 'diesel', 'gasoline', 'engine oil', 'filling station'] },

  // ── Food ────────────────────────────────────────────────────
  {
    category: 'food',
    keywords: [
      'food',
      'chop',
      'groceries',
      'grocery',
      'restaurant',
      'lunch',
      'dinner',
      'breakfast',
      'shawarma',
      'suya',
      'meal',
      'snacks',
      'coffee',
      'supermarket',
      'drinks',
      'bread',
      'meat',
      'rice',
      'beans',
      'amala',
      'jollof',
      'egusi',
      'mama put',
      'bukka',
      'eating',
      'eat',
    ],
  },

  // ── Transport ───────────────────────────────────────────────
  {
    category: 'transport',
    keywords: [
      'transport',
      'transportation',
      'uber',
      'bolt',
      'bus',
      'fare',
      'cab',
      'taxi',
      'danfo',
      'keke',
      'okada',
      'flight',
      'train',
      'commute',
      'toll',
      'airfare',
      'ride',
    ],
  },

  // ── Rent ────────────────────────────────────────────────────
  { category: 'rent', keywords: ['rent', 'apartment', 'landlord', 'housing', 'lease', 'house rent', 'office rent'] },

  // ── Utilities ───────────────────────────────────────────────
  {
    category: 'utilities',
    keywords: [
      'electricity',
      'nepa',
      'phcn',
      'light bill',
      'dstv',
      'gotv',
      'netflix',
      'water',
      'wifi',
      'internet',
      'utilities',
      'data',
      'subscription',
      'airtime',
      'recharge',
      'bill',
      'bills',
      'cable',
    ],
  },

  // ── Inventory ───────────────────────────────────────────────
  { category: 'inventory', keywords: ['inventory', 'stock', 'supplies', 'goods', 'raw materials', 'products', 'restock'] },

  // ── Salary ──────────────────────────────────────────────────
  { category: 'salary', keywords: ['salary', 'wages', 'payroll', 'stipend', 'staff salary', 'allowance'] },

  // ── Marketing ───────────────────────────────────────────────
  { category: 'marketing', keywords: ['marketing', 'advert', 'ads', 'facebook ads', 'instagram ads', 'promo', 'promotion', 'campaign', 'flyers', 'branding'] },

  // ── Health ──────────────────────────────────────────────────
  { category: 'health', keywords: ['health', 'hospital', 'drugs', 'pharmacy', 'medical', 'doctor', 'dentist', 'clinic', 'medicine', 'lab test', 'chemist'] },

  // ── Education ───────────────────────────────────────────────
  { category: 'education', keywords: ['education', 'tuition', 'school fees', 'course', 'books', 'exam', 'training', 'tutorial', 'seminar'] },

  // ── Entertainment ───────────────────────────────────────────
  { category: 'entertainment', keywords: ['entertainment', 'movie', 'cinema', 'club', 'party', 'game', 'outing', 'concert', 'show', 'fun'] },

  // ── Shopping ────────────────────────────────────────────────
  {
    category: 'shopping',
    keywords: [
      'shopping',
      'shoes',
      'clothes',
      'dress',
      'shirt',
      'wear',
      'gadget',
      'phone',
      'laptop',
      'accessories',
      'bag',
      'deep freezer',
      'freezer',
      'generator',
      'electronics',
      'appliance',
    ],
  },

  // ── Freelance / Tech ────────────────────────────────────────
  {
    category: 'freelance',
    type: 'income',
    keywords: [
      'freelance',
      'website development',
      'web development',
      'design',
      'consulting',
      'gig',
      'project',
      'contract',
      'coding',
      'development',
      'logo',
      'app development',
    ],
  },

  // ── Sales ───────────────────────────────────────────────────
  {
    category: 'sales',
    type: 'income',
    keywords: ['sales', 'sold', 'customer payment', 'order payment', 'service fee', 'sales revenue'],
  },
];

/**
 * Infers category from text and transaction type.
 */
export function inferCategory(text: string, transactionType: 'income' | 'expense' = 'expense'): string {
  const lower = text.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.type && rule.type !== transactionType) continue;
    for (const kw of rule.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower) || lower.includes(kw)) {
        return rule.category;
      }
    }
  }

  // Fallbacks
  if (transactionType === 'income') {
    return 'payment';
  }
  return 'other';
}
