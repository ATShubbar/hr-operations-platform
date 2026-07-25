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

// The brand accent must never carry a status meaning (UX-01).
//
// `--primary` is a gold at hue 92 — which is also where a warning colour
// naturally sits — and it appears dozens of times per screen in buttons, focus
// rings and active nav. A status tinted with it reads as brand, not as caution,
// and a warning that looks like chrome is not a warning. So status surfaces use
// the `--status-*` tier exclusively.
//
// Scoped to files whose path says "status", which is a deliberate line, not a
// loophole: `Badge` is arbitrary metadata whose colour is decorative (a brand-
// filled "New" badge is legitimate), while `StatusPill` communicates workflow
// state and its colour is semantic. Those are different components with
// different rules — see the design proposal for why they must not be merged.
const STATUS_FILE_RE = /(?:^|\/)[^/]*status[^/]*\.[jt]sx?$|\/status\//i;
const BRAND_CLASS_RE =
  /^(?:bg|text|border|ring|outline|from|to|via|fill|stroke|decoration|caret|accent|divide)-(?:primary|brand)(?:-|\/|$)/;
const BRAND_VAR_RE = /--(?:primary|brand)\b/;

const noBrandInStatus = {
  meta: {
    type: 'problem',
    messages: {
      brandClass:
        "'{{cls}}' puts the brand accent on a status surface — use the --status-* tier (bg-status-<tone>-surface / text-status-<tone>) so caution never reads as chrome (UX-01).",
      brandVar:
        "'{{text}}' references the brand token from a status file — use --status-<tone> instead (UX-01).",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, '/');
    if (!STATUS_FILE_RE.test(filename)) return {};

    const checkClasses = (node, value) => {
      for (const raw of String(value).split(/\s+/)) {
        if (!raw) continue;
        const cls = raw.split(':').pop() ?? raw;
        if (BRAND_CLASS_RE.test(cls)) {
          context.report({ node, messageId: 'brandClass', data: { cls: raw } });
        }
      }
    };
    const checkVar = (node, value) => {
      const text = String(value);
      if (BRAND_VAR_RE.test(text)) {
        context.report({ node, messageId: 'brandVar', data: { text: text.trim().slice(0, 60) } });
      }
    };

    return {
      // Class strings anywhere — className attributes, cva variant maps, cn() args.
      Literal(node) {
        if (typeof node.value !== 'string') return;
        checkClasses(node, node.value);
        checkVar(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value?.raw;
        if (typeof raw !== 'string') return;
        checkClasses(node, raw);
        checkVar(node, raw);
      },
    };
  },
};

export default {
  rules: {
    'module-boundaries': moduleBoundaries,
    'rtl-safe-classes': rtlSafeClasses,
    'no-brand-in-status': noBrandInStatus,
  },
};
