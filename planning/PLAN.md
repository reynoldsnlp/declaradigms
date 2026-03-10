# Plan: Declarative Standard for Finite-State Paradigm Generation

## Context

Multiple projects (RLTK, VIEW, webpipelines, satni-frontend, giellaltconversiontools) independently implement paradigm generation for morphologically rich languages. Each embeds paradigm structure, tag mappings, exception handling, and rendering logic in procedural code (JS, Java, TypeScript, bash). There is no shared specification that could be reused across frameworks. This project creates a declarative JSON-based standard that captures paradigm specifications in a framework-agnostic way, enabling any implementation to generate identical paradigm tables from the same spec.

The Zulip discussion shows interest from multiple parties (Brede/webpipelines, Børre/satni, Flammie/giellaltconversiontools, Anders/webpipelines) and consensus that a shared format would reduce duplicated effort, even if adoption will be gradual.

**Scope decisions:**
- Location: `paradigm_declarative_standard/` at root of this repo (temporary home; will move to its own repo when stable)
- This phase: analysis files + SPEC.md + JSON schemas + example specs for sme + rus. Proof-of-concept implementations (JS, Python, bash) deferred to a follow-up.
- Cell tag format: **full tag path per cell** (e.g. `"+N+Sg+Nom"` appended directly to lemma). More explicit and self-contained; no `baseTags` computation required.

---

## Phase 1: Project Analysis Files

Create `paradigm_declarative_standard/` with one analysis file per project. Each file summarizes the project's paradigm approach, strengths, weaknesses, features the standard must accommodate, and adaptability. These are based on the thorough exploration already completed.

### Files to create:

1. **`paradigm_declarative_standard/analysis_rltk.md`** — RLTK extension (`src/rltk/sidepanel.js`)
   - Runtime generation via `generateParadigm()` (~570 lines)
   - 5 POS types: N, V, A/Adj/Det, Num, Pron
   - Key pattern: `baseTags` = tags minus "vary" tags; cells = `lemma + baseTags + cellTags`
   - Strengths: real-time form matching/highlighting, Prb/Fac fallback chains, passive voice toggle, sub-cases (Loc2/Voc/Leng), stress accenting
   - Weaknesses: all structure implicit in 570 lines of JS, no separation of spec from rendering, Russian-only, lemma-specific numeral routing hardcoded
   - Key features for standard: fallback chains, secondary/optional forms, form matching against current reading, Prb/Fac improbable-form marking

2. **`paradigm_declarative_standard/analysis_view_old.md`** — Old VIEW extension (`old/`)
   - Two-tier: Java backend generates all forms via HFST, JS frontend renders via tag dictionaries
   - Tag dictionaries: `nounTagDict` (18 entries), `adjectiveTagDict` (43+), `verbTagDict` (18+), `numberTagDict` (9+), `twoTagDict` (26+)
   - Strengths: pre-computed paradigms (fast rendering), explicit tag-to-cell mapping, deduplication of ambiguous readings
   - Weaknesses: static dictionaries require code changes, no form matching feedback, language-specific only (Russian), fragile string-delimited encoding
   - Key features for standard: explicit tag dictionaries are the closest to a declarative spec already

