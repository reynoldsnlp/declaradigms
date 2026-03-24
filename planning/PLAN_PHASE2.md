# Plan: Declaradigms Phase 2 — Literature-Informed Spec Enhancements

## Context

Phase 1 (documented in `planning/PLAN.md`) established the declaradigms standard:
a declarative JSON format for paradigm table generation backed by finite-state
transducers. The standard is implemented with JSON schemas
(`schemas/paradigm.schema.json`, `schemas/meta.schema.json`), JS/browser
libraries (`libraries/js/`), and example paradigm files for North Sami and
Russian (`examples/lang-sme/`, `examples/lang-rus/`).

A literature review across three domains — computational paradigm
standardization, theoretical morphology, and L2 pedagogy — identified specific
gaps and enhancements. This plan summarizes what Phase 1 achieved and proposes
concrete Phase 2 work items derived from the research.

---

## Phase 1 Completed Work

### Schemas
- `schemas/paradigm.schema.json` — validates paradigm files; defines sections,
  tables, rows, cells (string / cellObject / array-of-cellObjects), conditions
  (`showIf` with `hasTags`/`lacksTags`/`hasLemma`/`allOf`/`anyOf`), fallbacks,
  exceptions, tagVariables, styleClass at every level, colspan, validateRows
- `schemas/meta.schema.json` — validates meta files; defines fst, version,
  tagPrefix/tagSuffix, localization map, shared tagVariables, excludeTags

### Libraries
- `libraries/js/core.js` — framework-agnostic paradigm engine: paradigm
  selection (`selectParadigm`), tag variable extraction, FST generation with
  fallbacks, table model generation (`generateTableModel`), HTML rendering
  (`renderTableModelToHtml`)
- `libraries/js/index.js` — Node.js wrapper: HFST WASM loading, paradigm
  bundle loading from filesystem, transducer loading from file/URL
- `libraries/js/browser.js` — browser wrapper

### Examples
- `examples/lang-sme/` — North Sami: noun (with possessive suffixes gated by
  `showIf`), verb, verb_neg (exception paradigm), meta.json
- `examples/lang-rus/` — Russian: noun, verb (with aspect-conditioned
  present/future via `$aspect` tagVariable), adjective, numerals (odin, dva,
  ordinal), meta.json

### Key Design Decisions Already Made
1. Full tag path per cell (no baseTags computation)
2. Regex-based paradigm selection (`match`/`exceptions`)
3. Declarative conditions only (no embedded code)
4. Tag sequences as opaque strings (FST-agnostic)
5. Fallback chains for FST coverage gaps
6. styleClass for semantic annotation separate from rendering
7. Localization via key lookup in meta.json

---

## Phase 2: Literature-Informed Enhancements

### Priority 1 (High) — MWE / periphrastic cell support

