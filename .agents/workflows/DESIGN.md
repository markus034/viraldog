---
description: Design
---

## Brand & Style

This design system is built upon the principles of intentionality, precision, and effortless sophistication. It draws heavily from **Minimalism** and **High-End Corporate** aesthetics, prioritizing the subject matter through generous negative space and a rigorous typographic hierarchy. 

The target audience consists of discerning users who value clarity over clutter. The UI should evoke a sense of calm authority—a digital environment where every pixel serves a purpose. Visual interest is generated not through decorative elements, but through the perfect balance of scale, subtle depth, and a refined color palette. The overall experience should feel premium, responsive, and intellectually accessible.

## Colors

The palette is anchored in a monochromatic foundation to ensure that content remains the focal point. 

- **Primary Blue (#0071E3):** Reserved strictly for interactive elements, primary calls to action, and meaningful links. It acts as a beacon of utility within the neutral landscape.
- **Deep Black (#1D1D1F):** Used for primary headings and body text to ensure maximum legibility and a grounded feel.
- **Subtle Gray (#F5F5F7):** Applied to large background sections to create soft contrast against pure white cards or containers.
- **Muted Gray (#86868B):** Dedicated to secondary information, captions, and deactivated states.

The color strategy relies on high-contrast pairings (White/Black) for readability and low-contrast pairings (Off-white/White) for structural depth.

## Typography

The design system utilizes **Inter** for its neutral, systematic, and highly legible characteristics, mimicking the clean sans-serif profile of premium tech interfaces. 

**Hierarchy Rules:**
- **Scale:** Use dramatic size differences between display headers and body text to create a clear entry point for the eye.
- **Tracking:** Apply slight negative letter-spacing to larger headlines (-0.01em to -0.02em) to maintain a "tight," professional look.
- **Weight:** Reserve 600 (Semibold) for headlines to ensure they command attention, while 400 (Regular) provides a clean, breathable reading experience for body copy.
- **Mobile Adaptation:** Headlines must scale down aggressively on mobile to prevent awkward line breaks while maintaining visual impact.

## Layout & Spacing

This design system follows a **Fixed Grid** model for desktop to ensure content remains centered and readable, transitioning to a **Fluid Grid** for mobile devices. 

- **The 8px Rhythm:** All spacing (padding, margins, gaps) must be a multiple of 8px. This creates a predictable and harmonious vertical rhythm.
- **Generous Margins:** Content should never feel cramped. Use 120px to 160px of vertical padding between major page sections to create a "gallery" effect.
- **Breakpoints:**
  - **Mobile:** < 768px (4 columns, 20px margins)
  - **Tablet:** 768px - 1024px (8 columns, 32px margins)
  - **Desktop:** > 1024px (12 columns, fixed 1200px max-width)

## Elevation & Depth

Depth is conveyed through **Tonal Layering** and **Ambient Shadows**, avoiding harsh borders.

- **Surface Levels:** The base background is often `#F5F5F7`. Primary cards and containers are `#FFFFFF`. This subtle shift creates "soft" elevation.
- **Shadow Profile:** Use extremely soft, large-radius shadows. For example: `0 10px 40px rgba(0,0,0,0.04)`. Shadows should feel like a soft glow rather than a hard drop.
- **Interactive Depth:** On hover, elements may slightly scale (e.g., 1.02x) or their shadow may deepen marginally to indicate "lift."

## Shapes

The shape language is defined by large, friendly corner radii that soften the professional tone. 

- **Standard Components:** Buttons and small input fields use a **0.5rem (8px)** radius.
- **Cards & Containers:** Major UI blocks (cards, modals) use a **1rem (16px) to 1.25rem (20px)** radius to create a distinct, modern silhouette.
- **Media:** Images and video players should always follow the container's roundedness to maintain a cohesive look.

## Components

### Buttons
- **Primary:** Solid `#0071E3` background with white text. Pill-shaped or 8px rounded. No border.
- **Secondary:** Transparent background with `#0071E3` text and a chevron icon. Focus on link-style interaction rather than heavy boxes.

### Cards
- **Product Cards:** Pure white background, 18px rounded corners, and the subtle ambient shadow defined in the Elevation section. Content should have at least 32px of internal padding.

### Input Fields
- **Text Inputs:** Light gray background (`#F5F5F7`) with no border. On focus, a subtle 2px primary blue outline appears.

### Sliders & Pagination
- **Sliders:** Use thin, horizontal bars for progress. Active state in Primary Blue, inactive in light gray.
- **Pagination:** Minimalist dots. The active dot is slightly larger or darker to indicate the current position.

### Iconography
- Use ultra-thin or "light" weight line icons. Avoid filled icons unless they represent an active state. Icons should be sized precisely to 20px or 24px.