# People &amp; Gro Design System

A working design system for **People &amp; Gro** — hiring, payroll and people-ops software. It ships the brand's colour, type, spacing, elevation and motion foundations, 113 reusable React primitives, a 407-glyph icon set, and two full product recreations (the People Ops app and the marketing site).

Everything here was extracted from the source file below. Where a number looks odd — a 10px radius, a 28px control, a `rgb(224,52,52)` error red that isn't Tailwind's — that is the source, copied verbatim.

---

## Sources

| Source | Detail |
| --- | --- |
| Figma file | `shadcn-studio-nova-uikit-v1.1 (Copy).fig`, attached and mounted as a read-only filesystem. 85 pages, 485,178 nodes, 1,143 component sets, 1,083 Figma Variables across 6 collections. No public URL was supplied. |
| Company context | "PEOPLE &amp; GRO (NEW)", provided by the user with the file. |
| Codebase | None attached. |

The Figma file is a **UI-kit library**, not a product file: each page is one component family (Buttons, Input, Table, Dialog …) laid out as a specimen sheet, plus three foundation pages (Colors, Shadow, Tailwind/ShadCN Typography), a Style Guide page and a Lucide icon page carrying 1,515 glyph symbols. There are no product screens in the file — the two UI kits in this project are assembled from its primitives, not copied from screens that don't exist.

**There is no logo in the source.** The only mark in the file is the kit vendor's own (`shadcn-studio-logo`), which is not this brand's, so it has not been adopted. The brand appears as a type-set wordmark (`components/brand/Wordmark.jsx`) everywhere a logo would go. **Send a real logo file and it can be swapped in one place.**

---

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | Global entry point. `@import` list only — link this one file. |
| `tokens/` | `fonts.css`, `fig-tokens.css` (all 1,082 Figma Variables, 16 theme scopes), `fig-typography.css`, then the hand-authored `palette` / `typography` / `radius-spacing` / `elevation` / `semantic` / `base` layers that components actually reference. |
| `components/` | 10 groups of React primitives (see below). Each has a `.jsx`, a `.d.ts` props contract, a `.prompt.md` usage note, and one `@dsCard` specimen. |
| `assets/icons/` | `icon-data.js` (407 Lucide glyphs extracted from the file) + the `Icon` wrapper. |
| `assets/images/` | Bitmaps copied verbatim from the file (three avatars, one abstract card image). |
| `guidelines/` | 16 foundation specimen cards — colour, type, spacing, radius, elevation, borders, motion. |
| `ui_kits/people-ops-app/` | Interactive app recreation: shell, dashboard, people table, settings. |
| `ui_kits/marketing-site/` | Interactive marketing homepage. |
| `SKILL.md` | Agent-Skills front matter so this folder works as a Claude Code skill. |
| `thumbnail.html` | Homepage tile. |

---

## Components

