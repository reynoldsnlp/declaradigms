'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const {
  generateParadigmHtml,
  generateParadigmHtmlFromDirectory,
  loadParadigmBundle,
  generateTableModel,
  selectParadigm
} = require('../index.js');

function makeFakeGenerator() {
  return {
    lookup(input) {
      return [
        [[...`FORM:${input}`], 0]
      ];
    }
  };
}

async function readJson(relativePath) {
  const fullPath = path.join(__dirname, '..', '..', '..', relativePath);
  const text = await fs.readFile(fullPath, 'utf8');
  return JSON.parse(text);
}

test('selects the russian noun paradigm by match', async () => {
  const noun = await readJson('examples/lang-rus/noun.json');
  const verb = await readJson('examples/lang-rus/verb.json');

  const picked = selectParadigm(
    {
      './noun.json': noun,
      './verb.json': verb
    },
    'работа+N+Fem+Inan+Sg+Nom'
  );

  assert.equal(picked.path, './noun.json');
  assert.equal(picked.paradigm.id, 'rus-noun');
});

test('builds html using russian noun example structure', async () => {
  const meta = await readJson('examples/lang-rus/meta.json');
  const noun = await readJson('examples/lang-rus/noun.json');

  const { html, model } = generateParadigmHtml({
    reading: 'работа+N+Fem+Inan+Sg+Nom',
    meta,
    paradigmsByPath: {
      './noun.json': noun
    },
    generator: makeFakeGenerator(),
    locale: 'en'
  });

  assert.equal(model.lemma, 'работа');
  assert.equal(model.variables.$gender, 'Fem');
  assert.equal(model.variables.$animacy, 'Inan');
  assert.match(html, /<table/);
  assert.match(html, /Nominative/);
  assert.match(html, /FORM:работа\+N\+Fem\+Inan\+Sg\+Nom/);
});

test('respects showIf in north sami noun example', async () => {
  const meta = await readJson('examples/lang-sme/meta.json');
  const noun = await readJson('examples/lang-sme/noun.json');

  const noPx = generateTableModel({
    reading: 'guolli+N+Sg+Nom',
    meta,
    paradigmsByPath: {
      './noun.json': noun
    },
    generator: makeFakeGenerator(),
    locale: 'en'
  });

  const withPx = generateTableModel({
    reading: 'guolli+N+Sg+Nom+PxSg1',
    meta,
    paradigmsByPath: {
      './noun.json': noun
    },
    generator: makeFakeGenerator(),
    locale: 'en'
  });

  assert.equal(noPx.sections.some((section) => section.title === 'Possessive suffixes'), false);
  assert.equal(withPx.sections.some((section) => section.title === 'Possessive suffixes'), true);
});

test('auto-loads paradigms from meta directory and selects by match', async () => {
  const bundle = await loadParadigmBundle(path.join(__dirname, '..', '..', '..', 'examples', 'lang-rus'));

  assert.equal(typeof bundle.meta, 'object');
  assert.equal(typeof bundle.paradigmsByPath['./noun.json'], 'object');
  assert.equal(typeof bundle.paradigmsByPath['./verb.json'], 'object');

  const { model } = await generateParadigmHtmlFromDirectory({
    metaPathOrDir: path.join(__dirname, '..', '..', '..', 'examples', 'lang-rus'),
    reading: 'работа+N+Fem+Inan+Sg+Nom',
    generator: makeFakeGenerator(),
    locale: 'en'
  });

  assert.equal(model.selectedParadigmPath, './noun.json');
});

test('renders required declaradigm data attributes and styleClass markup', async () => {
  const meta = await readJson('examples/lang-rus/meta.json');
  const noun = await readJson('examples/lang-rus/noun.json');

  const { html } = generateParadigmHtml({
    reading: 'работа+N+Fem+Inan+Sg+Nom',
    meta,
    paradigmsByPath: {
      './noun.json': noun
    },
    generator: makeFakeGenerator(),
    locale: 'en'
  });

  assert.match(html, /data-declaradigm-file=\"\.\/noun\.json\"/);
  assert.match(html, /data-declaradigm-section-title=\"General forms\"/);
  assert.match(html, /data-declaradigm-input-reading=\"работа\+N\+Fem\+Inan\+Sg\+Nom\"/);
  assert.match(html, /class=\"subcase\"/);
  assert.match(html, /<span[^>]*data-reading=\"работа\+N\+Fem\+Inan\+Sg\+Nom\"/);
});

test('strips HFST flag diacritics from generated forms', async () => {
  const meta = await readJson('examples/lang-sme/meta.json');
  const noun = await readJson('examples/lang-sme/noun.json');

  const generator = {
    lookup() {
      return [
        [[
          '@P.Px.add@',
          'g',
          'u',
          'o',
          'l',
          'l',
          'i',
          '@D.CmpOnly.FALSE@',
          '@D.CmpPref.TRUE@'
        ], 0]
      ];
    }
  };

  const { html } = generateParadigmHtml({
    reading: 'guolli+N+Sg+Nom',
    meta,
    paradigmsByPath: {
      './noun.json': noun
    },
    generator,
    locale: 'en'
  });

  assert.match(html, />guolli</);
  assert.doesNotMatch(html, /@P\.|@D\./);
});
