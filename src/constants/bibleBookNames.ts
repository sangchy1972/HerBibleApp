// Localized Bible book names keyed by slug.
// Upstream pd-text-corpus index.json ships English names for every translation; we override
// the display name based on the active language so the book list, header, and saved verses
// match the rest of the translation.

const SLUGS = [
  'genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy',
  'joshua', 'judges', 'ruth', 'i-samuel', 'ii-samuel',
  'i-kings', 'ii-kings', 'i-chronicles', 'ii-chronicles', 'ezra',
  'nehemiah', 'esther', 'job', 'psalms', 'proverbs',
  'ecclesiastes', 'song-of-solomon', 'isaiah', 'jeremiah', 'lamentations',
  'ezekiel', 'daniel', 'hosea', 'joel', 'amos',
  'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk',
  'zephaniah', 'haggai', 'zechariah', 'malachi',
  'matthew', 'mark', 'luke', 'john', 'acts',
  'romans', 'i-corinthians', 'ii-corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', 'i-thessalonians', 'ii-thessalonians', 'i-timothy',
  'ii-timothy', 'titus', 'philemon', 'hebrews', 'james',
  'i-peter', 'ii-peter', 'i-john', 'ii-john', 'iii-john',
  'jude', 'revelation-of-john',
] as const;

type Slug = typeof SLUGS[number];
type NameMap = Record<Slug, string>;

// Canonical Protestant chapter counts. Same numbers the corpus audit checked
// against — the German Joel/Malachi split is intentionally NOT reflected here
// because this map is keyed by slug only and we use these counts for
// "% of book read" math, where the English numbering is the lingua franca.
const CHAPTERS: Record<Slug, number> = {
  'genesis': 50, 'exodus': 40, 'leviticus': 27, 'numbers': 36, 'deuteronomy': 34,
  'joshua': 24, 'judges': 21, 'ruth': 4,
  'i-samuel': 31, 'ii-samuel': 24, 'i-kings': 22, 'ii-kings': 25,
  'i-chronicles': 29, 'ii-chronicles': 36, 'ezra': 10, 'nehemiah': 13, 'esther': 10,
  'job': 42, 'psalms': 150, 'proverbs': 31, 'ecclesiastes': 12, 'song-of-solomon': 8,
  'isaiah': 66, 'jeremiah': 52, 'lamentations': 5, 'ezekiel': 48, 'daniel': 12,
  'hosea': 14, 'joel': 3, 'amos': 9, 'obadiah': 1, 'jonah': 4, 'micah': 7, 'nahum': 3,
  'habakkuk': 3, 'zephaniah': 3, 'haggai': 2, 'zechariah': 14, 'malachi': 4,
  'matthew': 28, 'mark': 16, 'luke': 24, 'john': 21, 'acts': 28,
  'romans': 16, 'i-corinthians': 16, 'ii-corinthians': 13, 'galatians': 6, 'ephesians': 6,
  'philippians': 4, 'colossians': 4, 'i-thessalonians': 5, 'ii-thessalonians': 3,
  'i-timothy': 6, 'ii-timothy': 4, 'titus': 3, 'philemon': 1,
  'hebrews': 13, 'james': 5, 'i-peter': 5, 'ii-peter': 3, 'i-john': 5, 'ii-john': 1, 'iii-john': 1,
  'jude': 1, 'revelation-of-john': 22,
};

