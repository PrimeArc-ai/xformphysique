# Precision — Active / revision 02

This revises **Precision only**. Performance, the original Precision board and the application remain unchanged. Both deliverables are static **3200 × 2200 PNG** previews:

- `precision-active-dashboard.png` — full-size client dashboard.
- `precision-active-theme.png` — typography comparison, component theme and matching login.

## What actually changed

1. **Typography:** Sora is replaced by [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) for headings and key metrics, using 600–700 weights. Its angular letterforms make the change visible without changing the palette. IBM Plex Sans remains the readable working font; IBM Plex Mono is limited to small data labels. The before/after specimen uses the same text, colour and 32 px font size, with Sora 500 versus Chakra Petch 700.
2. **Hierarchy:** current weight is the dominant number inside the trend panel, not one of four equally sized tiles. Target progress, waist, check-ins and training volume have distinct supporting roles.
3. **Layout:** a larger progress column is balanced by a separate training column with photography, exercise list and contextual shortcuts. The screenshot is no longer squeezed beside a brand board and login.
4. **Components:** chamfered primary buttons and XP mark, outlined secondary actions, text actions, segmented controls, angled progress segments, 6 px panels and a defined selected-navigation treatment. This is a custom theme-pack concept, not a purchased or installed third-party component library.
5. **Photography:** the same original generated photograph is reused as a training cue and sign-in header. No image editing or new image-generation call was needed: this revision edits the existing code-native design source.

## What did not change

The Precision colour tokens are retained exactly: canvas `#0B1115`, panel `#121C22`, raised surface `#1A2830`, border `#2C404B`, text `#EDF5F8`, secondary text `#A2B4BD`, mint `#A9D6CD` and action ink `#132522`. The choice is deliberate: typography, layout and components—not a palette swap—drive this revision.

The underlying feature areas and illustrative data remain consistent: 72.4 kg current weight, 84 cm waist, four submitted check-ins, 60% progress toward a 70 kg target from a 76 kg start, and 18,240 kg training volume across 12 sessions. No new backend capabilities are implied by the rearranged presentation.

## Theme application boundaries

This is a visual proposal only. Buttons, tabs, chart ranges and sign-in controls do not execute application actions. `client@example.com` is not a test account or credential. All people, account references, body values and workout details are synthetic. The photograph is generated editorial artwork, not a client's upload.

The theme can later extend across Client, Coach and Admin with shared tokens. Use Chakra Petch for hierarchy, not dense paragraphs or data tables. Keep account roles and client-data isolation unchanged. Responsive layouts, keyboard behaviour, focus visibility, full component states and production accessibility still need implementation and testing if this direction is selected.

## Assets and verification

- `chakra.css`, `theme.css` and `preview.js` are editable design sources. `theme-tokens.json` records the custom pack's semantic values and typography/shape choices.
- Chakra Petch was downloaded from Google's official font distribution. Its source URLs and OFL license are included. Previously bundled Sora and IBM Plex assets are copied into this folder with their licenses. Sora loads only for the before/after specimen, not the revised dashboard.
- `render-evidence.json` verifies loaded fonts, dimensions, checked element clipping, browser errors and absence of external requests during rendering.
- `validation.json` verifies the original Precision palette and the unchanged hashes of Performance, original Precision and the checked app source files, plus selected text-contrast pairs. It is not a complete accessibility certification.
- The existing generated photo is reused from `../xform-dark-directions/assets/strength-editorial.png`. Its original built-in image-generation prompt and provenance remain in the previous study.

From the repository root:

```sh
node output/xform-precision-v2/render.mjs
node output/xform-precision-v2/validate.mjs
```

`precision-active-preview.zip` contains the two final images. The source and tokens are available beside them in this directory.
