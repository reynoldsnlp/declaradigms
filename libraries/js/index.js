'use strict';

const path = require('path');
const fs = require('fs/promises');

const createHfstModule = require('./libhfst.js');

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
  return ` class=\"${escapeHtml(classes.join(' '))}\"`;
}

function dataAttrs(data = {}) {
  return Object.entries(data)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => ` ${key}=\"${escapeHtml(String(value))}\"`)
    .join('');
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function runLookup(generator, generatorInput) {
  const raw = generator.lookup(generatorInput);
  const forms = stringifyLookupOutput(raw);
  return Array.from(new Set(forms));
}

function generateWithFallbacks(generator, generatorInput, fallbacks = []) {
  const base = runLookup(generator, generatorInput);
  if (base.length) {
    return {
      forms: base,
      styleClass: [],
      strategy: 'base',
      inputUsed: generatorInput
    };
  }

  for (const fallback of fallbacks) {
    let candidateInput = generatorInput;

    if (typeof fallback.append === 'string') {
      candidateInput = `${candidateInput}${fallback.append}`;
    } else if (typeof fallback.replace === 'string') {
      candidateInput = candidateInput.split(fallback.replace).join(fallback.with || '');
    }

    const forms = runLookup(generator, candidateInput);
    if (forms.length) {
      return {
        forms,
        styleClass: toArray(fallback.styleClass),
        strategy: 'fallback',
        inputUsed: candidateInput
      };
    }
  }

  return {
    forms: [],
    styleClass: [],
    strategy: 'none',
    inputUsed: generatorInput
  };
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
  if (Array.isArray(cell)) {
    return cell.map(normalizeCellVariant);
  }

  return [normalizeCellVariant(cell)];
}

function localize(value, localization = {}, locale = 'en') {
  const entry = localization[value];
  if (!entry) return value;
  return entry[locale] || entry.en || Object.values(entry)[0] || value;
}

function normalizePathForKey(filePath) {
  return filePath.split(path.sep).join('/');
}

function toParadigmKey(baseDir, absolutePath) {
  const relative = normalizePathForKey(path.relative(baseDir, absolutePath));
  if (relative.startsWith('.')) return relative;
  return `./${relative}`;
}

async function listJsonFilesRecursively(dirPath) {
  const files = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFilesRecursively(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadParadigmBundle(metaPathOrDir) {
  const asPath = path.resolve(metaPathOrDir);
  let metaPath = asPath;

  try {
    const stat = await fs.stat(asPath);
    if (stat.isDirectory()) {
      metaPath = path.join(asPath, 'meta.json');
    }
  } catch (error) {
    throw new Error(`Could not access ${metaPathOrDir}: ${error.message}`);
  }

  const baseDir = path.dirname(metaPath);
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  const jsonFiles = (await listJsonFilesRecursively(baseDir)).sort();
  const paradigmsByPath = {};
  const visited = new Set();

  async function loadParadigmFile(absolutePath) {
    const normalizedAbs = path.resolve(absolutePath);
    if (visited.has(normalizedAbs)) return;

    visited.add(normalizedAbs);

    const key = toParadigmKey(baseDir, normalizedAbs);
    const parsed = JSON.parse(await fs.readFile(normalizedAbs, 'utf8'));

    if (!parsed.match || !Array.isArray(parsed.sections)) {
      return;
    }

    paradigmsByPath[key] = parsed;

    if (!Array.isArray(parsed.exceptions)) return;

    for (const exception of parsed.exceptions) {
      if (!exception || typeof exception.use !== 'string') continue;

      const exceptionRelative = path.posix.normalize(path.posix.join(path.posix.dirname(key), exception.use));
      const exceptionAbsolute = path.resolve(baseDir, exceptionRelative);
      await loadParadigmFile(exceptionAbsolute);
    }
  }

  for (const jsonFile of jsonFiles) {
    if (path.resolve(jsonFile) === path.resolve(metaPath)) continue;
    await loadParadigmFile(jsonFile);
  }

  return {
    meta,
    paradigmsByPath,
    baseDir,
    metaPath
  };
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
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(paradigmPath), hit.use));
        const exceptionParadigm = paradigmsByPath[resolved];
        if (!exceptionParadigm) {
          throw new Error(`Exception path not found: ${resolved}`);
        }
        return { paradigm: exceptionParadigm, path: resolved };
      }
    }

    return { paradigm, path: paradigmPath };
  }

  throw new Error(`No paradigm matched reading: ${reading}`);
}

