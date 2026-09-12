/**
 * Category IDs are carried over from money-map v1 **unchanged**. That is
 * deliberate: it makes the v1 import an identity mapping with no lookup table
 * and no chance of silently re-categorising history.
 */
export type CategoryId =
  | 'living_home_rent'
  | 'living_home_utilities'
  | 'living_home_supermarket'
  | 'living_home_home_garden'
  | 'mobility_transport_fuel'
  | 'mobility_transport_car_maintenance'
  | 'mobility_transport_car_insurance'
  | 'mobility_transport_travel_commuting'
  | 'personal_health_healthcare'
  | 'personal_health_personal_care'
  | 'personal_health_fitness'
  | 'personal_health_supplements'
  | 'family_education_school_fees'
  | 'family_education_childcare'
  | 'family_education_gifts_celebrations'
  | 'leisure_lifestyle_clothing'
  | 'leisure_lifestyle_eating_out'
  | 'leisure_lifestyle_entertainment'
  | 'leisure_lifestyle_travel_holidays'
  | 'leisure_lifestyle_toys'
  | 'leisure_lifestyle_subscriptions'
  | 'income_salary'
  | 'income_other'
  | 'other';

export type GroupId =
  | 'living_home'
  | 'mobility_transport'
  | 'personal_health'
  | 'family_education'
  | 'leisure_lifestyle'
  | 'income'
  | 'other';

export type EntryKind = 'income' | 'expense';

export interface CategoryMeta {
  label: string;
  color: string;
  kind: EntryKind;
  group: GroupId;
}

export interface GroupMeta {
  label: string;
  color: string;
  kind: EntryKind;
}

/**
 * v1 encoded these five groups in the category *keys* and then never used
 * them — every chart was flat across 24 categories. Making the grouping
 * explicit is what unlocks the "where does it actually go" rollups.
 */
export const GROUP_META: Record<GroupId, GroupMeta> = {
  living_home: { label: 'Living & Home', color: '#6366f1', kind: 'expense' },
  mobility_transport: { label: 'Mobility & Transport', color: '#22d3ee', kind: 'expense' },
  personal_health: { label: 'Personal & Health', color: '#10b981', kind: 'expense' },
  family_education: { label: 'Family & Education', color: '#9333ea', kind: 'expense' },
  leisure_lifestyle: { label: 'Leisure & Lifestyle', color: '#ec4899', kind: 'expense' },
  income: { label: 'Income', color: '#facc15', kind: 'income' },
  other: { label: 'Other', color: '#94a3b8', kind: 'expense' }
};

/** Colours are unchanged from v1. */
export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  living_home_rent: { label: 'Rent', color: '#6366f1', kind: 'expense', group: 'living_home' },
  living_home_utilities: { label: 'Utilities', color: '#facc15', kind: 'expense', group: 'living_home' },
  living_home_supermarket: { label: 'Supermarket', color: '#f97316', kind: 'expense', group: 'living_home' },
  living_home_home_garden: { label: 'Home & Garden', color: '#84cc16', kind: 'expense', group: 'living_home' },

  mobility_transport_fuel: { label: 'Fuel', color: '#22d3ee', kind: 'expense', group: 'mobility_transport' },
  mobility_transport_car_maintenance: { label: 'Car Maintenance', color: '#0ea5e9', kind: 'expense', group: 'mobility_transport' },
  mobility_transport_car_insurance: { label: 'Car Insurance', color: '#14b8a6', kind: 'expense', group: 'mobility_transport' },
  mobility_transport_travel_commuting: { label: 'Travel & Commuting', color: '#38bdf8', kind: 'expense', group: 'mobility_transport' },

  personal_health_healthcare: { label: 'Healthcare', color: '#10b981', kind: 'expense', group: 'personal_health' },
  personal_health_personal_care: { label: 'Personal Care', color: '#f9a8d4', kind: 'expense', group: 'personal_health' },
  personal_health_fitness: { label: 'Fitness', color: '#34d399', kind: 'expense', group: 'personal_health' },
  personal_health_supplements: { label: 'Supplements', color: '#65a30d', kind: 'expense', group: 'personal_health' },

  family_education_school_fees: { label: 'School Fees', color: '#9333ea', kind: 'expense', group: 'family_education' },
  family_education_childcare: { label: 'Childcare', color: '#c084fc', kind: 'expense', group: 'family_education' },
  family_education_gifts_celebrations: { label: 'Gifts & Celebrations', color: '#fbbf24', kind: 'expense', group: 'family_education' },

  leisure_lifestyle_clothing: { label: 'Clothing', color: '#f472b6', kind: 'expense', group: 'leisure_lifestyle' },
  leisure_lifestyle_eating_out: { label: 'Eating Out', color: '#fb923c', kind: 'expense', group: 'leisure_lifestyle' },
  leisure_lifestyle_entertainment: { label: 'Entertainment', color: '#ec4899', kind: 'expense', group: 'leisure_lifestyle' },
  leisure_lifestyle_travel_holidays: { label: 'Travel & Holidays', color: '#8b5cf6', kind: 'expense', group: 'leisure_lifestyle' },
  leisure_lifestyle_toys: { label: 'Toys', color: '#f87171', kind: 'expense', group: 'leisure_lifestyle' },
  leisure_lifestyle_subscriptions: { label: 'Subscriptions', color: '#94a3b8', kind: 'expense', group: 'leisure_lifestyle' },

  income_salary: { label: 'Salary', color: '#facc15', kind: 'income', group: 'income' },
  income_other: { label: 'Other income', color: '#bef264', kind: 'income', group: 'income' },

  other: { label: 'Other', color: '#94a3b8', kind: 'expense', group: 'other' }
};

export const CATEGORY_IDS = Object.keys(CATEGORY_META) as CategoryId[];

export const isCategoryId = (value: unknown): value is CategoryId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_META, value);

export const categoryMeta = (id: CategoryId): CategoryMeta => CATEGORY_META[id];

export const groupOf = (id: CategoryId): GroupId => CATEGORY_META[id].group;

export const isIncome = (id: CategoryId): boolean => CATEGORY_META[id].kind === 'income';

export const categoriesInGroup = (group: GroupId): CategoryId[] =>
  CATEGORY_IDS.filter((id) => CATEGORY_META[id].group === group);

export const EXPENSE_CATEGORY_IDS = CATEGORY_IDS.filter((id) => !isIncome(id));
export const INCOME_CATEGORY_IDS = CATEGORY_IDS.filter((id) => isIncome(id));
