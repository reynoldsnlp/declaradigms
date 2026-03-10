function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classAttr(styleClass) {
  const classes = toArray(styleClass).filter(Boolean);
  if (!classes.length) return '';
  return ` class="${escapeHtml(classes.join(' '))}"`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagBoundaryRegex(tag, meta = {}) {
  const prefix = meta.tagPrefix || '+';
  const escapedPrefix = escapeRegExp(prefix);
  const escapedTag = escapeRegExp(tag);

  if (meta.tagSuffix) {
    const escapedSuffix = escapeRegExp(meta.tagSuffix);
    return new RegExp(`${escapedPrefix}${escapedTag}${escapedSuffix}`);
  }

  return new RegExp(`${escapedPrefix}${escapedTag}(?:${escapedPrefix}|$)`);
}

function hasTag(reading, tag, meta) {
  return tagBoundaryRegex(tag, meta).test(reading);
}

function hasConditionTag(reading, tag, meta = {}) {
  if (hasTag(reading, tag, meta)) return true;
  const prefix = meta.tagPrefix || '+';
  if (meta.tagSuffix) {
    return reading.includes(`${prefix}${tag}${meta.tagSuffix}`);
  }
  return reading.includes(`${prefix}${tag}`);
}

function localize(value, localization = {}, locale = 'en') {
  const entry = localization[value];
  if (!entry) return value;
  return entry[locale] || entry.en || Object.values(entry)[0] || value;
}

function evaluateCondition(condition, context) {
  if (!condition) return true;

  if (condition.hasTags) {
    return condition.hasTags.every((tag) => hasConditionTag(context.reading, tag, context.meta));
  }

  if (condition.lacksTags) {
    return !condition.lacksTags.some((tag) => hasConditionTag(context.reading, tag, context.meta));
  }

  if (condition.hasLemma) {
    return new RegExp(condition.hasLemma).test(context.lemma);
  }

  if (condition.allOf) {
    return condition.allOf.every((sub) => evaluateCondition(sub, context));
  }

  if (condition.anyOf) {
    return condition.anyOf.some((sub) => evaluateCondition(sub, context));
  }

  return true;
}

function stringifyLookupOutput(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const first = item && item[0];
      if (Array.isArray(first)) return first.join('');
      if (typeof first === 'string') return first;
      if (first == null) return null;
      return String(first);
    })
    .filter(Boolean);
}

function extractLemma(reading, meta = {}) {
  const prefix = meta.tagPrefix || '+';
  const index = reading.indexOf(prefix);
  return index === -1 ? reading : reading.slice(0, index);
}

function extractTagVariables(reading, meta = {}, paradigm = {}) {
  const merged = Object.assign({}, meta.tagVariables || {}, paradigm.tagVariables || {});
  const values = {};

  for (const [name, candidates] of Object.entries(merged)) {
    const found = candidates.find((candidate) => hasTag(reading, candidate, meta));
    if (found) values[name] = found;
  }

  return values;
}

function applyTagVariables(tagSequence, variables) {
  let output = tagSequence;
  for (const [name, value] of Object.entries(variables)) {
    output = output.split(name).join(value);
  }
  return output;
}

function createGeneratorInput(lemma, tagSequence, variables) {
  return `${lemma}${applyTagVariables(tagSequence, variables)}`;
}

function runLookup(generator, input) {
  const raw = generator.lookup(input);
  const forms = stringifyLookupOutput(raw);
  return Array.from(new Set(forms));
}

function generateWithFallbacks(generator, generatorInput, fallbacks = []) {
  const base = runLookup(generator, generatorInput);
  if (base.length) {
    return { forms: base, styleClass: [] };
  }

  for (const fallback of fallbacks) {
    let candidate = generatorInput;

    if (typeof fallback.append === 'string') {
      candidate = `${candidate}${fallback.append}`;
    } else if (typeof fallback.replace === 'string') {
      candidate = candidate.split(fallback.replace).join(fallback.with || '');
    }

    const forms = runLookup(generator, candidate);
    if (forms.length) {
      return { forms, styleClass: toArray(fallback.styleClass) };
    }
  }

  return { forms: [], styleClass: [] };
}