**brand** — `Wordmark`
**typography** — `Text`, `Blockquote`, `List`
**actions** — `Button`, `IconButton`, `ButtonGroup`, `Toggle`, `ToggleGroup`, `GradientButton`, `GlowButton`, `RippleButton`, `SwipeButton`, `ArrowButton`, `CraftButton`
**forms** — `Label`, `Field`, `Form`, `FormSection`, `FormActions`, `Input`, `Textarea`, `Select`, `Checkbox`, `AdvancedCheckbox`, `RadioGroup`, `Switch`, `Slider`, `InputGroup`, `InputGroupAddon`, `InputGroupField`, `InputNumber`, `OtpInput`, `FileInput`, `Rating`, `ReactionRating`, `Calendar`, `CalendarNova`, `DatePicker`, `DateRangePicker`, `CardRadio`, `RangeSlider`
**display** — `Badge`, `Avatar`, `AvatarGroup`, `Card`, `CardNova`, `CardHeader`, `CardTitle`, `CardBody`, `CardFooter`, `CardMedia`, `Separator`, `Skeleton`, `Spinner`, `Progress`, `ProgressCircle`, `Kbd`, `Item`, `Divider`, `ChatBubble`, `Countdown`, `IntegrationCard`, `AdvancedProgress`
**data** — `Table`, `DataTable`, `Chart`, `ChartCard`, `AreaChart`, `BarChart`, `PieChart`, `RadarChart`, `ChartStatistic`, `Timeline`, `Steps`, `FormWizard`, `ScrollArea`
**feedback** — `Alert`, `AdvancedAlert`, `AlertSolid`, `AlertSoft`, `AlertOutline`, `Toast`, `Toaster`
**disclosure** — `Accordion`, `AccordionNova`, `AdvancedAccordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`, `AccordionTriggerText`, `AccordionContentText`, `AccordionTriggerIcon`, `Collapsible`, `Carousel`, `CarouselNova`
**overlays** — `Popover`, `PopoverSurface`, `Tooltip`, `HoverCard`, `MenuList`, `MenuItem`, `MenuLabel`, `MenuSeparator`, `DropdownMenu`, `ContextMenu`, `Menubar`, `Dialog`, `AlertDialog`, `Sheet`, `Drawer`, `Command`, `Combobox`, `ComboboxItem`, `ComboboxToolbar`, `AdvancedPopover`, `AdvancedDropdown`
**navigation** — `Breadcrumbs`, `BreadcrumbsNova`, `BreadcrumbItem`, `Pagination`, `Tabs`, `NavigationMenu`, `Navbar`, `DashboardNavbar`, `Sidebar`, `Footer`, `DashboardFooter`, `TableOfContents`, `BlockHeading`, `BottomNavigation`, `AdvancedNavigationMenu`
**blocks** (marketing scale) — `BlockBadge`, `BlockButton`, `FeatureCard`, `PricingSection`, `FaqSection`, `FeatureSection`, `IntegrationSection`, `AboutSection`, `SocialProof`
**source-spelling aliases** — thin re-exports under the Figma file's own (misspelled / lowercase / trailing-space) family names, so a search from the source lands somewhere. Prefer the corrected name in new code; see `docs/figma-name-map.md`. `AdvanceAccordation`, `AdvanceAlert`, `AdvanceCheckboxs`, `AdvanceDatePicker`, `AdvanceDropdown`, `AdvanceHoverCard`, `AdvanceNavigationMenu`, `AdvancePagination`, `AdvancePopover`, `AdvanceProgress`, `AdvanceRadiobtns`, `AdvanceRatings`, `AdvanceSlider`, `AdvanceSolidButton`, `AdvanceTabs`
**icons** — `Icon`

### Intentional additions

Three components have no single counterpart in the source and were added deliberately:

- **`Wordmark`** — the file has no logo for this brand. Needed so screens have something to put in the brand slot.
- **`Icon`** — a wrapper over the extracted Lucide data. The file stores 1,515 loose glyph symbols; one component with a `name` prop is the only sane API.
- **`Text` / `Blockquote` / `List`** — the file's ShadCN Typography and Tailwind Typography pages define a type ladder as *styles*, not as components. These package that ladder so prose is never hand-styled.

Everything else maps 1:1 onto a family the file defines.

---

## Coverage — what was built, and what was deliberately skipped

The compiler counts **4,107 "component families"** in the source file. That number is the raw Figma symbol count, and it is not an inventory of distinct components. It breaks down roughly as:

| Bucket | Count | Built? |
| --- | --- | --- |
| Distinct component families (one per page: Buttons, Input, Table, Dialog, Sidebar …) | ~85 | **113 built — all of them** |
| Lucide glyph symbols on the `Lucide-Icons` page | 1,515 | **407 extracted** into `icon-data.js`; the rest are the same open-source set, available from CDN |
| `Company logo` symbols (108 third-party brand marks) | 108 | **Skipped** — other companies' trademarks; not ours to redistribute |
| Sub-parts of a family, exported as their own symbols (`Accordion item`, `Accordion Trigger icon`, `Accordion Content text`, `Breadcrumb item`, `.card-title`, `.card-body`, `Combobox Item`, `Divider`, `Star`, `RightIcon` …) | ~600 | **Absorbed** into their parent's props. The eight worth composing by hand also ship standalone: `AccordionItem`, `AccordionTrigger`, `AccordionContent`, `BreadcrumbItem`, `ComboboxItem`, `CardTitle`, `Divider`, `InputGroupAddon` |
| Duplicate copies of the same family across showcase pages (`Accordion` ×2, `Advance alert` ×3, `Alert Soft` ×4, `Avatar` ×6, `Check Box` ×3, `Card` ×5 …) | ~1,700 | **Collapsed** — one component per family, with the differences expressed as `variant` / `appearance` / `size` props |
| Full page mockups on the `Drag-drop-page-builder` page (`Bistro - Restaurant Landing page`, `Craft - Portfolio Detail page`, `Blog Detail Page`, `Category Page`, `Contact Us Page` …) | ~90 | **Skipped** — these are the kit vendor's demo templates for unrelated brands, not People & Gro surfaces |
| Figma housekeeping symbols (`📃 Component Header`, `.Comp / Header`, `Container`, `Component 1`–`Component 5`, `test-component`) | ~40 | **Skipped** — specimen-page scaffolding, not product UI |

