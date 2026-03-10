# Paradigm Generation Standard — Specification v0.1

## 1. Overview

This specification defines a declarative JSON format for specifying how grammatical paradigm tables should be generated from finite-state transducers (FSTs). A paradigm specification describes:

1. **Which paradigm** to generate for a given morphological reading
2. **The shape** of the paradigm (sections, tables, rows, columns)
3. **Which tag sequences** fill each cell
4. **Exceptional lemmas or tags** that require a different paradigm
5. **Optional features** like fallback generation strategies, conditional inclusion, and style hooks

The standard is FST-specific: each set of paradigm files targets a particular transducer and its tagset. The standard is framework-agnostic: implementations may render paradigms as HTML, Markdown, plain text, JSON, or any other format. The standard focuses on **structure and semantics**, not on rendering or styling. Style hooks (`styleClass`) allow implementations to apply their own visual presentation.

## 2. Terminology

- **Reading**: A morphological analysis string produced by an FST analyzer, e.g. `guolli+N+Sg+Nom`
- **Lemma**: The dictionary/citation form of a word, e.g. `guolli`
- **Tag**: A morphosyntactic label in the FST's tagset, e.g. `N`, `Sg`, `Nom`
- **Tag sequence**: A sequence of tags encoded with the language's tag boundary convention (see `tagPrefix`/`tagSuffix`), e.g. `+N+Sg+Nom` or `<n><sg><nom>`
- **Generator input**: A string of the form `lemma + tagSequence` sent to an FST generator to produce a surface form
- **Cell**: A position in a paradigm table. Each cell is defined by a tag sequence; its content (the generated surface form) is produced by sending `lemma + tagSequence` to the generator.
- **Section**: A named group of related tables (e.g. "Indicative", "Possessive suffixes")
- **Paradigm file**: A JSON file defining the complete paradigm for one POS or sub-type

## 3. File Organization

A paradigm specification for a language consists of:

```
paradigms/
  meta.json              # Required: FST metadata, localization, shared config
  noun.json              # One file per paradigm type
  noun_proper.json       # Exception paradigms
  verb.json
  verb_neg.json
  adjective.json
  ...
```

Each paradigm file is self-contained: it declares which readings it applies to and defines the complete table structure. The `meta.json` file provides shared configuration.

## 4. `meta.json` — Shared Configuration

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | No | URI of the JSON Schema for validation |
| `fst` | string | Yes | Identifier of the target FST (e.g. `"lang-sme"`, `"lang-rus"`) |
| `version` | string | Yes | Version of this paradigm specification set |
| `tagPrefix` | string | Yes | String that precedes each tag in readings and tag sequences (e.g. `"+"`, `"<"`) |
| `tagSuffix` | string | No | String that follows each tag (e.g. `">"` for Apertium). If omitted, tags end at the next `tagPrefix` or end-of-string. |
| `localization` | object | No | Tag-to-label mappings for UI display |
| `tagVariables` | object | No | Shared template variables available to all paradigm files |
| `excludeTags` | string[] | No | Tag prefixes to exclude from paradigm generation |

### `localization`

Maps tag strings to localized display labels. Keys are tags or tag sequences; values are objects mapping ISO 639 language codes to display strings.

```json
{
  "localization": {
    "Nom": { "en": "Nominative", "ru": "Именительный", "se": "Nominatiiva" },
    "Sg":  { "en": "Singular",   "ru": "Единственное", "se": "Ovttaidlohku" }
  }
}
```

When rendering, implementations look up each label string in the localization map. If no entry exists, the string is used as-is.

### `tagPrefix` and `tagSuffix`

`tagPrefix` defines how tags start in readings and cell tag sequences.

`tagSuffix` is optional and defines how tags end. If it is omitted, the end of a tag is delimited by `tagPrefix` or end-of-string.

```json
{
  "tagPrefix": "+"
}
```

```json
{
  "tagPrefix": "<",
  "tagSuffix": ">"
}
```

### `tagVariables`

