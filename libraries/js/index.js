'use strict';

const path = require('path');
const fs = require('fs/promises');

const createHfstModule = require('./libhfst.js');
const core = require('./core.js');

const {
  stringifyLookupOutput,
  selectParadigm,
  extractTagVariables,
  generateTableModel,
  renderTableModelToHtml
} = core;

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
