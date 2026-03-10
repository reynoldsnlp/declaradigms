# Analysis: Old VIEW Extension -- Paradigm Generation

**Source files:**
- **Frontend:** `old/webextension/viewWE/content_scripts/js/activities/assistiveReading/paradigms.js`
- **Backend:** `old/backend/app/src/main/java/werti/uima/enhancer/HFSTRusAssistiveReadingEnhancer.java`

## 1. Approach and Architecture

The old VIEW extension uses a **two-tier, pre-computed** paradigm generation model:

```
[Java Backend (UIMA/HFST)]          [JavaScript Frontend]
         |                                    |
  1. Analyze text with CG3              5. Parse paradigm string
  2. Extract readings                   6. Map tags -> cells via tag dicts
  3. Construct all possible tag         7. Look up forms by tag key
     combinations for paradigm          8. Build HTML tables
  4. Run each through HFST generator
  5. Serialize as delimited string
  6. Embed in HTML data attributes
         |                                    |
         +-------- HTTP response ------------>+
```

### Backend: `HFSTRusAssistiveReadingEnhancer.java`

The Java backend extends `AbstractHFSTRussianEnhancer` and operates within a UIMA pipeline:

1. **Token processing:** Each CG token is checked against POS patterns using regex:
   ```java
   Pattern posPattern = Pattern.compile("\\+(N|A|V|Pron|Det|Num|Num\\+Ord)\\+");
   Pattern posIndeclPattern = Pattern.compile("\\+(Abbr|Adv.*|CC|CS|Interj|Paren|Pcle|Po|Pr)\\b");
   ```

2. **Reading selection:** The first valid reading (non-ruled-out, matching a POS pattern) is selected. Readings with `+Fac` or `+Prb` are excluded entirely.

3. **Deduplication:** Multiple readings for the same word are deduplicated by constructing a "distinct element" key:
   ```java
   String distinctElement = readingLemma + "+" + pos;
   // For verbs, add aspect and transitivity
   if (pos.equals("V")) {
       distinctElement += "+" + aspect + "+" + transitivity + "+" + tenseVoice;
   }
   ```

4. **Paradigm construction:** The `createParadigms()` method generates all possible tag combinations by:
   - Identifying the current case/tense/person tag in the reading
   - Replacing it with every other tag in the same category
   - For adjectives: also replacing gender tags to generate all 4 gender columns
   - For nouns: also replacing number (Sg/Pl)
   - For verbs: generating present/future, past, imperative, infinitive, gerunds, and participles

5. **HFST generation:** Each constructed reading is run through the `HFSTStressGenerator` transducer, producing a surface form (or empty string on failure).

6. **Serialization:** Results are packed into a delimited string using special Unicode delimiter sequences:
   ```
   ñôŃßĘńŠēNEWPARADIGM,reading1:form1,reading2:form2,...ñôŃßĘńŠēPARADIGMEND,
   ```

7. **Embedding:** The serialized paradigm string is added as a `data-paradigms` attribute on the enhanced HTML element.

### Frontend: `paradigms.js`

The frontend receives the pre-computed paradigm data and renders it:

1. **Parsing:** Split the paradigm string on the `ñôŃßĘńŠēPARADIGMEND,` delimiter, then split each paradigm on `,` to get `reading:form` pairs.

2. **POS inference:** Check the reading string for POS markers:
   ```javascript
   if (pair[0].includes("+N+")) { tagDict = nounTagDict; paradigmDict["pos"] = "N"; }
   else if (pair[0].includes("+Ord+")) { tagDict = adjectiveTagDict; ... }
   else if (pair[0].includes("+Num+")) { ... }
   else if (pair[0].includes("+A+")) { tagDict = adjectiveTagDict; ... }
   else if (pair[0].includes("+V+")) { tagDict = verbTagDict; ... }
   ```

3. **Tag matching:** For each `reading:form` pair, the code checks if all tags in the tag dictionary entry are present in the reading:
   ```javascript
   for (var key in tagDict) {
       const tags = tagDict[key];
       var tagsInPair = true;
       for (var tag of tags) {
           if (!pair[0].includes(tag) || ...) {
               tagsInPair = false;
           }
       }
       if (tagsInPair) { paradigmDict[key] = pair[1]; }
   }
   ```

