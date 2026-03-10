# Analysis: satni-frontend Paradigm Generation

## Repository

`divvun/satni-frontend` — A React frontend for Divvun's GraphQL dictionary and term API backend (sátni.org).

## Architecture Overview

satni-frontend takes a simple, data-driven approach to paradigm rendering. Paradigm data is received from a GraphQL API as a dictionary mapping tag paths to arrays of surface forms. The frontend defines static arrays of `{name, values[]}` objects per language per POS, and iterates over them to render HTML tables.

### Key Files

| File | Purpose |
|------|---------|
| `src/features/paradigm/NounParadigm.tsx` | Noun paradigm table definition and rendering |
| `src/features/paradigm/AdjParadigm.tsx` | Adjective paradigm table definition and rendering |

## Data Format

### Input Data

The API provides paradigm data as an `Analyses` object:

```typescript
interface Analyses {
  [key: string]: string[];  // tag path → array of surface forms
}
```

For example:
```json
{
  "+N+Sg+Nom": ["guolli"],
  "+N+Pl+Nom": ["guolit"],
  "+N+Sg+Acc": ["guoli"],
  ...
}
```

### Table Row Definitions

Each POS defines its paradigm shape as a `TableRowData` object keyed by ISO 639 language code:

```typescript
interface TableRowItem {
  name: string;      // Row label (e.g. "Nom", "Acc")
  values: string[];  // Tag paths for each column
}

interface TableRowData {
  [language: string]: TableRowItem[];  // Language → row definitions
}
```

### Example: North Sámi Noun

```typescript
export const NounTableRows: TableRowData = {
  sme: [
    { name: "Nom", values: ["+N+Sg+Nom", "+N+Pl+Nom"] },
    { name: "Acc", values: ["+N+Sg+Acc", "+N+Pl+Acc"] },
    { name: "Gen", values: ["+N+Sg+Gen", "+N+Pl+Gen"] },
    { name: "Ill", values: ["+N+Sg+Ill", "+N+Pl+Ill"] },
    { name: "Loc", values: ["+N+Sg+Loc", "+N+Pl+Loc"] },
    { name: "Com", values: ["+N+Sg+Com", "+N+Pl+Com"] },
    { name: "Ess", values: ["+N+Ess"] },              // single column, uses colspan
  ],
  // ... also sma, smj, smn, sms, fin
};
```

Column headers are hardcoded: `["", "Sg", "Pl"]` for nouns.

### Example: Adjective (3-column with degree)

Adjective paradigms use three columns: Positive, Comparative, Superlative. Tag paths include derivation tags for degree:

```typescript
export const AdjTableRows: TableRowData = {
  sme: [
    { name: "Attr",   values: ["+A+Attr",   "+A+Der/Comp+A+Attr",   "+A+Der/Superl+A+Attr"] },
    { name: "Sg/Nom", values: ["+A+Sg+Nom", "+A+Der/Comp+A+Sg+Nom", "+A+Der/Superl+A+Sg+Nom"] },
    // ...
  ]
};
```

Note how derivation tags (`+Der/Comp+A`, `+Der/Superl+A`) are embedded directly in the tag paths — the system uses full tag paths per cell.

## Rendering Logic

The rendering is simple and generic:

1. Iterate over `TableRows[language]` for the POS
2. For each row, check if any `values` entry exists in the `analyses` object
3. If yes, render the row; if no data exists for any value, skip the row entirely
4. If a row has only 1 value, use `colSpan={2}` to center it
5. If a row has multiple values, render one `<TableCell>` per value
6. Each cell can contain multiple surface forms (the `analyses[tag]` array)

```typescript
// Row visibility check — skip rows with no generated data
if (MapTableRow.values.some((value) => analyses[value])) {
  return <MyTableRow ... />;
}
return null;
```

This is equivalent to `validateRows: true` in the proposed standard — rows are hidden when all cells fail to generate.

## Languages Supported

| Language | Code | Noun cases | Adj forms |
|----------|------|------------|-----------|
| South Sámi | sma | 8 (Nom–Ess) | Attr + 7 cases × Sg/Pl + Ess |
| North Sámi | sme | 7 (Nom–Ess) | Attr + 6 cases × Sg/Pl + Ess |
| Lule Sámi | smj | 9 (Nom–Ess) | Attr + 7 cases × Sg/Pl + Ess |
| Inari Sámi | smn | 9 (Nom–Ess, incl Par) | Attr + 7 cases × Sg/Pl + Par + Ess |
| Skolt Sámi | sms | 9 (Nom–Ess, incl Par) | Attr + 8 cases × Sg/Pl + Par + Ess |
| Finnish | fin | 13 (Nom–Ins) | Attr + 12 cases × Sg/Pl |

## Strengths

1. **Simplicity**: The simplest approach of all analyzed projects. Minimal code, easy to understand.
2. **Full tag paths**: Already uses complete tag paths per cell (matching the proposed standard's design choice).
3. **Data-driven**: Row definitions are pure data (`{name, values}` arrays), not code.
4. **Colspan handling**: Gracefully handles cells spanning multiple columns (e.g. Essive with no Sg/Pl distinction).
5. **Row validation**: Automatically skips rows with no generated data.
6. **Multi-language per POS**: Same component supports multiple languages with different case inventories.

## Limitations

1. **No conditional sections**: No way to show/hide entire sections based on tags (no `showIf` equivalent).
2. **No exception handling**: No mechanism for different paradigm shapes per sub-POS (e.g. proper nouns vs common nouns).
3. **No localization**: Row labels are raw tag names (`"Nom"`, `"Acc"`), and column headers are hardcoded English strings.
4. **No secondary forms**: No support for sub-cases, variant forms, or parenthetical displays.
5. **No fallback chains**: If generation fails, the cell is simply empty — no alternative generation strategies.
6. **No prefixes**: No support for composite forms where a fixed word precedes the generated form.
7. **No sections/sub-tables**: Each POS is a single flat table — no grouping (e.g. no "Possessive suffixes" section for nouns).
8. **Tightly coupled to React**: The data is interleaved with JSX rendering components in the same file.
9. **Hardcoded column headers**: Cannot vary column headers dynamically.
10. **No verb paradigms visible**: Only noun and adjective paradigms were found in the repository.

## Mapping to Proposed Standard

| satni concept | Standard equivalent |
|---------------|---------------------|
| `TableRowItem.name` | `row.label` |
| `TableRowItem.values` | `row.cells` (as simple tag path strings) |
| `values.length === 1` + `colSpan={2}` | `row.colspan: 2` |
| Row skip on empty | `section.validateRows: true` or `table.validateRows: true` |
| `NounTableRows.sme` | Separate paradigm file per language (e.g. `lang-sme/noun.json`) |
| `AdjTableRows` 3-column layout | Table with `headers: ["", "Positive", "Comparative", "Superlative"]` |

## Key Insights for the Standard

1. **The satni approach validates the "full tag path per cell" design**: satni already uses complete tag paths like `"+N+Sg+Nom"` and `"+A+Der/Comp+A+Sg+Nom"` without any baseTags computation or variable substitution. This confirms the approach is workable and natural.

2. **Colspan is necessary**: Essive and other "number-neutral" forms need to span the Sg and Pl columns. The standard should support this.

3. **Per-language row definitions are needed**: Each language has a different case inventory even within the Sámi family. The standard correctly places paradigm specs per-language rather than trying to share across languages.

4. **Simple is viable for simple languages**: For languages without complex conditional paradigms (possessive suffixes, compound tenses, exception sub-types), the satni approach works well. The standard should be simple enough that basic paradigms are not overly complex to specify.
