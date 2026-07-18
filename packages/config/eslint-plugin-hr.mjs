import path from 'node:path';

const MODULE_RE = /\/src\/modules\/([^/]+)(?:\/|$)/;

function moduleOf(p) {
  const match = p.replace(/\\/g, '/').match(MODULE_RE);
  return match ? match[1] : null;
}

// Cross-module imports must go through the target module's public-api.ts
// (ADR-003). Same-module imports and non-module files are unrestricted.
const moduleBoundaries = {
  meta: {
    type: 'problem',
    messages: {
      deepImport:
        "Cross-module deep import '{{spec}}' violates the module boundary — import from the '{{target}}' module's public-api instead (ADR-003).",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    const sourceModule = moduleOf(filename);
    return {
      ImportDeclaration(node) {
        const spec = node.source.value;
        if (typeof spec !== 'string' || !spec.startsWith('.')) return;
        const resolved = path
          .resolve(path.dirname(filename), spec)
          .replace(/\\/g, '/');
        const targetModule = moduleOf(resolved);
        if (!targetModule || targetModule === sourceModule) return;
        if (resolved.endsWith(`/modules/${targetModule}/public-api`)) return;
        context.report({
          node,
          messageId: 'deepImport',
          data: { spec, target: targetModule },
        });
      },
    };
  },
};

// Physical-direction Tailwind utilities break RTL layouts (ADR-005).
// Logical equivalents: ps-/pe-, ms-/me-, start-/end-, text-start/text-end,
// border-s/border-e, rounded-s/rounded-e.
const PHYSICAL_CLASS_RE =
  /^-?(?:pl|pr|ml|mr|left|right|inset-x|scroll-pl|scroll-pr|scroll-ml|scroll-mr)-|^(?:text-left|text-right|float-left|float-right)$|^border-[lr](?:-|$)|^rounded-[lr](?:-|$)|^rounded-(?:tl|tr|bl|br)(?:-|$)/;

function checkClassString(context, node, value) {
  for (const raw of String(value).split(/\s+/)) {
    if (!raw) continue;
    const cls = raw.split(':').pop() ?? raw;
    if (PHYSICAL_CLASS_RE.test(cls)) {
      context.report({ node, messageId: 'physicalClass', data: { cls: raw } });
    }
  }
}

const rtlSafeClasses = {
  meta: {
    type: 'problem',
    messages: {
      physicalClass:
        "Physical utility '{{cls}}' breaks RTL — use the logical equivalent (ps-/pe-, ms-/me-, start-/end-, text-start/text-end) per ADR-005.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className' && node.name?.name !== 'class') return;
        const v = node.value;
        if (!v) return;
        if (v.type === 'Literal') {
          checkClassString(context, node, v.value);
        } else if (v.type === 'JSXExpressionContainer') {
          const expr = v.expression;
          if (expr.type === 'Literal') {
            checkClassString(context, node, expr.value);
          } else if (expr.type === 'TemplateLiteral') {
            for (const quasi of expr.quasis) {
              checkClassString(context, node, quasi.value.raw);
            }
          }
        }
      },
    };
  },
};

export default {
  rules: {
    'module-boundaries': moduleBoundaries,
    'rtl-safe-classes': rtlSafeClasses,
  },
};