4. **Table rendering:** The paradigm dictionary is read by POS-specific rendering code that constructs jQuery table elements.

## 2. Tag Dictionaries

The frontend uses five tag dictionaries that serve as the paradigm cell specifications. Each maps a tag-combination key to an array of tags that must all be present in a reading for it to match that cell.

### `nounTagDict` (18 entries)

```javascript
const nounTagDict = {
    "+Sg+Nom": ["+Sg","+Nom"], "+Sg+Acc": ["+Sg","+Acc"],
    "+Sg+Gen": ["+Sg","+Gen"], "+Sg+Gen2": ["+Sg","+Gen2"],
    "+Sg+Loc": ["+Sg","+Loc"], "+Sg+Loc2": ["+Sg","+Loc2"],
    "+Sg+Dat": ["+Sg","+Dat"], "+Sg+Ins": ["+Sg","+Ins"],
    "+Sg+Voc": ["+Sg","+Voc"],
    "+Pl+Nom": ["+Pl","+Nom"], "+Pl+Acc": ["+Pl","+Acc"],
    "+Pl+Gen": ["+Pl","+Gen"], "+Pl+Gen2": ["+Pl","+Gen2"],
    "+Pl+Loc": ["+Pl","+Loc"], "+Pl+Loc2": ["+Pl","+Loc2"],
    "+Pl+Dat": ["+Pl","+Dat"], "+Pl+Ins": ["+Pl","+Ins"],
    "+Pl+Voc": ["+Pl","+Voc"]
};
```

Covers 6 standard cases + Gen2 + Loc2 + Voc = 9 cases x 2 numbers = 18 cells.

### `adjectiveTagDict` (43+ entries)

Covers 4 genders (Msc, Neu, Fem, MFN/Pl) x 6 cases = 24 cells, plus:
- Anim/Inan Acc variants for each gender = +8 cells
- Ins+Leng variants for each gender = +4 cells
- Pred (short form) for each gender = +4 cells
- Cmpar+Pred = +1 cell

Total: approximately 41-43 entries.

### `verbTagDict` (18+ entries)

```javascript
const verbTagDict = {
    "+Prs+Sg1": ..., "+Prs+Sg2": ..., "+Prs+Sg3": ...,
    "+Prs+Pl1": ..., "+Prs+Pl2": ..., "+Prs+Pl3": ...,
    "+Fut+Sg1": ..., "+Fut+Sg2": ..., "+Fut+Sg3": ...,
    "+Fut+Pl1": ..., "+Fut+Pl2": ..., "+Fut+Pl3": ...,
    "+Pst+Msc+Sg": ..., "+Pst+Neu+Sg": ..., "+Pst+Fem+Sg": ..., "+Pst+MFN+Pl": ...,
    "+Imp+Sg2": ..., "+Imp+Pl2": ..., "+Inf": ...,
    "+PrsAct+Adv": ..., "+PstAct+Adv": ...,
    "+PrsAct+Msc+AnIn+Sg+Nom": ..., "+PrsPss+Msc+AnIn+Sg+Nom": ...,
    "+PstAct+Msc+AnIn+Sg+Nom": ..., "+PstPss+Msc+AnIn+Sg+Nom": ...
};
```

Covers: 12 present/future person forms + 4 past forms + 2 imperative + 1 infinitive + 2 gerunds + 4 participle citation forms = 25 entries.

### `twoTagDict` (26 entries)

For numerals like два/оба/полтора. Gender x Case x Animacy combinations without number (Sg/Pl).

### `numberTagDict` (9 entries)

For generic cardinal numerals. Case-only (no gender splitting except for accusative Anim/Inan).

## 3. Backend Paradigm Construction Strategy

The Java backend constructs paradigms through **string replacement** on the original reading. The core strategy per POS:

### Nouns
```
For each case tag in [Nom, Acc, Loc2, Gen2, Gen, Loc, Dat, Ins, Voc]:
    Replace current case tag with each other case tag
Then: Replace +Sg+ with +Pl+ (or vice versa) to generate opposite number
```

