# Analysis: RLTK Extension -- Paradigm Generation

**Source file:** `src/rltk/sidepanel.js`, method `generateParadigm()` (lines ~3519--4236)

## 1. Approach and Architecture

RLTK uses a **runtime, client-side generation** model. When a user clicks a word on a webpage, the extension:

1. Receives a `lemma`, `pos`, `tags` array, and optionally `currentReadings` and `surfaceForm`.
2. Infers the POS from a fixed set (`N`, `V`, `A`, `Adj`, `Det`, `Num`, `Pron`) and normalizes it.
3. Computes `baseTags` by stripping all "vary" tags (the tags that change across paradigm cells) from the input tags.
4. Constructs tag strings for each cell as `lemma + baseTags + cellTags`.
5. Calls an asynchronous `generateForm()` function for each cell, which sends messages to a background service running HFST via WASM.
6. Assembles the results into HTML tables.

The core algorithmic pattern is:

```javascript
// Strip tags that vary across the paradigm
const varyTags = ['Sg', 'Pl', 'Nom', 'Gen', 'Dat', 'Acc', 'Ins', 'Loc', ...];
const baseTagsList = tags.filter(t => !varyTags.includes(t));
const baseTags = baseTagsList.length > 0 ? '+' + baseTagsList.join('+') : '';

// Generate each cell
const sgInput = `${lemma}${baseTags}+Sg+${caseTag}`;
const form = await generateForm(sgInput);
```

This is a **generate-on-demand** architecture: no paradigm data is pre-computed or cached. Every cell is individually requested from the HFST transducer.

## 2. POS Types and Table Shapes

RLTK supports 5 distinct paradigm shapes (with sub-variants for numerals):

### Nouns (`pos === 'N'`)
- **Shape:** 6 cases (Nom, Acc, Gen, Loc, Dat, Ins) x 2 numbers (Sg, Pl) = 12 core cells
- **Secondary forms:** Loc2 (locative sub-case), Voc (vocative), shown as optional sub-forms within their parent case cell
- **Example cell construction:** `lemma+N+Msc+Inan+Sg+Nom`

### Adjectives (`pos === 'A' || 'Adj' || 'Det'`)
- **Shape:** 6 cases x 4 gender/number columns (Masc, Neut, Fem, Plural) = 24 core cells
- **Accusative special handling:** Animate/Inanimate variants for Masc and Pl (up to 6 sub-cells for Acc row)
- **Short forms (Pred):** Extra row with Masc/Neut/Fem/Pl (excluded for Det)
- **Comparative:** Single row spanning all columns (excluded for Det)
- **Example cell construction:** `lemma+A+Msc+AnIn+Sg+Nom`, `lemma+A+Msc+Inan+Sg+Acc`

### Numerals (`pos === 'Num'`)
Four sub-paradigms based on lemma routing:

| Lemma group | Table shape |
|---|---|
| `один/одна/одно/одни` (and ordinals) | Adjective-like: 6 cases x 4 genders |
| `два/две` | 6 cases x 3 genders (Masc, Neut, Fem) -- no Pl column |
| `оба/обе` | 6 cases x 3 genders (Masc, Neut, Fem) -- no Pl column |
| All other numerals | 6 cases x 1 column (single form) |

The numeral routing code:

```javascript
const adjectivalLemmas = new Set(['один', 'одна', 'одно', 'одни']);
const twoLemmas = new Set(['два', 'две']);
const paucalLemmas = new Set(['оба', 'обе']);
const isOrdinal = tags.includes('Ord');

if (adjectivalLemmas.has(normalizedLemma) || isOrdinal) {
    // Adjective-like table
} else if (twoLemmas.has(normalizedLemma)) {
    // Three-column gender table
} else if (paucalLemmas.has(normalizedLemma)) {
    // Three-column gender table
} else {
    // Single-column table
}
```

### Verbs (`pos === 'V'`)
- **Present/Future:** 3 persons x 2 numbers (tense label depends on aspect: Impf -> Present, Perf -> Future)
- **Past:** 3 genders Sg + Pl = 4 cells
- **Imperative:** Sg2 + Pl2 = 2 cells
- **Infinitive:** 1 cell
- **Participles and Gerunds:** 2 x 3 grid (Active/Passive x Present/Past for participles, + verbal adverbs)
- **Passive voice toggle:** Each verb form is also generated with `+Pass` appended; if a passive form exists, it is hidden behind a toggle