3. **`paradigm_declarative_standard/analysis_webpipelines.md`** — Webpipelines (`webpipelines/client/src/lib/paradigms/`)
   - TypeScript schemas: `LanguageSchema → Section[] → Table[] → Row[]`
   - 9 languages (sme, sma, smj, smn, fin, fkv, fit, olo + more)
   - Key pattern: `Row.tags[]` maps directly to generated forms; `showIf` predicates for conditional sections
   - `prefixes` array for composite forms (auxiliary verbs in negative/compound tenses)
   - Strengths: **closest to declarative** — schemas are pure data structures; conditional display via `showIf`/`validateRows`; localization via message functions; reusable helpers (SME_CASES, SME_PERSONS)
   - Weaknesses: TS-specific (functions for labels/conditions can't serialize to JSON directly), per-language boilerplate, registry/routing logic is procedural
  - Key features for standard: Section/Table/Row hierarchy, conditional display, style hooks (`styleClass`) for grouping/visual semantics, `colspan`, `validateRows`

4. **`paradigm_declarative_standard/analysis_satni.md`** — Satni-frontend (`satni-frontend/src/features/paradigm/`)
   - React components with embedded tag arrays: `NounTableRows[language] = [{name, values}]`
   - 6 languages × 3 POS (N, A, V)
   - Simplest approach: tag arrays define cell positions, rendering iterates and looks up
   - Strengths: extremely simple data model, self-contained, clear structure
   - Weaknesses: massive duplication across languages, no conditional display, no section grouping, hardcoded switch-case for POS routing, no localization
   - Key features for standard: demonstrates that the minimal viable spec is just `{label, tags[]}` per row

5. **`paradigm_declarative_standard/analysis_giellaltconversiontools.md`** — Giellaltconversiontools (`giellaltconversiontools/scripts/`)
   - Bash/Python pipeline: extract lemmas from LEXC → compose regex with FST → generate all strings → convert to UniMorph tags
   - Tag mapping: `GIELLA2UNIMORPH` dict (330+ entries), `UNIMORPH2GIELLA` reverse (700+ entries)
   - `excluded.tags`: 109 tag patterns to filter (derivations, compounding, errors)
   - Strengths: leverages existing HFST infrastructure, works across all Giella languages, explicit tag mappings
   - Weaknesses: generates flat form lists (no table structure), entirely procedural, no paradigm shape awareness
   - Key features for standard: tag filtering/exclusion lists, cross-standard tag mapping

6. **`paradigm_declarative_standard/analysis_zulip_discussion.md`** — Summary of Zulip thread
   - Key concerns raised: localization, conditional display, TypeScript vs JSON tradeoffs, where to house specs (lang-xxx repos), paradigm size options (key/compact/standard/full)
   - Edge cases identified: variable lexical tags (genders, +NomAg, +Prop), paradigm gaps (pluralia tantum, weather verbs), sub-cases, Prb/Fac forms
   - Consensus: JSON is acceptable; start simple and iterate; specs should live near linguistic resources

---

## Phase 2: The Declarative Standard

### Design Principles

1. **JSON-only** — no embedded code, functions, or Turing-complete logic
2. **FST-specific** — each spec file declares its target FST/tagset
3. **Human-readable** — linguists should be able to author and review specs
4. **Validatable** — JSON Schema for structural correctness
5. **Minimal** — the simplest spec that can express all surveyed paradigms
6. **Framework-agnostic** — implementable in JS, Python, bash+jq, or anything else

### File Structure

```
lang-xxx/
  paradigms/
    meta.json              # FST identity, tag inventory, localization
    noun.json              # one file per paradigm type
    noun_proper.json       # exception paradigm (triggered by regex match)
    verb.json
    verb_neg.json          # exception paradigm for negation verbs
    adjective.json
    adjective_ord.json
    numeral.json
    pronoun_pers.json
    pronoun_dem.json
    ...
```

### `meta.json` — FST metadata and shared definitions

```json
{
  "$schema": "https://example.org/paradigm-standard/v1/meta.schema.json",
  "fst": "lang-sme",
  "version": "1.0",
  "tagPrefix": "+",
  "localization": {
    "Nom": { "en": "Nominative", "se": "Nominatiiva" },
    "Acc": { "en": "Accusative", "se": "Akkusatiiva" },
    "Sg":  { "en": "Singular",   "se": "Ovttaidlohku" },
    "Pl":  { "en": "Plural",     "se": "Máŋggaidlohku" }
  },
  "excludeTags": ["+Der", "+Err", "+Use/NG", "+Cmp", "+Cmp#"]
}
```

### Paradigm file — e.g. `noun.json`

Cell values are **full tag paths** appended directly to the lemma. For lemma `guolli`, cell `"+N+Sg+Nom"` produces generator input `guolli+N+Sg+Nom`.

```json
{
  "$schema": "https://example.org/paradigm-standard/v1/paradigm.schema.json",
  "id": "sme-noun",
  "pos": "N",
  "match": "\\+N\\+",
  "exceptions": [
    { "match": "\\+N\\+Prop", "use": "./noun_proper.json" }
  ],
  "sections": [
    {
      "title": "General forms",
      "tables": [
        {
          "headers": ["", "Sg", "Pl"],
          "rows": [
            { "label": "Nom", "cells": ["+N+Sg+Nom", "+N+Pl+Nom"] },
            { "label": "Acc", "cells": ["+N+Sg+Acc", "+N+Pl+Acc"] },
            { "label": "Gen", "cells": ["+N+Sg+Gen", "+N+Pl+Gen"] },
            { "label": "Ill", "cells": ["+N+Sg+Ill", "+N+Pl+Ill"] },
            { "label": "Loc", "cells": ["+N+Sg+Loc", "+N+Pl+Loc"] },
            { "label": "Com", "cells": ["+N+Sg+Com", "+N+Pl+Com"] },
            { "label": "Ess", "cells": ["+N+Ess"], "colspan": [2] }
          ]
        }
      ]
    },
    {
      "title": "Possessive suffixes",
      "showIf": { "hasTags": ["Px"] },
      "tables": [
        {
          "title": "Nom",
          "headers": ["Owner", "Sg", "Pl"],
          "rows": [
            { "label": "mu",    "cells": ["+N+Sg+Nom+PxSg1", "+N+Pl+Nom+PxSg1"] },
            { "label": "du",    "cells": ["+N+Sg+Nom+PxSg2", "+N+Pl+Nom+PxSg2"] },
            { "label": "su",    "cells": ["+N+Sg+Nom+PxSg3", "+N+Pl+Nom+PxSg3"], "styleClass": "group-end" },
            { "label": "munno", "cells": ["+N+Sg+Nom+PxDu1", "+N+Pl+Nom+PxDu1"] },
            { "label": "dudno", "cells": ["+N+Sg+Nom+PxDu2", "+N+Pl+Nom+PxDu2"] },
            { "label": "sudno", "cells": ["+N+Sg+Nom+PxDu3", "+N+Pl+Nom+PxDu3"], "styleClass": "group-end" },
            { "label": "min",   "cells": ["+N+Sg+Nom+PxPl1", "+N+Pl+Nom+PxPl1"] },
            { "label": "din",   "cells": ["+N+Sg+Nom+PxPl2", "+N+Pl+Nom+PxPl2"] },
            { "label": "sin",   "cells": ["+N+Sg+Nom+PxPl3", "+N+Pl+Nom+PxPl3"] }
          ]
        }
      ]
    }
  ]
}
```

### Key Design Decisions

**1. Cell tag format — full path per cell**: Each cell value is a complete tag path appended to the lemma. Example: for lemma `guolli`, cell `"+N+Sg+Nom"` generates `guolli+N+Sg+Nom`. This is explicit, self-contained, and requires no baseTags computation. Trade-off: more repetitive in the spec, but eliminates a source of bugs and makes each cell independently understandable.

**2. `match` field**: PCRE-compatible regex tested against the full reading string. Determines which paradigm file to use. First matching exception wins; otherwise the base paradigm is used.

**3. `showIf`**: Declarative conditions, not functions. Supports:
  - `{ "hasTags": ["Px"] }` — show if any generated form contains ALL listed tags
  - `{ "lacksTags": ["Px"] }` — show if NO generated form contains any listed tag
  - `{ "hasLemma": "regex" }` — show if lemma matches regex
  These cover the `has_tags()` / `lacks_tags()` patterns from webpipelines.

**4. `tagPrefix` / `tagSuffix`**: `meta.json` defines tag boundaries for cross-FST compatibility. `tagPrefix` is required, `tagSuffix` is optional.

**5. `validateRows`**: Boolean on table/section. If true, rows where ALL cells fail to generate are flagged (implementations decide whether to hide, gray out, etc.).

**6. `styleClass`**: Semantic style labels on sections/tables/rows/cells/fallback outputs; rendering behavior is implementation-defined.

**7. `colspan`**: Integer array on rows. Supports per-cell spans (e.g., Essive has no Sg/Pl distinction in Sámi).

**8. Labels as localization keys**: Row/header labels are strings. Implementations look them up in `meta.json`'s `localization` map. If no match, the string is used literally.

**9. Fallback chains** (optional): For languages where forms may need alternative tag attempts:
```json
{
  "fallbacks": [
    { "replace": "+Num", "with": "+A" },
    { "replace": "+Num", "with": "" },
    { "append": "+Fac", "styleClass": "improbable" },
    { "append": "+Prb", "styleClass": "improbable" }
  ]
}
```

**10. Additional forms in a cell** (optional): For sub-cases or variants shown alongside a primary form, use array cell format:
```json
{
  "label": "Nom",
  "cells": [
    [
      "+N+$gender+$animacy+Sg+Nom",
      { "tagSequence": "+N+$gender+$animacy+Sg+Voc", "styleClass": "subcase" }
    ],
    "+N+$gender+$animacy+Pl+Nom"
  ]
}
```

**11. Cell object format** (when metadata is needed):
```json
{
  "label": "mun/mon",
  "cells": [
    "+V+Ind+Prs+Sg1",
    { "tagSequence": "+V+Ind+Prs+ConNeg", "styleClass": "connegative" }
  ]
}
```
Here `cells` can mix simple strings, objects (`tagSequence` + `styleClass`), and array cells for additional forms.

---

## Phase 3: JSON Schema

Create `paradigm_declarative_standard/schemas/`:
- `meta.schema.json` — validates `meta.json` files
- `paradigm.schema.json` — validates paradigm files (noun.json, verb.json, etc.)

The schemas enforce:
- Required fields (`id`, `pos`, `match`, `sections`)
- Valid `showIf` condition shapes
- Cell format (string, object with `tagSequence`/`styleClass`, or array cell format)
- `tagVariables` definitions
- `fallbacks` and cell-level additional form shapes

---

## Phase 4: Example Specs

Create example paradigm specs for two languages to demonstrate the standard works cross-linguistically:

### `paradigm_declarative_standard/examples/lang-sme/`
- `meta.json` — North Sámi metadata, localization, person constants
- `noun.json` — based on webpipelines `sme/noun.ts`
- `verb.json` — based on webpipelines `sme/verb.ts` (most complex case with positive/negative columns, prefixes, compound tenses)
- `verb_neg.json` — exception paradigm for negation verb

### `paradigm_declarative_standard/examples/lang-rus/`
- `meta.json` — Russian metadata, localization, Prb/Fac fallback definitions
- `noun.json` — based on RLTK `generateParadigm` noun section. Since cell paths are full, gender/animacy are explicit in every cell. Uses `"$gender"` and `"$animacy"` tag variables drawn from the input reading to avoid needing a separate file per gender. 6 cases × Sg/Pl with Loc2/Voc/Leng as additional forms inside array cells.
- `adjective.json` — based on RLTK (most complex: Msc/Neu/Fem/Pl × cases, Anim/Inan accusative, short forms, comparative)
- `verb.json` — based on RLTK (present/future, past, imperative, infinitive, participles with full declension)
- `numeral_odin.json` — exception paradigm for "один" (adjective-like declension)
- `numeral_dva.json` — exception paradigm for "два/две" (3-column gender-based)

**Tag variables**: Since Russian noun paradigms vary by gender (Msc/Fem/Neu) and animacy (Anim/Inan) but always share the same table shape, the spec uses `$gender` and `$animacy` placeholders in cell paths:
```json
{ "label": "Nom", "cells": ["+N+$gender+$animacy+Sg+Nom", "+N+$gender+$animacy+Pl+Nom"] }
```
The implementation extracts `$gender` and `$animacy` from the input reading's tags and substitutes them. This is declared in the paradigm file (or shared `meta.json`) under a `"tagVariables"` section:
```json
"tagVariables": {
  "$gender": ["Msc", "Fem", "Neu"],
  "$animacy": ["Anim", "Inan"]
}
```

Tag matching uses `tagPrefix`/`tagSuffix` boundaries from `meta.json` (no partial matches like `N` in `+Nom`).
This keeps the spec declarative while avoiding an explosion of per-gender paradigm files.

---

## Deliverables Summary

```
paradigm_declarative_standard/
  analysis_rltk.md
  analysis_view_old.md
  analysis_webpipelines.md
  analysis_satni.md
  analysis_giellaltconversiontools.md
  analysis_zulip_discussion.md
  SPEC.md                          # The standard specification document
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
      adjective.json
      verb.json
      numeral_odin.json
      numeral_dva.json
```

**Deferred to follow-up:** Proof-of-concept implementations in JS (`paradigm.js`), Python (`paradigm.py`), and bash (`paradigm.sh`).

---

## Verification

1. Validate example JSON files against their schemas using `ajv` (JS) or `jsonschema` (Python)
2. Manually trace a Sámi noun: lemma `guolli`, cell `"+N+Sg+Nom"` → generator input `guolli+N+Sg+Nom` — verify matches webpipelines expected output
3. Manually trace a Russian noun: lemma `стол`, cell `"+N+Msc+Inan+Sg+Nom"` → generator input `стол+N+Msc+Inan+Sg+Nom` — verify matches RLTK expected output
4. Verify that the Russian `noun.json` spec handles `чистоты` correctly: the paradigm simply lists full tag paths per cell (e.g. `"+N+Fem+Inan+Sg+Gen"`), so there is no baseTags bug — gender/animacy are explicit in every cell
