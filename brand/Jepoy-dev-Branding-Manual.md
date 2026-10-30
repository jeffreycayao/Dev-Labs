# Jepoy.dev — Brand & AI Production Manual

Version: 1.0 | Established: 3 October 2026 | Owner: Jeffrey Cayao

Applies to social creatives, captions, carousels, video scripts, thumbnails, website graphics, and brand assets.

## 1. How AI must use this manual

Read this entire manual before producing brand content. Follow the latest explicit user brief first, then this manual, then platform requirements. Treat examples as style references, not verified claims. Produce usable final content rather than an explanation of the process unless asked.

The colors below are the standardized production palette chosen for this brand, based on the approved visual direction. They are not measured hex values extracted from every generated image. Generated lettering is custom artwork; the fonts below are reproducible standards for new work, not claimed identifications of the image lettering.

Never invent results, credentials, prices, testimonials, dates, product capabilities, or platform policies. For missing essential facts, ask one focused question. For routine visual choices, use this manual and proceed.

## 2. Brand identity and positioning

| Item | Standard |
| --- | --- |
| Brand | Jepoy.dev |
| Person | Jeffrey Cayao; Jepoy in casual content |
| Display spelling | Jepoy.dev in prose; JEPOY.DEV in logo artwork |
| Core headline | Build it. Ship it. |
| Supporting line | Learn. Build. Launch. |
| Topic line | Code • AI • Automation |
| Brand role | Practical developer coach and builder |
| Audience | Filipino learners, vibe coders, developers, freelancers, and business owners learning to build useful software |
| Promise | Help people understand, build, and ship useful systems with practical guidance |
| Personality | Direct, curious, approachable, technically grounded, playful |

Explain what someone can build, how it works, and how they can use or monetize the skill. Connect learning to useful outcomes without promising earnings.

### Keep the business boundaries clear

Jepoy.dev owns personal education, coaching, advisory content, courses, tools, downloads, community, and development learning. Automatika owns agency implementation and delivery projects. Do not place the Automatika logo on Jepoy content by default or imply that agency results belong to the personal brand. Name the responsible business explicitly when presenting a case study. A shared founder or similar lime accent does not make the brands interchangeable.

## 3. Color system

| Token | Name | HEX | Primary use |
| --- | --- | --- | --- |
| `cream` | Warm cream | `#F6F1E6` | Main canvas, light cards, light lettering on dark |
| `charcoal` | Warm charcoal | `#27231B` | Headlines, text, logo tile, dark panels |
| `lime` | Electric lime | `#D5FA00` | Highlight, small CTA area, slash, key emphasis |
| `olive` | Muted olive | `#687323` | Orbit lines, secondary illustrations, code symbols |
| `blue` | Powder blue | `#BFD0EF` | Optional small pixel or secondary decorative accent |
| `white` | White | `#FFFFFF` | Optional clean surface or functional UI use |

Default light composition: approximately 65% cream, 22% charcoal, 8% lime, 4% olive, 1% blue. These are visual guides, not exact pixel quotas. Dark compositions can reverse cream and charcoal dominance; lime remains restrained.

### Color rules

- Use charcoal text on cream and charcoal text on lime.
- Use cream text on charcoal. Keep olive mainly decorative or reserve it for large labels after checking contrast.
- Do not use lime or powder blue for small text on cream. Do not use cream text on lime.
- Use one focal lime highlight per composition. A lime underline, stripe, badge, or small code accent is usually enough.
- Keep skin tones natural and hair black. Brand colors belong around the person, not in their facial features.
- Avoid the earlier purple/turquoise Joker palette. Avoid neon overload, rainbow gradients, and unrelated accent colors.
- Before delivery, check actual text/background contrast, including the effects of transparency. Target at least 4.5:1 for body text and 3:1 for large text.

## 4. Typography

These are newly defined production fonts. The generated comic lettering is not a downloadable font and must not be represented as one.

| Role | Font | Weight | Rule |
| --- | --- | --- | --- |
| Main headlines | Sora | 700–800 | Bold, short, sentence case |
| Body and captions inside graphics | Inter | 400–500 | Plain, spacious, easy to scan |
| Labels and CTA | Inter | 600–700 | Clear, compact, never tiny |
| Code and terminal labels | JetBrains Mono | 400–600 | Only for code or technical labels |
| Logo lettering | Approved JEPOY.DEV artwork | Asset | Reuse the original artwork; do not retype to simulate it |

Fallbacks: Sora → Inter → Arial → sans-serif; Inter → Arial → sans-serif; JetBrains Mono → Consolas → monospace. Do not replace missing fonts with an unrelated decorative font. Use no more than two families in one social graphic; a code block can use the mono family as a functional exception.

