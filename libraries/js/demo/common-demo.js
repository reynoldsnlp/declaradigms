import {
  escapeHtml,
  generateTableModel,
  renderTableModelToHtml
} from '../browser.js';

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
