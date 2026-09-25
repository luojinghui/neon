const { HOVER_MEDIA, hasHover, splitSelectors } = require('../src/styles/hover-policy');
module.exports = () => ({
  postcssPlugin: 'neon-pointer-hover',
  OnceExit(root, { postcss }) {
    const rules = [];
    root.walkRules(rule => { if (hasHover(rule.selector)) rules.push(rule); });
    for (const rule of rules) {
      const selectors = splitSelectors(rule.selector);
      const hover = selectors.filter(hasHover);
      const rest = selectors.filter(selector => !hasHover(selector));
      const media = postcss.atRule({ name: 'media', params: HOVER_MEDIA.slice(7) });
      media.append(rule.clone({ selector: hover.join(', ') }));
      rule.after(media);
      if (rest.length) rule.selector = rest.join(', ');
      else rule.remove();
    }
  }
});
module.exports.postcss = true;