Headline line height: 1.05–1.15. Body line height: 1.4–1.6. Avoid stretched lettering and heavy tracking in sentences. Use uppercase for short labels and logo treatment, not whole paragraphs.

For a 1080 px wide graphic, start around 72–104 px for the headline, 32–44 px for body, and 28–36 px for support text. These are starting sizes: inspect the exported image at phone size and enlarge text if needed.

### Web design tokens

```css
:root {
  --brand-cream: #F6F1E6;
  --brand-charcoal: #27231B;
  --brand-lime: #D5FA00;
  --brand-olive: #687323;
  --brand-blue: #BFD0EF;
  --brand-white: #FFFFFF;
  --font-heading: "Sora", "Inter", Arial, sans-serif;
  --font-body: "Inter", Arial, sans-serif;
  --font-code: "JetBrains Mono", Consolas, monospace;
}
```

Load the chosen fonts in the implementation; declaring a font family alone does not install it.

## 5. Logos and icon usage

The core mark is a cream J with a coding bracket detail and a lime slash on a charcoal rounded tile. Use the same approved mark across every format.

| Asset | Use | Rule |
| --- | --- | --- |
| J monogram | Favicon, compact UI, small watermark | No wordmark at tiny sizes |
| Square logo | App tile, community icon, square placement | J with JEPOY.DEV below when space permits |
| Horizontal lockup | Website header, banner, footer | Mark left, JEPOY.DEV right |
| Illustrated portrait | Personal profile and educational content | Preserve original likeness; not a substitute for every logo placement |

Clear space: keep at least one-quarter of the mark height free around the logo. Preserve aspect ratio. Do not rotate, redraw, recolor, add effects, or remove the lime slash. Use the charcoal horizontal wordmark on cream or white; request a deliberate light-wordmark version for dark backgrounds.

AI-generated raster logos are concept assets. For exact repeatability, reuse approved files instead of generating the logo again in each image. Check transparency edges for holes, halos, and stray pixels before production. When vector output is needed, create and approve a faithful vector master; do not label a raster PNG as SVG.

Suggested exports: favicon PNG at 16, 32, and 48 px plus an ICO if required; square PNG at 512 and 1024 px; horizontal transparent PNG and a verified SVG master when available. These exports are production tasks, not files supplied by this manual.

## 6. Portrait and identity preservation — mandatory

Use Jeffrey's original photograph as the identity source. Previous generated avatars are style references only. Never progressively copy the face from generated images.

Preserve eye size and spacing, eyelids, eyebrows, nose width and tip, lips, expression, cheek shape, jaw, ears, head angle, facial asymmetry, and apparent age. Keep the original short black haircut: identical hairline, fringe, silhouette, texture direction, and volume. No longer anime spikes, green dye, extra hair volume, enlarged eyes, sharpened jaw, or superhero makeover.

Use gentle contour lines and light cel shading. Keep realistic proportions and natural skin color. Preserve the navy/black jacket, black shirt, and slim build unless the brief explicitly changes clothing or pose. Default to the original front-facing headshot for stronger likeness.

The comic inspiration is expressed through lettering and graphic energy, not clown makeup or a sinister character. No scars, threatening grin, scary eyes, or exaggerated teeth.

Compare every rendered face against the original at full size. If it drifts, reduce stylization and revise. Identity takes priority over illustration intensity.

## 7. Creative direction

Default look: cream editorial layout, bold charcoal headline, restrained lime emphasis, clean illustrated portrait when relevant, thin olive orbit lines, and a few powder blue pixels. Modern and playful, with enough empty space for readability.

Use code brackets, terminal symbols, simple browser cards, nodes, or flow connections only when they explain the subject. Avoid fake dashboards full of unreadable text, generic robot imagery, excessive circuitry, clutter, stock motivational poses, and decorative icons unrelated to the topic.

One creative should carry one message. Prefer one headline, one supporting sentence, and one action. Keep substantial explanations in the caption or later carousel slides. A tutorial screenshot may carry more information if it remains legible.

### Composition patterns

| Pattern | Composition | Best use |
| --- | --- | --- |
| Personal teaching | Short headline left; faithful portrait right | Coaching, introduction, opinion |
| Practical tutorial | Numbered steps or one clear code example | How-to and debugging |
| Before/after | Two clearly labeled states | Workflow or product improvement |
| Evidence | One real screenshot or metric with context | Case study and product proof |
| Announcement | Large headline, essential details, one CTA | Course, event, tool release |

Use genuine screenshots and approved testimonials. Redact private data. Do not fabricate client brands, interface screens presented as real, or performance numbers. Label conceptual UI as a concept when it could be mistaken for an actual product.

