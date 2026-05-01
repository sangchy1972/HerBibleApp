// Parses English Bible references like "Psalm 23:1–3", "John 3:16",
// "1 Peter 5:7", or "Psalm 23" into { bookSlug, chapter, verseStart, verseEnd }.
// Used when the home-screen verse card jumps the reader to a specific verse so
// we can highlight just that range. Returns null on unknown books or malformed
// input — callers fall back to a plain navigation in that case.

const NAME_TO_SLUG: Record<string, string> = {
  genesis: 'genesis', gen: 'genesis',
  exodus: 'exodus', exod: 'exodus', ex: 'exodus',
  leviticus: 'leviticus', lev: 'leviticus',
  numbers: 'numbers', num: 'numbers',
  deuteronomy: 'deuteronomy', deut: 'deuteronomy',
  joshua: 'joshua', josh: 'joshua',
  judges: 'judges', judg: 'judges',
  ruth: 'ruth',
  '1 samuel': 'i-samuel', 'i samuel': 'i-samuel',
  '2 samuel': 'ii-samuel', 'ii samuel': 'ii-samuel',
  '1 kings': 'i-kings', 'i kings': 'i-kings',
  '2 kings': 'ii-kings', 'ii kings': 'ii-kings',
  '1 chronicles': 'i-chronicles', 'i chronicles': 'i-chronicles',
  '2 chronicles': 'ii-chronicles', 'ii chronicles': 'ii-chronicles',
  ezra: 'ezra',
  nehemiah: 'nehemiah', neh: 'nehemiah',
  esther: 'esther',
  job: 'job',
  psalm: 'psalms', psalms: 'psalms', ps: 'psalms',
  proverbs: 'proverbs', prov: 'proverbs',
  ecclesiastes: 'ecclesiastes', eccl: 'ecclesiastes',
  'song of songs': 'song-of-solomon', 'song of solomon': 'song-of-solomon',
  isaiah: 'isaiah', isa: 'isaiah',
  jeremiah: 'jeremiah', jer: 'jeremiah',
  lamentations: 'lamentations', lam: 'lamentations',
  ezekiel: 'ezekiel', ezek: 'ezekiel',
  daniel: 'daniel', dan: 'daniel',
  hosea: 'hosea',
  joel: 'joel',
  amos: 'amos',
  obadiah: 'obadiah', obad: 'obadiah',
  jonah: 'jonah',
  micah: 'micah',
  nahum: 'nahum',
  habakkuk: 'habakkuk', hab: 'habakkuk',
  zephaniah: 'zephaniah', zeph: 'zephaniah',
  haggai: 'haggai',
  zechariah: 'zechariah', zech: 'zechariah',
  malachi: 'malachi', mal: 'malachi',
  matthew: 'matthew', matt: 'matthew',
  mark: 'mark',
  luke: 'luke',
  john: 'john',
  acts: 'acts',
  romans: 'romans', rom: 'romans',
  '1 corinthians': 'i-corinthians', 'i corinthians': 'i-corinthians',
  '2 corinthians': 'ii-corinthians', 'ii corinthians': 'ii-corinthians',
  galatians: 'galatians', gal: 'galatians',
  ephesians: 'ephesians', eph: 'ephesians',
  philippians: 'philippians', phil: 'philippians',
  colossians: 'colossians', col: 'colossians',
  '1 thessalonians': 'i-thessalonians', 'i thessalonians': 'i-thessalonians',
  '2 thessalonians': 'ii-thessalonians', 'ii thessalonians': 'ii-thessalonians',
  '1 timothy': 'i-timothy', 'i timothy': 'i-timothy',
  '2 timothy': 'ii-timothy', 'ii timothy': 'ii-timothy',
  titus: 'titus',
  philemon: 'philemon',
  hebrews: 'hebrews', heb: 'hebrews',
  james: 'james',
  '1 peter': 'i-peter', 'i peter': 'i-peter',
  '2 peter': 'ii-peter', 'ii peter': 'ii-peter',
  '1 john': 'i-john', 'i john': 'i-john',
  '2 john': 'ii-john', 'ii john': 'ii-john',
  '3 john': 'iii-john', 'iii john': 'iii-john',
  jude: 'jude',
  revelation: 'revelation-of-john', rev: 'revelation-of-john',
  'revelation of john': 'revelation-of-john',
};

export interface ParsedReference {
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

export function parseReference(ref: string): ParsedReference | null {
  // Normalize en-dash/em-dash to hyphen, collapse internal whitespace, lowercase.
  const normalized = ref
    .replace(/[‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const m = normalized.match(/^([1-3]?\s?[a-z][a-z\s]*?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  const bookName = m[1].replace(/\s+/g, ' ').trim();
  const chapter = parseInt(m[2], 10);
  if (!chapter) return null;
  const verseStart = m[3] ? parseInt(m[3], 10) : 1;
  const verseEnd = m[4] ? parseInt(m[4], 10) : verseStart;
  const slug = NAME_TO_SLUG[bookName];
  if (!slug) return null;
  return { bookSlug: slug, chapter, verseStart, verseEnd };
}
