# Analysis: giellaltconversiontools Paradigm Generation

## Repository

`flammie/giellaltconversiontools` — Python and bash tools for converting between linguistic annotation formats, including paradigm generation for UniMorph format.

## Architecture Overview

This project takes a fundamentally different approach from the other analyzed projects. Rather than defining specific paradigm table shapes, it uses HFST finite-state transducer composition to enumerate **all possible forms** for a given lemma+POS combination. The output is a flat list of forms in UniMorph TSV format, not a structured table.

### Key Files

| File | Purpose |
|------|---------|
| `scripts/generate.bash` | Main paradigm generation script |
| `scripts/excluded.tags` | Tag patterns to filter from generation |

## Generation Pipeline

### Input

Tab-separated input (UniMorph format):
```
lemma	surface_form	POS[;features]
```

Only the lemma (column 1) and POS (column 3) are used.

### Step 1: POS Mapping

Maps UniMorph POS labels to GiellaLT FST tags:

```bash
case $pos in
    ADJ)  gtpos="+A";;
    ADV)  gtpos="+Adv";;
    NUM)  gtpos="+Num";;
    ADP)  gtpos="+Po";;
    INTJ) gtpos="+Interj";;
    CONJ) gtpos="+CS";;
    PRO)  gtpos="+Pron";;
    V)    gtpos="+V";;
    V.PTCP) gtpos="+V";;
    V.MSD)  gtpos="+V";;
    V.CVB)  gtpos="+V";;
    N)    gtpos="+N";;
    *)    gtpos="+$pos?";;
esac
```

### Step 2: Cyclic Tag Filtering

The `excluded.tags` file contains 109 tag patterns that should be excluded from generation. These include:
- Derivation tags: `+Der`, `+Der/Comp`, `+Der/Superl`, `+Der/NomAg`, etc.
- Compounding tags: `+Cmp`, `+Cmp#`
- Error tags: `+Err/Orth`, `+Err/Spellrelax`, etc.
- Usage tags: `+Use/NG`, `+Use/Circ`, `+Use/GC`, etc.
- Special tags: `+ABBR`, `+ACR`, `+Prop`, `+Num`, `+Ord`, `+Guess`, etc.

These are compiled into a regex alternation and used to constrain the FST composition.

### Step 3: FST Composition

This is the core of the approach — it constructs an HFST regex that:

1. Spells out the lemma character by character
2. Appends the POS tag
3. Allows any tag sequence EXCEPT the excluded tags
4. Composes this regex with the generator FST

```bash
echo "$lemma" | sed -e 's/./ & /g' | sed -e "s/\$/ $gtpos /" |\
    sed -e "s:\$: [? - [ $cyclicRE  ] ]*:" |\
    sed -e "s:^:$cyclicRE +UglyHack | :" |\
    sed -e 's/+/%+/g' -e 's:/:%/:g' -e 's/#/%#/g' > generative.regex
hfst-regexp2fst -i generative.regex -o generative.hfst -f foma
hfst-compose -F -1 generative.hfst -2 "$generator" |\
    hfst-fst2fst -f olw -o generator.hfst
timeout 10s hfst-fst2strings generator.hfst > generated.strings
```

The resulting transducer, when enumerated, produces all forms the FST can generate for the given lemma+POS, excluding paths through the excluded tags.

### Step 4: Output

Generated strings are deduplicated and converted to UniMorph format via a Python module:

```bash
uniq < generated.strings |\
    python -m giellaltconversiontools.giella2unimorph
```

If generation fails (empty output), the script falls back to analyzing the lemma:

```bash
echo "$lemma" | hfst-lookup -q "$analyser"
```

### Deduplication

The script tracks `prevlemmapos` to skip duplicate lemma+POS combinations:

```bash
if test "$prevlemmapos" == "$lemma${pos%.*}" ; then
    continue
fi
```

## Excluded Tags Analysis

The 109 excluded tag patterns fall into categories:

