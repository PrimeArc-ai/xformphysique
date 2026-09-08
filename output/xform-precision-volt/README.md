# Precision — Volt / revision 03

A palette-only revision of the approved **Precision with Pulse** design. The dashboard and login retain their layout, spacing, geometry, illustration, content and typography. The application, Performance concept and previous Precision previews are unchanged.

## Deliverables

- `precision-volt-dashboard.png`: client dashboard, 3200 × 2200.
- `precision-volt-theme.png`: matching theme sheet and login, 3200 × 2200.
- `precision-volt-preview.zip`: the two final PNGs.

## Colour pack

| Token | Value | Purpose |
| --- | --- | --- |
| Canvas | `#090A0B` | Neutral carbon background |
| Surface | `#141719` | Graphite panels |
| Raised | `#1D2123` | Elevated surfaces |
| Border | `#343A3D` | Panel and control boundaries |
| Text | `#F5F7F4` | Crisp chalk-white text |
| Secondary text | `#ABB3AD` | Supporting information |
| Accent | `#C7F542` | Volt-lime actions, selected states and chart series |
| Action text | `#11180A` | Dark text on lime |
| Selected surface | `#242E17` | Restrained olive-black selection background |

The blue-black cast and muted mint are replaced by neutral charcoal and a more energetic lime. Large surfaces stay dark; the accent is reserved for existing focal points. No glow, extra gradient decoration or new visual elements are added. Existing photo-overlay colours are neutralised without editing the image.

**Typography is unchanged:** Chakra Petch 600–700 for display and metrics; IBM Plex Sans for interface copy; IBM Plex Mono for small data labels. Sora was present only in revision 02's before/after specimen, not in its dashboard. This sheet replaces that historical specimen with the actual interface font to avoid confusion.

## Source and verification

`theme.css`, `preview.js` and `chakra.css` are unchanged copies of revision 02. `volt.css` supplies the colour overlay; `volt.js` updates only theme-sheet documentation and revision labels. Assets and their licenses are reused from revision 02. The generated photograph is editorial artwork, not a real client's photo. No new raster generation or image editing was needed; this is an edit to the existing code-native design source.

Run from the repository root:

```sh
node output/xform-precision-volt/render.mjs
```

`render-evidence.json` records loaded fonts, dimensions, clipping checks, browser errors and external requests. `validation.json` records dashboard geometry/type equivalence with revision 02 and selected text-contrast checks. These checks do not constitute a complete accessibility audit.

These are static desktop review images, not an app rollout or functional login. All account details and values are synthetic. If selected, this palette can later be applied to the shared Client, Coach and Admin components without changing permissions or features.
