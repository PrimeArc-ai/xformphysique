# XForm Physique — three additional dark directions

Three original **3200 × 2640 PNG** design boards, each showing brand expression, font pairing, palette, login and a client dashboard. Same synthetic data and the same editorial fitness photograph make the visual differences easier to compare. These are proposals, not changes to the running application.

## 01 — Performance (recommended)

- File: `1-performance.png`.
- Barlow Condensed 700 for bold athletic headings and headline metrics; Manrope for the working interface.
- Near-black `#090A0B`, graphite `#141719`, soft white `#F3F6F4` and the existing XForm lime `#B8FF2B`.
- Sharp 4 px panels, short direct labels, visible sidebar navigation and decisive actions.
- Best fit: an unmistakably fitness-oriented product that evolves the existing black-and-lime identity.
- Rollout principle: use the condensed face sparingly. Keep dense coach/admin tables, client names, instructions and form labels in Manrope.
- Tradeoff: more assertive than the other directions. Do not apply uppercase to everything.

## 02 — Private Studio

- File: `2-studio.png`.
- Instrument Serif for expressive greetings and titles; DM Sans for metrics, controls, charts and body text.
- Warm black `#100F0E`, espresso-charcoal `#1A1816`, ivory `#F6F0E6` and muted champagne `#D7BC91`.
- Horizontal client navigation, open metric dividers, 20 px panels and pill-shaped controls.
- Best fit: premium, personal coaching with a softer editorial experience.
- Rollout principle: reserve the serif for a few hierarchy points. For coach/admin work, keep this typography and palette but use a denser navigation arrangement and sans-serif operational tables.
- Tradeoff: less overtly athletic. The proposed horizontal client navigation is not a final solution for every portal or mobile viewport.

## 03 — Precision

- File: `3-precision.png`.
- Sora for headings, IBM Plex Sans for the interface and IBM Plex Mono for metrics and selected technical labels.
- Ink-black `#0B1115`, blue-charcoal `#121C22`, cool white `#EDF5F8` and restrained mint `#A9D6CD`.
- Connected metric grid, 8 px panels, explicit labels and disciplined data alignment.
- Best fit: a professional data-led coaching system that scales naturally to coach/admin operational screens.
- Rollout principle: keep monospaced type out of long paragraphs; preserve human language and restrained fitness photography.
- Tradeoff: more technical and less expressive than the other directions.

## Research and design interpretation

These are original design interpretations, not copies of another product's interface or evidence of usability testing.

- [WHOOP's overview documentation](https://www.whoop.com/us/en/thelocker/your-key-whoop-metrics-all-in-one-place/) describes bringing important metrics together and making activity actions easy to reach. The transferable principle here is a clear progress summary plus a visible action. This is a documented historical reference, not a claim that these boards reproduce WHOOP's latest interface.
- [Oura's app guide](https://support.ouraring.com/hc/en-us/articles/360058599753-How-to-Use-the-Oura-App) separates timely daily information from deeper metric and long-term views. The transferable principle is an approachable overview, with detailed pages retained in navigation.
- [ABC Trainerize](https://www.trainerize.com/) places training, nutrition and progress tracking within a coaching relationship. That reinforces keeping these designs oriented toward coaching tasks rather than a generic analytics dashboard.

The recommendation for Performance is a design judgment based on XForm's fitness positioning and the positive feedback on the existing black-and-lime identity. It is not a tested conversion or retention claim. No wearable-specific scores, medical features, messaging capabilities or other researched-product features were added to XForm.

## Scope and privacy

- The app, existing six-board study, backend, database, accounts and permissions are unchanged.
- The XP letter mark remains recognisable. Colour, corner and circular treatments shown here are optional brand proposals, not adopted brand standards.
- `client@example.com` is a placeholder, not a credential. All client and coach names and values are fictional examples. The model photograph was generated; it is not a real client's photo.
- Samples show existing feature areas in proposed arrangements: body entries, check-ins, progress photos, nutrition, workouts, health and profile. Controls are static and do not execute those actions.
- Coach and Admin views are not separately mocked up in this set. Each board explains how its system would extend to those portals. Existing client-data boundaries must be retained in any later implementation.

## Verification

All three images were visually inspected. `render-evidence.json` records font loading, dimensions, selected portal, clipping checks and absence of external requests during rendering. The final PNGs have no clipped checked panels or browser script errors.

`tokens-and-contrast.json` records 18 checks of selected text/background pairs against a 4.5:1 minimum. This is not full accessibility certification: keyboard behaviour, focus visibility, control boundaries, responsive layouts, screen readers and all interactive states still need implementation and testing.

Regenerate locally from the repository root:

```sh
node output/xform-dark-directions/audit.mjs
node output/xform-dark-directions/render.mjs
```

The renderer starts a temporary loopback-only server, exports PNGs with Playwright, then closes the server and browser. It does not connect to the application APIs or authentication provider.

## Fonts and photography

Font files and SIL Open Font License notices are bundled under `assets/`. Exact distribution URLs are in `font-sources.json`. Official family references:

- [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed), [Manrope](https://fonts.google.com/specimen/Manrope).
- [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), [DM Sans](https://fonts.google.com/specimen/DM+Sans).
- [Sora](https://fonts.google.com/specimen/Sora), [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans), [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono).

The original editorial photograph is `assets/strength-editorial.png`, generated with the **built-in image-generation tool**, not the CLI. It is reused through CSS background positioning. All branding text, fonts, charts, controls and layouts are rendered from HTML/CSS for exact, reproducible typography. The complete generation prompt is in `image-generation-prompt.txt`.

`xform-three-dark-options.zip` contains exactly the three final PNGs.