### Working canvases and safe areas

The sizes below are internal working templates, not claims about current platform limits. If a brief depends on exact platform upload specifications, verify the current requirements and preview the real placement.

| Deliverable | Working canvas | Layout guidance |
| --- | --- | --- |
| Profile or square icon | 1080 × 1080 | Face and name inside central 75–80% circle |
| Square feed post | 1080 × 1080 | At least 72 px inner margin |
| Portrait feed/carousel | 1080 × 1350 | At least 80 px inner margin |
| Stories/Reels/TikTok frame | 1080 × 1920 | Keep important content away from top/bottom controls and right action rail; preview in platform |
| Wide cover working master | 2032 × 774 | Keep key content centered; leave lower-left overlap area clear; test desktop and mobile crops |
| Video thumbnail | 1920 × 1080 | Few large words; recognizable subject; preview at small size |

Never promise one cover crop works on every device. Reposition content after a placement preview if the face, title, or name is clipped. Do not bake a crop guide or platform UI into the delivered creative.

## 8. Writing voice

Default language: natural Taglish for Facebook and Philippine community audiences. Use direct English when the brief requests it or the audience benefits from it. LinkedIn defaults to professional English with personality. Never translate every sentence into two languages.

Write like Jepoy explaining something to a capable friend: practical, direct, technically informed, and occasionally amused by how fast things have changed. Teach a useful point, show a concrete example, and explain the next move. Avoid canned guru language.

### Rules for captions

- Start with a concrete hook: a problem, surprising observation, or specific outcome.
- Use short paragraphs, usually one or two sentences. Broken-line copy should feel spoken, not mechanically split after every few words.
- Explain technical terms when the audience needs them. Keep code/API/product names accurate.
- Use one CTA that matches the actual destination and offer.
- Default to 0–2 emojis and 0–3 relevant hashtags. Add more only when requested.
- Humor can include mild self-aware exaggeration or playful frustration. Strong profanity is opt-in; do not insert it into every post.
- Never invent a personal story for Jeffrey. First-person posts must rely on facts supplied by him.
- Do not suggest guaranteed earnings, guaranteed security, or universally effortless development.
- Avoid “unlock your potential,” “game-changing,” “revolutionize,” “dive into,” “in today's digital world,” and inflated claims without evidence.
- Do not add a disclaimer mechanically. Explain a material limitation where it affects the claim.

### Evidence and claims

Separate a prototype from a shipped product. Separate development time from testing, platform review, deployment, and maintenance. Separate revenue from profit and attributed sales from unverified totals. State the time period and source when reporting a result. Use current official documentation to verify time-sensitive technical claims.

Do not attach remembered agency revenue claims, certifications, client results, or AI model names to a new post without checking the specific brief and evidence. Preserve supplied testimonials faithfully; label paraphrases rather than placing them in quotation marks.

### Facebook formatting

Facebook copy should be delivered as plain text with intentional line breaks. Markdown asterisks are not a reliable way to preserve bold when pasted. If the user explicitly requests pasteable emphasis, offer sparing Unicode bold for a few short phrases, with plain-text spelling retained for URLs, handles, code, and searchable product names. Unicode styled letters can reduce accessibility; never convert the entire caption.

When a character limit is supplied, count spaces, punctuation, and line breaks. Say which convention was used if an exact limit matters. Do not claim a post is within the limit without counting it.

## 9. Social platform adaptations

Editorial length targets below are brand defaults, not platform maximums.

| Platform | Default approach | Typical content |
| --- | --- | --- |
| Facebook | Taglish, broken-line copy, useful story, one CTA | 80–220 words; shorter when brief says so |
| Instagram | Clear first line, visual-first teaching, concise caption | 40–140 words; one idea per carousel slide |
| LinkedIn | Specific problem, technical/business insight, evidence | 120–250 words; professional English by default |
| Threads / X | One sharp idea, practical example, optional short thread | 20–60 words; verify current length limit when needed |
| TikTok / Reels / Shorts | Hook immediately, demonstration, lesson, action | Start with a 20–45 second script; read aloud to time |
| YouTube | Clear learning promise, demonstration, usable outcome | Searchable title; accurate thumbnail; useful description |
| Discord | Direct instruction, context, actionable next step | Compact announcement; links and code where useful |

Adapt the copy to the platform rather than pasting the same long caption everywhere. Confirm dates and timezones for announcements. Do not invent schedules, community links, pricing, or availability.

## 10. Content pillars and examples