Shared template variables that are available to all paradigm files for this language. These follow the same format as paradigm-level variables (see §5.2). If a paradigm file defines a variable with the same name, the paradigm-level definition takes precedence.

```json
{
  "tagVariables": {
    "$gender": ["Msc", "Fem", "Neu"],
    "$animacy": ["Anim", "Inan"]
  }
}
```

This avoids duplicating the same variable definitions across multiple paradigm files (e.g. `$gender` and `$animacy` for Russian nouns, adjectives, and numerals).

### `excludeTags`

Tags to filter out before paradigm matching. Readings containing these tags (typically derivations, compounding markers, error tags) should be stripped or ignored when selecting paradigms.

```json
{
  "excludeTags": ["+Der", "+Err", "+Use/NG", "+Cmp", "+Cmp#"]
}
```

## 5. Paradigm File — Structure

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | No | URI of the JSON Schema for validation |
| `id` | string | Yes | Unique identifier for this paradigm (e.g. `"sme-noun"`) |
| `pos` | string | Yes | Primary POS tag this paradigm handles (e.g. `"N"`, `"V"`) |
| `match` | string | Yes | Regex pattern tested against the full reading to select this paradigm |
| `exceptions` | Exception[] | No | Ordered list of exception rules (first match wins) |
| `tagVariables` | object | No | Template variables extracted from the reading (overrides `meta.json` tagVariables) |
| `fallbacks` | Fallback[] | No | Ordered fallback strategies for failed generation |
| `sections` | Section[] | Yes | The paradigm table structure |

### 5.1 Paradigm Selection (`match` and `exceptions`)

#### `match`

A regex pattern (PCRE-compatible subset: no lookbehind, no named groups — to ensure cross-language compatibility with JS, Python, Java, and POSIX). The regex is tested against the full reading string (e.g. `guolli+N+Sg+Nom`).

```json
{ "match": "\\+N\\+" }
```

Multiple paradigm files for the same language are tested in order. The first whose `match` succeeds is selected, unless an exception overrides it.

#### `exceptions`

An ordered list of rules that override the base paradigm. Each exception has a `match` regex and a `use` field containing a full relative path to another paradigm file (including `.json`).

```json
{
  "exceptions": [
    { "match": "\\+N\\+Prop", "use": "./noun_proper.json" },
    { "match": "^(один|одна|одно|одни)\\+", "use": "./numeral_odin.json" }
  ]
}
```

Exceptions are tested before the base paradigm's sections are used. The first matching exception wins.

### 5.2 Tag Variables (`tagVariables`)

For paradigms where invariant tags (like gender or animacy) must appear in every cell but vary per lemma, template variables avoid duplicating the entire paradigm per variant.

Tag variables may be defined in `meta.json` (shared across all paradigm files) or in individual paradigm files (local to that paradigm). If a paradigm file defines a variable with the same name as one in `meta.json`, the paradigm-level definition takes precedence.

