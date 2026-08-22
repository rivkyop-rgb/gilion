---
name: Yomon Editorial Management
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf1'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fa'
  on-surface: '#111c2c'
  on-surface-variant: '#43474e'
  inverse-surface: '#263142'
  inverse-on-surface: '#ebf1ff'
  outline: '#74777f'
  outline-variant: '#c4c6cf'
  surface-tint: '#476083'
  primary: '#000613'
  on-primary: '#ffffff'
  primary-container: '#001f3f'
  on-primary-container: '#6f88ad'
  inverse-primary: '#afc8f0'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#040607'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1f20'
  on-tertiary-container: '#848688'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#afc8f0'
  on-primary-fixed: '#001c3a'
  on-primary-fixed-variant: '#2f486a'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#f9f9ff'
  on-background: '#111c2c'
  surface-variant: '#d8e3fa'
typography:
  display-lg:
    fontFamily: Libre Caslon Text
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
  headline-lg:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  caption:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1440px
---

## Brand & Style

This design system is built for the high-pressure, high-precision world of editorial management. It evokes the prestige of traditional broadsheet journalism while providing the efficiency of modern SaaS. The brand personality is **authoritative, institutional, and precise**.

The visual style is **Corporate / Modern** with a strong **Editorial** influence. It prioritizes information density and clarity, using a sophisticated color palette inspired by ink and parchment. The interface is designed for power users who manage complex workflows, requiring a balanced mix of "utilitarian" functional areas and "premium" content previews. 

Key attributes:
- **Heritage Meets Tech:** Blending classic serif typography with a rigid, functional grid.
- **Operational Clarity:** High-contrast status indicators to manage deadlines and publishing states.
- **RTL-First:** Optimized for Hebrew layouts, ensuring natural flow and readability from right to left.

## Colors

The palette is anchored by **Deep Navy (#001F3F)**, representing the "Ink" and the authority of the institution. **Champagne Gold (#D4AF37)** is used sparingly for accents, high-level highlights, and premium interactions, echoing the provided logo's refined aesthetic.

- **Primary:** Navy is used for global navigation, primary buttons, and heavy headers.
- **Secondary:** Gold is reserved for active states, brand-critical accents, and "Published" status indicators.
- **Backgrounds:** A hierarchy of crisp white (#FFFFFF) and light gray (#F8F9FA) creates clear visual separation between the workspace and the sidebar.
- **Semantic Palette:** Functional status is communicated via Emerald (Success), Amber (Pending/Warning), and Rose (Overdue/Error).

## Typography

The typography system uses a dual-font strategy to balance editorial prestige with functional utility.

- **Editorial (Libre Caslon Text):** Used for headlines, article titles, and display moments. It provides the "Newspaper" feel and establishes hierarchy in content-heavy views.
- **UI & Operations (Hanken Grotesk):** A sharp, modern sans-serif used for all functional elements, labels, and body text. It ensures legibility in dense data tables and management panels.
- **Technical (JetBrains Mono):** Used for metadata, word counts, character counts, and publication timestamps to provide a distinct "data-driven" look.

All typography must respect RTL alignment, with proper tracking and leading adjustments for Hebrew character sets.

## Layout & Spacing

The layout utilizes a **Fixed Grid** for main dashboard views and a **Fluid Content Area** for the editorial workspace.

- **Grid Model:** A 12-column grid system with 16px gutters. In RTL mode, Column 1 starts from the right.
- **Density:** The system uses a 4px base unit. Spacing is kept tight (8px/12px) in management lists to maximize data visibility, while expanded (24px/32px) in reading and editing modes to reduce cognitive load.
- **Sidebar:** A fixed 280px right-hand sidebar houses primary navigation. A collapsible 320px left-hand panel is used for metadata and contextual tools.
- **Breakpoints:**
  - Mobile (<768px): Single column, 16px margins.
  - Tablet (768px - 1024px): 8-column grid, fluid margins.
  - Desktop (>1024px): 12-column grid, 32px margins.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than aggressive shadows, maintaining a clean, "printed" feel.

- **Base Layer:** #F8F9FA (Background).
- **Surface Layer:** #FFFFFF (Cards, Input areas). Surfaces use a 1px border (#E2E8F0) to define boundaries.
- **Elevation 1:** Used for hover states on list items. A very subtle, diffused shadow: `0 2px 4px rgba(0, 31, 63, 0.05)`.
- **Elevation 2:** Used for active modals and dropdown menus. A more pronounced navy-tinted shadow: `0 8px 16px rgba(0, 31, 63, 0.1)`.
- **Active State:** Items in an "active" or "selected" state receive a 2px Gold left-border (in RTL, this is a right-border).

## Shapes

The shape language is **Professional and Controlled**. 

- **Standard Radius:** 8px (0.5rem) for cards, buttons, and input fields. This provides a modern touch without appearing overly "bubbly" or consumer-grade.
- **Large Radius:** 16px (1rem) for large container sections or promotional banners.
- **Interactive Elements:** Buttons maintain the 8px radius to feel substantial and clickable.
- **Data Tags:** Chips and status badges use a "soft" 4px radius or are fully rounded (pill-shaped) depending on their categorization (Tags vs Status).

## Components

- **Buttons:** Primary buttons are Solid Navy with White text. Secondary buttons use a Navy outline. Ghost buttons use Navy text with no border. Gold is reserved for "Highlight" or "Premium" actions.
- **Input Fields:** 8px rounding, 1px light gray border. On focus, the border transitions to Navy with a 2px subtle Gold glow. Labels are always positioned above the field in Hanken Grotesk Bold.
- **Status Chips:** Small, high-contrast badges. 
    - *Draft:* Light Gray background / Dark Gray text.
    - *Ready:* Emerald background / White text.
    - *Delayed:* Amber background / Black text.
    - *Alert:* Rose background / White text.
- **Cards:** White background, 1px border, 8px radius. Used for article previews and dashboard widgets.
- **The "Editorial Bar":** A specialized sticky header for the editor view containing word counts (Mono font), save status, and primary "Publish" (Gold) action.
- **Data Tables:** Highly condensed. Row height 40px. Zebra striping using #F8F9FA. Horizontal borders only.