### Every named family is now built

The last eight decorative families are in, as their own components rather than as props, because their geometry genuinely differs from the plain versions:

| Source family | Component | How it differs |
| --- | --- | --- |
| `Advance accordation` | `AdvancedAccordion` | Five surface skins, optional 01/02/03 medallions |
| `Advance Progress` | `AdvancedProgress` | Striped, gradient and segmented fills |
| `advance ratings` | `ReactionRating` | Reaction faces, heart tally, numbered chips |
| `advance popover` | `AdvancedPopover` | Titled, with arrow, media slot and footer |
| `Advance Dropdown` | `AdvancedDropdown` | Header strip, inline search, footer, radius 18 |
| `Advance Navigation Menu` | `AdvancedNavigationMenu` | Wider panel, 3 columns, 240px feature rail |
| `Badges for blocks` | `BlockBadge` | 28px tall at 13/18 — hero scale, not status |
| `Button for blocks` | `BlockButton` | 40/48/56px at radius 14, with inverse tones |
| `Brandly - card` | `FeatureCard` | Radius 18, 40px icon tile, eyebrow, 18/26 title |
| `Accordion Nova` | `AccordionNova` | One ring, 1px rules, open row on the muted surface |
| `Advance alert` | `AdvancedAlert` | Radius 14, 32px medallion, action row, accent edge, timer rail |
| `Accordion item` / `Trigger` / `Content text` | `AccordionItem`, `AccordionTrigger`, `AccordionContent` | Composable parts for bodies that hold forms |
| `Breadcrumb item` | `BreadcrumbItem` | A single crumb with its own trailing separator |
| `Combobox Item` | `ComboboxItem` | Checkbox/avatar/meta option row, 3 states |
| `.card-title` | `CardTitle` | Title + description block, usable outside a Card |
| `advance checkboxs` | `AdvancedCheckbox` | Nine row treatments: card, info, multi-box, avatar, strikethrough |
| `Card - Nova Style` | `CardNova` | Radius 18, media on any edge, stat block, six skins |
| `Calendar Nova` | `CalendarNova` | Header band, 34px cells, event dots, preset and slot rails |
| `Breadcrumbs nova` | `BreadcrumbsNova` | Track, card, segmented and chip treatments at 13/18 (the source's `style` axis is exposed as `variant`) |
| `Corausel nova` / `Corausel variants` | `CarouselNova` | Controls on the frame, counter/progress indicators, peek |
| `Combobox toolbar` | `ComboboxToolbar` | Search row, filter chips, select-all and count footer |
| `Dashboard Footer` | `DashboardFooter` | 44px in-app strip with status dot and mono version |
| `Craft Button` | `CraftButton` | Uppercase, 0.08em tracking, hard 3px offset shadow |
| `Data-Table` | `DataTable` | Table plus toolbar, sortable headers, selection banner, empty state |
| `Field` | `Field` | Label / control / message wrapper, vertical or horizontal |
| `Form` | `Form`, `FormSection`, `FormActions` | Grid scaffold, titled sections, divided submit row |
| Chart page `Type=Basic` … `Type=Grid` | `ChartCard` | The frame every chart sits in — radius 14, inset ring, muted bordered footer strip |
| `Area Chart` / `Area Chart New` | `AreaChart` | All 10 type variants — basic, linear, step, stacked, stacked-expanded, gradient, dots, axes, legend, icons |
| `Bar Chart New` | `BarChart` | All 10 type variants — basic, horizontal, multiple, mixed, stacked, stacked-legend, label, custom-label, negative, active |
| Chart page `Type=Basic` / `Type=Donut` | `PieChart` | Pie and donut with a centred total and mono-percentage legend |
| `Radar Charts New` | `RadarChart` | Circle or polygon grid, legend and icon-axis variants |
| `Advance Date Picker` | `DateRangePicker` | Two date slots joined by an arrow, opens CalendarNova |
| `Advance Tabs` | `Tabs appearance="gradient"` | Active pill takes the 112-degree wash |
| `Advance Pagination` | `Pagination appearance="gradient"` | Same, on the active page cell |
| `Pricing` (page-builder) | `PricingSection` | Three plans **fused into one strip**; featured plan taller with a near-black ring |
| `FAQ` (page-builder) | `FaqSection` | 800px rail, neutral-100 panels at radius 8, 20px apart |
| `Feature2` (page-builder) | `FeatureSection` | Uneven bento — 3 cards then 2, 24px columns / 23px rows, ring only |
| `App-integration` (page-builder) | `IntegrationSection` | Pill tiles filled with each app's brand hue at 10% |
| `About-us` / `About-us2` | `AboutSection` | `layout="stats"` bare row, `layout="metrics"` ringed cards with shadow-sm |
| `Social-proof` (page-builder) | `SocialProof` | 80px column gap against a 24px row gap; neutral-100 media card |
| `Accordion Trigger text` | `AccordionTriggerText` | Trigger label as its own element — the source's `Font Size` axis is **vestigial** (sm/md/lg all Inter Medium 14/20) |
| `Accordion Content text` | `AccordionContentText` | Body copy as its own element — same vestigial axis (all Inter Regular 14/20 muted) |
| `Accordion Trigger icon` | `AccordionTriggerIcon` | The caret — this axis **is** real: SM 16 / MD 18 / LG 20 |

The five most-used button skins were built in the previous pass: `GradientButton`, `GlowButton`, `RippleButton`, `SwipeButton`, `ArrowButton`.

**Nothing from the source's family inventory is outstanding.** What remains uncounted is the icon long tail, the duplicate copies, the sub-parts, the third-party logos, and the vendor demo pages — all listed in the table above.

### Why the automated family count stays low

The design-system checker matches built components to source families **by literal family name**, not
by capability. This was verified empirically: adding components cleared exactly the names covered and
the reported list advanced alphabetically (`Accordion Trigger *` → `Advance *` → `Alert *` → `app
integration`, `Area Chart New`, `Arrow buttons`, `Avatar examples`, `Basic Radio`). Every one of those
is built here under a corrected name.

The source's layer names carry typos (`Dailog`, `Corausel`, `accordation`), inconsistent casing
(`advance checkboxs`), plurals, and trailing spaces (`Advance Tabs `, `Advance solid button `).
Components in this system use corrected PascalCase. **`docs/figma-name-map.md` maps every source
spelling to its component** — that file, not a pile of alias wrappers, is the intended way to find a
component you saw in Figma.

Fifteen thin alias exports do exist for the most-searched `Advance*` spellings (listed under
"source-spelling aliases" above). That set was deliberately capped: shipping ~40 more no-op wrapper
files purely to satisfy a string match would add weight to every consumer's bundle without adding a
single new design. Names the checker still reports fall into one of these buckets:

| Reported name | Reality |
| --- | --- |
| `Area Chart New`, `Bar Chart New` | Same families as `Area Chart` / `Bar Chart` — built as `AreaChart` / `BarChart` with all 10 type variants |
| `Avatar examples` | Not a component — a 576x38 **slot** on the Data-Display alert page that hosts avatar instances |
| `app integration`, `Arrow buttons`, `Badges for blocks`, `Basic Radio` | Built as `IntegrationCard`, `ArrowButton`, `BlockBadge`, `RadioGroup` |
| `Bistro - Restaurant Landing page`, `Craft - *`, `Brandly - *` | Vendor demo templates for other brands — deliberately not built |
| ~1,515 Lucide glyph names | The icon set; 407 extracted, remainder identical to the CDN set |

---

## Visual foundations

### Colour

The palette is **value-driven, not hue-driven**. The entire structure of every screen is built from one neutral ramp — Tailwind `neutral`, 50 through 950 — and `--pg-primary` is `rgb(23,23,23)`, near-black. There is no brand hue. Emphasis comes from contrast; colour is reserved for meaning.

- **Structure:** `rgb(255,255,255)` background, `rgb(245,245,245)` muted surfaces, `rgb(229,229,229)` borders, `rgb(115,115,115)` secondary text, `rgb(23,23,23)` primary, `rgb(10,10,10)` body text.
- **Status:** info `rgb(2,132,199)` (sky-600), success `rgb(22,163,74)` (green-600), warning `rgb(217,119,6)` (amber-600), error `rgb(220,38,38)` (red-600), with a second error `rgb(224,52,52)` used for shadow tints.
- **The 10% rule:** every soft badge, soft alert and soft button is its status hue at **exactly 10% alpha** composited over the surface, with the full-strength hue as the text colour. This is the single most characteristic move in the system.
- **Charts:** a **neutral value ladder** by default — `neutral-950`, `400`, `700`, `300`, `500`. The steps alternate dark/light rather than descending, so adjacent series stay separable in a two- or three-series plot. Series are distinguished by value, exactly as the rest of the system is. The source file's own ramp (orange-600, teal-600, cyan-900, amber-400, amber-500) is preserved as `--pg-chart-source-1..5`; set `--pg-chart-N` to those to restore exact source fidelity. **This is the one place the system deliberately departs from the file** — see "Deliberate departures" below.
- **Dark mode** flips roles only. Background `rgb(10,10,10)`, cards `rgb(23,23,23)`, primary becomes `rgb(229,229,229)` (inverted, so primary buttons are light-on-dark), borders become `rgba(255,255,255,0.1)`.
- **17 alternate theme modes** ship in `fig-tokens.css` (`marvel`, `corporate`, `perplexity`, `nature`, `summer`, `claude`, `modern-minimal`, `neo-brutalism`, `pastel`, plus responsive and card-style modes). Set `data-mode` on `:root` to use one. Neutral is the default and the only theme these components were tuned against.

### Type

Two families do all the work, and they are **not interchangeable**:

- **Geist** — headings, display, brand, numbers that are the point of a card. SemiBold (600) with negative tracking: `-0.03em` at 60px, `-0.02em` at 30–36px, `-0.01em` at 20–24px.
- **Inter** — everything a user reads inside a control or a paragraph: labels, buttons, inputs, table cells, body copy. Regular (400) for prose, Medium (500) for anything interactive. Inter Medium 14/20 is the most-used style in the entire file, by a wide margin.
- **JetBrains Mono** — code, token names, keyboard chips, and tabular figures in tables and stat readouts. Always 12px in the file.

The scale is 12/16, 14/20, 16/24, 18/28, 20/28, 24/32, 30/36, 36/40, 48/48, 60/60, 72/72. Weights 300 and 700 exist but appear only on decorative specimen pages — **use 400, 500, 600**.

### Spacing and size

4px base, with 2 / 6 / 10 / 14 half-steps used constantly (`padding: 4px 10px` on an `md` control, `gap: 6`). Controls sit on one height ladder shared by Button, Input, Select, Tabs and Pagination: **24 / 28 / 32 / 36** for xs / sm / md / lg. Radius follows the control, not the designer's mood: **8 at xs–sm, 10 at md–lg**.

### Radii

`xs 2 · sm 6 · md 8 · lg 10 · xl 14 · 2xl 18 · 3xl 22 · 4xl 26 · full 9999`. Note 10, 14, 18, 22, 26 — this is not a doubling scale. Cards, popovers, sheets and toasts use **xl (14)**. Menus use **lg (10)**. Badges are **full**, unless explicitly square, when they are **sm (6)**.

### Borders — rings, not borders

Almost nothing in this system uses `border`. Surfaces are outlined with `box-shadow: inset 0 0 0 1px …`, so a hover or focus state can thicken the outline without shifting layout by a pixel. `--pg-ring` (neutral-200) is the default; `--pg-ring-strong` (neutral-300) marks empty inputs, checkboxes and radios; focus adds a 3px `rgba(163,163,163,0.5)` halo outside it. The **only** real border in the system is the dashed rule on a file drop zone.

### Elevation

A 7-step ramp — `2xs xs sm md lg xl 2xl` — but most surfaces use **no shadow at all**, just a ring. When shadow appears it means "floating": menus and popovers `md`, toasts `lg`, dialogs and sheets `xl`. `2xl` (`0 25px 50px -12px rgba(0,0,0,0.25)`) is a marketing-page device only. Solid status buttons carry a 1px coloured shadow at 20% of their own hue.

### Backgrounds and imagery

Backgrounds are **flat**. There are no gradient page backgrounds, no textures, no patterns, no hand-drawn illustration. Sections alternate between `rgb(255,255,255)` and `rgb(250,250,250)` separated by a 1px rule, and the dark CTA band is flat `rgb(23,23,23)`. The one gradient in the whole file is on the Custom Button's optional "Gradient Button" skin — a 112° two-stop wash between two near-identical neutrals, i.e. barely visible. Imagery is cool-toned, high-saturation abstract 3D (see `assets/images/card-a5337c46f4933d22.jpg`) and neutral photographic avatars — no grain, no duotone, no filters.

### Motion

150ms with `cubic-bezier(0.4, 0, 0.2, 1)`, applied to colour and shadow. Overlays fade in over 120–200ms with a 4px rise (`pg-fade-in`); carousels translate at 300ms; skeletons pulse opacity on a 1.6s loop; spinners rotate at 0.6s linear. **Nothing bounces, nothing overshoots, nothing scales on press.**

### Interaction states

- **Hover** — the fill darkens one ramp step (or a ghost control gains the `accent` surface). No lift, no shadow change, no colour change on text.
- **Press** — nothing visual changes beyond the hover fill. No scale, no translate.
- **Focus** — a 3px halo outside the existing ring.
- **Disabled** — `opacity: 0.5` and `cursor: not-allowed`, and that is the *entire* treatment. Colours are never desaturated.
- **Selected** — the flat `accent` surface (neutral-100), never a tint of a brand colour.

### Transparency and blur

Used sparingly and always with a reason: 10% status tints on soft components, 50% black scrims behind modals with a 2px backdrop blur, and `0.8` opacity on secondary label text. No frosted-glass panels, no translucent navbars.

### Layout

1120px content column, 24px gutters, centred. App shell is a fixed 248px sidebar (collapsing to a 60px icon rail) plus a 56px sticky header; marketing pages use a 60px sticky navbar. Marketing sections are 64px tall vertically at desktop and 48px at tablet — the file's `📱 Responsive` collection defines 1440 / 768 / 360 breakpoints with 64 / 64 / 32px vertical padding and 96 / 24 / 16px horizontal padding.

---

## Corrections made against the source

### Deliberate departures

One place this system knowingly differs from the file:

- **Chart series colours.** The source imports a five-hue ramp from its Tailwind collection
  (orange-600, teal-600, cyan-900, amber-400, amber-500). Those hues sit oddly against a palette
  that is otherwise entirely neutral with no brand hue — a chart became the loudest thing on any
  screen it appeared on. The default is now a **neutral value ladder** (`neutral-950 / 400 / 700 /
  300 / 500`) — alternating dark and light so adjacent series stay separable — which distinguishes
  series by value, the same way every other component in the system creates emphasis. The source
  ramp is preserved verbatim as `--pg-chart-source-1..5`; reassigning `--pg-chart-N` to them
  restores exact fidelity in one edit.

Everything else below is a correction *toward* the source, not away from it.

### Corrected toward the source

Twenty-four components were first built from the general shadcn pattern and later corrected against
their leaf nodes in the file. The source values won in every case:

| Component | Was (pattern) | Is (source) |
| --- | --- | --- |
| All six `blocks/` sections (`40678:94023`) | section heading and description set in **Inter** | **Geist** — 600 36/40 heading, 400 20/28 description. `block-heading` is a display-font element; only the eyebrow badge stays in Inter. `IntegrationSection` also gained the 40px-tall action row (primary + outline Button at gap 16) the source pairs with it. |
| `Card` (`38526:288`) | inset 1px neutral-200 ring, Geist SemiBold 16/24 title, uniform 24px padding, inline footer | outset `0 0 0 1px rgba(10,10,10,0.1)`, **Inter Medium** 16/24 title, **16px vertical on the card with 16px horizontal per section**, full-bleed neutral-50 footer strip with its own 1px border. `size="sm"` is the source's 12/12 variant. |
| `Dialog` (`38791:107070`) | Geist SemiBold 18/28 title, 24px padding, shadow-xl only | **Inter Medium 16/24** title 4px above the description, **16px** padding, outset ring **plus** shadow-xl |
| `Table` / `DataTable` (`38835:185883`) | 10/12 padding, top-border-only row rules | **52px cells (40 dense), 8px padding**, and a 1px neutral-200 border on **all four sides** — the source draws a full grid |
| `Popover` (`38750:9493`) | radius 14, 12px padding, 8px gaps, inset ring | **256px, radius 10, 10px padding, 10px gaps**, outset ring + shadow-md |
| `Select` (`3884:6981`) | radius 10, 4/10 padding, value at 14/20, 16px chevron | **radius 8, 6/10 padding, value at 16/22, 14px chevron** |
| `Timeline` (`15783:326561`) | bare 10px dot, 14/20 title, no day headers | **12px dot inside an 18px same-hue halo**, Inter Medium **16/22** title, `groupLabel` day headers, `TimelineAttachment` chip |
| `Progress` (`39090:35539`) | neutral-200 track | **neutral-100 track** (`rgb(245,245,245)`) — the rail is lighter than a border |
| `Badge` (`326:2335`) | one type size per badge size | **solid md/lg set at 12/16**, soft and outline at 14/20 — the fill needs the smaller label |
| `Switch` (`3867:4029`) | one knob size, 12px description, primary only | **knob grows 12\u219216px on toggle**, description at **14/20**, 6 tones, `outline` appearance, `invalid` state |
| `Checkbox` (`36447:12790`) | 14/16/20 boxes at radius 2, glyph = box\u22124 | **16/20/24 boxes at radius 4**, 16px glyph at md, checked keeps a matching 1px ring |
| `Input` / `Textarea` / `Select` filled (`414:12812`) | flat `--pg-muted` fill | **`rgba(229,229,229,0.5)`** \u2014 a 50% neutral-200 wash, so the ring still reads through |
| `Alert` (`15226:58744`) | body faded to 85\u201390% opacity under the title | **body at full strength**, same colour as the title \u2014 soft/outline both in the tone, solid both in white |
| `Sidebar` (`38915:10526`) | 32px rows at radius 10, active row set in Medium | **36px rows at radius 8**, active fills neutral-100 and darkens ink only \u2014 weight stays Regular |
| `Avatar` (`323:319`) | no ring, initials in Medium 12px on `--pg-muted` | **1px inset neutral-200 ring on every avatar**, initials in **Regular 16/24** on neutral-100 |
| `Spinner` (`38699:3523`) | invented a 1\u20135 scale with 14px and 20px steps | **3 / 4 / 6 / 8 named by Tailwind step** \u2014 12 / 16 / 24 / 32px, the only sizes the file defines |
| `AvatarGroup` (`15205:153498`) | invented \u2212d/3 overlap, outer background cutout, +n as a circular chip | **5/12 of the diameter** (the source\u2019s `gap: -20` on 48px), **2px white INNER ring** per avatar, **+n as plain text** |
| Icon set (`3637:6775`) | I wrapped all 403 glyphs in a centring `translate()` on a false premise, computing it as `(24-w)/2` without subtracting the glyph's own origin — shifting every glyph down-right past the viewBox edge (bboxes ran to x=24.75); checkmarks and media glyphs sat low-right in their containers | **wrappers removed — the authored geometry was already correct.** Measured across 407 entries: nothing overflows; residual 0.5–1px offsets on `Play`, `Car`, `Bus`, `Briefcase` are the source's optical adjustments, and `StarHalf` stays 5px off-centre so it overlays `Star` |
| `Slider` / `RangeSlider` (`3868:82886`) | one 6px track on neutral-200, 16px thumb with a primary ring and shadow | **4 / 6 / 8px tracks on neutral-100**, **12px thumb with a 1px neutral-400 ring**, no shadow |
| `Breadcrumbs` (`3760:18379`) | current page set in Medium | **every crumb Inter Regular 14/20** \u2014 the current page is marked by ink alone, never weight |
| `Tabs` (`3808:12668`) | 28/32/36 tall, uniform 0/12 padding | **26 / 30 / 34** with asymmetric padding (2/6/4, 4/8/6, 6/10/8) to clear the 2px rule |
| `Pagination` (`3772:59250`) | radius 10, 4px gaps, bare icon prev/next | **radius 8, 2px gaps**, and prev/next are **labelled ghost buttons** (glyph + word) |
| `RadioGroup` (`3830:59846`) | 14/16/20 white circle, primary ring, primary centre dot | **16/20/24 disc FILLED primary** with a **neutral-50 dot punched out** \u2014 the inverse of what I built |
| `Steps` (`405:7831`) | 24px circle, 12/16 numeral, 1px connector, Medium 14/20 title | **38px rounded square at radius 8**, numeral Medium 16/24, **2px** connector, title Regular **16/22** |
| `Accordion` (`324:855`) | Medium 14/20 trigger, 14/16 padding (rule inset) | **Regular 14/20**, 10px vertical / **no horizontal** padding so the rule runs full-bleed |
| `Tooltip` (`15139:15898`) | radius 6, 4/8 padding, primary only | **28px tall, radius 8**, padding **6/12**, inner gap 6, and the source's full **6 tones x 5 positions x 2 shapes** matrix with avatar / subtitle / badge / arrow slots |
| `Chart` (`38686:180118`) | bare SVG plot, 12% area fill, 2px stroke, Inter 11px ticks | the chart **is a card**: radius 14, inset ring, `16px 0` shell padding, header Inter SemiBold 16/24 over Regular 14/20, and a full-bleed `rgba(245,245,245,0.5)` footer strip bordered on **all four sides** setting both lines in Geist **14/14**. Area fill **30%**, stroke **1px**, ticks and legend Geist 12/16 with an 8px radius-2 swatch — now split into `ChartCard` + `Chart` |

The pattern to watch for: this kit draws card-like surfaces with an **outset** ring at
`rgba(10,10,10,0.1)`, sets **titles in Inter Medium 16/24 rather than Geist**, and pads
containers **vertically only** so footers and media can sit full-bleed. Table cells are a
full **grid**, bordered on every side, not rows separated by rules.

**The kit never signals state with font weight.** Active sidebar rows, current breadcrumbs and
selected tabs all keep their neighbours\u2019 weight and are marked by ink, fill or rule instead.
This caught me out in six separate components.

---

## Content fundamentals

The file's own copy is short, lower-case-where-possible, and factual — placeholder text is literally `Type here`, labels are one word (`Label`, `Badge`, `Button`), and component descriptions are single sentences that lead with the verb: *"Use custom button styles for actions in forms, dialogs, and more with support for multiple sizes, states, and more."* Extend that voice as follows.

**Tone.** Plain, specific, slightly dry. Confident without being loud. Never salesy, never cute.

**Person.** Address the reader as **you**. The product refers to itself as **we** only in first-person commitments ("We'll send a verification link"). Avoid "I" entirely. In empty states and confirmations, prefer the imperative: *"Import your team"*, not *"You can import your team"*.

**Casing.** **Sentence case everywhere** — buttons, labels, headings, menu items, table headers. `Add person`, not `Add Person`. Title Case appears nowhere. All-caps is reserved for 12px overlines and sidebar group labels, always with `0.04em`–`0.06em` tracking.

**Length.** Button labels 1–3 words. Field labels 1–3 words. Helper text one clause. Card descriptions one sentence. Section descriptions at most two.

**Numbers.** Always concrete. `24 employees · 5 open roles`, not `Manage your team`. Currency with thousands separators and no trailing zeros in body copy (`$148,220`); with them in tables (`148,220.00`). Dates as `18 Aug 2026`. Use a middle dot `·` to join short facts in a subtitle.

**Punctuation.** No exclamation marks. No em-dash pile-ups. Serial commas. Full stops in sentences, none on labels or single-clause helper text.

**Errors.** Say what is wrong and what fixes it, in that order: *"Must be 12+ characters"*, *"Enter a valid address"*, *"Names must match exactly"*. Never "Oops", never "Something went wrong" without a next step.

**Destructive copy.** Name the consequence in numbers before asking: *"All 24 employee records, 18 pay runs and every uploaded document will be removed immediately."* The confirm button says what it does — `Delete forever` — not `OK`.

**Emoji.** Not used. The source file contains emoji only in Figma layer names (`📃 Component Header`, `💨 Tailwind`) — designer housekeeping, never product surface. Do not put emoji in UI, and do not use them as icons.

**Unicode as iconography.** Only for keyboard glyphs in `Kbd` (`⌘`, `↵`, `esc`) and the `·` separator. Everything else is a Lucide SVG.

---

## Iconography

**Lucide** is the icon system, and it is the only one. The file carries **1,515 Lucide glyphs** as Figma symbols on its `Lucide-Icons` page, drawn on a 24px grid with a 2px stroke, round caps and round joins, `fill: none`, and stroke colour inherited from the parent.

- **407 of those glyphs are extracted into `assets/icons/icon-data.js`** as `{ viewBox, body }` path markup, rendered by `assets/icons/Icon.jsx` as `<Icon name="Wallet" size={16} />`. Every icon paints with `currentColor`, so recolour by setting `color` on the element or its parent.
- The remaining ~1,110 glyphs were **not** extracted — see `assets/icons/README.md`. For those, `lucide@0.469.0` from CDN is a byte-identical source — the Figma page is an import of the same open-source set, and the names match one-for-one in PascalCase.
- **Sizes in use:** 12 inside `xs` badges, 14 in `sm` controls and table row actions, 16 in `md`/`lg` controls, sidebars, menus and alerts, 18 in feature medallions and avatars-with-icon, 20–24 in specimen and marketing contexts, 32+ never.
- **No icon fonts, no PNG icons, no sprite sheet.** Everything is inline SVG.
- **Never draw a new glyph.** If Lucide doesn't have it, pick the nearest Lucide concept or use type.
- Status glyphs are fixed by tone and should not be swapped: info → `CircleAlert`, success → `CircleCheck`, warning → `TriangleAlert`, error → `CircleX`.

`assets/images/` holds the bitmaps copied out of the file verbatim: three avatar photographs (`avatar-a542b8ba335a53db.png`, `avatar-38a0e2b930a4f836.png`, `avatar-d874eea2c6cc3d47.png`) and one abstract 3D card image (`card-a5337c46f4933d22.jpg`). Use these rather than substituting stock.

---

## Using it

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
<script>const { Button, Card, Table } = window.PeopleAmpGroDesignSystem_a6acf8;</script>
```

Read `<Component>.prompt.md` next to any component for its "what and when", a usage snippet, and its notable props.