// English names used as the universal fallback when no localized map exists
// (i.e. when the active language is English) and as the input for any caller
// that needs a display name without first fetching a translation index.
const EN: NameMap = {
  'genesis': 'Genesis', 'exodus': 'Exodus', 'leviticus': 'Leviticus', 'numbers': 'Numbers', 'deuteronomy': 'Deuteronomy',
  'joshua': 'Joshua', 'judges': 'Judges', 'ruth': 'Ruth', 'i-samuel': '1 Samuel', 'ii-samuel': '2 Samuel',
  'i-kings': '1 Kings', 'ii-kings': '2 Kings', 'i-chronicles': '1 Chronicles', 'ii-chronicles': '2 Chronicles', 'ezra': 'Ezra',
  'nehemiah': 'Nehemiah', 'esther': 'Esther', 'job': 'Job', 'psalms': 'Psalms', 'proverbs': 'Proverbs',
  'ecclesiastes': 'Ecclesiastes', 'song-of-solomon': 'Song of Solomon', 'isaiah': 'Isaiah', 'jeremiah': 'Jeremiah', 'lamentations': 'Lamentations',
  'ezekiel': 'Ezekiel', 'daniel': 'Daniel', 'hosea': 'Hosea', 'joel': 'Joel', 'amos': 'Amos',
  'obadiah': 'Obadiah', 'jonah': 'Jonah', 'micah': 'Micah', 'nahum': 'Nahum', 'habakkuk': 'Habakkuk',
  'zephaniah': 'Zephaniah', 'haggai': 'Haggai', 'zechariah': 'Zechariah', 'malachi': 'Malachi',
  'matthew': 'Matthew', 'mark': 'Mark', 'luke': 'Luke', 'john': 'John', 'acts': 'Acts',
  'romans': 'Romans', 'i-corinthians': '1 Corinthians', 'ii-corinthians': '2 Corinthians', 'galatians': 'Galatians', 'ephesians': 'Ephesians',
  'philippians': 'Philippians', 'colossians': 'Colossians', 'i-thessalonians': '1 Thessalonians', 'ii-thessalonians': '2 Thessalonians', 'i-timothy': '1 Timothy',
  'ii-timothy': '2 Timothy', 'titus': 'Titus', 'philemon': 'Philemon', 'hebrews': 'Hebrews', 'james': 'James',
  'i-peter': '1 Peter', 'ii-peter': '2 Peter', 'i-john': '1 John', 'ii-john': '2 John', 'iii-john': '3 John',
  'jude': 'Jude', 'revelation-of-john': 'Revelation',
};

export function englishBookName(slug: string): string {
  return (EN as Record<string, string>)[slug] || slug;
}

export function chaptersInBook(slug: string): number {
  return (CHAPTERS as Record<string, number>)[slug] || 1;
}

const ZH_HANT: NameMap = {
  'genesis': '創世記', 'exodus': '出埃及記', 'leviticus': '利未記', 'numbers': '民數記', 'deuteronomy': '申命記',
  'joshua': '約書亞記', 'judges': '士師記', 'ruth': '路得記', 'i-samuel': '撒母耳記上', 'ii-samuel': '撒母耳記下',
  'i-kings': '列王紀上', 'ii-kings': '列王紀下', 'i-chronicles': '歷代志上', 'ii-chronicles': '歷代志下', 'ezra': '以斯拉記',
  'nehemiah': '尼希米記', 'esther': '以斯帖記', 'job': '約伯記', 'psalms': '詩篇', 'proverbs': '箴言',
  'ecclesiastes': '傳道書', 'song-of-solomon': '雅歌', 'isaiah': '以賽亞書', 'jeremiah': '耶利米書', 'lamentations': '耶利米哀歌',
  'ezekiel': '以西結書', 'daniel': '但以理書', 'hosea': '何西阿書', 'joel': '約珥書', 'amos': '阿摩司書',
  'obadiah': '俄巴底亞書', 'jonah': '約拿書', 'micah': '彌迦書', 'nahum': '那鴻書', 'habakkuk': '哈巴谷書',
  'zephaniah': '西番雅書', 'haggai': '哈該書', 'zechariah': '撒迦利亞書', 'malachi': '瑪拉基書',
  'matthew': '馬太福音', 'mark': '馬可福音', 'luke': '路加福音', 'john': '約翰福音', 'acts': '使徒行傳',
  'romans': '羅馬書', 'i-corinthians': '哥林多前書', 'ii-corinthians': '哥林多後書', 'galatians': '加拉太書', 'ephesians': '以弗所書',
  'philippians': '腓立比書', 'colossians': '歌羅西書', 'i-thessalonians': '帖撒羅尼迦前書', 'ii-thessalonians': '帖撒羅尼迦後書', 'i-timothy': '提摩太前書',
  'ii-timothy': '提摩太後書', 'titus': '提多書', 'philemon': '腓利門書', 'hebrews': '希伯來書', 'james': '雅各書',
  'i-peter': '彼得前書', 'ii-peter': '彼得後書', 'i-john': '約翰一書', 'ii-john': '約翰二書', 'iii-john': '約翰三書',
  'jude': '猶大書', 'revelation-of-john': '啟示錄',
};

