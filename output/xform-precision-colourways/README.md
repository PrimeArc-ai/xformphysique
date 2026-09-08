# Precision / three dark colour packs

Three non-green alternatives, with **Sora** display typography and the same Precision with Pulse layout. Each pack includes a 3200 × 2200 client dashboard and a matching brand/components/login sheet. These are review images, not changes to the live app.

## Directions

| Pack | Background | Panels | Action fill | Text/chart accent | Character |
| --- | --- | --- | --- | --- | --- |
| Electric Blue | `#090E18` | `#111D2F` | `#3667E8` | `#82ABFF` | Crisp, technical, performance-focused |
| Signal Coral | `#130E10` | `#21191D` | `#FF6E5B` | `#FF8D80` | Warm, athletic, confident |
| Ultraviolet | `#100D19` | `#1C172A` | `#8D52F0` | `#C49AFF` | Bold, expressive, contemporary |

These palettes include coordinated surfaces, borders, secondary text and selected states—not just one substituted accent. Saturated action fills are separated from lighter foreground accents so text remains readable on dark panels. The complete tokens live in `palettes.js`.

Sora 600–700 is used for display and key metrics; IBM Plex Sans supports everyday interface copy; IBM Plex Mono is reserved for small data labels. Typography, content, panel arrangement and control shapes are identical across these three options, making this a controlled colour comparison. Compared with the previous Volt proposal, Sora replaces Chakra Petch. The previous studies and live application sources remain untouched.

## Images

- `01-electric-blue-dashboard.png`
- `01-electric-blue-theme.png`
- `02-signal-coral-dashboard.png`
- `02-signal-coral-theme.png`
- `03-ultraviolet-dashboard.png`
- `03-ultraviolet-theme.png`

`precision-three-dark-palettes.zip` contains all six images.

## Design source and checks

`theme.css` and `preview.js` are unchanged copies of the approved Precision layout source. `colourways.css` and `colourways.js` apply this study's typography and semantic palette mapping. The existing generated fitness photograph is reused unchanged; no raster generation or image editing was needed. Font assets and their OFL licenses are included.

Render from the repository root:

```sh
node output/xform-precision-colourways/render.mjs
```

The renderer verifies font loading, missing resources, browser errors, clipping, canvas boundaries and identical dashboard/login geometry across the three palettes. Results are in `render-evidence.json`. `validation.json` records selected text contrast pairs and preservation of original source copies.

Primary-button text contrast is 4.93:1 for Electric Blue, 6.47:1 for Signal Coral and 4.57:1 for Ultraviolet. All selected normal-text pairs pass the 4.5:1 threshold. This is not a complete accessibility audit: responsive layouts, focus/hover/disabled states and status colours still need implementation and testing if a pack is chosen. Brand coral must not become the sole signifier of an error or destructive action.

These are static desktop concepts. Sign-in controls do not authenticate, and all account/body/training values are synthetic. No Supabase, API, role or client-data access changes are made.
