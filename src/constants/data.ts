// MV / EV used to live here as a static prayer-of-the-day. They've been
// replaced in production by the daily-verses pipeline (DailyVersesContext
// + per-language CDN JSON). These constants are kept as fallbacks for the
// HEAD-restored PrayerScreen.tsx (rebuilt after a worktree-deletion data
// loss) which still reads them directly.
export const MV = {
  ref: 'Psalm 23:1–3',
  text: 'The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters.',
};

export const EV = {
  ref: 'Psalm 91:1–2',
  text: 'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty. I will say to the Lord, "My refuge and my fortress."',
};

export const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const WEEK = [true, true, true, false, false, false, false];

export const PSALMS_CARDS = [
  { psalm: 'Psalm 46', subtitle: 'God is our refuge and strength', tag: 'Strength', ac: '#E8619A', acl: 'rgba(232,97,154,.13)' },
  { psalm: 'Psalm 121', subtitle: 'I lift my eyes to the hills', tag: 'Protection', ac: '#866BC0', acl: 'rgba(157,127,224,.13)' },
  { psalm: 'Psalm 27', subtitle: 'The Lord is my light', tag: 'Faith', ac: '#E07830', acl: 'rgba(224,120,48,.13)' },
];

export const OT = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Songs', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'];
export const NT = ['Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'];

export const PSALM_23 = [
  'The Lord is my shepherd; I shall not want.',
  'He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  'He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.',
  'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
  'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.',
  'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord for ever.',
];

export const RECENT_SEARCHES = ['love', 'faith', 'shepherd', 'psalm 23', 'comfort'];

export const SAVED_VERSES = [
  { ref: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son…' },
  { ref: 'Philippians 4:13', text: 'I can do all things through Christ who strengthens me.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the Lord…' },
];

export const STREAK_DAYS = 12;
export const MAX_STREAK = 28;
export const STREAK_START = 'Mar 15, 2025';

export const VERSE_BG = {
  morning: ['#C2547A', '#7B2255', '#2D0A1A'] as const,
  evening: ['#5B3A9E', '#2D1660', '#100525'] as const,
};
