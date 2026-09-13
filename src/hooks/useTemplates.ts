import { useCallback, useEffect, useState } from 'react';
import {
  createTemplate,
  markTemplateUsed,
  parseTemplates,
  sortTemplates,
  type Template,
  type TemplateDraft
} from '../domain/templates';
import { KEYS, dbGet, dbSet } from '../storage/db';

export const useTemplates = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void dbGet<unknown>(KEYS.templates).then((stored) => {
      setTemplates(sortTemplates(parseTemplates(stored)));
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: Template[]) => {
    const sorted = sortTemplates(next);
    setTemplates(sorted);
    void dbSet(KEYS.templates, sorted);
    return sorted;
  }, []);

  const addTemplate = useCallback(
    (draft: TemplateDraft) => {
      const created = createTemplate(draft);
      setTemplates((current) => {
        const next = sortTemplates([...current, created]);
        void dbSet(KEYS.templates, next);
        return next;
      });
      return created;
    },
    []
  );

  const useTemplate = useCallback((id: string) => {
    setTemplates((current) => {
      const next = sortTemplates(
        current.map((template) => (template.id === id ? markTemplateUsed(template) : template))
      );
      void dbSet(KEYS.templates, next);
      return next;
    });
  }, []);

  const removeTemplate = useCallback((id: string) => {
    setTemplates((current) => {
      const next = current.filter((template) => template.id !== id);
      void dbSet(KEYS.templates, next);
      return next;
    });
  }, []);

  return { templates, loaded, addTemplate, useTemplate, removeTemplate, persist };
};