const ZH_HANS: NameMap = {
  'genesis': '创世记', 'exodus': '出埃及记', 'leviticus': '利未记', 'numbers': '民数记', 'deuteronomy': '申命记',
  'joshua': '约书亚记', 'judges': '士师记', 'ruth': '路得记', 'i-samuel': '撒母耳记上', 'ii-samuel': '撒母耳记下',
  'i-kings': '列王纪上', 'ii-kings': '列王纪下', 'i-chronicles': '历代志上', 'ii-chronicles': '历代志下', 'ezra': '以斯拉记',
  'nehemiah': '尼希米记', 'esther': '以斯帖记', 'job': '约伯记', 'psalms': '诗篇', 'proverbs': '箴言',
  'ecclesiastes': '传道书', 'song-of-solomon': '雅歌', 'isaiah': '以赛亚书', 'jeremiah': '耶利米书', 'lamentations': '耶利米哀歌',
  'ezekiel': '以西结书', 'daniel': '但以理书', 'hosea': '何西阿书', 'joel': '约珥书', 'amos': '阿摩司书',
  'obadiah': '俄巴底亚书', 'jonah': '约拿书', 'micah': '弥迦书', 'nahum': '那鸿书', 'habakkuk': '哈巴谷书',
  'zephaniah': '西番雅书', 'haggai': '哈该书', 'zechariah': '撒迦利亚书', 'malachi': '玛拉基书',
  'matthew': '马太福音', 'mark': '马可福音', 'luke': '路加福音', 'john': '约翰福音', 'acts': '使徒行传',
  'romans': '罗马书', 'i-corinthians': '哥林多前书', 'ii-corinthians': '哥林多后书', 'galatians': '加拉太书', 'ephesians': '以弗所书',
  'philippians': '腓立比书', 'colossians': '歌罗西书', 'i-thessalonians': '帖撒罗尼迦前书', 'ii-thessalonians': '帖撒罗尼迦后书', 'i-timothy': '提摩太前书',
  'ii-timothy': '提摩太后书', 'titus': '提多书', 'philemon': '腓利门书', 'hebrews': '希伯来书', 'james': '雅各书',
  'i-peter': '彼得前书', 'ii-peter': '彼得后书', 'i-john': '约翰一书', 'ii-john': '约翰二书', 'iii-john': '约翰三书',
  'jude': '犹大书', 'revelation-of-john': '启示录',
};

const DE: NameMap = {
  'genesis': '1. Mose', 'exodus': '2. Mose', 'leviticus': '3. Mose', 'numbers': '4. Mose', 'deuteronomy': '5. Mose',
  'joshua': 'Josua', 'judges': 'Richter', 'ruth': 'Rut', 'i-samuel': '1. Samuel', 'ii-samuel': '2. Samuel',
  'i-kings': '1. Könige', 'ii-kings': '2. Könige', 'i-chronicles': '1. Chronik', 'ii-chronicles': '2. Chronik', 'ezra': 'Esra',
  'nehemiah': 'Nehemia', 'esther': 'Ester', 'job': 'Hiob', 'psalms': 'Psalmen', 'proverbs': 'Sprüche',
  'ecclesiastes': 'Prediger', 'song-of-solomon': 'Hoheslied', 'isaiah': 'Jesaja', 'jeremiah': 'Jeremia', 'lamentations': 'Klagelieder',
  'ezekiel': 'Hesekiel', 'daniel': 'Daniel', 'hosea': 'Hosea', 'joel': 'Joel', 'amos': 'Amos',
  'obadiah': 'Obadja', 'jonah': 'Jona', 'micah': 'Micha', 'nahum': 'Nahum', 'habakkuk': 'Habakuk',
  'zephaniah': 'Zefanja', 'haggai': 'Haggai', 'zechariah': 'Sacharja', 'malachi': 'Maleachi',
  'matthew': 'Matthäus', 'mark': 'Markus', 'luke': 'Lukas', 'john': 'Johannes', 'acts': 'Apostelgeschichte',
  'romans': 'Römer', 'i-corinthians': '1. Korinther', 'ii-corinthians': '2. Korinther', 'galatians': 'Galater', 'ephesians': 'Epheser',
  'philippians': 'Philipper', 'colossians': 'Kolosser', 'i-thessalonians': '1. Thessalonicher', 'ii-thessalonians': '2. Thessalonicher', 'i-timothy': '1. Timotheus',
  'ii-timothy': '2. Timotheus', 'titus': 'Titus', 'philemon': 'Philemon', 'hebrews': 'Hebräer', 'james': 'Jakobus',
  'i-peter': '1. Petrus', 'ii-peter': '2. Petrus', 'i-john': '1. Johannes', 'ii-john': '2. Johannes', 'iii-john': '3. Johannes',
  'jude': 'Judas', 'revelation-of-john': 'Offenbarung',
};