| Category | Count | Examples |
|----------|-------|---------|
| Derivation (`+Der/*`) | ~60 | `+Der/Comp`, `+Der/Superl`, `+Der/NomAg`, `+Der/Caus` |
| Error/Spelling (`+Err/*`) | 5 | `+Err/Orth`, `+Err/Spellrelax` |
| Usage restrictions (`+Use/*`) | 4 | `+Use/NG`, `+Use/Circ`, `+Use/GC`, `+Use/SpellNoSugg` |
| Compounding | 2 | `+Cmp`, `+Cmp#` |
| Abbreviations | 3 | `+ABBR`, `+ACR`, `+Acr` |
| POS-like tags | 4 | `+Num`, `+Ord`, `+Prop` |
| Other | ~5 | `+Guess`, `+TODO`, `+Dyn`, `+Coll`, `^BlockCap` |

This list is highly relevant for the proposed standard's `excludeTags` field in `meta.json`.

## Strengths

1. **Comprehensive**: Generates ALL possible forms without needing to manually specify each cell. No paradigm shape definition needed.
2. **Language-agnostic generation**: The same script works for any language with an HFST generator, without language-specific paradigm definitions.
3. **Tag filtering**: The excluded tags list is a well-curated resource that prevents cyclic/infinite derivation chains.
4. **Fallback**: Falls back to analysis when generation fails, providing diagnostic information.
5. **FST-native**: Works directly with the transducer rather than sending individual generation requests.

## Limitations

1. **No table structure**: Produces a flat list, not a structured paradigm table. The output has no sections, tables, rows, or columns.
2. **No presentation logic**: No concept of how forms should be organized for display (e.g. case × number grids).
3. **No conditional display**: Cannot show/hide sections based on tags or lemma properties.
4. **No localization**: Output is raw tag paths and surface forms.
5. **Shell-dependent**: Requires bash, HFST command-line tools, and Python — not portable to browser environments.
6. **Performance**: FST composition and enumeration can be slow (the script uses `timeout 10s`).
7. **No exception handling**: Same generation process for all lemmas of a POS — no special handling for irregular forms.
8. **UniMorph-specific output**: Tied to UniMorph format conversion rather than paradigm presentation.

## Relevance to the Proposed Standard

This project is the most different from the proposed standard's approach. It operates at a lower level — enumerating FST outputs — whereas the standard operates at a higher level — specifying table shapes and individual cell tag paths.

However, several elements are directly relevant:

### `excludeTags`

The `excluded.tags` file maps directly to the standard's `meta.json` `excludeTags` field. The curated list of 109 tags provides a starting point for any GiellaLT language:

```json
{
  "excludeTags": ["+Der", "+Err", "+Use/NG", "+Cmp", "+Cmp#", "+Guess", "+TODO"]
}
```

The standard should reference this resource and recommend using a similar exclusion list.

### Complementary Approach

The giellaltconversiontools approach could be used as a **validation tool** for declarative paradigm specs:

1. Use `generate.bash` to enumerate all possible forms for a lemma+POS
2. Compare against the cells defined in a paradigm JSON file
3. Flag any forms in the paradigm that the FST doesn't generate
4. Flag any FST outputs not captured by any paradigm cell

This "spec-vs-FST" comparison would be valuable for paradigm authors to verify completeness.

### POS Mapping

The UniMorph-to-GiellaLT POS mapping is useful reference data, though the proposed standard works with native FST tags directly.

## Key Insights for the Standard

1. **Tag exclusion is essential**: The excluded.tags list demonstrates that FSTs contain many tag paths that should never appear in paradigm tables (derivations, error tags, etc.). The standard's `excludeTags` in `meta.json` addresses this.

2. **Flat enumeration is insufficient for presentation**: While generating all forms is useful for linguistic completeness testing, it doesn't solve the paradigm *presentation* problem. Users need structured tables, not flat lists.

3. **The two approaches complement each other**: Declarative specs (the standard) define HOW to present paradigms; FST enumeration (giellaltconversiontools) can validate that the specs are complete and correct.

4. **Timeout handling**: FST composition can be slow. Implementations of the standard should consider timeout mechanisms for generation.
