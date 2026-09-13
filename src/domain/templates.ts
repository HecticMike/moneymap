import { CATEGORY_META, isCategoryId, type CategoryId } from './categories';
import { isCurrencyCode, roundMoney } from './money';
import { BASE_CURRENCY, type CurrencyCode } from './types';

/**
 * Saved one-tap presets for entries the household repeats — "Tesco", "Fuel",
 * "Coffee". Applying one fills in everything except, usually, the amount.
 *
 * Stored per device for now. The one-tap *chips* are derived from synced entry
 * history, so those already agree across both phones; templates carrying to the
 * other phone means putting them in the Drive payload, which is a change to the
 * sync format and is deliberately not bundled into this slice.
 */
export interface Template {
  id: string;
  label: string;
  category: CategoryId;
  currency: CurrencyCode;
  /** null means "ask every time", which is the normal case. */
  amount: number | null;
  user: string | null;
  note: string;
  useCount: number;
  lastUsedAt: string | null;
}

export interface TemplateDraft {
  label: string;
  category: CategoryId;
  currency: CurrencyCode;
  amount: number | null;
  user: string | null;
  note: string;
}

export const createTemplate = (draft: TemplateDraft): Template => ({
  id:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tpl-${Math.random().toString(36).slice(2)}`,
  label: draft.label.trim() || CATEGORY_META[draft.category].label,
  category: draft.category,
  currency: draft.currency,
  amount: draft.amount == null ? null : roundMoney(draft.amount),
  user: draft.user,
  note: draft.note.trim(),
  useCount: 0,
  lastUsedAt: null
});

/** Most-used first, then most recently used. */
export const sortTemplates = (templates: Template[]): Template[] =>
  [...templates].sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount;
    const left = a.lastUsedAt ?? '';
    const right = b.lastUsedAt ?? '';
    if (left !== right) return right.localeCompare(left);
    return a.label.localeCompare(b.label);
  });

export const markTemplateUsed = (template: Template): Template => ({
  ...template,
  useCount: template.useCount + 1,
  lastUsedAt: new Date().toISOString()
});

/** Coerce untrusted stored data, dropping anything unusable rather than throwing. */
export const parseTemplates = (raw: unknown): Template[] => {
  if (!Array.isArray(raw)) return [];

  const templates: Template[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (!isCategoryId(candidate.category)) continue;
    if (typeof candidate.id !== 'string' || candidate.id === '') continue;

    const amount = typeof candidate.amount === 'number' && Number.isFinite(candidate.amount)
      ? roundMoney(candidate.amount)
      : null;

    templates.push({
      id: candidate.id,
      label:
        typeof candidate.label === 'string' && candidate.label.trim() !== ''
          ? candidate.label
          : CATEGORY_META[candidate.category].label,
      category: candidate.category,
      currency: isCurrencyCode(candidate.currency) ? candidate.currency : BASE_CURRENCY,
      amount,
      user: typeof candidate.user === 'string' && candidate.user !== '' ? candidate.user : null,
      note: typeof candidate.note === 'string' ? candidate.note : '',
      useCount: typeof candidate.useCount === 'number' ? candidate.useCount : 0,
      lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : null
    });
  }

  return templates;
};
