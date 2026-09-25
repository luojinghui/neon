const HOVER_MEDIA = '@media (hover: hover) and (pointer: fine)';

// Split selector lists without splitting :is(), :not() or attribute values.
function splitSelectors(selector) {
  const parts = [];
  let start = 0, depth = 0, quote = '';
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) { parts.push(selector.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(selector.slice(start).trim());
  return parts;
}
const hasHover = (selector) => /(^|[^\\]):hover\b/.test(selector);
const transformed = new WeakSet();

// Ant Design inserts styles at runtime; apply the same rule as our build CSS.
function visit(style) {
  if (!style || typeof style !== 'object') return style;
  if (transformed.has(style)) return style;
  if (Array.isArray(style)) return style.map(visit);
  if (Object.getPrototypeOf(style) !== Object.prototype && Object.getPrototypeOf(style) !== null) return style;
  const result = {};
  transformed.add(result);
  for (const [key, value] of Object.entries(style)) {
    const next = visit(value);
    if (hasHover(key) && !key.startsWith('@')) {
      const selectors = splitSelectors(key);
      const hover = selectors.filter(hasHover).join(', ');
      const rest = selectors.filter((selector) => !hasHover(selector)).join(', ');
      if (hover) {
        result[HOVER_MEDIA] = { ...result[HOVER_MEDIA], [hover]: next };
        transformed.add(result[HOVER_MEDIA]);
      }
      if (rest) result[rest] = next;
    } else if (key === HOVER_MEDIA) {
      result[key] = { ...result[key], ...next };
      transformed.add(result[key]);
    } else result[key] = next;
  }
  return result;
}

module.exports = { HOVER_MEDIA, hasHover, splitSelectors, hoverOnlyTransformer: { visit } };