### Adjectives
```
For each case tag in [Nom, Acc, Gen, Loc, Dat, Ins, Pred]:
    Replace current case tag with each other case tag
    Special handling for Acc (add Anim, Inan variants), Ins (add Leng), Pred (remove animacy)
For each gender tag in [Msc, Neu, Fem, MFN]:
    Replace current gender with each other gender
    Swap Sg/Pl when switching to/from MFN
Add comparative form: lemma+A+Cmpar+Pred
```

### Verbs
The verb paradigm construction is the most complex, with separate handling for each possible "entry point" (which tense/mood the original reading has):
- From present tense: generate present, future (if Perf or быть), past, imperative, infinitive, gerunds, participles
- From future tense: similar to present
- From past tense: generate all other tenses from past
- From infinitive: generate all tenses from infinitive
- From imperative: generate all from imperative
- From verbal adverb: find the tense tag, replace everything after it
- From participle: find the tense tag, generate full verb paradigm + full adjectival sub-paradigm for the current participle type

This results in highly repetitive code (~400 lines of nearly identical string replacement loops).

## 4. Deduplication Strategy

The backend implements a deduplication mechanism to avoid sending redundant paradigms when a word has multiple readings that produce nearly identical paradigms:

```java
// Compare the generated forms of the new paradigm against each existing paradigm
int differenceCount = 0;
while (listIter.hasNext() && compListIter.hasNext()) {
    if (!listString.equals(compString)) {
        differenceCount += 1;
    }
}
// If 3 or fewer differences, replace the old paradigm (keep the newer one)
if (differenceCount <= 3) {
    replacedListInGenerationList = true;
    generationInputAllList.set(i, comparableCorrectFormList);
}
```

This threshold-based deduplication (<=3 differences = "same paradigm") is a heuristic that avoids presenting the user with nearly-identical tables while preserving genuinely different readings.

## 5. Strengths

1. **Pre-computation offloads work from the client.** The browser only needs to look up forms in a dictionary, not run a transducer. This was important when HFST WASM was not available.
2. **Tag dictionaries are quasi-declarative.** The tag dictionaries (`nounTagDict`, `adjectiveTagDict`, etc.) are essentially data structures describing paradigm cells. They are close to what a declarative standard would look like.
3. **Broader POS coverage in backend.** The Java backend handles nouns, adjectives, verbs, pronouns, numerals (including ordinals), and determiners.
4. **Secondary forms included.** Gen2, Loc2, Voc, Ins+Leng are all present in the tag dictionaries.
5. **Deduplication of ambiguous readings.** The threshold-based comparison avoids overwhelming users with near-duplicate paradigm tables.
6. **Multi-language framework.** The overarching VIEW extension supports English, Spanish, German, and Russian, though paradigm generation is only implemented for Russian.

## 6. Weaknesses

1. **Extreme serialization complexity.** The delimited string format (`ñôŃßĘńŠēPARADIGMEND,`) is fragile, difficult to debug, and essentially a custom binary protocol encoded in Unicode. Any parsing error silently corrupts the paradigm.

2. **Massive code duplication in the backend.** The verb paradigm construction repeats essentially the same loop structure 6 times (once per possible entry tense/mood). Each copy is ~60 lines of nearly identical string replacement logic.

3. **No fallback for generation failures.** If HFST fails to generate a form, the cell is simply empty. There is no `+Fac`/`+Prb` retry (these tags are actively excluded). The frontend shows `---` for missing forms.

4. **Two separate codebases to maintain.** Paradigm logic is split between Java (form generation) and JavaScript (form rendering). Changes to the paradigm shape require edits in both places.

5. **Tag dictionary matching is fragile.** The `includes()` check can produce false positives. For example, the code needs special guards:
   ```javascript
   (tag == "+Gen" && pair[0].includes("+Gen2")) ||
   (tag == "+Loc" && pair[0].includes("+Loc2")) ||
   (tag == "+Ins" && !tags.includes("+Leng") && pair[0].includes("+Leng"))
   ```