### Pronouns (`pos === 'Pron'`)
- **Shape:** 6 cases x 1 column
- Tags are taken from the analysis (preserving person, gender, number) with only the case tag replaced
- Paradigm does not split by gender/number since pronouns are highly irregular

## 3. The `generateForm()` Fallback Chain

The `generateForm()` function implements a sophisticated multi-step fallback strategy:

```
1. Try primary form (lemma + tags, with stress)
   |
   +--> Success: return stressed form
   |
   +--> Failure + has +Num tag:
   |     Try replacing +Num with +A, removing +Num, replacing with +Adj
   |     |
   |     +--> Success: return form
   |
   +--> Failure: Try appending +Fac (factitive/unlikely)
   |     |
   |     +--> Success: return with strikethrough styling
   |
   +--> Failure: Try appending +Prb (probable/improbable)
   |     |
   |     +--> Success: return with strikethrough + "impossible or unlikely" tooltip
   |
   +--> Failure: Try without stress accenting
   |     |
   |     +--> Success: return unstressed form
   |
   +--> Failure: return em-dash "---"
```

This chain is critical because the HFST transducer may fail for certain tag combinations, and the fallback to `+Fac`/`+Prb` allows displaying grammatically marginal forms with appropriate visual marking.

## 4. The `checkMatch()` Function

When the user clicks a specific word form, `checkMatch()` highlights that form's cell in the paradigm:

```javascript
const checkMatch = (input, generatedForm) => {
    // Compare input tags against currentReadings
    // Normalize: strip stress marks, replace ё with е, lowercase
    // If match found, highlight with yellow background
    // If surface form differs from generated form, show both
};
```

Key details:
- Certain tags (`Ind`, `AnIn`, and optionally `Num`) are ignored during comparison.
- Participle matching uses a relaxed comparison that ignores inflectional tags (gender, case, number, animacy).
- Passive voice matching is strict (except for inherently passive participles like PrsPss/PstPss).
- Surface form variants (when the clicked form differs from the canonical generated form) are shown with a subtle yellow annotation.

## 5. Passive Voice Handling

The `generateVerbForm()` wrapper generates both active and passive forms for each verb cell:

```javascript
const generateVerbForm = async (input) => {
    const activeHtml = await generateForm(input);
    let passiveInput = input + '+Pass';
    // Special handling for participles
    let passiveHtml = await generateForm(passiveInput);
    if (!passiveHtml.includes('---')) {
        hasPassive = true;
        return `${activeHtml} <span class="passive-variant" style="display:none">(...)</span>`;
    }
    return activeHtml;
};
```

The passive forms are hidden by default and toggled via a UI control. The `hasPassive` flag propagates up to the caller to conditionally show the toggle button.

## 6. Stress Accenting

Forms are generated with stress marks via an async service call to the background script. The `sendGenerateRequest` function includes a 5-second timeout:

```javascript
const sendGenerateRequest = async (requestInput, useStress) => {
    const request = chrome.runtime.sendMessage({
        action: 'generate', input: requestInput, useStress
    });
    const timeout = new Promise(resolve => {
        setTimeout(() => resolve({ success: false, data: [] }), 5000);
    });
    return Promise.race([request, timeout]);
};
```

Participle surface forms receive special accent handling via `accentParticipleSurfaceForm()`, which reconstructs the reading tags from the participle reading and generates the accented form.

## 7. Strengths

1. **Complete runtime generation:** No pre-computation needed; works with any lemma the transducer knows.
2. **Robust fallback chain:** Graceful degradation when forms fail to generate, including visual indication of marginal forms (`+Fac`/`+Prb` with strikethrough).
3. **Rich UI features:** Highlighted current form, surface-form variant display, passive voice toggle, case tooltips with grammar snippets, stress marks.
4. **Nuanced numeral handling:** Lemma-specific routing for the morphologically diverse Russian numeral system.
5. **Secondary forms:** Loc2, Voc, Partitive displayed as optional sub-forms rather than requiring a different table shape.
6. **Parallel generation:** Uses `Promise.all()` to generate multiple cells concurrently.
7. **Capitalization matching:** Preserves the original capitalization pattern of the surface form.

