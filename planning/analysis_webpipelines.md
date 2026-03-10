# Analysis: webpipelines Paradigm System

## Project Overview

The webpipelines project implements a paradigm display system within a SvelteKit web application. It covers 8 languages (sme, sma, smj, smn, fin, fit, fkv, olo) with a richly typed, schema-driven architecture defined in TypeScript. The paradigm code lives under `webpipelines/client/src/lib/paradigms/`.

Of the three projects analyzed, webpipelines is the closest to a declarative paradigm specification. Its schemas are essentially static data structures that describe what to display, with the rendering engine interpreting them generically.

---

## 1. Approach and Architecture

### Type Hierarchy

The system is built around a four-level type hierarchy defined in `types.ts`:

```typescript
// types.ts
export interface Row {
    label: string | Function;
    tags: string[];
    colspan?: number;
    prefixes?: string[];
    separator?: boolean;
}

export interface Table {
    tId?: string;
    title?: Function;
    headers: Function[];
    rows: Row[];
    showIf?: (elem: ParsedParadigm) => boolean;
}

export interface Section {
    sId?: string;
    title?: Function;
    tables: Table[];
    validateRows?: boolean;
    showIf?: (elem: ParsedParadigm) => boolean;
}

export interface LanguageSchema {
    sections: Section[];
}
```

The hierarchy is: **LanguageSchema -> Section[] -> Table[] -> Row[]**. Each level adds its own display metadata:

- **LanguageSchema**: The top-level container, one per (language, POS, subclass) triple.
- **Section**: A major grouping (e.g., "Indicative", "Conditional", "Non-finite forms"). Sections can be conditionally displayed (`showIf`) and can enable automatic row validation (`validateRows`).
- **Table**: A single table within a section (e.g., "Present", "Perfect" within the Indicative section). Tables have headers, rows, and optional conditional display.
- **Row**: A single row in a table, mapping a label to one or more morphological tag strings. Each tag string is looked up against the FST-generated wordform data.

### Language Registry and POS Routing

The `registry.ts` file implements lazy-loading of language-specific schema modules:

```typescript
// registry.ts
const registry: Record<string, SchemaLoader> = {
    sme: (p, s) => import("./sme").then((m) => m.getSmeSchema(p, s)),
    sma: (l, p) => import("./sma").then((m) => m.getSmaSchema(l, p)),
    fkv: (l, p) => import("./fkv").then((m) => m.getFkvSchema(l, p)),
};
```

Each language module then has a POS/subclass switcher. For example, the SME index (`sme/index.ts`) dispatches to specific schema files:

```typescript
// sme/index.ts
export async function getSmeSchema(pos: string, subclass: string): Promise<LanguageSchema | null> {
    switch (pos) {
        case "V":
            if (subclass === "Neg") {
                const mod = await import("./verb_neg");
                return mod.default;
            }
            const verbMod = await import("./verb");
            return verbMod.default;
        case "N":
            const nounMod = await import("./noun");
            return nounMod.default;
        case "A":
            if (subclass === "Ord") {
                const mod = await import("./adjective_ord");
                return mod.default;
            }
            // ...
        case "Pron":
            switch (subclass) {
                case "Dem": // ...
                case "Indef": // ...
                case "Interr": // ...
                case "Pers": // ...
                case "Refl": // ...
                case "Rel": // ...
            }
    }
}
```

This gives SME alone approximately 10+ distinct schema files covering verbs, nouns, adjectives (regular and ordinal), numerals, and 6 pronoun subclasses.

### Shared Helpers

The `sme/helpers.ts` file defines reusable constants for North Sami:

