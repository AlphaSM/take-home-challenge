---
name: Deep Enterprise Dark Mode
colors:
  surface: '#121315'
  surface-dim: '#121315'
  surface-bright: '#38393b'
  surface-container-lowest: '#0d0e10'
  surface-container-low: '#1b1c1e'
  surface-container: '#1f2022'
  surface-container-high: '#292a2c'
  surface-container-highest: '#343537'
  on-surface: '#e3e2e5'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e3e2e5'
  inverse-on-surface: '#303033'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#121315'
  on-background: '#e3e2e5'
  surface-variant: '#343537'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '450'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 24px
  container-max: 1440px
---

## Brand & Style

This design system is engineered for **Clever Dictate**, a high-density AI dictation tool tailored for developers and technical power users. The brand personality is hyper-efficient, technical, and authoritative. It draws heavily from **Minimalism** and **Modern Enterprise** aesthetics, focusing on high-contrast readability and "Information Density."

The UI evokes a sense of "The Command Center"—a place where complex AI operations are monitored and controlled. Instead of organic soft shadows, the system uses structural rigidity and razor-sharp precision. The atmosphere is professional and "lights-out," reducing eye strain during long-form technical dictation sessions.

## Colors

The palette is optimized for OLED and deep-dark environments. 
- **Base (#0A0B0D):** Used for the root background to create infinite depth.
- **Surface (#12141C):** Used for cards, sidebars, and elevated containers. 
- **Electric Cobalt (#3B82F6):** Represents the "AI Core"—used for primary actions and active states.
- **Hyper-Purple (#8B5CF6):** Designated for VLM (Vision Language Model) features and advanced intelligence modules.
- **Status Colors:** Muted Emerald for success/active mic states and Crimson Red for destructive actions or connectivity errors.

Text hierarchy is strictly enforced: pure white-off for content (#F9FAFB) and a diminished gray (#9CA3AF) for metadata and labels to maintain a clear visual stack.

## Typography

The system utilizes a dual-font strategy. **Inter** handles all UI labels, headings, and standard body text, providing high legibility in a compact footprint. **JetBrains Mono** is reserved for developer-centric contexts: code snippets, terminal outputs, shortcut hints, and metadata labels.

For mobile layouts, `headline-xl` should scale down to 24px to ensure the high-density layout remains usable without horizontal scrolling. All monospaced elements should use a slightly increased letter-spacing to enhance character distinction at small sizes.

## Layout & Spacing

This design system uses a **fixed-fluid hybrid grid**. The core application workspace is fluid to maximize dictation real estate, while sidebars and inspectors are fixed at technical widths (e.g., 280px or 320px).

A strict **4px baseline grid** governs all spacing. 
- **Desktop:** 12-column grid, 24px margins, 16px gutters.
- **Mobile:** 4-column grid, 16px margins, 12px gutters.

The "high-density" requirement means vertical padding in lists and inputs is minimized (8px to 12px) to ensure as much data as possible is visible above the fold.

## Elevation & Depth

This design system eschews soft shadows in favor of **Tonal Layering** and **Subtle Outlines**. Depth is communicated through color-stepping and luminosity.

- **Level 0 (Base):** #0A0B0D.
- **Level 1 (Surface):** #12141C.
- **Level 2 (Overlay):** #1E202A.

Every elevated element (cards, modals, dropdowns) must feature a **1px inner border** using `rgba(255, 255, 255, 0.08)`. This creates a "sharp edge" look that simulates a glass-cut finish without the blur of traditional shadows. Active states for inputs or primary containers should use a 1px border of the Primary Accent color (#3B82F6) to provide a "glow" effect that is structurally contained.

## Shapes

The shape language is rigid and professional. We use **Soft (Level 1)** roundedness across the system.

- **Standard Elements (Buttons, Inputs, Chips):** 6px radius.
- **Containers (Cards, Modals):** 8px radius.
- **Interactive States:** On hover, shapes do not change radius, but the border luminosity increases. 

Avoid completely round (pill-shaped) elements to maintain the "enterprise tool" feel; the only exception is the "Recording" status indicator, which remains a perfect circle to denote activity.

## Components

### Buttons
- **Primary:** Solid #3B82F6 with white text. 6px radius. No shadow.
- **Ghost:** Transparent background, 1px #3B82F6 border.
- **Monospace Tool:** JetBrains Mono text, #12141C background, 1px subtle white border. Used for "Copy Code" or "CLI" actions.

### Inputs
- **Field:** #0A0B0D background with a 1px `rgba(255,255,255,0.08)` border. On focus, the border changes to Primary Accent with a subtle 2px outer ring (no blur).
- **Labels:** Always use JetBrains Mono at 12px, uppercase, placed above the field.

### Chips / Badges
- **Status:** Small, 4px radius. Use Success Emerald or Destructive Crimson with 10% background opacity and 100% stroke opacity for a "high-tech" indicator look.

### Cards
- Surfaces are #12141C. 
- Must include a 1px top-edge highlight (`rgba(255,255,255,0.12)`) to separate stacked containers in deep dark mode.

### Dictation Waveform
- The waveform should use a gradient of Primary to Secondary (#3B82F6 to #8B5CF6) with a 2px stroke width, presented on a Level 0 background for maximum contrast.