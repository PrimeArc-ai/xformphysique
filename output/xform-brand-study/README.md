# XForm Physique — six brand & interface boards

Six PNG images, each **3200 × 2640 pixels**. Every board contains the identity guide, typography, supporting graphic, palette, role-selected login and corresponding dashboard.

1. `dark-admin.png` — coach administration and privacy-limited client assignments.
2. `dark-coach.png` — client pulse, review queue and plan shortcuts.
3. `dark-client.png` — body signal, weight trend, next actions and training volume.
4. `light-admin.png` — the same Admin view in the proposed light theme.
5. `light-coach.png` — the same Coach view in the proposed light theme.
6. `light-client.png` — the same Client view in the proposed light theme.

`xform-six-theme-boards.zip` contains exactly these six final images.

## What is real, and what is proposed

These are **static, harmonised design previews**, not screenshots of a changed production application. No app source, API, database, accounts, authentication or permissions were modified to produce them. Controls are visual samples, not functional app controls. All displayed people, values and `example.com` sign-in addresses are illustrative; the login samples are not credentials.

The existing XP mark and product lockup are retained. “XForm Physique” is used consistently for the brand, while “XForm / Coaching OS” remains the product lockup. The descriptor treatment, “Progress, with purpose” brand copy and contour graphic are design proposals, not claims of an existing brand guideline.

Current interface content was checked against `src/AuthGate.jsx`, `src/AdminWorkspace.jsx`, `src/CoachWorkspace.jsx`, `src/App.jsx` and the client navigation. Samples preserve the main existing portal capabilities. The Admin sample shows coach information but **only client codes, assignment dates and assignment status**; client names, contact data, health records and photos do not appear in that portal. The boards are not evidence of new feature implementation or security testing.

## Source-based design system

The dark palette was extracted from `src/styles.css`, with comparison against `src/admin.css` and `src/profile-photos.css`. Exact counts and source-file hashes are in `tokens-and-source-audit.json`.

| Token | Dark: existing CSS values | Light: proposed values |
| --- | --- | --- |
| Canvas | `#090B0D` | `#F6F7F2` warm chalk |
| Main panel | `#101419` | `#FFFFFF` porcelain |
| Raised surface | `#171C20` | `#EBEFE5` pale sage |
| Sidebar | `#0B0D10` | `#EFF2E9` |
| Border | `#293036` | `#D7DED2` |
| Primary text | `#F4F6F1` | `#1C2921` |
| Secondary text | `#9AA1A5` | `#59695D` |
| Brand accent | `#B8FF2B` | `#B8FF2B` |
| Primary action | `#B8FF2B`, dark text | `#314B36`, white text |
| Selected surface | `#1C2512` | `#DCE8CC` |

Dark semantic values are all verified to occur in the existing `styles.css`. The source uses many similar shades for related purposes; the boards assign these existing colours to consistent semantic roles instead of reproducing every variation.

### Consistency decisions applied to the boards

- **Surfaces:** the main app's `#101419` panel is the shared dark panel. The Admin `#191F22` variation is not carried into the concept.
- **Borders:** `#293036` becomes the shared dark edge, replacing portal-specific use of `#2B3539` and other nearby shades in equivalent contexts.
- **Text:** the root `#F4F6F1` becomes shared primary ink, with `#9AA1A5` for secondary text. The existing Admin `#E9EEE8` and `#95A3A9` variations are consolidated here.
- **Accent:** XP branding and dark primary actions share `#B8FF2B`. Nearby lime values in photo and button styling are no longer interchangeable theme defaults. Semantic warning colours remain distinct from branding.
- **Typography:** the app declares Inter but does not bundle it; local font resolution fell back to Noto Sans. The boards bundle the official Inter variable font so the declared face actually renders. Product mark weight and tightly tracked display type follow the existing direction.
- **Shape:** 16 px primary panels, 12 px compact metric cards, 8 px controls and 11 px standard XP mark corners form a deliberate hierarchy. Large identity marks scale proportionally.
- **Light expression:** warm chalk canvas, white panels, sage edges and forest actions. Lime remains a signature, not body text on white or the default background of every control.

All of these decisions are isolated to this design study. They have **not** been applied to the running app.

## Verification and regeneration

From the repository root:

```sh
node output/xform-brand-study/audit.mjs
node output/xform-brand-study/render.mjs
```

The renderer uses the repository's Playwright dependency and a temporary loopback-only server. It closes both Chromium and the server when finished. No external app or authentication services are called. `render-evidence.json` records dimensions, selected portals, font loading, browser errors and layout clipping checks for each export. All six final images were also visually inspected.

`audit.mjs` verifies dark token provenance and contrast of the listed text/background pairs. This is **not** a full accessibility certification: production keyboard behaviour, focus states, minimum control contrast, responsive behaviour and screen-reader use still require implementation and testing. The images are desktop presentation boards, not responsive applications.

## Asset provenance

- Font: [Inter 4.1, official source](https://rsms.me/inter/), bundled under the SIL Open Font License 1.1; license included in `assets/Inter-LICENSE.txt`.
- Contour background: generated using the built-in image-generation workflow, not the CLI. Selected asset: `assets/progress-contours.png`. The same generated asset supplies both thematic crops through CSS background positioning.
- Exact copy, XP mark, UI controls, charts, tokens and layouts are code-rendered for legibility and consistency. No private app data or credentials were provided to the image generator.
- The user's PACE reference guided the editorial layout structure only. Its name, logo, colour palette and typography were not reused.

### Generation prompt record

Use case: logo-brand. Create a single wide 3:1 editorial brand texture sheet for XForm Physique, containing TWO exactly equal, edge-to-edge panels with a perfectly straight vertical seam halfway across. No borders, no text, no lettering, no logos, no UI. LEFT HALF: near-black #090B0D ground with restrained fine contour lines suggesting the rhythm of steady physical progress, a graceful sculptural sweep rising from bottom left to upper right, dark graphite contour filaments with just three subtle lime #B8FF2B filaments. RIGHT HALF: warm chalk #F6F7F2 ground with the same graceful sculptural contour sweep, extremely fine sage and forest-green #314B36 filaments, and a tiny lime accent. Elegant organic technical linework, premium fitness coaching identity, disciplined editorial minimalism, ample quiet negative space. Flat, frontal 2D graphic with very subtle tactile paper grain, no glossy 3D objects, no glow, no neon saturation fields, no people, no icons, no orange, no blue, no text or watermark. This is a background asset for exact code-rendered brand guidelines and dashboard boards, not the final board itself.
