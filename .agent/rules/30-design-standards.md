---
trigger: always_on
---

# Design Standards (FormWaypoint 2026)

## 1. Core Aesthetic: 'Modern Logistics'

**Goal:** A clean, data-dense interface that simplifies complex logistics workflows.
**Keywords:** Precise, Technical, High-Contrast, Information-Dense.

### Strict Constraints

- **No Arbitrary Values:** Standard Tailwind spacing only.
- **No Pure Black:** Use slate-900 or zinc-900 for text.
- **Information Density:** Logistics users need to see data. Use 	ext-xs or 	ext-sm appropriately for tables.
- **Borders:** Subtle order-slate-200 for separation.

## 2. Component Blueprints

### Cards & Panels
- **Background:** g-white (or g-slate-900 for dark mode)
- **Border:** order border-slate-200 (Dark: order-slate-800)
- **Radius:** ounded-lg (Sharper than consumer apps)

## 3. Color System

| Role | Tailwind |
| :--- | :--- |
| **Primary** | 	ext-blue-600 / g-blue-600 (Trust, Professional) |
| **Surface** | g-slate-50 |
| **Status** | Standardize shipment statuses (Draft=Gray, Booked=Blue, Transit=Amber, Delivered=Green) |