```typescript
// sme/helpers.ts
export const SME_CASES = [
    { tag: "Nom", label: m.paradigm_nominative },
    { tag: "Acc", label: m.paradigm_accusative },
    // ... 7 cases total
];

export const SME_DEFAULT_CASE_TABLE: Table = {
    headers: [m.paradigm_case, m.paradigm_singular, m.paradigm_plural],
    rows: [
        { label: m.paradigm_nominative, tags: ["Sg+Nom", "Pl+Nom"] },
        { label: m.paradigm_accusative, tags: ["Sg+Acc", "Pl+Acc"] },
        // ...
        { label: m.paradigm_essive, tags: ["Ess"], colspan: 2 },
    ],
};

export const SME_PERSONS = [
    { tag: "Sg1", label: "mun/mon", pxLabel: "mu" },
    { tag: "Sg2", label: "don", pxLabel: "du" },
    // ... 9 person/number combinations
];
```

These are composed into paradigm schemas. For example, the noun schema reuses `SME_DEFAULT_CASE_TABLE` directly and iterates over `SME_PERSONS` to build possessive suffix tables.

### Utility Functions

The `paradigm_utils.ts` module provides three critical functions:

```typescript
// paradigm_utils.ts
export function get_entry(tags: string, elem: ParsedParadigm) {
    const wordforms = elem.wordforms.get(tags);
    if (!wordforms) return "\u2014";  // em dash
    return Array.from(wordforms);
}

export function has_tags(...needed: string[]) {
    return (elem: ParsedParadigm) => {
        const keys = Array.from(elem.wordforms.keys());
        return keys.some((tag) => needed.every((n) => tag.includes(n)));
    };
}

export function lacks_tags(...excluded: string[]) {
    return (elem: ParsedParadigm) => {
        const keys = Array.from(elem.wordforms.keys());
        return keys.every((tag) => excluded.every((n) => !tag.includes(n)));
    };
}
```

- `get_entry` is the core lookup function: given a tag string and the parsed paradigm data, it returns the matching wordforms or an em dash.
- `has_tags` returns a predicate (closure) that checks whether the parsed data contains at least one tag string matching all the needed substrings. This is used for `showIf` on sections and tables.
- `lacks_tags` returns a predicate that checks whether all tag strings in the data lack the excluded substrings.

---

## 2. Key Features Demonstrated

### Compound (Periphrastic) Tenses via `prefixes`

The most distinctive feature is the `prefixes` array on Row, which enables compound verb forms. In North Sami, compound tenses are formed with an auxiliary verb + perfect participle. The schema handles this by pairing prefixes with the same underlying tag:

```typescript
// sme/verb.ts - Perfect tense
{
    title: m.paradigm_perfect,
    headers: [m.paradigm_person, m.paradigm_positive, m.paradigm_negative],
    rows: [
        { label: "mun/mon", tags: ["PrfPrc", "PrfPrc"], prefixes: ["lean", "in leat"] },
        { label: "don", tags: ["PrfPrc", "PrfPrc"], prefixes: ["leat", "it leat"] },
        { label: "son/dat", tags: ["PrfPrc", "PrfPrc"], prefixes: ["lea", "ii leat"], separator: true },
        // ...
    ],
}
```

Here, both the positive and negative columns reference the same tag (`PrfPrc`) but prepend different auxiliary strings. The positive form "lean boahtit" consists of prefix "lean" + the looked-up PrfPrc form. The negative "in leat boahtit" consists of prefix "in leat" + the same PrfPrc form.

This pattern extends through perfect, pluperfect, conditional perfect, and other compound tenses, with prefixes encoding the auxiliary paradigm.

### Positive/Negative Column Pairing

Simple (non-compound) tenses pair a positive inflected form with a negative connegative form:

```typescript
// sme/verb.ts - Present tense
{
    title: m.paradigm_present,
    headers: [m.paradigm_person, m.paradigm_positive, m.paradigm_negative],
    rows: [
        { label: "mun/mon", tags: ["Ind+Prs+Sg1", "Ind+Prs+ConNeg"], prefixes: ["", "in"] },
        { label: "don", tags: ["Ind+Prs+Sg2", "Ind+Prs+ConNeg"], prefixes: ["", "it"] },
        // ...
    ],
}
```

The first column uses a person-specific tag (`Ind+Prs+Sg1`), while the negative column uses the invariant connegative form (`Ind+Prs+ConNeg`) with a person-specific negative auxiliary prefix (`in`, `it`, `ii`, etc.).

