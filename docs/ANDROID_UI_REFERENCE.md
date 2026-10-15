# Android UI reference

Reference source: responsive patient website as implemented on 2026-10-15. Preserve its Arabic Iraq language, RTL layout, information hierarchy, colors, spacing, and medical caveats in the native client. This is a reproduction guide, not a new brand design.

## Navigation and shared shell

Source: `src/components/patient-shell.tsx`.

- Header shows the logo mark and “صحتي وسكري”, urgent-help action, patient name, and logout.
- Desktop uses top navigation. Phone layout uses a fixed bottom bar with six items: Home, Profile, Glucose, Medications, Daily log, and Reports. Settings remains reachable from a settings entry elsewhere in the responsive flow; urgent help stays in the header.
- Main content uses a centered `max-w-6xl` column with 16 px horizontal padding and 20 px vertical padding. The web shell reserves bottom padding for the mobile bar.
- Native navigation should keep the same six destinations and visible active state. Keep urgent help reachable without hiding the current screen.

## Visual tokens

Source: `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui.tsx`.

| Token | Value/use |
|---|---|
| Brand blue | `#2463A6` (`brand-500`), main actions and logo |
| Brand dark | `#184673` to `#0D2438`, dark blue range |
| Teal | `#16A6A0`, secondary highlights |
| Canvas | `#F5F9FC`, page background |
| Ink | `#17324D`, primary text; muted `#6B8299` |
| Warning / alert / success | `#E6A23C` / `#C94949` / `#2F9E68` |
| Font | Cairo, bundled local fonts, weights 400/600/700 |
| Corners | 0.9 rem cards/controls; 1.25 rem larger cards |

Cards use white surfaces, subtle blue borders and `shadow-card`. Buttons and inputs use rounded-xl corners. Preserve generous whitespace and clear text hierarchy. Reuse local Cairo assets if licensing/build workflow permits.

## Screens and API map

| Screen | Existing source | Main content and behavior | API |
|---|---|---|---|
| Dashboard | `src/app/(patient)/dashboard/page.tsx`, `src/components/charts.tsx`, `src/components/quick-actions.tsx` | Four summary cards, quick actions, 14-day glucose chart, day summary, event comparisons, recent readings/activity, profile completion, disclaimer. Empty states appear when there is no data. Event comparisons are descriptive only, never causal. | `GET /api/v1/dashboard`; writes from quick actions use glucose/administrations/daily-log endpoints. |
| Profile | `src/app/(patient)/profile/page.tsx` | Personal details and health sections; editable forms use shared validation. | `GET/PATCH /profile`, plus profile subroutes. |
| Glucose | `src/app/(patient)/glucose/page.tsx` | Add/edit/delete measurement, filter history, glucose units and contexts, chart/list. | `/glucose` collection and `{id}` routes. |
| Medications | `src/app/(patient)/medications/page.tsx` | Active/inactive medicine, dose and schedule details, administration log. | `/medications`, `/administrations`. |
| Daily log | `src/app/(patient)/daily-log/page.tsx` | Tabs/sections for meals, activity, sleep, symptoms, daily factors. Keep field-specific empty and validation states. | `/meals`, `/activities`, `/sleep`, `/symptoms`, `/factors`. |
| Reports | `src/app/(patient)/reports/page.tsx` | Date range, summary, PDF export; preserve Arabic RTL PDF, report limits, and disclaimer. | `/reports/summary`, `/reports/pdf`. |
| Settings | `src/app/(patient)/settings/page.tsx` | Contact and account settings. | `/settings/contact`, auth password endpoints. |
| Urgent help | `src/app/urgent-help/page.tsx` | Static urgent-help information and disclaimers. | No private API required. |

## RTL, controls, and states

- Set the app direction to RTL for Arabic screens. Keep glucose numbers, dates, units, phone/email, and other Latin-formatted values LTR within RTL content, matching `.num` and `.unit` styles in `globals.css`.
- Use Cairo throughout. Keep form labels above controls, inline validation near its field, and destructive confirmation before deleting a record.
- Preserve the web's icon meanings from `src/components/ui.tsx`; do not substitute icons that imply diagnosis or treatment.
- Charts use recorded values only. Keep unit conversion explicit and preserve date/timezone labeling.
- Every screen needs loading, recoverable error, empty, and populated states. Never convert a failed request to an empty state.
- The website's safety text states that the platform does not diagnose, calculate doses, or create unrecorded data. Keep it visible on dashboard and reports.

## Responsive layout references

Source: `src/app/globals.css`, `tailwind.config.ts`, patient screen components. Web uses a 420 px small breakpoint, one-column phone layouts, and wider multi-column grids on large screens. Native layouts should prioritize one-column scrolling, keep card order from the phone view, and avoid horizontal scrolling except for deliberate chart gestures.