function normalizeCellVariant(variant) {
  if (typeof variant === 'string') {
    return { tagSequence: variant, styleClass: [], onlyIfGenerates: true };
  }

  return {
    tagSequence: variant.tagSequence,
    styleClass: toArray(variant.styleClass),
    onlyIfGenerates: variant.onlyIfGenerates !== false
  };
}

function normalizeCell(cell) {
  if (Array.isArray(cell)) return cell.map(normalizeCellVariant);
  return [normalizeCellVariant(cell)];
}

function normalizeRelativePath(inputPath) {
  const parts = inputPath.split('/');
  const out = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }

  return `./${out.join('/')}`;
}

function selectParadigm(paradigmsByPath, reading, explicitPath) {
  if (explicitPath) {
    const explicit = paradigmsByPath[explicitPath];
    if (!explicit) throw new Error(`Unknown paradigm path: ${explicitPath}`);
    return { paradigm: explicit, path: explicitPath };
  }

  for (const [paradigmPath, paradigm] of Object.entries(paradigmsByPath)) {
    if (!new RegExp(paradigm.match).test(reading)) continue;

    if (Array.isArray(paradigm.exceptions)) {
      const hit = paradigm.exceptions.find((rule) => new RegExp(rule.match).test(reading));
      if (hit) {
        const base = paradigmPath.split('/').slice(0, -1).join('/') || '.';
        const normalized = normalizeRelativePath(`${base}/${hit.use}`);
        const exceptionParadigm = paradigmsByPath[normalized] || paradigmsByPath[hit.use];
        if (!exceptionParadigm) {
          throw new Error(`Exception path not found: ${hit.use}`);
        }
        return { paradigm: exceptionParadigm, path: normalized };
      }
    }

    return { paradigm, path: paradigmPath };
  }

  throw new Error(`No paradigm matched reading: ${reading}`);
}

function generateTableModel({ reading, meta, paradigmsByPath, generator, locale = 'en', paradigmPath }) {
  const picked = selectParadigm(paradigmsByPath, reading, paradigmPath);
  const paradigm = picked.paradigm;
  const lemma = extractLemma(reading, meta);
  const variables = extractTagVariables(reading, meta, paradigm);
  const context = { reading, lemma, meta };

  const sections = [];

  for (const section of paradigm.sections) {
    if (!evaluateCondition(section.showIf, context)) continue;

    const outputSection = {
      title: section.title ? localize(section.title, meta.localization, locale) : null,
      styleClass: toArray(section.styleClass),
      tables: []
    };

    for (const table of section.tables) {
      if (!evaluateCondition(table.showIf, context)) continue;

      const outputTable = {
        title: table.title ? localize(table.title, meta.localization, locale) : null,
        styleClass: toArray(table.styleClass),
        headers: table.headers.map((header) => localize(header, meta.localization, locale)),
        rows: []
      };

      for (const row of table.rows) {
        const outputRow = {
          label: localize(row.label, meta.localization, locale),
          styleClass: toArray(row.styleClass),
          colspan: row.colspan || [],
          cells: []
        };

        row.cells.forEach((rawCell, idx) => {
          const variants = normalizeCell(rawCell);
          const rendered = [];

          variants.forEach((variant) => {
            const input = createGeneratorInput(lemma, variant.tagSequence, variables);
            const generated = generateWithFallbacks(generator, input, paradigm.fallbacks || []);

            if (!generated.forms.length && variant.onlyIfGenerates) {
              return;
            }

            rendered.push({
              value: generated.forms.join(', '),
              styleClass: [...variant.styleClass, ...generated.styleClass]
            });
          });

          outputRow.cells.push({
            variants: rendered,
            colspan: outputRow.colspan[idx] || 1
          });
        });

        outputTable.rows.push(outputRow);
      }

      outputSection.tables.push(outputTable);
    }

    if (outputSection.tables.length) sections.push(outputSection);
  }

  return {
    lemma,
    selectedParadigmPath: picked.path,
    sections
  };
}