### Conditional Display (`showIf`)

Sections and tables can be conditionally shown based on the data:

```typescript
// sme/noun.ts - Possessive suffixes section
{
    title: m.paradigm_possessivesuffixes,
    showIf: has_tags("Px"),
    tables: [ /* ... */ ],
}

// sme/verb.ts - Potential preterite table
{
    showIf: has_tags("Pot", "Prt"),
    title: m.paradigm_preterite,
    // ...
}
```

This is used to hide possessive suffix tables for nouns that lack possessive forms, and to hide rare tense/mood combinations that don't exist for all verbs.

### Row Validation (`validateRows`)

Entire sections can be marked with `validateRows: true`, which causes the renderer to hide rows where no data exists:

```typescript
{
    title: m.paradigm_indicative,
    validateRows: true,
    tables: [ /* ... */ ],
}
```

This is useful for verb paradigms where some person/number combinations may not be attested.

### Visual Grouping (`separator`)

Rows can be marked with `separator: true` to insert a visual break after that row, typically used to separate singular, dual, and plural person groups:

```typescript
{ label: "son/dat", tags: ["Ind+Prs+Sg3", "Ind+Prs+ConNeg"], prefixes: ["", "ii"], separator: true },
// visual break here
{ label: "moai", tags: ["Ind+Prs+Du1", "Ind+Prs+ConNeg"], prefixes: ["", "ean"] },
```

### Merged Cells (`colspan`)

The `colspan` property enables forms that don't distinguish number to span multiple columns:

```typescript
{ label: m.paradigm_essive, tags: ["Ess"], colspan: 2 },
```

### Localization

All user-facing strings (labels, section/table titles, headers) use paraglide message functions (`m.paradigm_nominative`, etc.) rather than raw strings. This means the same schema works across all UI languages without modification.

### Exception Schemas

The `verb_neg.ts` file shows a separate schema for the negative verb itself, which has a fundamentally different paradigm structure (no positive/negative pairing, unique moods):

```typescript
// sme/verb_neg.ts
{
    title: m.paradigm_indicative,
    tables: [{
        headers: [m.paradigm_person, m.paradigm_empty],
        rows: [
            { label: "mun/mon", tags: ["Ind+Sg1"] },
            { label: "don", tags: ["Ind+Sg2"] },
            // ...
        ],
    }],
},
```

This demonstrates that the architecture supports entirely different schema shapes per POS subclass.

---

## 3. Strengths

1. **Already nearly declarative.** Schemas are static data structures (JavaScript objects). Aside from `showIf` predicates and `m.*` message function references, the schemas contain no imperative logic. A JSON/YAML serialization of these schemas would be straightforward.

2. **Rich structural hierarchy.** The Section -> Table -> Row nesting maps naturally to how linguists organize paradigms: by mood/section, then tense/table, then person/number/row.

3. **Composability.** Shared helpers (`SME_DEFAULT_CASE_TABLE`, `SME_PERSONS`, `SME_CASES`) eliminate repetition and ensure consistency. JavaScript's `.map()` is used to generate repetitive row arrays from a single data source.

4. **Compound form support.** The `prefixes` mechanism elegantly handles periphrastic constructions without requiring the FST to generate the entire compound form. This is essential for languages with analytic negation or compound tenses.

5. **Conditional display.** The `showIf` and `validateRows` mechanisms allow a single schema to adapt to lexeme-specific variation (e.g., nouns with vs. without possessive forms).

6. **Localization separation.** By using message functions for all labels, paradigm structure is cleanly separated from display language.

7. **Comprehensive POS coverage.** SME alone covers verbs, nouns, adjectives (regular + ordinal), numerals, and 6 pronoun subclasses. The system can handle fine-grained morphological subclass routing.

8. **Code splitting.** Dynamic imports ensure only the relevant schema is loaded for a given paradigm request.

---

## 4. Weaknesses

