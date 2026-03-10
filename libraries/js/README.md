# declaradigms

`declaradigms` is a JavaScript library for generating HTML paradigm tables from declarative paradigm JSON files using HFST wasm transducers.

## Install

```bash
npm install declaradigms
```

## Quick Start

```js
const {
  initHfst,
  loadTransducerFromUrl,
  generateParadigmHtml
} = require('declaradigms');

async function run() {
  const hfst = await initHfst({
    wasmPath: './libhfst.wasm'
  });

  const generator = await loadTransducerFromUrl(hfst, './generator.hfstol');

  const meta = await (await fetch('./meta.json')).json();
  const nounParadigm = await (await fetch('./noun.json')).json();

  const { html } = generateParadigmHtml({
    reading: 'работа+N+Fem+Inan+Sg+Nom',
    meta,
    paradigmsByPath: {
      './noun.json': nounParadigm
    },
    generator,
    locale: 'en'
  });

  document.getElementById('out').innerHTML = html;
}

run();
```

## API

- `initHfst(options)`
- `loadParadigmBundle(metaPathOrDir)`
- `loadTransducerFromUrl(hfst, url, fsPath?)`
- `loadTransducerFromFile(hfst, filePath, fsPath?)`
- `generateTableModel({ reading, meta, paradigmsByPath, generator, locale?, paradigmPath? })`
- `renderTableModelToHtml(model, { placeholder?, containerClass? })`
- `generateParadigmHtml(options)`
- `generateParadigmHtmlFromDirectory({ metaPathOrDir, reading, generator, locale? })`

`generateParadigmHtml` returns:

- `model`: normalized structured table model with generated forms
- `html`: ready-to-insert HTML string

If you use `generateParadigmHtmlFromDirectory`, the library automatically:

- Loads `meta.json`
- Loads all paradigm JSON files in that folder (plus transitive exception references)
- Selects the matching paradigm by each file's `match` regex

## Demo Pages

A browser demo index is available at `libraries/js/demo/index.html` with links to:

- `libraries/js/demo/demo-lang-rus.html`
- `libraries/js/demo/demo-lang-sme.html`

Run a static server from `libraries/js`:

```bash
python3 -m http.server 8000 -d ../..
```

Then open:

```text
http://localhost:8000/libraries/js/demo/index.html
```

Demo flow:

- Open a language-specific demo from the index
- Select a paradigm file (data is loaded from `examples/`)
- The readings textarea auto-populates with functionally interesting readings for that paradigm
- Upload an HFST generator file (`.hfstol`)
- Edit readings (one reading per line)
- Click "Generate HTML Table" to render a block for each reading line