function renderTableModelToHtml(model, placeholder = '&mdash;') {
  let html = '<div class="declaradigms">';

  model.sections.forEach((section) => {
    html += `<section${classAttr(section.styleClass)}>`;

    if (section.title) {
      html += `<h3>${escapeHtml(section.title)}</h3>`;
    }

    section.tables.forEach((table) => {
      html += `<table${classAttr(table.styleClass)}>`;

      if (table.title) {
        html += `<caption>${escapeHtml(table.title)}</caption>`;
      }

      html += '<thead><tr>';
      table.headers.forEach((header) => {
        html += `<th scope="col">${escapeHtml(header)}</th>`;
      });
      html += '</tr></thead><tbody>';

      table.rows.forEach((row) => {
        html += `<tr${classAttr(row.styleClass)}>`;
        html += `<th scope="row">${escapeHtml(row.label)}</th>`;

        row.cells.forEach((cell) => {
          const span = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
          const classes = cell.variants[0] ? cell.variants[0].styleClass : [];
          html += `<td${span}${classAttr(classes)}>`;

          if (!cell.variants.length) {
            html += placeholder;
          } else {
            html += cell.variants
              .map((variant) => escapeHtml(variant.value || placeholder))
              .join('<br>');
          }

          html += '</td>';
        });

        html += '</tr>';
      });

      html += '</tbody></table>';
    });

    html += '</section>';
  });

  html += '</div>';
  return html;
}

