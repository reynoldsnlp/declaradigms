# Analysis: Zulip Discussion on Declarative Paradigm Generation Standard

## Source

Zulip chat thread involving Rob Reynolds, Brede Eder Murberg, Anders Lorentsen, Børre, Trond Trosterud, Sjur, and Flammie A Pirinen. Saved in `zulipchat_declarative_standard_for_paradigm_generation.txt`.

## Context

Rob Reynolds initiated the discussion while planning a browser extension to analyze text in GiellaLT languages and generate grammatical paradigm tables when users click on words. The discussion explored whether a shared declarative standard for paradigm generation would be feasible and useful across multiple projects.

## Key Participants and Their Projects

| Participant | Project | Approach |
|-------------|---------|----------|
| Rob Reynolds | RLTK (Russian Language ToolKit) | Chrome extension, JS, WASM HFST |
| Brede Eder Murberg | webpipelines | TypeScript paradigm schemas, API-based |
| Anders Lorentsen | webpipelines | TypeScript, reluctant about JSON conversion |
| Børre | satni-frontend (sátni.org) | React + GraphQL, JSON constants in TSX |
| Trond Trosterud | Linguistic advisor | Advocates for paradigm size options |
| Sjur | SubEthaEdit modes, API design | macOS text analysis, not paradigm generation |
| Flammie A Pirinen | giellaltconversiontools | Bash/HFST, UniMorph format |

## Key Topics and Design Decisions

### 1. Format Choice: JSON vs TypeScript

**Discussion**: Rob proposed JSON as a framework-agnostic format. Anders expressed concern about the extra parsing layer JSON would require in their React/TS frontend. Børre noted that satni-frontend already uses JSON-like constants in TypeScript.

**Resolution in standard**: JSON was chosen as the canonical format. The standard is framework-agnostic — implementations can consume JSON in any language/framework. TypeScript definitions can be generated from JSON schemas.

**Relevant quotes**:
- Rob: "a more universal (framework agnostic) format would be feasible. That way these paradigms could be more easily re-implemented in other environments (Python, vanilla js, etc.)"
- Anders: "json would certainly work, but I have two reservations: (1) for our use case, it would involve a lot of extra work [...] (2) writing them, and changing them, would be even more cumbersome for dictionary authors"
- Flammie: "I think json is good at the moment [...] I would probably start use it in existing bash scripts via jq oneliners"

### 2. Conditional Paradigm Display

**Discussion**: Brede highlighted the need for logic in paradigm definitions — showing/hiding sections based on available forms (e.g. "only show the Potential Preterite table if the verb has those forms") and handling irregular verbs (e.g. "arvit" = "to rain" only has Sg3 forms).

**Resolution in standard**: The `showIf` condition system with `hasTags`, `lacksTags`, `hasLemma`, and combinators (`allOf`, `anyOf`) replaces TypeScript predicates with declarative JSON constructs.

**Relevant quote**:
- Brede: "I had the need to incorporate some logic into the tables. Verbs are quite tricky when showing all possible forms."

### 3. Localization

**Discussion**: Anders raised the need for localization — paradigm table labels need to be displayed in different UI languages. Rob proposed using tags as keys for localization lookup.

**Resolution in standard**: The `meta.json` `localization` map provides tag-to-label mappings per locale. Labels in paradigm files serve as localization keys, with fallback to literal display.

**Relevant quotes**:
- Anders: "At the very least, we would need make our components be able to override titles and other text, for localization"
- Rob: "a global localization mapping from tags/tag sequences to strings/markup, and 2) individual paradigms that use tags/tag sequences as labels"

### 4. Paradigm Size Variants

**Discussion**: Sjur and Trond advocated for standardized paradigm size options (key forms/compact, standard, full). Trond noted that full paradigms would be "too much" for in-context lookup and suggested "key forms needed to be able to build the rest."

**Resolution in standard**: Listed as a future consideration (Section 10). Not yet part of v0.1 but identified as a clear need.