| Pillar | Useful angle |
| --- | --- |
| Build | Show an app, integration, or workflow and how it works |
| Learn | Teach one coding concept or practical debugging method |
| Ship | Deployment, testing, maintenance, and product readiness |
| AI practice | Prompting, planning, agent workflows, and checking output |
| App economics | Hosting costs, product tradeoffs, and pricing reasoning |
| Community | Learner questions, honest lessons, and collaboration |

Illustrative caption — educational, not a claimed personal case study:

```text
Gumagana sa laptop mo? Good start.

Next question: kaya ba siyang gamitin ng ibang tao?

Check mo ang login, permissions, error handling, at deployment.
Kapag sablay ang isa, doon madalas lumalabas ang tunay na debugging. 😆

AI can help you build faster.
Kailangan mo pa ring intindihin ang bina-build mo.

Anong part ang pinaka-stuck ka ngayon?
```

Example thumbnail headline: “Your app works. Can you ship it?”

Example teaching CTA: “Comment your error message. Remove API keys and private data first.”

Example offer CTA pattern: “See the course details at [verified destination].” Replace placeholders before publishing.

## 11. AI production workflow

1. Identify objective, audience, platform, message, and desired action.
2. Extract supplied facts and evidence. Mark missing claims; do not fill them with guesses.
3. Pick one visual pattern and the appropriate working canvas.
4. Apply palette, typography, approved logo, and likeness rules.
5. Draft the hook, useful explanation, evidence, and single CTA in the right voice.
6. Check spelling, character limit if supplied, contrast, mobile readability, crop, and identity.
7. Deliver final caption and creative separately. Include alt text. Keep internal production notes out of publishable copy.

For image generation, use the original photo for identity and approved artwork only for styling. Render long text and exact logos with layout tools where possible, because generated typography and repeatable logo geometry may drift.

## 12. Reusable AI instructions

### Master instruction

```text
Act as the creative and content assistant for Jepoy.dev, Jeffrey Cayao's
developer coaching and education brand. Follow the attached branding manual.
Use cream #F6F1E6, charcoal #27231B, restrained lime #D5FA00,
olive #687323, and optional tiny blue #BFD0EF accents.
Use Sora for headings, Inter for body, JetBrains Mono for actual code.
Reuse approved logo assets; do not regenerate them unnecessarily.
Preserve Jeffrey's original face proportions and exact short black haircut.
Apply only light comic styling. Original photo overrides generated likenesses.
Write natural direct Taglish for Filipino Facebook audiences unless instructed
otherwise. Use short paragraphs, practical teaching, occasional light humor,
and one clear CTA. Keep all claims factual and grounded in supplied evidence.
Keep Jepoy education distinct from Automatika agency implementation.
Deliver final publishable content, with no placeholders left unresolved.
Ask only for essential missing facts; use the manual for routine choices.
```

### Creative brief template

```text
Platform and placement:
Objective:
Audience:
Single message:
Verified facts / evidence:
Headline:
Supporting copy:
CTA and verified destination:
Format / canvas:
Portrait needed? Original reference attached:
Approved logo asset:
Other constraints:
Deliver: finished creative + final caption + concise alt text.
```

### Portrait generation prompt

```text
Use the attached ORIGINAL photograph as the identity authority. Preserve
exact eye spacing, eyelids, nose, lips, cheeks, jaw, ears, expression, age,
and head angle. Preserve the exact short black hair silhouette, hairline,
fringe, texture direction, and volume. No anime spikes, dye, larger eyes,
sharper jaw, or superhero beautification. Apply only gentle comic outlines
and light cel shading. Natural skin; navy/black jacket; slim proportions.
Place cream, charcoal, restrained lime and olive graphics around the person.
Keep face and hair comfortably inside the placement's crop-safe area.
```

### Caption prompt

```text
Write a [platform] caption for Jepoy.dev about [topic]. Audience: [audience].
Facts permitted: [facts]. Action: [one CTA]. Length: [target or exact limit].
Use a concrete hook, natural Taglish, short broken-line paragraphs, one
useful lesson, and light humor if it fits. No invented story or result.
Return only the final caption unless alternatives are requested.
```

## 13. Release checklist

- Correct name, domain, palette, and font roles.
- Approved logo reused without distortion; transparency clean.
- Original hair and facial likeness preserved.
- One message and a clear next action.
- Facts and testimonials supported; no misleading prototype or earnings claim.
- Platform-appropriate language and line breaks.
- Exact limits counted when requested.
- Text readable on a phone; contrast checked.
- Face, name, and headline survive the intended crop and overlays.
- Links, dates, and CTA verified; no placeholders.
- Alt text describes the useful image content without unnecessary decoration.

If a check fails, revise before delivery. Maintain a consistent identity rather than chasing a new visual trend for each post.