export function initLanguageDemo(config) {
  const state = {
    hfst: null,
    generator: null,
    meta: null,
    paradigmsByPath: {}
  };

  const els = {
    locale: document.getElementById('locale'),
    readings: document.getElementById('readings'),
    hfstFile: document.getElementById('hfstFile'),
    transducerChooser: document.getElementById('transducerChooser'),
    runBtn: document.getElementById('runBtn'),
    status: document.getElementById('status'),
    result: document.getElementById('result')
  };

  // Fail fast with a clear message if a page misses required demo controls.
  for (const [name, el] of Object.entries(els)) {
    if (!el) {
      throw new Error(`Demo page is missing required element id: ${name}`);
    }
  }

  function setStatus(message, kind = '') {
    els.status.textContent = message;
    els.status.className = `status ${kind}`.trim();
  }

  function setDefaultReadings() {
    const seen = new Set();
    const lines = [];

    for (const fileName of config.paradigms) {
      const paradigmPath = `./${fileName}`;
      const defaults = config.defaultsByParadigm[paradigmPath] || [];
      for (const reading of defaults) {
        if (seen.has(reading)) continue;
        seen.add(reading);
        lines.push(reading);
      }
    }

    els.readings.value = lines.join('\n');
  }

  async function initHfst() {
    if (state.hfst) return state.hfst;

    if (typeof createHfstModule !== 'function') {
      throw new Error('createHfstModule is not available. Make sure ../libhfst.js loaded.');
    }

    state.hfst = await createHfstModule({
      locateFile: (requestedPath) => {
        if (requestedPath.endsWith('.wasm')) {
          return '../libhfst.wasm';
        }
        return requestedPath;
      }
    });

    return state.hfst;
  }

  async function loadLanguageData() {
    const base = `../../../examples/${config.lang}`;

    const metaRes = await fetch(`${base}/meta.json`);
    if (!metaRes.ok) throw new Error(`Could not load meta.json for ${config.lang}`);
    state.meta = await metaRes.json();

    const paradigmsByPath = {};
    for (const fileName of config.paradigms) {
      const res = await fetch(`${base}/${fileName}`);
      if (!res.ok) {
        throw new Error(`Could not load ${fileName} for ${config.lang}`);
      }
      paradigmsByPath[`./${fileName}`] = await res.json();
    }

    state.paradigmsByPath = paradigmsByPath;
  }

  async function loadGeneratorFromFile(file) {
    const hfst = await initHfst();
    const bytes = new Uint8Array(await file.arrayBuffer());
    hfst.FS.writeFile('/generator.hfstol', bytes);

    const inputStream = new hfst.HfstInputStream('/generator.hfstol');
    const transducer = inputStream.read();
    inputStream.close();

    state.generator = transducer;
  }

  async function loadGeneratorFromUrl(url) {
    const hfst = await initHfst();
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch transducer: ${res.status}`);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    hfst.FS.writeFile('/generator.hfstol', bytes);

    const inputStream = new hfst.HfstInputStream('/generator.hfstol');
    const transducer = inputStream.read();
    inputStream.close();

    state.generator = transducer;
  }

  function renderResultBlock(reading, outputHtml, metaText, isError = false) {
    const block = document.createElement('article');
    block.className = isError ? 'result-block error' : 'result-block';
    block.innerHTML = `
      <h2>${escapeHtml(reading)}</h2>
      <div class="meta">${escapeHtml(metaText)}</div>
      ${outputHtml}
    `;
    return block;
  }

  async function run() {
    try {
      if (!state.generator) {
        setStatus('No transducer loaded. Choose an .hfstol file.', 'error');
        return;
      }

      const locale = els.locale.value.trim() || 'en';
      const readings = els.readings.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (!readings.length) {
        throw new Error('Please enter at least one reading line.');
      }

      els.result.innerHTML = '';

      let successCount = 0;
      for (const reading of readings) {
        try {
          const model = generateTableModel({
            reading,
            meta: state.meta,
            paradigmsByPath: state.paradigmsByPath,
            generator: state.generator,
            locale
          });

          const html = renderTableModelToHtml(model);
          els.result.appendChild(
            renderResultBlock(
              reading,
              html,
              `Rendered with ${model.selectedParadigmPath}; lemma: ${model.lemma}`
            )
          );
          successCount += 1;
        } catch (error) {
          els.result.appendChild(
            renderResultBlock(
              reading,
              `<pre>${escapeHtml(error.message || String(error))}</pre>`,
              'Generation failed for this line.',
              true
            )
          );
        }
      }

      setStatus(`Generated ${successCount}/${readings.length} reading lines.`, successCount ? 'ok' : 'error');
    } catch (error) {
      console.error(error);
      setStatus(error.message || String(error), 'error');
    }
  }

  els.hfstFile.addEventListener('change', async () => {
    const file = els.hfstFile.files && els.hfstFile.files[0];
    if (!file) return;

    try {
      setStatus('Loading HFST transducer...', '');
      await loadGeneratorFromFile(file);
      setStatus(`Transducer loaded: ${file.name}`, 'ok');
    } catch (error) {
      console.error(error);
      setStatus(`Could not load transducer: ${error.message}`, 'error');
    }
  });

  els.runBtn.addEventListener('click', run);

  setDefaultReadings();
  els.locale.value = config.defaultLocale || 'en';
  if (els.transducerChooser) {
    els.transducerChooser.style.display = 'none';
  }

  loadLanguageData()
    .then(async () => {
      if (config.vendoredTransducerUrl) {
        try {
          await loadGeneratorFromUrl(config.vendoredTransducerUrl);
          const source = config.transducerSourceUrl || config.vendoredTransducerUrl;
          setStatus(`Using transducer copied from ${source}.`, 'ok');
          return;
        } catch (error) {
          console.error(error);
          if (els.transducerChooser) {
            els.transducerChooser.style.display = '';
          }
          setStatus('Loading vendored transducer failed. Please choose an .hfstol file.', 'error');
          return;
        }
      }

      if (els.transducerChooser) {
        els.transducerChooser.style.display = '';
      }
      setStatus('Language data loaded. Please choose an .hfstol file.', 'ok');
    })
    .catch((error) => setStatus(error.message || String(error), 'error'));
}