```json
{
  "tagVariables": {
    "$gender": ["Msc", "Fem", "Neu"],
    "$animacy": ["Anim", "Inan"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `$varName` | string[] | Ordered list of possible tag values. The first matched tag is used as the variable value. |

Tag matching is boundary-aware and depends on `meta.json`:

- If `tagSuffix` is set, a tag value `X` matches only `tagPrefix + X + tagSuffix`.
- If `tagSuffix` is not set, a tag value `X` matches only `tagPrefix + X + (tagPrefix | $)`.

This prevents partial matches. For example, with `tagPrefix="+"` and no `tagSuffix`, `N` matches `+N` but not `+Nom`.

Variables are referenced in cell tag sequences as `$varName`. For example, a Russian noun cell might use:

```json
{ "cells": ["+N+$gender+$animacy+Sg+Nom", "+N+$gender+$animacy+Pl+Nom"] }
```

Before generation, all `$varName` occurrences in tag sequences are replaced with the extracted value. For a reading like `стол+N+Msc+Inan+Sg+Nom`, the tag variables `$gender=Msc` and `$animacy=Inan` would be extracted, producing generator inputs `стол+N+Msc+Inan+Sg+Nom` and `стол+N+Msc+Inan+Pl+Nom`.

### 5.3 Fallback Chains (`fallbacks`)

When a generator fails to produce a form for a given input, fallbacks define alternative inputs to try in order.

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

| Field | Type | Description |
|-------|------|-------------|
| `replace` | string | Substring in the input to replace |
| `with` | string | Replacement string |
| `append` | string | String to append to the input |
| `styleClass` | string or string[] | Style class(es) applied to forms produced by this fallback (see §5.9) |

Fallbacks are tried in order. The first that produces a form is used. If a `styleClass` is present, implementations should annotate the form accordingly (e.g. an "improbable" class might be rendered as strikethrough, dimmed, or with a tooltip).

### 5.4 Sections

A section groups related tables under a heading.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Section heading (localization key or literal text) |
| `tables` | Table[] | Yes | Tables within this section |
| `showIf` | Condition | No | Condition for including this section (see §5.8) |
| `validateRows` | boolean | No | If true, flag rows where ALL cells fail to generate (see §5.10) |
| `styleClass` | string or string[] | No | Style class(es) for this section (see §5.9) |

### 5.5 Tables

A table defines a grid of generated forms.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Table sub-heading |
| `headers` | string[] | Yes | Column headers (localization keys or literal text). Empty string `""` for unlabeled columns. |
| `rows` | Row[] | Yes | Row definitions |
| `showIf` | Condition | No | Condition for including this table (see §5.8) |
| `validateRows` | boolean | No | If true, flag rows where ALL cells fail to generate (see §5.10) |
| `styleClass` | string or string[] | No | Style class(es) for this table (see §5.9) |

### 5.6 Rows

A row defines one horizontal line in a table.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes | Row label (localization key or literal text) |
| `cells` | Cell[] | Yes | Cell definitions (see §5.7) |
| `colspan` | integer[] | No | Span widths for each cell. Each element specifies how many columns the corresponding cell occupies. If omitted, each cell occupies 1 column. |
| `styleClass` | string or string[] | No | Style class(es) for this row (see §5.9) |

The `colspan` array allows flexible column spanning. For example:
- `"colspan": [2]` — single cell spans 2 columns (e.g. Essive with no Sg/Pl distinction)
- `"colspan": [1, 2]` — first cell takes 1 column, second cell spans 2

### 5.7 Cell Format

Each cell specifies a tag sequence that, combined with the lemma, produces a generator input. The tag sequence is the cell's structural definition; the generated surface form is the cell's content, produced by the FST.

Tag sequences may contain template variables (see §5.2). Before generation, all `$varName` references are replaced with the extracted values. For example, `"+N+$gender+$animacy+Sg+Nom"` with `$gender=Msc` and `$animacy=Inan` becomes `"+N+Msc+Inan+Sg+Nom"`.

Cells can be specified in three formats:

#### Simple format (string)

A tag sequence string appended to the lemma:

```json
{ "cells": ["+N+Sg+Nom", "+N+Pl+Nom"] }
```

For lemma `guolli`, these produce generator inputs `guolli+N+Sg+Nom` and `guolli+N+Pl+Nom`.

#### Object format

When a cell needs a style class or other metadata:

```json
{
  "cells": [
    "+V+Ind+Prs+Sg1",
    { "tagSequence": "+V+Ind+Prs+ConNeg", "styleClass": "connegative" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tagSequence` | string | Yes | Tag sequence appended to lemma to produce a generator input |
| `styleClass` | string or string[] | Yes | Style class(es) for this cell (see §5.9) |
| `onlyIfGenerates` | boolean | No | If `true` (the default), this cell is only included if the generator produces a form. If `false`, the cell is always included (with an emdash or similar placeholder if generation fails). |

Object format always requires a `styleClass` — if a cell needs no style annotation, use simple string format instead.

#### Array format (cell with additional forms)

When a cell position has additional forms (e.g. sub-cases like Vocative alongside Nominative, or variant forms like Locative2 alongside Locative), the cell is an array:

```json
{
  "cells": [
    ["+N+$gender+$animacy+Sg+Nom",
     { "tagSequence": "+N+$gender+$animacy+Sg+Voc", "styleClass": "subcase" }],
    "+N+$gender+$animacy+Pl+Nom"
  ]
}
```

The first element is the primary form (string or object format). All subsequent elements must be in object format (with required `styleClass`). This keeps additional forms co-located with the primary form they belong to, rather than requiring cross-referencing via column indices.

A row's `cells` array may mix all three formats: simple strings, objects, and arrays.

### 5.8 Conditions (`showIf`)

Conditions are declarative objects that evaluate to true or false based on the reading, lemma, or paradigm data. They annotate structural elements (sections, tables) with metadata about when those elements are relevant. Implementations decide how to act on false conditions — common strategies include hiding the element, greying it out, or adding a CSS class.

#### `hasTags`

True if any form in the paradigm data contains ALL of the specified tags:

```json
{ "showIf": { "hasTags": ["Px"] } }
```

#### `lacksTags`

True if NO form in the paradigm data contains ANY of the specified tags:

```json
{ "showIf": { "lacksTags": ["Px"] } }
```

#### `hasLemma`

True if the lemma matches a regex:

```json
{ "showIf": { "hasLemma": "^(один|одна|одно)$" } }
```

#### Combining conditions

Conditions can be combined with `allOf` or `anyOf`:

```json
{
  "showIf": {
    "allOf": [
      { "hasTags": ["V"] },
      { "lacksTags": ["Neg"] }
    ]
  }
}
```

### 5.9 Style Classes (`styleClass`)

Every structural element in the paradigm — sections, tables, rows, cells (object format), and fallback-produced forms — may carry an optional `styleClass` field. For cells in object format, `styleClass` is required. This field accepts a string or array of strings.

```json
{ "styleClass": "group-end" }
{ "styleClass": ["key-form", "highlighted"] }
```

Style classes are **semantic labels**, not rendering instructions. They provide hooks that implementations can use to apply visual presentation appropriate to their output format:

- An HTML renderer might map `"group-end"` to a CSS class that adds a bottom border.
- A Markdown renderer might insert a blank line.
- A plain-text renderer might ignore it entirely.

**Suggested class names** (implementations may define their own):

| Class | Suggested meaning |
|-------|-------------------|
| `group-end` | Last element in a logical group (e.g. after Sg3 before Du1) |
| `improbable` | Form is grammatically unlikely or impossible (e.g. `+Fac`, `+Prb` fallbacks) |
| `subcase` | A sub-case form (Vocative, Locative2, Partitive) |
| `connegative` | A connegative form |
| `key-form` | A key/citation form for compact paradigm display |
| `full-only` | Form shown only in full paradigm display |
| `compact-only` | Form shown only in compact paradigm display |

The `key-form`, `full-only`, and `compact-only` classes enable **paradigm size variants**: implementations can filter rows by class to produce key/compact/standard/full views from a single paradigm file.

### 5.10 Row Validation (`validateRows`)

When `validateRows` is true on a section or table, it flags rows where ALL cells failed to generate a form. This is a semantic annotation — implementations decide how to handle flagged rows (hide them, grey them out, mark them with a class, etc.).

## 6. Generation Workflow

An implementation processes a paradigm specification as follows:

1. **Select paradigm**: Given a reading, test each paradigm file's `match` regex. For the matching paradigm, check `exceptions` in order. Use the first matching exception's `use` target, or the base paradigm if none match.

2. **Extract tag variables**: Merge `tagVariables` from `meta.json` and the selected paradigm file (paradigm-level takes precedence). Scan the reading and match tags using `tagPrefix` and `tagSuffix` rules. Replace all `$varName` placeholders in tag sequences throughout the paradigm.

3. **Evaluate conditions**: For each section and table, evaluate `showIf` conditions against the available paradigm data. Handle sections/tables whose conditions are false according to the implementation's strategy.

4. **Generate forms**: For each row and cell, construct the generator input as `lemma + cellTagSequence`. Send to the FST generator. If generation fails and `fallbacks` are defined, try each fallback in order.

5. **Handle additional forms**: For cells in array format, generate all additional forms (elements after the first). For each additional form, respect the `onlyIfGenerates` flag (default `true`): only include the form if the generator produces output.

6. **Apply validateRows**: If `validateRows` is true on a section or table, flag rows where all cells produced no form. Implementations decide how to handle flagged rows.

7. **Render**: Format the resulting table structure in the target output format (HTML, Markdown, txt, etc.), looking up labels in `meta.json`'s `localization` map and applying `styleClass` annotations.

### Efficiency note

For efficiency, implementations may pre-generate all forms for the lemma at once rather than generating per cell. The paradigm structure can then be populated by looking up pre-generated forms. Fallback variants (e.g. `+Fac`, `+Prb` alternatives) and additional cell forms can be included in the initial generation batch. This is especially beneficial for HFST-based implementations where FST lookup has per-call overhead.

## 7. Cross-Language Regex Compatibility

The `match` field uses a restricted regex subset compatible with JavaScript, Python (`re`), Java (`java.util.regex`), and PCRE:

**Supported features:**
- Character classes: `[abc]`, `[^abc]`, `[a-z]`
- Quantifiers: `*`, `+`, `?`, `{n}`, `{n,m}`
- Alternation: `|`
- Grouping: `(...)` (non-capturing preferred: `(?:...)`)
- Anchors: `^`, `$`
- Escape sequences: `\+`, `\.`, `\\`, `\d`, `\w`, `\s`
- Unicode: literal Unicode characters

**Avoided features** (not portable):
- Lookbehind: `(?<=...)`, `(?<!...)`
- Named groups: `(?P<name>...)`
- Possessive quantifiers: `*+`, `++`
- Atomic groups: `(?>...)`

## 8. Implementation Notes

### Minimal implementation

A minimal implementation needs only:
1. JSON parsing
2. Regex matching
3. String concatenation (lemma + tag sequence)
4. Iteration over sections/tables/rows

It does NOT need to call an FST — it produces generator inputs that the caller sends to whatever generation backend is available (HFST, hfst-ospell, an API, etc.).

### Localization

Labels are resolved by looking up the string in `meta.json`'s `localization` map for the desired locale. If no entry exists, the string is used literally. This means paradigm files can use either:
- Raw tag names as labels (e.g. `"Nom"`) — resolved via localization
- Pre-localized strings (e.g. `"Nominative"`) — used as-is

### Style classes

The standard does not prescribe rendering. The `styleClass` field provides semantic hooks that implementations interpret as appropriate for their output format. A plain-text renderer might ignore all style classes; an HTML renderer might map them to CSS classes; a JSON API might pass them through for client-side rendering.

### Compound forms

Some paradigms include compound forms where an auxiliary word accompanies the generated form (e.g. Sámi perfect tense: auxiliary "lean" + past participle). These auxiliary words are not part of the lemma's morphological paradigm — they belong to a different lexeme. The standard does not encode display-only fixed strings. Implementations that wish to show compound forms should handle auxiliary word lookup separately (e.g. by generating from the auxiliary verb's paradigm, or from a lookup table).

## 9. Versioning

The specification version is tracked in `meta.json`'s `version` field. Paradigm files reference the specification version via their `$schema` URI. Breaking changes increment the major version; additive changes increment the minor version.

## 10. Future Considerations

Features identified during analysis that are not yet part of the standard but may be added:

- **Paradigm sizes**: Key/compact/standard/full variants of the same paradigm (partially addressed via `styleClass` labels like `key-form`, `full-only`)
- **Form matching**: Declarative rules for highlighting which paradigm cell corresponds to the input reading
- **Cross-standard tag mapping**: Integration with UniMorph or other universal tag standards
- **Computed rows**: Rows generated by iterating over a list of values (e.g. all persons × numbers) to reduce repetition
- **Audio/TTS hooks**: Integration with speech synthesis for generated forms