## 8. Weaknesses

1. **Massive monolithic method:** ~700 lines of imperative JavaScript in a single method with deeply nested conditionals. Extremely difficult to maintain, extend, or port.
2. **Russian-only:** Every POS handler, tag name, label, and fallback is hardcoded for Russian morphology. No path to supporting other languages without rewriting.
3. **Hardcoded table shapes:** The paradigm dimensions (which cases, which genders, which tenses) are embedded in the code, not in data. Adding a new sub-case or removing a row requires code changes.
4. **Hardcoded tag strings:** Tags like `'Nom'`, `'Msc'`, `'AnIn'`, `'PrsAct'` are string literals scattered throughout. No tag inventory or validation.
5. **POS routing is brittle:** The `if/else if` chain for POS handling does not scale to new POS types or languages.
6. **No paradigm size options:** Always generates the full paradigm. No compact/key-forms mode.
7. **Performance concern:** Each cell makes a separate async call to the HFST backend. A full verb paradigm with passive forms could require 40+ individual generation requests.
8. **Label/display logic is interleaved with generation logic:** Renaming "Ins" to "Inst" and "Loc" to "Prep" is done inline. No separation of concerns.

## 9. Features the Standard Must Accommodate

Based on RLTK's implementation, the declarative standard needs to support:

| Feature | Detail |
|---|---|
| **POS-specific table shapes** | Different row/column structures per POS |
| **Vary tags vs. base tags** | Declarative specification of which tags are held constant vs. varied |
| **Cell tag construction** | Formula: `lemma + baseTags + cellTags` |
| **Accusative animate/inanimate splits** | Cells that expand into sub-cells based on animacy |
| **Secondary/optional forms** | Loc2, Voc, Partitive -- forms that appear only when they generate successfully |
| **Fallback chains** | Ordered list of alternative tag sequences to try when generation fails |
| **Form probability markers** | `+Fac`, `+Prb` for marking improbable/impossible forms |
| **Lemma-specific routing** | Different paradigm shapes for specific lemmas (e.g., numerals один, два, оба) |
| **Aspect-conditioned tables** | Verb tense label and form set depend on aspect (Impf vs. Perf) |
| **Passive voice as toggle** | Passive forms generated alongside active but displayed conditionally |
| **Participle sub-paradigms** | Participles shown in citation form within verb paradigm |
| **Current-form highlighting** | Mechanism to identify which cell matches the clicked word |
| **Stress/accent marks** | Support for requesting accented forms from the generator |
| **Tag aliasing in labels** | `Ins` -> `Inst`, `Loc` -> `Prep` (display labels differ from tag names) |
| **Comparative degree** | Single-cell special row |

## 10. Adaptability to a Declarative Model

RLTK's approach is highly procedural but reveals clear patterns that map well to a declarative specification:

**Easy to declarativize:**
- The `varyTags` arrays for each POS are essentially the "dimensions" of a paradigm.
- The table column/row structure is regular within each POS.
- The `baseTags` computation is a simple set difference (all tags minus vary tags).
- Cell tag construction follows a predictable formula.

**Moderately challenging:**
- The accusative animate/inanimate split requires conditional cell expansion (a cell that becomes two sub-cells depending on whether both generate).
- Secondary forms (Loc2, Voc) require "try and show if successful" semantics.
- Aspect-conditioned verb tables need a tag-based conditional to select between Present and Future.

**Most challenging to declarativize:**
- The `generateForm()` fallback chain involves ordered alternative tag sequences with different display styling per fallback level. This could be specified as an ordered list of `{ tags, displayStyle }` objects.
- Lemma-specific routing for numerals requires pattern-matching on the lemma itself, not just on tags.
- The passive voice toggle involves generating parallel forms for every cell with different tag suffixes, then conditionally displaying them -- this is more of a UI concern than a paradigm-shape concern, but the standard should at least allow declaring "parallel dimensions" (e.g., active/passive).
- `checkMatch()` logic depends on reading comparison semantics that may vary by language.

A well-designed declarative standard could capture roughly 85-90% of what RLTK does procedurally, with the remaining 10-15% handled by a small set of standardized "hooks" or "extension points" for fallback behavior, conditional display, and lemma-specific overrides.
