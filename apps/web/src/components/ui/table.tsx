"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// The container — not the outer wrapper a page draws a border on — is the element
// that actually scrolls, so it is the one that has to be reachable by keyboard
// (WCAG 2.1.1, UX-11). DataTable got this in UX-05; the screens that are NOT
// lists (audit, expiry, reports) still render raw <Table>s and kept the defect:
// columns past the viewport edge that a mouse can reach and a keyboard cannot.
//
// A region needs a name to be exposed as one, so role=region is applied only when
// a name is supplied — an unnamed region is worse than none. The tab stop is
// unconditional, because reaching the columns is the point.
// DS-03: the People & Gro table. The classes are exported so DataTable — which
// renders its own markup for sorting and states — draws exactly the same frame,
// header band and cells; two hand-kept copies would drift on the first tweak.
//
// - FRAME: the table IS the card (radius 14, the system's 10% outset ring), so
//   pages no longer draw a bordered wrapper around it. `overflow-x-auto` clips
//   the header band to the rounded corners.
// - HEAD: a grey band, 12/16 medium, sentence case. The previous uppercase +
//   wide tracking is gone: the system doesn't use it, and uppercase is a no-op
//   for Arabic anyway, so the two locales read differently.
// - CELL: 16px inline padding, 48px rows. Text is 13px in English and 14px in
//   Arabic (owner-approved): Arabic glyphs sit smaller on the same body size, so
//   matching the prototype's 13px literally would make the default locale the
//   harder one to read.
export const TABLE_FRAME =
  "relative w-full overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
export const TABLE_HEAD =
  "h-8 bg-muted px-4 text-start align-middle text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground"
export const TABLE_CELL =
  "h-12 px-4 align-middle text-[13px] whitespace-nowrap rtl:text-sm"
export const TABLE_ROW =
  "border-b transition-colors last:border-b-0 hover:bg-muted/40"

function Table({
  className,
  label,
  labelledBy,
  ...props
}: React.ComponentProps<"table"> & { label?: string; labelledBy?: string }) {
  const named = Boolean(label || labelledBy)
  return (
    <div
      data-slot="table-container"
      role={named ? "region" : undefined}
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={0}
      className={TABLE_FRAME}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        TABLE_ROW,
        "has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        TABLE_HEAD,
        "[&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        TABLE_CELL,
        "[&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
