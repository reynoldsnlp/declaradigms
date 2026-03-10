import { initLanguageDemo } from './common-demo.js';

initLanguageDemo({
  lang: 'lang-sme',
  vendoredTransducerUrl: './transducers/generator-gt-norm.sme.hfstol',
  transducerSourceUrl: 'https://pkg.pjj.cc/f/n/ge/giella-sme/usr/share/giella/sme/generator-gt-norm.hfstol',
  paradigms: [
    'noun.json',
    'verb.json',
    'verb_neg.json'
  ],
  defaultLocale: 'en',
  defaultsByParadigm: {
    './noun.json': [
      'guolli+N+Sg+Nom',
      'beana+N+Sg+Nom',
      'guovssahas+N+Sg+Nom+PxSg1',
      'giela+N+Sg+Nom+PxPl3',
      'ruoktu+N+Sg+Nom',
      'suolu+N+Sg+Nom',
      'guolli+N+Pl+Nom',
      'beana+N+Sg+Loc+PxDu2',
      'guovssahas+N+Sg+Gen+PxSg3',
      'ruoktu+N+Ess+PxPl1'
    ],
    './verb.json': [
      'boahtit+V+Inf',
      'diehtit+V+Inf',
      'oaidnit+V+Inf',
      'boahtit+V+Pot+Prt+Sg1',
      'oaidnit+V+Ind+Prs+Sg1',
      'diehtit+V+Ind+Prt+Pl3',
      'boahtit+V+Cond+Prs+Du2',
      'oaidnit+V+Imprt+Pl2',
      'diehtit+V+Pot+Prs+Sg3',
      'boahtit+V+Actio+Loc',
      'oaidnit+V+Ger+PxSg1'
    ],
    './verb_neg.json': [
      'ii+V+IV+Neg',
      'in+V+IV+Neg',
      'eai+V+IV+Neg',
      'it+V+IV+Neg',
      'ean+V+IV+Neg',
      'ehpet+V+IV+Neg'
    ]
  }
});
