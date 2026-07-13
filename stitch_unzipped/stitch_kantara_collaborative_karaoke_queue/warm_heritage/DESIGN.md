---
name: Warm Heritage
colors:
  surface: '#fbf9f5'
  surface-dim: '#dcdad6'
  surface-bright: '#fbf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ef'
  surface-container: '#f0eeea'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e4e2de'
  on-surface: '#1b1c1a'
  on-surface-variant: '#444840'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f0ed'
  outline: '#757870'
  outline-variant: '#c5c8be'
  surface-tint: '#54634a'
  primary: '#54634a'
  on-primary: '#ffffff'
  primary-container: '#a7b79a'
  on-primary-container: '#3a4832'
  inverse-primary: '#bbccae'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#745663'
  on-tertiary: '#ffffff'
  tertiary-container: '#cca8b7'
  on-tertiary-container: '#573c49'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e8c9'
  primary-fixed-dim: '#bbccae'
  on-primary-fixed: '#121f0c'
  on-primary-fixed-variant: '#3d4b34'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1b1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffd8e8'
  tertiary-fixed-dim: '#e2bccc'
  on-tertiary-fixed: '#2b1520'
  on-tertiary-fixed-variant: '#5a3f4b'
  background: '#fbf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2de'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 64px
  stack-sm: 16px
  stack-md: 32px
  stack-lg: 64px
---

## Brand & Style

The design system is built on a narrative of "Tactile Modernism." It bridges the gap between high-end editorial print and contemporary digital interfaces. The personality is sophisticated, calm, and intentionally human, moving away from the sterile "tech-white" aesthetic toward a gallery-like experience.

The design style utilizes a **Minimalist-Premium** approach with **Glassmorphism** influences. It prioritizes high-quality negative space, fluid motion, and organic depth. The emotional response is one of quiet confidence and enduring quality, catering to users who value intentionality and a premium tactile feel.

## Colors

The palette is anchored in organic warmth. We replace standard greys with "warm neutrals" to reduce eye strain and evoke the feel of premium heavy-stock paper.

- **Primary (Sage Green):** Used sparingly for key actions, active states, and brand moments.
- **Secondary/Dark (Charcoal):** Applied to high-contrast sections, footers, and primary headings to provide a grounded, authoritative weight.
- **Surface Layering:**
    - `Surface-Bright` (#FFFFFF): Used for the top-most elevated elements like cards or floating menus.
    - `Surface` (#F9F8F5): The standard background for most page content.
    - `Surface-Dim` (#F2F1EC): Used for recessed areas, gutters, or grouped background sections.

## Typography

The typography strategy pairs the friendly, open counters of **Plus Jakarta Sans** for headlines with the refined, technical precision of **Manrope** for functional text.

For large displays, use tight letter-spacing to create a "compact-premium" look. Body text should maintain generous line-height to ensure readability against the warm neutral backgrounds. Labels and small metadata should occasionally use uppercase styling with slight letter spacing to differentiate from body prose.

## Layout & Spacing

Following a strict Apple-inspired spacing logic, this design system utilizes a generous 8px base grid. 

- **Layout Model:** A 12-column fluid grid for desktop with 24px gutters. 
- **Vertical Rhythm:** Large vertical gaps (64px+) between major sections to allow the content to breathe. 
- **Margins:** Desktop views should utilize wide margins (64px) to center the focus, while mobile views compress to 20px to maximize screen real estate. 
- **Safe Areas:** Elements never crowd the edges; everything is inset with consistent padding to maintain the "contained gallery" feel.

## Elevation & Depth

This design system uses **Layered Surfaces** and **Ambient Blurs** instead of traditional hard shadows.

- **Soft Borders:** Surfaces are defined by thin 1px strokes in a color slightly darker than the background (e.g., `Surface-Dim` + 5% contrast).
- **Ambient Shadows:** For featured media or album artwork, use "Apple Music" style shadows. This involves a low-opacity, large-radius blur of the image itself (the "glow" effect) placed behind the element to create a vibrant, soft depth.
- **Glassmorphism:** Navigation bars and floating headers should use a 20px backdrop blur with a 70% opacity `Surface-Bright` tint.
- **Z-Axis Hierarchy:**
    - Level 0: `Surface` (Background)
    - Level 1: `Surface-Bright` (Cards/Containers)
    - Level 2: `Surface-Bright` + Soft Ambient Shadow (Modals/Popovers)

## Shapes

The shape language is "Hyper-Rounded." We move away from industrial corners to embrace soft, organic radii that feel comfortable and premium.

Primary containers (Cards, Main Content Blocks) must use `radius-xl` (32px). Secondary elements like buttons and input fields use `radius-lg` (24px). This high level of roundedness requires internal padding to be scaled accordingly to avoid "crowded corners."

## Components

- **Buttons:** Primary buttons use the Sage Green (#A7B79A) with Charcoal text (#1E1E1E). They should be 48px or 56px in height with a `radius-lg` (24px).
- **Cards:** Cards should be `Surface-Bright` with a 1px soft border and the 32px `radius-xl`. Padding inside cards should be at least 24px.
- **Inputs:** Text fields use `Surface-Dim` as the base with no shadow, a subtle 1px border, and 24px corners. Labels sit above the input in `label-sm` Charcoal.
- **Ambient Media:** All images or album art should feature a 12px-16px corner radius and a soft, color-matched ambient blur behind them to lift them off the warm surface.
- **Lists:** List items are separated by thin horizontal rules in the `Surface-Dim` color, with generous vertical padding (16px-20px) for a luxurious feel.