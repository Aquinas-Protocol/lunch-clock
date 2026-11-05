# DESIGN.md — Lunch Clock

The single source of truth for how this app looks and feels. Build only from these tokens; if something isn't here, add it here first.

## Mood

Warm editorial. A quiet, paper-like page with one confident serif numeral and one black button. Calm, boutique, unhurried. The time is the hero; everything else steps back.

## Color

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F4EEE4` | Page background |
| `--card` | `#FBF8F2` | Raised surfaces (coach card, status chip) |
| `--ink` | `#1C1A17` | Primary text, primary button fill |
| `--ink-soft` | `#4A453D` | Secondary text on paper |
| `--muted` | `#8A8173` | Captions, eyebrows, quiet buttons |
| `--hairline` | `#E3DACB` | Dividers, progress track |
| `--terracotta` | `#C8684A` | Accent dot, progress fill, focus ring, confirm text |
| `--on-ink` | `#F7F2EA` | Text on the black button |

One accent only. Terracotta never fills large areas; it marks things (a dot, a line, a ring).

## Typography

| Role | Family | Size / line-height | Weight | Notes |
|---|---|---|---|---|
| Display numerals | Instrument Serif *Italic* | 112 / 0.9 | 400 | `font-variant-numeric: tabular-nums lining-nums`, letter-spacing −0.02em |
| Display suffix (PM) | Instrument Serif *Italic* | 40 / 1 | 400 | Baseline-aligned to the numerals |
| Headline | Instrument Serif | min(60px, (100vw − 48px) / 6) / 1 | 400 | Always one line (`nowrap`); mix roman with one *italic* word |
| Body | Geist | 17 / 1.45 | 400 | `--ink-soft` |
| Label (buttons) | Geist | 17 / 1 | 500 | Never below 16px (prevents iOS zoom) |
| Caption | Geist | 13 / 1.3 | 500 | `--muted` |
| Eyebrow | Geist | 12 / 1 | 600 | Uppercase, letter-spacing 0.14em, `--muted` |

Fonts are self-hosted (latin subsets only); no CDN.

## Spacing

8px scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Page gutter 24. Respect `env(safe-area-inset-*)` on every edge.

## Radius & elevation

- Pill: fully rounded (`999px`).
- Card: 20px radius, 1px `--hairline` border, shadow `0 1px 0 rgba(28,26,23,.04), 0 12px 32px -16px rgba(28,26,23,.18)`.

## Components

**Brand mark** — the provided logo (`brand/logo.jpg`, a blue figure on a yellow sun), 32px in the top bar, `mix-blend-mode: multiply` so its white ground disappears into the paper. Also the Home Screen icon. Regenerate with `npm run icons`.

**Primary pill** — full-width, 60px tall, `--ink` fill, `--on-ink` label, a 8px `--terracotta` dot before the label. Pressed: scale 0.97 + slightly lighter fill, 120ms. Focus-visible: 3px `--terracotta` ring offset 3px.

**Quiet button** — text only, Geist 15/500 `--muted`, min 44×44 hit area. Confirm state turns the text `--terracotta` ("Tap again to cancel") for 3 s, then reverts.

**Progress line** — 2px `--hairline` track, `--terracotta` fill that drains right-to-left as lunch elapses, with a 6px terracotta dot at the leading edge.

**Status line** — caption under the progress line, shown only when something is wrong (notifications off, not installed, reminder failed). Silent when the reminder is set.

**Coach card** — `--card` surface explaining Add to Home Screen, with the Share glyph inline.

## Screens

1. **Ready** — eyebrow (logo + weekday · date), one-line headline "Ready for *lunch?*" (no body copy), Take Lunch pill pinned to the bottom (thumb zone). Coach card above the pill when not installed.
2. **On lunch** — eyebrow "On lunch" with a softly pulsing terracotta dot, body "Clock back in at", display numerals + PM, caption "Eastern Time · EST", progress line, "28 min left", status line (problems only), quiet Cancel lunch at the bottom.

Lunch ending simply returns to **Ready**.

## Motion

- Screen change: content rises 12px and fades in, 420ms `cubic-bezier(.2,.8,.2,1)`, numerals staggered 60ms after the label.
- Live dot: opacity pulse 2.4s ease-in-out infinite.
- `prefers-reduced-motion: reduce` → no transforms, no pulse, instant swaps.

## Interaction rules (from Vercel's Web Interface Guidelines)

- Hit targets ≥ 44px; the primary pill is 60px.
- `touch-action: manipulation` on controls (no double-tap zoom); custom `-webkit-tap-highlight-color: transparent`.
- Never disable browser zoom.
- Optimistic: the clock-in time appears the instant the button is tapped; the reminder is set in the background and reports its result in the status line.
- Destructive actions confirm (Cancel needs a second tap).
- `overscroll-behavior: contain` on the page so it feels like an app, not a web page.

## Copy voice

Short, warm, plain. Times always say the zone ("12:47 PM ET"). No exclamation marks except "Time to clock in" is allowed to feel like a nudge.