const FR: NameMap = {
  'genesis': 'Genèse', 'exodus': 'Exode', 'leviticus': 'Lévitique', 'numbers': 'Nombres', 'deuteronomy': 'Deutéronome',
  'joshua': 'Josué', 'judges': 'Juges', 'ruth': 'Ruth', 'i-samuel': '1 Samuel', 'ii-samuel': '2 Samuel',
  'i-kings': '1 Rois', 'ii-kings': '2 Rois', 'i-chronicles': '1 Chroniques', 'ii-chronicles': '2 Chroniques', 'ezra': 'Esdras',
  'nehemiah': 'Néhémie', 'esther': 'Esther', 'job': 'Job', 'psalms': 'Psaumes', 'proverbs': 'Proverbes',
  'ecclesiastes': 'Ecclésiaste', 'song-of-solomon': 'Cantique des Cantiques', 'isaiah': 'Ésaïe', 'jeremiah': 'Jérémie', 'lamentations': 'Lamentations',
  'ezekiel': 'Ézéchiel', 'daniel': 'Daniel', 'hosea': 'Osée', 'joel': 'Joël', 'amos': 'Amos',
  'obadiah': 'Abdias', 'jonah': 'Jonas', 'micah': 'Michée', 'nahum': 'Nahum', 'habakkuk': 'Habacuc',
  'zephaniah': 'Sophonie', 'haggai': 'Aggée', 'zechariah': 'Zacharie', 'malachi': 'Malachie',
  'matthew': 'Matthieu', 'mark': 'Marc', 'luke': 'Luc', 'john': 'Jean', 'acts': 'Actes',
  'romans': 'Romains', 'i-corinthians': '1 Corinthiens', 'ii-corinthians': '2 Corinthiens', 'galatians': 'Galates', 'ephesians': 'Éphésiens',
  'philippians': 'Philippiens', 'colossians': 'Colossiens', 'i-thessalonians': '1 Thessaloniciens', 'ii-thessalonians': '2 Thessaloniciens', 'i-timothy': '1 Timothée',
  'ii-timothy': '2 Timothée', 'titus': 'Tite', 'philemon': 'Philémon', 'hebrews': 'Hébreux', 'james': 'Jacques',
  'i-peter': '1 Pierre', 'ii-peter': '2 Pierre', 'i-john': '1 Jean', 'ii-john': '2 Jean', 'iii-john': '3 Jean',
  'jude': 'Jude', 'revelation-of-john': 'Apocalypse',
};