function generateTableModel({ reading, meta, paradigmsByPath, generator, locale = 'en', paradigmPath }) {
  const { paradigm, path: selectedPath } = selectParadigm(paradigmsByPath, reading, paradigmPath);
  const lemma = extractLemma(reading, meta);
  const variables = extractTagVariables(reading, meta, paradigm);
  const context = { reading, lemma, meta };

  const sections = [];

  for (const section of paradigm.sections) {
    if (!evaluateCondition(section.showIf, context)) continue;

    const outputSection = {
      sourceFile: selectedPath,
      rawTitle: section.title || '',
      title: section.title ? localize(section.title, meta.localization, locale) : null,
      styleClass: toArray(section.styleClass),
      tables: []
    };

    for (const table of section.tables) {
      if (!evaluateCondition(table.showIf, context)) continue;

      const outputTable = {
        sourceFile: selectedPath,
        sectionTitle: outputSection.title || outputSection.rawTitle || '',
        inputReading: reading,
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

        row.cells.forEach((rawCell, cellIndex) => {
          const variants = normalizeCell(rawCell);
          const renderedVariants = [];

          variants.forEach((variant) => {
            const input = createGeneratorInput(lemma, variant.tagSequence, variables);
            const generated = generateWithFallbacks(generator, input, paradigm.fallbacks || []);

            if (!generated.forms.length && variant.onlyIfGenerates) {
              return;
            }

            renderedVariants.push({
              forms: generated.forms,
              value: generated.forms.join(', '),
              styleClass: [...variant.styleClass, ...generated.styleClass],
              tagSequence: variant.tagSequence,
              inputUsed: generated.inputUsed,
              generated: generated.forms.length > 0
            });
          });

          const colspan = outputRow.colspan[cellIndex] || 1;

          outputRow.cells.push({
            variants: renderedVariants,
            colspan,
            generated: renderedVariants.some((variant) => variant.generated)
          });
        });

        outputTable.rows.push(outputRow);
      }

      outputSection.tables.push(outputTable);
    }

    if (outputSection.tables.length) {
      sections.push(outputSection);
    }
  }

  return {
    reading,
    lemma,
    selectedParadigmPath: selectedPath,
    paradigmId: paradigm.id,
    variables,
    sections
  };
}

function renderTableModelToHtml(model, options = {}) {
  const placeholder = options.placeholder || '&mdash;';
  const containerClass = options.containerClass || 'declaradigms';

  let html = `<div class=\"${escapeHtml(containerClass)}\">`;

  model.sections.forEach((section) => {
    html += `<section${classAttr(section.styleClass)}>`;

    if (section.title) {
      html += `<h3>${escapeHtml(section.title)}</h3>`;
    }

    section.tables.forEach((table) => {
      const tableAttrs = dataAttrs({
        'data-declaradigm-file': table.sourceFile,
        'data-declaradigm-section-title': table.sectionTitle,
        'data-declaradigm-input-reading': table.inputReading
      });

      html += `<table${classAttr(table.styleClass)}${tableAttrs}>`;

      if (table.title) {
        html += `<caption>${escapeHtml(table.title)}</caption>`;
      }

      html += '<thead><tr>';
      table.headers.forEach((header) => {
        html += `<th scope=\"col\">${escapeHtml(header)}</th>`;
      });
      html += '</tr></thead><tbody>';

      table.rows.forEach((row) => {
        html += `<tr${classAttr(row.styleClass)}>`;
        html += `<th scope=\"row\">${escapeHtml(row.label)}</th>`;

        row.cells.forEach((cell) => {
          const span = cell.colspan > 1 ? ` colspan=\"${cell.colspan}\"` : '';
          const variantClasses = Array.from(
            new Set(cell.variants.flatMap((variant) => toArray(variant.styleClass)))
          );
          html += `<td${span}${classAttr(variantClasses)}>`;

          if (!cell.variants.length) {
            html += placeholder;
          } else {
            html += cell.variants
              .map((variant) => `<span${classAttr(variant.styleClass)}>${escapeHtml(variant.value || placeholder)}</span>`)
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

async function initHfst(options = {}) {
  const wasmPath = options.wasmPath || path.join(__dirname, 'libhfst.wasm');
  const hfst = await createHfstModule({
    ...(options.moduleConfig || {}),
    locateFile: (requestedPath) => {
      if (requestedPath.endsWith('.wasm')) return wasmPath;

      if (options.moduleConfig && typeof options.moduleConfig.locateFile === 'function') {
        return options.moduleConfig.locateFile(requestedPath);
      }

      return requestedPath;
    }
  });

  return hfst;
}

async function loadTransducerFromUrl(hfst, url, fsPath = '/generator.hfstol') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  hfst.FS.writeFile(fsPath, bytes);
  const inputStream = new hfst.HfstInputStream(fsPath);
  const transducer = inputStream.read();
  inputStream.close();
  return transducer;
}

async function loadTransducerFromFile(hfst, filePath, fsPath = '/generator.hfstol') {
  const bytes = new Uint8Array(await fs.readFile(filePath));
  hfst.FS.writeFile(fsPath, bytes);
  const inputStream = new hfst.HfstInputStream(fsPath);
  const transducer = inputStream.read();
  inputStream.close();
  return transducer;
}

function generateParadigmHtml(options) {
  const model = generateTableModel(options);
  const html = renderTableModelToHtml(model, options);
  return { model, html };
}

async function generateParadigmHtmlFromDirectory(options) {
  if (!options || !options.metaPathOrDir) {
    throw new Error('generateParadigmHtmlFromDirectory requires metaPathOrDir.');
  }

  const bundle = await loadParadigmBundle(options.metaPathOrDir);
  return generateParadigmHtml({
    ...options,
    meta: bundle.meta,
    paradigmsByPath: bundle.paradigmsByPath
  });
}

module.exports = {
  initHfst,
  loadParadigmBundle,
  loadTransducerFromUrl,
  loadTransducerFromFile,
  stringifyLookupOutput,
  selectParadigm,
  extractTagVariables,
  generateTableModel,
  renderTableModelToHtml,
  generateParadigmHtml,
  generateParadigmHtmlFromDirectory
};
