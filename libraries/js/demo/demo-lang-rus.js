import { initLanguageDemo } from './common-demo.js';

initLanguageDemo({
  lang: 'lang-rus',
  vendoredTransducerUrl: './transducers/generator-gt-norm.accented.rus.hfstol',
  transducerSourceUrl: 'https://pkg.pjj.cc/f/n/gs/giella-rus/usr/share/giella/rus/generator-gt-norm.accented.hfstol',
  paradigms: [
    'noun.json',
    'verb.json',
    'adjective.json',
    'numeral.json',
    'numeral_odin.json',
    'numeral_dva.json',
    'numeral_ordinal.json'
  ],
  defaultLocale: 'en',
  defaultsByParadigm: {
    './noun.json': [
      'лес+N+Msc+Inan+Sg+Nom',
      'человек+N+Msc+Anim+Sg+Nom',
      'путь+N+Msc+Inan+Sg+Nom',
      'мать+N+Fem+Anim+Sg+Nom',
      'ножницы+N+Fem+Inan+Pl+Nom',
      'время+N+Neu+Inan+Sg+Nom',
      'окно+N+Neu+Inan+Sg+Nom',
      'берег+N+Msc+Inan+Sg+Nom',
      'край+N+Msc+Inan+Sg+Nom',
      'друг+N+Msc+Anim+Sg+Nom',
      'деньги+N+Fem+Inan+Pl+Nom'
    ],
    './verb.json': [
      'делать+V+Impf+Inf',
      'сделать+V+Perf+Inf',
      'читать+V+Impf+Inf',
      'упасть+V+Perf+Inf',
      'работать+V+Impf+Inf',
      'бежать+V+Impf+Inf',
      'побежать+V+Perf+Inf',
      'писать+V+Impf+Inf',
      'написать+V+Perf+Inf',
      'открывать+V+Impf+Inf',
      'открыть+V+Perf+Inf'
    ],
    './adjective.json': [
      'хороший+A+Msc+Inan+Sg+Nom',
      'большой+A+Msc+Inan+Sg+Nom',
      'готов+A+Msc+Sg+Pred',
      'старый+A+Msc+Inan+Sg+Nom',
      'новый+A+Msc+Inan+Sg+Nom',
      'молодой+A+Msc+Anim+Sg+Nom',
      'долгий+A+Msc+Inan+Sg+Nom',
      'короткий+A+Msc+Inan+Sg+Nom'
    ],
    './numeral.json': [
      'пять+Num+MFN+AnIn+Nom',
      'три+Num+MFN+AnIn+Nom',
      'сорок+Num+MFN+AnIn+Nom',
      'десять+Num+MFN+AnIn+Nom',
      'сто+Num+MFN+AnIn+Nom'
    ],
    './numeral_odin.json': [
      'один+Num+Msc+Inan+Sg+Nom',
      'одна+Num+Fem+Inan+Sg+Nom',
      'одно+Num+Neu+Inan+Sg+Nom',
      'одни+Num+MFN+Inan+Pl+Nom',
      'одного+Num+Msc+Anim+Sg+Gen',
      'одной+Num+Fem+Inan+Sg+Gen'
    ],
    './numeral_dva.json': [
      'два+Num+Msc+Inan+Nom',
      'два+Num+Neu+Inan+Nom',
      'две+Num+Fem+Inan+Nom',
      'двух+Num+MFN+AnIn+Gen',
      'двумя+Num+MFN+AnIn+Ins'
    ],
    './numeral_ordinal.json': [
      'первый+Num+Ord+Msc+Inan+Sg+Nom',
      'вторая+Num+Ord+Fem+Inan+Sg+Nom',
      'третье+Num+Ord+Neu+Inan+Sg+Nom',
      'пятые+Num+Ord+MFN+Inan+Pl+Nom',
      'десятого+Num+Ord+Msc+Anim+Sg+Gen',
      'сороковой+Num+Ord+Fem+Inan+Sg+Loc'
    ]
  }
});