1. **`showIf` is imperative.** The `showIf` predicates are JavaScript closures, not declarative data. While they currently use only `has_tags()` and `lacks_tags()`, the type system allows arbitrary functions (`(elem: ParsedParadigm) => boolean`). A declarative standard would need to constrain this to a fixed set of predicable operations.

2. **Labels are opaque function references.** Labels like `m.paradigm_nominative` are paraglide message functions. A declarative standard would need to replace these with either localization keys (strings) or inline multilingual label maps.

3. **Prefixes are language-specific strings.** The auxiliary verb forms in `prefixes` (e.g., `"lean"`, `"in leat"`) are hardcoded North Sami strings. A declarative standard might want these to come from a reference data source or be generated from the FST rather than manually listed.

4. **No explicit column semantics.** The relationship between columns is implicit (index 0 = positive, index 1 = negative in verb tables). A declarative standard should make column semantics explicit.

5. **Limited metadata.** There is no machine-readable metadata about what morphological features each row represents beyond the tag strings. For instance, `"Ind+Prs+Sg1"` encodes mood+tense+person+number, but these features are not separately annotated.

6. **Repetitive row definitions.** Despite the helpers, the verb schema still contains substantial repetition across tenses -- every tense repeats the same 9 person/number rows with slight tag variations. A more abstract "apply this person/number template for this tense" mechanism would reduce this.

7. **No validation schema.** There is no formal schema (JSON Schema, etc.) that validates whether a paradigm specification is well-formed.

---

## 5. Features the Standard Must Accommodate

Based on this project, a declarative paradigm standard must support:

| Feature | Example from webpipelines |
|---|---|
| Hierarchical grouping (section > table > row) | Indicative > Present > Sg1 |
| Column headers with localization | `[m.paradigm_person, m.paradigm_positive, m.paradigm_negative]` |
| Multi-column rows (one tag per column) | `tags: ["Ind+Prs+Sg1", "Ind+Prs+ConNeg"]` |
| Prefix/auxiliary strings per cell | `prefixes: ["lean", "in leat"]` |
| Cell spanning (colspan) | `colspan: 2` for essive |
| Visual separators between row groups | `separator: true` |
| Conditional section/table visibility | `showIf: has_tags("Px")` |
| Automatic empty-row hiding | `validateRows: true` |
| POS and subclass routing | V -> Neg subclass -> verb_neg schema |
| Shared/reusable schema fragments | `SME_DEFAULT_CASE_TABLE` |
| Non-finite forms (flat label/tag lists) | Infinitive, participles, verbal nouns |
| Exception paradigms | Negative verb has different structure from regular verbs |

---

## 6. Adaptability to a Declarative Model

**Assessment: High adaptability.**

The webpipelines paradigm system is already 90% declarative. The main barriers to full declarativity are:

1. **`showIf` predicates**: These can be replaced with a declarative condition language, e.g.:
   ```json
   { "condition": { "has_tags": ["Px"] } }
   ```
   or:
   ```json
   { "condition": { "has_tags": ["Pot", "Prt"] } }
   ```
   The current codebase only uses `has_tags()` and `lacks_tags()` as `showIf` values, so a declarative representation of these two predicates would cover all existing cases.

2. **Message function references**: Replace `m.paradigm_nominative` with a localization key like `"paradigm_nominative"`, and let the consuming application handle i18n lookup.

3. **JavaScript `.map()` for row generation**: The possessive suffix tables in `noun.ts` use `.map()` to generate rows from `SME_PERSONS`. In a declarative standard, this would need to be either:
   - Pre-expanded (list all 9 rows explicitly), or
   - Supported via a template/iterator mechanism in the standard (e.g., "for each person in persons, generate a row with tags [Sg+{case}+Px{person.tag}]").

4. **Dynamic imports**: These are purely an implementation concern and do not affect the data model.

The fact that this project already uses typed interfaces (`Row`, `Table`, `Section`, `LanguageSchema`) that could be directly translated to a JSON Schema makes it the natural starting point for a declarative standard.