const ES: NameMap = {
  'genesis': 'Génesis', 'exodus': 'Éxodo', 'leviticus': 'Levítico', 'numbers': 'Números', 'deuteronomy': 'Deuteronomio',
  'joshua': 'Josué', 'judges': 'Jueces', 'ruth': 'Rut', 'i-samuel': '1 Samuel', 'ii-samuel': '2 Samuel',
  'i-kings': '1 Reyes', 'ii-kings': '2 Reyes', 'i-chronicles': '1 Crónicas', 'ii-chronicles': '2 Crónicas', 'ezra': 'Esdras',
  'nehemiah': 'Nehemías', 'esther': 'Ester', 'job': 'Job', 'psalms': 'Salmos', 'proverbs': 'Proverbios',
  'ecclesiastes': 'Eclesiastés', 'song-of-solomon': 'Cantares', 'isaiah': 'Isaías', 'jeremiah': 'Jeremías', 'lamentations': 'Lamentaciones',
  'ezekiel': 'Ezequiel', 'daniel': 'Daniel', 'hosea': 'Oseas', 'joel': 'Joel', 'amos': 'Amós',
  'obadiah': 'Abdías', 'jonah': 'Jonás', 'micah': 'Miqueas', 'nahum': 'Nahúm', 'habakkuk': 'Habacuc',
  'zephaniah': 'Sofonías', 'haggai': 'Hageo', 'zechariah': 'Zacarías', 'malachi': 'Malaquías',
  'matthew': 'Mateo', 'mark': 'Marcos', 'luke': 'Lucas', 'john': 'Juan', 'acts': 'Hechos',
  'romans': 'Romanos', 'i-corinthians': '1 Corintios', 'ii-corinthians': '2 Corintios', 'galatians': 'Gálatas', 'ephesians': 'Efesios',
  'philippians': 'Filipenses', 'colossians': 'Colosenses', 'i-thessalonians': '1 Tesalonicenses', 'ii-thessalonians': '2 Tesalonicenses', 'i-timothy': '1 Timoteo',
  'ii-timothy': '2 Timoteo', 'titus': 'Tito', 'philemon': 'Filemón', 'hebrews': 'Hebreos', 'james': 'Santiago',
  'i-peter': '1 Pedro', 'ii-peter': '2 Pedro', 'i-john': '1 Juan', 'ii-john': '2 Juan', 'iii-john': '3 Juan',
  'jude': 'Judas', 'revelation-of-john': 'Apocalipsis',
};

const PT: NameMap = {
  'genesis': 'Gênesis', 'exodus': 'Êxodo', 'leviticus': 'Levítico', 'numbers': 'Números', 'deuteronomy': 'Deuteronômio',
  'joshua': 'Josué', 'judges': 'Juízes', 'ruth': 'Rute', 'i-samuel': '1 Samuel', 'ii-samuel': '2 Samuel',
  'i-kings': '1 Reis', 'ii-kings': '2 Reis', 'i-chronicles': '1 Crônicas', 'ii-chronicles': '2 Crônicas', 'ezra': 'Esdras',
  'nehemiah': 'Neemias', 'esther': 'Ester', 'job': 'Jó', 'psalms': 'Salmos', 'proverbs': 'Provérbios',
  'ecclesiastes': 'Eclesiastes', 'song-of-solomon': 'Cânticos', 'isaiah': 'Isaías', 'jeremiah': 'Jeremias', 'lamentations': 'Lamentações',
  'ezekiel': 'Ezequiel', 'daniel': 'Daniel', 'hosea': 'Oséias', 'joel': 'Joel', 'amos': 'Amós',
  'obadiah': 'Obadias', 'jonah': 'Jonas', 'micah': 'Miquéias', 'nahum': 'Naum', 'habakkuk': 'Habacuque',
  'zephaniah': 'Sofonias', 'haggai': 'Ageu', 'zechariah': 'Zacarias', 'malachi': 'Malaquias',
  'matthew': 'Mateus', 'mark': 'Marcos', 'luke': 'Lucas', 'john': 'João', 'acts': 'Atos',
  'romans': 'Romanos', 'i-corinthians': '1 Coríntios', 'ii-corinthians': '2 Coríntios', 'galatians': 'Gálatas', 'ephesians': 'Efésios',
  'philippians': 'Filipenses', 'colossians': 'Colossenses', 'i-thessalonians': '1 Tessalonicenses', 'ii-thessalonians': '2 Tessalonicenses', 'i-timothy': '1 Timóteo',
  'ii-timothy': '2 Timóteo', 'titus': 'Tito', 'philemon': 'Filemom', 'hebrews': 'Hebreus', 'james': 'Tiago',
  'i-peter': '1 Pedro', 'ii-peter': '2 Pedro', 'i-john': '1 João', 'ii-john': '2 João', 'iii-john': '3 João',
  'jude': 'Judas', 'revelation-of-john': 'Apocalipse',
};

const BOOK_NAMES: Record<string, NameMap> = {
  'zh-Hant': ZH_HANT,
  'zh-Hans': ZH_HANS,
  de: DE,
  fr: FR,
  es: ES,
  pt: PT,
  // 'en' intentionally absent — upstream English names are already correct.
};

export function localizeBookName(code: string, slug: string, fallback: string): string {
  const map = BOOK_NAMES[code];
  if (!map) return fallback;
  return (map as Record<string, string>)[slug] || fallback;
}
