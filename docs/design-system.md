# XForm design base: Precision — Volt

Approved on 7 September 2026. This is the default design for **Login, account activation, Client, Coach and Admin**. The earlier Sora colour studies are proposals only; do not use them as the application's base.

## Source of truth

- `src/design-tokens.css`: semantic colours, locally hosted fonts, radii and effects.
- `src/precision.css`: shared typography, navigation, controls, responsive authentication and dashboard composition.
- `src/styles.css`, `src/admin.css`, `src/profile-photos.css`: existing feature layouts now consume the shared tokens. Keep feature behaviour here; do not introduce private colour palettes.
- `output/xform-precision-volt/precision-volt-theme.png`: the approved visual reference.

### Colour

| Role | Token | Value |
| --- | --- | --- |
| Carbon canvas | `--bg` | `#090A0B` |
| Graphite panel | `--surface` | `#141719` |
| Raised surface | `--surface-raised` | `#1D2123` |
| Border | `--border` | `#343A3D` |
| Chalk text | `--text` | `#F5F7F4` |
| Secondary text | `--text-muted` | `#ABB3AD` |
| Volt accent | `--accent` | `#C7F542` |
| Text on Volt | `--action-ink` | `#11180A` |
| Selected background | `--selected` | `#242E17` |

Use Volt for primary actions, selected navigation, chart series and limited headline emphasis. Large surfaces stay neutral. Use the dedicated success/warning/danger tokens for operational statuses; destructive actions must not look like the primary action. Pair statuses with text, not colour alone. Avoid glows and decorative gradients. Photo scrims and proportional chart fills are functional exceptions.

### Typography and components

- **Chakra Petch 600–700**: headings, brand wordmark and key metrics.
- **IBM Plex Sans 400–600**: copy, forms, tables and controls.
- **IBM Plex Mono 500**: compact data labels and chart annotations.
- **6 px panels; 3 px controls.** Primary actions have a 10 px chamfer; the XP mark has an 8 px chamfer.
- Primary actions have a contrasting inset keyboard-focus indicator because an external outline would be clipped by the chamfer. Other controls use the Volt focus outline.
- Preserve accessible labels, keyboard controls, disabled/loading states, alert messages and reduced-motion support.
- Use larger text inputs on mobile to avoid browser zoom; keep the existing responsive navigation and horizontally scrollable data tables.
- Center button labels across actions, navigation, dialogs and uploads. Icons must not push full-width labels to an edge.
- Login fills the viewport with a fluid photographic/form split on desktop and a stacked layout on mobile. Scale spacing and typography with the viewport, but keep the form at a readable maximum width of 640 px. The primary login label is **Sign In**, at 18–24 px.

Fonts are self-hosted in `src/assets/fonts/` with their OFL licenses. The existing generated editorial photograph in `src/assets/brand/` is a static brand asset, not a client's photograph. Client uploads still use their existing protected API paths; nothing is moved into public assets.

## Implementation boundaries

The client dashboard follows the asymmetric progress/training composition. Its weight chart, target segments and training volume use existing API responses. Empty records do not render invented trends or workouts. All existing navigation destinations remain available, including Health Summary.

Authentication, portal selection, role checks, API request contracts, Supabase policies, R2 photo authorization and database schemas are unchanged by this design rollout. Existing coach screens that are local previews remain local previews; this work does not implement their backend features.

## Verification

`e2e/precision-theme.spec.js` tests the real UI with intercepted, synthetic API/auth responses—never real accounts. It covers the three portals at 1440, 768 and 390 px, all existing navigation destinations, login errors/keyboard controls, client saves, empty dashboard states, admin privacy presentation, onboarding dialogs and invitation activation. Existing mocked admin tests also cover portal mismatch, onboarding and offboarding.

For isolated local verification, run the frontend with synthetic configuration on a separate port:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=design-test-publishable-key npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/precision-theme.spec.js e2e/admin-portal.spec.js
npm run build
```

Use normal local environment configuration for the actual app, not the synthetic test configuration. The test suite checks presentation and preserved UI requests, not live Supabase availability or a full security/accessibility certification.
