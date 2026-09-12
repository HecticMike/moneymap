/**
 * Who the entries can be attributed to.
 *
 * `Entry.user` is typed `string | null` rather than a union of these, so the
 * household can change without a data migration.
 */
export const HOUSEHOLD = ['Miguel', 'Ines'] as const;

export type Person = (typeof HOUSEHOLD)[number];
