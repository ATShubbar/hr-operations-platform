import { z } from 'zod';

// Reporting (REP-02; ACTION-PLAN 5.4). Every report shares ONE table shape —
// columns + rows + summary — so the export (REP-03) and the web table (REP-04)
// need no per-report code. The catalog response is already FILTERED to the
// reports the caller may run: a report is listed only when the caller holds the
// permissions on its underlying data.

export const reportIdSchema = z.enum([
  'workforce',
  'compliance-expiry',
  'recruitment-pipeline',
  'gro-workload',
  'service-operations',
  'payroll-cost',
]);

export const reportCategorySchema = z.enum([
  'workforce',
  'compliance',
  'recruitment',
  'gro',
  'operations',
  'financial',
]);

// What a report IS — its identity and what it takes to run it. The permission
// list is returned so the UI can explain an absence ("needs salary.read") rather
// than silently hiding capability.
export const reportDescriptorSchema = z.object({
  id: reportIdSchema,
  category: reportCategorySchema,
  requiredPermissions: z.array(z.string()),
});

export const reportCatalogResponseSchema = z.object({
  reports: z.array(reportDescriptorSchema),
});

// `key` is the web i18n lookup (`reports.column.<key>`); `label` is the plain
// English CSV header, so an export is readable outside the app.
export const reportColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  numeric: z.boolean(),
});

export const reportCellSchema = z.union([z.string(), z.number(), z.null()]);

export const reportResultResponseSchema = z.object({
  id: reportIdSchema,
  generatedAt: z.string(),
  columns: z.array(reportColumnSchema),
  rows: z.array(z.record(z.string(), reportCellSchema)),
  summary: z.record(z.string(), z.number()),
});

export type ReportIdContract = z.infer<typeof reportIdSchema>;
export type ReportCategoryContract = z.infer<typeof reportCategorySchema>;
export type ReportDescriptor = z.infer<typeof reportDescriptorSchema>;
export type ReportCatalogResponse = z.infer<typeof reportCatalogResponseSchema>;
export type ReportColumnContract = z.infer<typeof reportColumnSchema>;
export type ReportCellContract = z.infer<typeof reportCellSchema>;
export type ReportResultResponse = z.infer<typeof reportResultResponseSchema>;
