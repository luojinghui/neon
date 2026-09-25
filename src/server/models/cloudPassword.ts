/** Anchored, validated lookup also finds older mixed-case codes without regex injection. */
export function cloudPasswordQuery(value: unknown): RegExp | null {
  if (typeof value !== 'string' || !/^[a-z0-9]{2,4}$/i.test(value.trim())) return null;
  return new RegExp(`^${value.trim().toLowerCase()}$`, 'i');
}