**Relevant quotes**:
- Sjur: "the paradigm generation service would be available through a standardised API [...] with a standardised set of size options (e.g. key forms/compact, standard, full?)"
- Trond: "Getting the full paradigm by right-clicking will for most of our languages simply be too much"

### 5. Edge Cases Identified

**Discussion**: Several participants identified edge cases that any paradigm system must handle.

| Edge Case | Raised By | Standard Feature |
|-----------|-----------|-----------------|
| Variable required lexical tags (gender) | Flammie | Template variables (`$gender`, `$animacy`) |
| Known paradigm gaps (pluralia tantum, weather verbs) | Flammie | `validateRows` + `showIf` conditions |
| Sub-cases (Vocative, Locative, Partitive) | Rob | Secondary forms (`secondary`) |
| Problematic/unlikely forms (+Prb, +Fac) | Rob | Fallback chains with `display` hints |
| Negation verb exceptions | Brede | Exception rules (`exceptions`) |
| Different degree forms for adjectives | Børre (satni) | Multiple columns per degree |

### 6. Repository Location

**Discussion**: Rob suggested paradigm specs could live in their own repository. Børre suggested they should live in `lang-xxx` repositories where language specialists already work.

**Resolution in standard**: No opinion on repository location — the standard defines the format, not the hosting. Both approaches are valid. The `meta.json` `fst` field identifies the target FST, allowing specs to live anywhere.

### 7. Collaboration and Adoption

**Poll results**: Rob conducted a poll on adoption likelihood:
- "I would help develop the standard and/or specs for specific languages and use it in my work"
- "I would adapt existing projects to use it"
- "I would use it for new projects"
- "I would keep using what I'm already using"

(Actual vote counts not visible in the saved text.)

**Key concern**: Anders expressed time constraints — "I don't really feel like I can prioritize something like this, personally" — while acknowledging the benefit.

## Requirements Extracted from Discussion

### Must-Have (addressed in v0.1)

1. **Framework-agnostic format** (JSON) — multiple projects can consume it
2. **Conditional display** — show/hide sections based on tags, lemma
3. **Exception handling** — different paradigms for sub-POS types (negation verb, proper noun)
4. **Tag exclusion** — filter derivation, error, compounding tags
5. **Localization support** — tag-to-label mappings per locale
6. **Full tag path per cell** — unambiguous, self-contained cell definitions
7. **Variable tags** — gender, animacy extracted from readings
8. **Sub-case/secondary forms** — Vocative, Partitive alongside primary cases
9. **Problematic form display** — strikethrough, parenthetical for +Prb/+Fac

### Should-Have (partially addressed)

1. **Paradigm size options** — key/compact/standard/full variants (listed as future)
2. **Validation** — JSON Schema for spec validation (planned deliverable)

### Nice-to-Have (future considerations)

1. **Cross-standard tag mapping** — UniMorph integration
2. **Audio/TTS hooks** — speech synthesis for generated forms
3. **Computed rows** — auto-generating case × number grids to reduce repetition
4. **Form matching** — highlighting which cell matches the input reading

## Relationship to Other Projects

The Zulip discussion directly informed the standard's design:

```
webpipelines  ─→  Section/Table/Row hierarchy, showIf conditions, prefix
satni         ─→  Full tag paths per cell, validateRows behavior
RLTK          ─→  Fallback chains, secondary forms, prefix display
giellalttools ─→  excludeTags list, tag filtering
Zulip thread  ─→  Localization, exception handling, paradigm sizes
```

## Impact on Standard Design

Every major design decision in the standard can be traced to this discussion:

1. **JSON format** ← Rob's proposal, Flammie's endorsement
2. **Declarative conditions** ← Brede's "logic in tables" need
3. **Localization map** ← Anders's requirement
4. **Template variables** ← Flammie's "variable required lexical tags"
5. **Exception rules** ← Brede's negation verb handling
6. **Secondary forms** ← Rob's Russian sub-cases
7. **Fallback chains** ← Rob's +Prb/+Fac handling
8. **excludeTags** ← Flammie's excluded.tags resource
9. **Framework-agnostic** ← Multiple projects in different tech stacks