**Problem**: Many paradigms include periphrastic (multi-word) cells — Russian
analytical future (буду читать), English perfect (have eaten), French passé
composé (j'ai mangé). The current spec assumes each cell is filled by a single
FST lookup on the paradigm's lemma. FSTs typically do not generate periphrastic
forms.

**Key insight**: In nearly all periphrastic constructions, only one word
inflects per cell while the other is fixed. The inflecting word is typically an
auxiliary with a *different lemma* from the main verb.

**Proposed spec change**: Add `"mwe"` as an alternative cell format. An `mwe`
cell is an array of *parts*, each of which is an FST lookup (or a literal
string). Parts are joined with a space in the rendered output.

```json
{
  "mwe": [
    { "lemma": "быть", "tagSequence": "+V+Fut+Sg1" },
    { "tagSequence": "+V+$aspect+Inf" }
  ]
}
```

Each part supports:
- `tagSequence` (string) — appended to lemma for FST lookup
- `lemma` (string, optional) — overrides the paradigm's lemma for this part
- `literal` (string, alternative to tagSequence) — static text, no FST lookup
- `styleClass` (optional) — per-part styling

A cell using `mwe` is a new branch of the existing `cell` oneOf in the schema,
alongside string, cellObject, and array-of-cellObjects.

**Files to modify**:
- `schemas/paradigm.schema.json` — add `mwePart` and `mweCell` to `$defs`;
  add `mweCell` to the `cell` oneOf
- `libraries/js/core.js` — extend `normalizeCell` and the generation loop in
  `generateTableModel` to detect and handle `mwe` cells
- `examples/lang-rus/verb.json` — add analytical future section for
  imperfective verbs using `mwe`

**Validates against**: Ackerman & Stump 2004 (periphrasis theory), Brown et al.
2012 (defining periphrasis), pedagogical research showing learners expect full
tense/aspect/mood tables including periphrastic forms.

---

### Priority 2 (High) — Optional `note` / `description` on sections and tables

**Problem**: Pedagogical research (DeKeyser 2005, Erlam 2003) shows deductive
instruction is effective. Paradigm tables benefit from metalinguistic commentary
explaining patterns. The current spec has no field for this.

**Proposed spec change**: Add optional `"description"` field (string, treated as
a localization key) on section and table objects.

```json
{
  "title": "Fut (analytical)",
  "description": "futAnalyticalDescription",
  "showIf": { "hasTags": ["Impf"] },
  "tables": [...]
}
```

Renderers display this as explanatory text (e.g., a paragraph below the heading).
The value is looked up in `meta.json` localization like any other label.

**Files to modify**:
- `schemas/paradigm.schema.json` — add `description` to section and table
- `libraries/js/core.js` — pass through `description` in `generateTableModel`
  output; render it in `renderTableModelToHtml`

---

### Priority 3 (Medium) — Document recommended semantic styleClass values

**Problem**: The `styleClass` mechanism is powerful but undocumented. Without
conventions, every paradigm author invents their own class names. Pedagogical
research (Wong 2005, Lee & Huang 2008) supports judicious use of visual
enhancement for morphological features.

**Proposed action**: Document (not enforce) recommended styleClass values in the
spec. No schema changes; purely documentation.

Recommended classes:
- `group-end` — visual separator after this row (already used in sme examples)
- `improbable` — form generated via Fac/Prb fallback (already used in rus)
- `irregular` — form that deviates from the regular pattern
- `archaic` — historical or obsolete form
- `colloquial` — informal register variant
- `subcase` — secondary form within a cell (e.g., Voc alongside Nom)
- `connegative` — connegative form (used in Uralic languages)
- `collapsed` — section/table should start in a collapsed state with an
  expand toggle (for progressive disclosure of large paradigms; motivated by
  cognitive load theory, Sweller 2019)

**Files to create/modify**:
- Spec documentation (SPEC.md or similar) — add section on recommended classes

---

### Priority 4 (Medium) — Optional `featureMap` in meta.json for interop

**Problem**: The SIGMORPHON ecosystem (90+ languages, Vylomova et al. 2020),
UniMorph (212+ features, Sylak-Glassman 2016), Universal Dependencies, Paralex,
and CLDF all use different feature vocabularies from FST-native tags.
Cross-linguistic comparison and data export require mapping between these.

**Proposed spec change**: Add optional `"featureMap"` to `meta.schema.json`.
Top-level keys identify the target schema (well-known keys: `"unimorph"`,
`"ud"` for Universal Dependencies). Any key is allowed — projects can define
custom target schemas. Each value is an object mapping local FST tags to the
target schema's feature strings.

```json
{
  "featureMap": {
    "unimorph": {
      "Sg": "SG",
      "Pl": "PL",
      "Nom": "NOM",
      "Acc": "ACC",
      "Prs": "PRS",
      "Pst": "PST",
      "Sg1": "1;SG",
      "Sg2": "2;SG"
    },
    "ud": {
      "Sg": "Number=Sing",
      "Pl": "Number=Plur",
      "Nom": "Case=Nom",
      "Acc": "Case=Acc",
      "Prs": "Tense=Pres",
      "Pst": "Tense=Past"
    }
  }
}
```

This enables export tools to convert declaradigms output to UniMorph/SIGMORPHON
TSV format, UD CoNLL-U, Paralex CSV, etc. without modifying the paradigm files.

**Files to modify**:
- `schemas/meta.schema.json` — add `featureMap` as object of objects

---

### Priority 5 (Low) — Row grouping via `rowGroups`

**Problem**: The `group-end` styleClass is an ad-hoc convention for visual row
grouping. An explicit grouping mechanism that mirrors HTML `<tbody>` would be
cleaner and let renderers consistently apply borders/spacing.

**Proposed spec change**: Tables can use either `rows` (flat, existing behavior
→ single implicit `<tbody>`) or `rowGroups` (new → multiple `<tbody>`s). Never
both. The schema enforces this via oneOf.

Each rowGroup has:
- `rows` (required) — array of row objects
- `label` (optional) — group heading (localization key); renderers may display
  as a sub-header row, a `data-` attribute, or ignore it
- `styleClass` (optional) — applied to the `<tbody>` element
- `showIf` (optional) — condition for including this group

```json
{
  "headers": ["", "Sg", "Pl"],
  "rowGroups": [
    {
      "label": "Sg possessor",
      "rows": [
        { "label": "mu",  "cells": ["+N+Sg+Nom+PxSg1", "+N+Pl+Nom+PxSg1"] },
        { "label": "du",  "cells": ["+N+Sg+Nom+PxSg2", "+N+Pl+Nom+PxSg2"] },
        { "label": "su",  "cells": ["+N+Sg+Nom+PxSg3", "+N+Pl+Nom+PxSg3"] }
      ]
    },
    {
      "label": "Du possessor",
      "rows": [
        { "label": "munno", "cells": ["+N+Sg+Nom+PxDu1", "+N+Pl+Nom+PxDu1"] },
        { "label": "dudno", "cells": ["+N+Sg+Nom+PxDu2", "+N+Pl+Nom+PxDu2"] },
        { "label": "sudno", "cells": ["+N+Sg+Nom+PxDu3", "+N+Pl+Nom+PxDu3"] }
      ]
    }
  ]
}
```

JSON → HTML mapping:
- `rowGroups[i]` → `<tbody>`
- `rowGroups[i].styleClass` → `<tbody class="...">`
- `rowGroups[i].rows[j]` → `<tr>`
- flat `rows` (no groups) → single implicit `<tbody>` with all `<tr>`s

**Files to modify**:
- `schemas/paradigm.schema.json` — add `rowGroup` to `$defs`; make table use
  oneOf for `rows` vs `rowGroups`
- `SPEC.md` §5.5/§5.6 — document `rowGroups` as alternative to `rows`
- `libraries/js/core.js` — normalize `rows` to a single-group `rowGroups`
  internally; render `<tbody>` per group

---

### Priority 6 (Low) — Schema versioning and directory structure

**Problem**: CLDF's experience shows that versioned schemas are essential for
long-term interoperability. The current `$id` uses `v0.1` in the URL but there's
no formal versioning policy, and the directory structure doesn't support
looking up a specific spec version.

**Proposed directory structure**: A `spec/` directory at the repo root contains
a subdirectory per version. Each version directory is self-contained with
SPEC.md, schemas, and examples:

```
declaradigms/
  spec/
    0.1/
      SPEC.md
      schemas/
        meta.schema.json
        paradigm.schema.json
      examples/
        lang-sme/
          meta.json
          noun.json
          verb.json
          verb_neg.json
        lang-rus/
          meta.json
          noun.json
          verb.json
          ...
    0.2/
      SPEC.md
      schemas/
        ...
      examples/
        ...
  libraries/
    js/
    python/
    ...
  related/
    ...
  planning/
    ...
```

**Versioning policy**:
- Semantic versioning: `major.minor.patch`
- **Major**: breaking changes (e.g., removing a field, changing required fields)
- **Minor**: new optional fields (e.g., MWE cells, description, rowGroups)
- **Patch**: documentation/example fixes only
- `$schema` URIs reference the version directory
  (e.g., `https://declaradigms.org/spec/0.2/schemas/paradigm.schema.json`)
- `meta.json` `version` tracks the *paradigm set* version (independent of spec)
- The current spec (Phase 1) becomes `spec/0.1/`
- Phase 2 additions become `spec/0.2/`

**Migration**: Move current `SPEC.md`, `schemas/`, and `examples/` into
`spec/0.1/`. Create `spec/0.2/` with the Phase 2 enhancements. Libraries
reference a specific spec version.

**Files to create/modify**:
- Create `spec/` directory structure
- Create `spec/README.md` — documents the versioning policy, directory
  conventions, and instructions for future developers on how to create a new
  version (copy the latest version dir, increment the version number, apply
  changes, update `$schema` URIs). This is the authoritative reference for
  the versioning rules, not buried in SPEC.md.
- Move `SPEC.md` → `spec/0.1/SPEC.md`
- Move `schemas/` → `spec/0.1/schemas/`
- Move `examples/` → `spec/0.1/examples/`
- Copy `spec/0.1/` to `spec/0.2/` and apply Phase 2 changes there
- Update `$schema` URIs in all example files
- Update library imports to reference versioned schema paths

---

### Priority 7 — Tag-derived CSS classes on cells

**Problem**: Renderers often need to style cells based on their morphosyntactic
features (e.g., highlight all nominative cells, dim all plural cells). Currently
this requires manually adding `styleClass` values per cell. Tags are already
present in the tag sequence but not exposed to CSS.

**Proposed spec requirement**: Implementations MUST add a `prdgm-tag-<tag>` CSS
class for every tag in a cell's tag sequence. For example, a cell with tag
sequence `+N+Sg+Nom` gets classes `prdgm-tag-N`, `prdgm-tag-Sg`,
`prdgm-tag-Nom` on the rendered `<td>` (or equivalent). The `prdgm-tag-` prefix
avoids collisions with author-defined `styleClass` values.

These classes are applied to the `<span>` wrapping each generated form, NOT to
the `<td>`, since a single `<td>` can contain multiple form spans (from array
cells with additional forms, or from MWE parts). Each `<span>` gets only the
tags from its own tag sequence.

This enables CSS rules like:
```css
.prdgm-tag-Sg { background: #eef; }
.prdgm-tag-Nom { font-weight: bold; }
```

**Files to modify**:
- `SPEC.md` §5.9 — add a subsection documenting this as a MUST requirement
  for implementations that produce HTML/CSS output
- `SPEC.md` §6 step 7 — mention tag-derived classes in the render step
- `libraries/js/core.js` — in `renderTableModelToHtml`, parse the tag sequence
  for each cell variant and add `prdgm-tag-<tag>` classes to the `<span>`

---

### Deferred (not for Phase 2)

These items from the literature review are interesting but not actionable yet:

- **`dimensions` metadata**: declaring the feature dimensions of a paradigm
  (number, case, etc.) for automated layout alternatives. Useful in theory but
  adds complexity without a clear consumer. Revisit when a renderer wants
  alternative layouts.
- **Content paradigm declaration**: enumerating the abstract feature bundles a
  paradigm covers (Stump 2016). Valuable for validation but heavy. Revisit when
  cross-linguistic comparison tooling exists.
- **SIGMORPHON/Paralex/CLDF export tools**: valuable but these are tooling tasks,
  not spec changes. The `featureMap` (Priority 4) is the spec-level enabler.

---

## SPEC.md Changes

The specification document lives at `/Users/rob/repos/reynoldsnlp/declaradigms/SPEC.md`
(470 lines, 10 sections). Each priority item requires specific SPEC.md edits:

### MWE cells → SPEC.md §5.7 "Cell Format"

Add a fourth cell format after the existing three (simple string, object, array):

**§5.7.4 MWE format (multi-word expression)**

Document the `mwe` cell format for periphrastic constructions. Include:
- Schema: `{ "mwe": [ {part}, {part}, ... ] }` where each part has
  `tagSequence` + optional `lemma`/`literal`/`styleClass`
- Parts are generated independently and joined with a space
- If `lemma` is omitted, the paradigm's lemma is used
- If `literal` is provided instead of `tagSequence`, the text is used as-is
- JSON example: Russian analytical future (буду читать)
- JSON example: English perfect (have eaten) with `literal` for invariable "will"

Also **replace** the existing §8 "Compound forms" paragraph (lines 453-455)
which currently says "The standard does not encode display-only fixed strings"
— this is superseded by MWE support. Replace with a note that compound/
periphrastic forms are handled via the `mwe` cell format (§5.7.4).

Also **update** §6 "Generation Workflow" step 4 to mention MWE cells: "For MWE
cells, generate each part independently (using the part's lemma if specified,
otherwise the paradigm lemma), then join the resulting forms with a space."

### `description` → SPEC.md §5.4 and §5.5

Add `description` row to the section table (§5.4) and the table table (§5.5):

| `description` | string | No | Explanatory text (localization key or literal). Renderers display below the heading. |

### styleClass conventions → SPEC.md §5.9

Expand the existing §5.9 "Style Classes" section (currently brief) with a
subsection listing recommended semantic values:

| Class | Meaning | Used in |
|-------|---------|---------|
| `group-end` | Visual separator after this row | sme noun possessives |
| `improbable` | Form from Fac/Prb fallback | rus verb fallbacks |
| `subcase` | Secondary form in array cell | rus noun Voc/Loc2 |
| `connegative` | Connegative form | sme verb |
| `irregular` | Irregular/exceptional form | general |
| `archaic` | Historical/obsolete form | general |
| `colloquial` | Informal register | general |
| `collapsed` | Section/table starts collapsed with expand toggle | large paradigms (cognitive load, Sweller 2019) |
| `citation-form` | Cell contains the citation/dictionary form; renderers may bold or anchor it | general (Détrez & Ranta 2012) |
| `syncretic-<id>` | Cells sharing the same `<id>` are syncretic (same surface form for systematic reasons). `<id>` is an arbitrary set identifier (e.g., `syncretic-fem-acc-nom`). Renderers may merge or highlight syncretic cells. | syncretism (Baerman et al. 2005) |
| `principal-part` | Cell is a principal part — a form from which other paradigm cells can be predicted. Renderers may emphasize these for pedagogical use. | principal parts theory (Stump & Finkel 2013) |

Note explicitly that these are conventions, not enforced by the schema.

### `featureMap` → SPEC.md §4

Add a subsection to §4 "meta.json — Shared Configuration":

**§4.7 featureMap (optional)**

Document the optional multi-schema mapping from FST-native tags to external
feature vocabularies. Top-level keys are target schema identifiers; well-known
keys are `"unimorph"` and `"ud"` (Universal Dependencies). Any key is allowed.
Each value is an object mapping local tags to the target schema's feature
strings. Purpose: enables export to SIGMORPHON TSV, UD CoNLL-U, Paralex CSV,
CLDF, or any custom schema.

Also **update** §10 "Future Considerations" to remove the "Cross-standard tag
mapping" bullet (it's no longer future — it's in the spec).

### `rowGroups` → SPEC.md §5.5 and new §5.6a

Add `rowGroups` as an alternative to `rows` on table objects (§5.5). Document
that tables use **either** `rows` (flat) or `rowGroups` (grouped), never both.

Add a new subsection (§5.6a or renumber) documenting the rowGroup object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rows` | Row[] | Yes | Row definitions within this group |
| `label` | string | No | Group heading (localization key or literal) |
| `styleClass` | string or string[] | No | Style class(es) for this group |
| `showIf` | Condition | No | Condition for including this group |

Note: maps to `<tbody>` in HTML rendering. Flat `rows` renders as a single
implicit `<tbody>`.

### Schema versioning → SPEC.md §9

Expand §9 "Versioning" (currently 2 lines) to document:
- Semantic versioning policy: major.minor.patch
- Major = breaking changes; minor = new optional fields; patch = documentation
- `$schema` URIs include the major version
- `meta.json` `version` tracks the paradigm set version (independent of spec)

---

## Implementation Order

1. MWE support (SPEC.md §5.7.4, §6, §8 + schema + core.js + Russian example)
2. `description` field (SPEC.md §5.4/§5.5 + schema + core.js)
3. styleClass documentation (SPEC.md §5.9 — includes `collapsed`, `citation-form`)
4. `featureMap` in meta.json (SPEC.md §4 + §10 + schema)
5. `rowGroups` (SPEC.md §5.5/§5.6 + schema + core.js)
6. Schema versioning documentation (SPEC.md §9 only)

---

## Verification

1. **MWE**: Add analytical future to `examples/lang-rus/verb.json`; verify the
   JS library generates "буду читать", "будешь читать" etc. for an imperfective
   verb lemma when given a быть FST
2. **Schema validation**: Run `ajv validate` on all modified example files
   against updated schemas
3. **Existing tests**: Run `node --test` in `libraries/js/` to verify no
   regressions from core.js changes
4. **HTML output**: Generate HTML for a Russian imperfective verb and visually
   confirm the analytical future table renders correctly with MWE cells
5. **SPEC.md consistency**: Verify all new fields documented in SPEC.md match
   the JSON schema definitions exactly (field names, types, defaults)
