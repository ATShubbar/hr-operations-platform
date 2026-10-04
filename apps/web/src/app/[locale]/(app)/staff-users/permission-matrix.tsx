'use client';

import { useTranslations } from 'next-intl';
import { Eye, Plus, SquarePen, Trash2, Upload, type LucideIcon } from 'lucide-react';
import type { RoleResponse } from '@hr/contracts';
import { cn } from '@/lib/utils';

// The permission matrix (DS-19) — resources down, roles across, read-only.
//
// The prototype draws 9 coarse resources × Read/Write/Create/Delete. The real
// catalog is finer (27 resources, and actions such as approve / process /
// read-all that are not one of the four), and this screen shows the real one:
// every action a resource HAS, in each role's cell, dark when granted. The four
// familiar actions keep the prototype's icons; the rest are short labels.
// Nothing is clickable — editing roles comes later (owner decision).
//
// `example` and `scope-check` are the walking skeleton's test capabilities, not
// product resources; they are left out here and in the tiles' counts.

export const HIDDEN_RESOURCES = new Set(['example', 'scope-check']);

const ICON: Partial<Record<string, LucideIcon>> = {
  read: Eye,
  update: SquarePen,
  write: SquarePen,
  create: Plus,
  upload: Upload,
  delete: Trash2,
};

/** The catalog grouped by resource, in catalog order, without the hidden ones. */
export function resourcesOf(permissions: readonly string[]) {
  const out = new Map<string, string[]>();
  for (const p of permissions) {
    const [res, action] = p.split('.') as [string, string];
    if (HIDDEN_RESOURCES.has(res)) continue;
    out.set(res, [...(out.get(res) ?? []), action]);
  }
  return [...out.entries()].map(([key, actions]) => ({ key, actions }));
}

export function PermissionMatrix({
  permissions,
  roles,
}: {
  permissions: readonly string[];
  roles: readonly RoleResponse[];
}) {
  const t = useTranslations('staffUsers');
  const tr = useTranslations('roles');
  const resources = resourcesOf(permissions);
  const held = new Map(roles.map((r) => [r.id, new Set(r.permissions)]));
  // A label the catalog gained after this screen was written still reads as itself.
  const label = (ns: 'resource' | 'action', key: string) =>
    t.has(`${ns}.${key}`) ? t(`${ns}.${key}`) : key;

  return (
    <section
      aria-labelledby="rp-matrix"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-0.5 p-4">
        <h2 id="rp-matrix" className="text-base leading-6 font-medium">
          {t('matrix')}
        </h2>
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('matrixHint')}</p>
      </div>
      <div
        role="region"
        aria-labelledby="rp-matrix"
        tabIndex={0}
        className="overflow-x-auto border-t focus-visible:outline-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-[13px] leading-[18px]">
          <thead>
            <tr className="bg-neutral-100 text-xs leading-4">
              <th
                scope="col"
                className="w-[220px] px-4 py-2.5 text-start font-medium text-muted-foreground"
              >
                {t('resourceCol')}
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-2 text-start font-medium">
                  <span className="block text-foreground">{tr(r.id)}</span>
                  <span className="block font-normal text-muted-foreground">
                    {t('accountsCount', { count: r.accounts })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((res) => (
              <tr key={res.key}>
                <th
                  scope="row"
                  className="border-t px-4 py-2.5 text-start align-top font-normal text-foreground"
                >
                  {label('resource', res.key)}
                </th>
                {roles.map((r) => (
                  <td key={r.id} className="border-t px-3 py-2 align-top">
                    <span className="flex flex-wrap gap-1">
                      {res.actions.map((a) => {
                        const on = held.get(r.id)?.has(`${res.key}.${a}`) ?? false;
                        const Icon = ICON[a];
                        const name = t(on ? 'on' : 'off', {
                          action: label('action', a),
                          resource: label('resource', res.key),
                          role: tr(r.id),
                        });
                        return (
                          <span
                            key={a}
                            role="img"
                            aria-label={name}
                            title={name}
                            className={cn(
                              'inline-flex h-[22px] items-center justify-center rounded-md text-[11px] leading-none font-medium',
                              Icon ? 'w-[22px]' : 'px-1.5',
                              on
                                ? 'bg-neutral-900 text-neutral-50'
                                : 'bg-neutral-100 text-neutral-400',
                            )}
                          >
                            {Icon ? (
                              <Icon className="size-[13px]" aria-hidden />
                            ) : (
                              label('action', a)
                            )}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