6. **No current-form highlighting.** Unlike RLTK, the old VIEW extension does not highlight which cell in the paradigm corresponds to the clicked word.

7. **No stress accent handling on the frontend.** Stress is generated on the backend, but if it fails there is no fallback.

8. **Adjective tables split into two separate HTML tables** (Masc+Neut and Fem+Pl) rather than a single 4-column table. This was presumably a mobile/width constraint but makes the paradigm harder to read as a whole.

9. **Hard dependency on server.** Unlike RLTK's WASM approach, the old VIEW requires a Java backend server to be running. This introduces latency and infrastructure requirements.

10. **Bugs in tag dictionaries.** There are apparent errors in the tag dictionary data:
    ```javascript
    // verbTagDict has malformed entries with extra '+' characters:
    "+Prs+Sg1": ["+Prs+","+Sg1"]  // "+Prs+" should be "+Prs"

    // adjectiveTagDict has a typo in the MFN+Pl+Pred entry:
    "+MFN+Pl+Pred": ["+MFN+","Pl","+Pred"]  // "+MFN+" should be "+MFN", "Pl" missing leading +
    ```

## 7. Features the Standard Must Accommodate

Based on the old VIEW implementation, in addition to features already identified in the RLTK analysis:

| Feature | Detail |
|---|---|
| **Pre-computed paradigm support** | The standard should work for both runtime-generation and pre-computed paradigms. The same cell specification should drive both approaches. |
| **Gen2, Loc2 as distinct cells** | VIEW treats Gen2 and Loc2 as their own cells (not as sub-forms within Gen/Loc), showing both forms in the same visual cell with a separator. |
| **Ins+Leng variants** | The "long" instrumental form is a common Russian variant that needs its own cell specification. |
| **Aspect-conditioned generation** | For verbs, the backend checks aspect to determine whether to generate present or future tense forms. Both Prs and Fut are generated for быть even though it is Impf. |
| **Participle sub-paradigms** | The backend generates full adjectival paradigms for the participle type matching the current reading (case x gender), plus citation forms for the other three participle types. |
| **Deduplication hints** | A mechanism to determine when two readings produce "essentially the same" paradigm. |
| **Entry-point independence** | The paradigm should be the same regardless of which form the user clicked. The backend achieves this through exhaustive string replacement from any starting tense/mood. |
| **Ordinal numbers treated as adjectives** | Ordinals use the adjective tag dictionary and table shape. |
| **Specific numeral lemmas** | два/полтора and оба get separate table layouts. |

## 8. Adaptability to a Declarative Model

The old VIEW extension is surprisingly well-positioned for adaptation to a declarative model, primarily because of its tag dictionaries.

**Already quasi-declarative:**
- The five tag dictionaries (`nounTagDict`, `adjectiveTagDict`, `verbTagDict`, `numberTagDict`, `twoTagDict`) are essentially paradigm cell specifications in data form. Converting them to JSON is nearly mechanical:

```json
{
  "noun": {
    "cells": {
      "+Sg+Nom": { "match_tags": ["+Sg", "+Nom"], "row": "Nom", "col": "Singular" },
      "+Sg+Acc": { "match_tags": ["+Sg", "+Acc"], "row": "Acc", "col": "Singular" },
      ...
    }
  }
}
```

**Requires significant restructuring:**
- The backend's string-replacement paradigm construction (`createParadigms()`) is deeply procedural. It would need to be replaced with a declarative cell enumeration: instead of "take the current reading and replace the case tag," the standard would say "for a noun, generate cells for these tag combinations."
- The serialization format would be entirely replaced by the standard's data format.
- The deduplication logic would need to be expressed as paradigm identity rules.

**Challenges:**
- The backend constructs readings by manipulating the *original analysis reading*, which means it preserves any unusual or language-specific tags that happened to be in the reading. A purely declarative approach would construct readings from the cell specification + base tags, which might miss some tags. The standard would need a clear specification of how "base tags" are determined.
- The participle-within-verb paradigm (where clicking a participle generates a full verb paradigm with an expanded participle sub-table) is a complex nested structure that would need careful declarative representation.
