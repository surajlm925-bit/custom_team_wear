# Mockup Template Generation — AI Prompts & Logo Placement Spec

**Purpose:** Generate a one-time set of blank, logo-free garment template
images. These are stored once and reused for every order — the bot composites
the customer's actual logo onto the correct template at the correct zone to
produce a single preview mockup image, once payment is confirmed.

This is a **one-time asset generation task**, not a per-order AI call. It
stays consistent with tech.md's "no AI/LLM in the deterministic order flow"
principle — AI is used only to produce static template art up front; the
per-order compositing step itself is plain image manipulation (no AI, no
unpredictability, no per-order cost).

---

## 1. Why templates instead of "generate mockup per order"

Asking an image model to place a specific logo on a specific shirt on demand,
per order, is slow, costs money per call, and produces inconsistent placement
and framing between orders — bad for a bulk-order business where the ordering
company will compare their mockup to a colleague's. Generating the blank
templates once, then overlaying logos with regular image compositing code
(pixel-precise, instant, free), gives consistent, professional results every
time.

Sources referenced for the ghost-mannequin / clean-mockup generation approach
below: product photography guides on ghost-mannequin technique for apparel
([wearview.co](https://www.wearview.co/blog/ghost-mannequin-photography),
[pixelz.com](https://www.pixelz.com/blog/invisible-ghost-mannequin-photography/)),
and current (2026) AI mockup-prompt pattern guides
([skywork.ai](https://skywork.ai/blog/product-mockup-prompts-midjourney-2025/),
[mydesigns.io](https://mydesigns.io/blog/ai-t-shirt-design-generator/)).
Content was rephrased for compliance with licensing restrictions.

---

## 2. Template inventory

The mockup is a visualization aid, not a fabric sample — customers care about
seeing their logo on the garment *shape* they picked, not the material.
Fabric (dry-fit vs. cotton) makes no visible difference in a rendered mockup,
so templates are generated **per silhouette only** — round neck and polo —
not per product/material combination. This covers both the Basic/Standard/
Branded round-neck products and the Basic/Standard/Branded polo products in
the price book with a single shared template each.

| # | Template ID | Silhouette | View |
|---|---|---|---|
| 1 | `round_neck_front` | Round Neck | Front |
| 2 | `round_neck_back` | Round Neck | Back |
| 3 | `polo_front` | Polo | Front |
| 4 | `polo_back` | Polo | Back |

4 templates total cover every placement option in the client flow (left
chest, center front, upper back, sleeve, front+back all map onto these 4
front/back images) and every product in the price book (each product maps to
whichever of these two silhouettes it actually is).

---

## 3. Generation rules (apply to every prompt below)

To keep every template compositing-ready and visually consistent with each
other:

- **Same camera framing for all 4**: front-facing, straight-on, garment
  centered, filling ~80% of a square frame.
- **Ghost-mannequin style**: garment shown with natural 3D body-shaped drape
  (invisible wearer), not flat-lay — this is what makes a logo overlay look
  "worn" rather than "printed on a flat photo."
- **Neutral mid-grey background** (approx. RGB 128,128,128 / hex `#808080`,
  flat and seamless, no gradient) — a pure white background gives the
  white garments zero contrast against the backdrop and looks washed out.
  Mid-grey keeps the garment's edges, folds, and collar detail readable
  while staying neutral enough not to tint the fabric or the logo colors
  once composited later.
- **Zero branding**: no logo, no print, no text, no visible tags, no
  wrinkled/creased fabric across the chest, back, or sleeve areas — those
  zones must be smooth and clear since a logo will be placed there later.
- **Neutral, even studio lighting** — no strong shadows or highlights across
  the placement zones (a shadow there would show through the composited
  logo).
- **Consistent resolution**: generate all 4 at the same size —
  **2048×2048px, PNG**. Consistent resolution means one set of
  placement-zone coordinates works across all templates.
- **Same garment color for all templates: plain white** — this is the
  "canvas," not a customer-selectable colorway. (If you want colored mockups
  later, that's a v2 feature — regenerate the same prompts with a colour
  swap instruction.)
- **Fabric texture kept generic** — since one template now stands in for
  both dry-fit and cotton versions of that silhouette, don't over-specify
  fabric texture (no "glossy synthetic" or "cotton weave" detail) — a
  neutral, smooth fabric look reads fine as either material in a mockup.

---

## 4. Prompts

Paste these into your preferred image model (Midjourney, DALL·E 3, Gemini/Nano
Banana, Adobe Firefly, etc.). Where a tool has aspect-ratio/quality flags,
target a 1:1 square, highest quality setting.

### 4.1 Round Neck — Front
```
Ghost mannequin studio product photo of a completely blank plain white
round-neck t-shirt, front-facing, straight-on camera angle, garment
centered and filling most of a square frame. Invisible mannequin/body
shape implied only by realistic natural fabric drape — no visible
mannequin, no visible model, no visible skin. No logo, no print, no text,
no graphics, no tags anywhere on the garment. Smooth, crease-free fabric
across the entire chest and torso area, ribbed crew-neck collar. Flat
neutral mid-grey background (hex #808080), seamless, no gradient, no
shadows on the background. Soft, even, shadowless studio lighting across
the whole garment, especially the chest area. Ultra-sharp focus, high
resolution, e-commerce product photography style, 2048x2048 square.
```

### 4.2 Round Neck — Back
```
Ghost mannequin studio product photo of a completely blank plain white
round-neck t-shirt, back view, straight-on camera angle, garment centered
and filling most of a square frame. Invisible mannequin/body shape implied
only by realistic natural fabric drape — no visible mannequin, no visible
model, no visible skin. No logo, no print, no text, no graphics anywhere on
the garment. Smooth, crease-free fabric across the entire upper-back and
back-torso area. Flat neutral mid-grey background (hex #808080), seamless,
no gradient, no shadows on the background. Soft, even, shadowless studio
lighting across the whole garment, especially the upper-back area.
Ultra-sharp focus, high resolution, e-commerce product photography style,
2048x2048 square.
```

### 4.3 Polo — Front
```
Ghost mannequin studio product photo of a completely blank plain white
polo t-shirt with a ribbed collar and 2-button placket, front-facing,
straight-on camera angle, garment centered and filling most of a square
frame. Invisible mannequin/body shape implied only by realistic natural
fabric drape — no visible mannequin, no visible model, no visible skin. No
logo, no print, no text, no graphics, no tags anywhere on the garment.
Smooth, crease-free fabric across the entire chest and torso area, collar
neatly laid flat. Flat neutral mid-grey background (hex #808080),
seamless, no gradient, no shadows on the background. Soft, even,
shadowless studio lighting across the whole garment, especially the chest
area. Ultra-sharp focus, high resolution, e-commerce product photography
style, 2048x2048 square.
```

### 4.4 Polo — Back
```
Ghost mannequin studio product photo of a completely blank plain white
polo t-shirt, back view, straight-on camera angle, garment centered and
filling most of a square frame. Invisible mannequin/body shape implied
only by realistic natural fabric drape — no visible mannequin, no visible
model, no visible skin. No logo, no print, no text, no graphics anywhere on
the garment. Smooth, crease-free fabric across the entire upper-back and
back-torso area. Flat neutral mid-grey background (hex #808080), seamless,
no gradient, no shadows on the background. Soft, even, shadowless studio
lighting across the whole garment, especially the upper-back area.
Ultra-sharp focus, high resolution, e-commerce product photography style,
2048x2048 square.
```

---

## 5. Quality checklist before accepting a generated template

Reject and regenerate if any of these are true:
- [ ] Any visible logo, text, wrinkle-print, or tag anywhere on the garment
- [ ] Visible mannequin, hanger, model skin, or body parts
- [ ] Background isn't a flat, neutral mid-grey, or has a visible
      shadow/gradient
- [ ] Garment isn't centered, or framing differs noticeably from the other
      templates (camera distance/angle must match across the full set)
- [ ] Visible creases or fabric distortion across the chest, upper-back, or
      sleeve zones specifically (edges of the garment can drape naturally,
      but the placement zones must stay flat and clean)

---

## 6. Storage convention

Store the 4 accepted PNGs as:

```
assets/mockup-templates/
├── round_neck_front.png
├── round_neck_back.png
├── polo_front.png
└── polo_back.png
```

`assets/mockup-templates/` should be committed to the repo (they're static
public brand assets, not secrets) once generated.

### Mapping products to templates

Every product in the price book (`src/pricing/priceBook.ts`) maps to one of
the two silhouettes, regardless of tier or fabric:

| Product ID | Template used |
|---|---|
| `dry_fit_round_neck` | `round_neck_*` |
| `cotton_round_neck` | `round_neck_*` |
| `dry_fit_polo` | `polo_*` |
| `cotton_polo` | `polo_*` |

---

## 7. Placement zones (per client's Logo Placement Flow spec)

These map the 5 customer-facing placement options onto the front/back
template pair. Coordinates are given as **percentages of image
width/height** (resolution-independent) so they work regardless of final
export size, as long as both silhouettes' front/back pairs share the same
framing (§3).

The percentages below are standard apparel-mockup placement conventions and
are a starting point — nudge them after looking at your actual generated
templates, since exact chest/collar proportions vary slightly by AI output.

| Placement option | Template used | Zone (x%, y%, width%, height%) | Notes |
|---|---|---|---|
| 1. Left Chest | `*_front` | x: 58–78%, y: 22–35% | "Left chest" is the wearer's left = image-right in a front-facing photo |
| 2. Center Front | `*_front` | x: 30–70%, y: 25–55% | Large centered zone, scales with logo aspect ratio |
| 3. Upper Back | `*_back` | x: 25–75%, y: 15–35% | Shoulder-blade area |
| 4. Sleeve | `*_front` | x: 78–92%, y: 30–45% | Left sleeve (image-right); mirror to 8–22% for right sleeve if needed |
| 5. Front + Back | `*_front` **and** `*_back` | Left Chest zone + Upper Back zone | Two separate composite operations, one per template |

Data capture fields from the client spec (`logo_placement`,
`application_method`, etc.) slot directly into the existing `OrderData`
shape — see §8 for how this connects to the current codebase.

---

## 8. How this plugs into the existing bot (next implementation step)

Not part of this deliverable, but for planning: once templates + zones
exist, the pipeline per order would be:

1. Extend the conversation flow: after S4 (print method), add a new step —
   ask logo placement (5 buttons) → ask print/embroidery (3 buttons) — before
   S5 (city). This mirrors the client's flow exactly and reuses the same
   button-menu pattern already used throughout `orderFlow.ts`.
2. Store `logoPlacement` and `applicationMethod` on `OrderDraft`/`OrderData`,
   add matching columns to the Sheet schema (`src/sheets/schema.ts`).
3. On logo upload (S9), once payment is confirmed (admin ✅), run a
   compositing step: map the order's `productId` to `round_neck` or `polo`
   (§6), load the matching template PNG(s) for the relevant view(s),
   resize/fit the customer's logo into the matching zone from §7, flatten
   to a single PNG, and send it to the customer as the "Your Mockup" image
   alongside the confirmation DM.
4. Recommended library: `sharp` (already a common choice for Node image
   compositing — fast, no native build issues on Vercel) — `sharp().composite([{ input: logoBuffer, top, left }])`.

I can build this pipeline next if you'd like — happy to start with the
conversation flow changes (logo placement + print/embroidery questions)
first, since template generation is a manual step you'll need to do outside
this chat (I don't have an image-generation tool available to create them
directly).
