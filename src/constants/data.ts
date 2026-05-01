// MV / EV / FLOW_DATA used to live here as a static prayer-of-the-day. They've
// been replaced by the daily-verses pipeline (DailyVersesContext + the
// per-language JSON files served from CDN with a bundled 3-day fallback).

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

export const PLANS_EXPLORE = [
  {
    title: 'Overcoming Anxiety',
    subtitle: 'A 5-day journey from worry to peace',
    goal: 'To help women trade the spiral of anxious thoughts for the steady peace that comes from naming, casting, and replacing fear with God\'s truth.',
    desc: 'Trade anxious thoughts for peace',
    days: 5,
    tag: 'Popular',
    ac: '#E8619A',
    schedule: [
      { walk: 'Naming the Fear', verses: ['Philippians 4:6-7', '1 Peter 5:7', 'Psalm 55:22'] },
      { walk: 'Casting Your Cares', verses: ['Matthew 6:25-27', 'Psalm 34:4', 'Isaiah 41:10'] },
      { walk: 'The Mind of Christ', verses: ['2 Corinthians 10:5', 'Romans 12:2', 'Philippians 4:8'] },
      { walk: 'Steady in the Storm', verses: ['John 14:27', 'Psalm 23:4', 'Mark 4:39-40'] },
      { walk: 'Peace That Surpasses', verses: ['Isaiah 26:3', 'Colossians 3:15', 'John 16:33'] },
    ],
  },
  {
    title: '30-Day Psalms',
    subtitle: 'A month through the Psalter',
    goal: 'Walk daily through the Psalms to anchor your prayers in Scripture and learn the language of lament, praise, and trust.',
    desc: 'A month through the Psalms',
    days: 30,
    tag: 'Featured',
    ac: '#866BC0',
    schedule: [
      { walk: 'The Two Paths', verses: ['Psalm 1', 'Psalm 2'] },
      { walk: 'Morning Trust', verses: ['Psalm 3', 'Psalm 4', 'Psalm 5'] },
      { walk: 'When You\'re Weary', verses: ['Psalm 6', 'Psalm 7'] },
    ],
  },
  {
    title: 'Identity in Christ',
    subtitle: 'A 7-day study on who you are',
    goal: 'Help every woman see herself as God sees her — chosen, loved, redeemed, and called — so her identity rests in Him, not in her performance.',
    desc: 'Discover who you are in Him',
    days: 7,
    tag: 'New',
    ac: '#E07830',
    schedule: [
      { walk: 'Chosen', verses: ['Ephesians 1:4-5', '1 Peter 2:9', 'John 15:16'] },
      { walk: 'Beloved', verses: ['Romans 8:38-39', '1 John 3:1', 'Zephaniah 3:17'] },
      { walk: 'Forgiven', verses: ['Ephesians 1:7', 'Psalm 103:12', '1 John 1:9'] },
    ],
  },
  {
    title: 'Women of Faith',
    subtitle: '14 stories of courage and grace',
    goal: 'Trace the lives of women in Scripture — Ruth, Esther, Mary, Hannah — and discover how God writes His faithfulness through ordinary, brave women.',
    desc: 'Stories of courage and grace',
    days: 14,
    tag: 'Featured',
    ac: '#7DB87D',
    schedule: [
      { walk: 'Eve — The First', verses: ['Genesis 2:18-25', 'Genesis 3:1-15'] },
      { walk: 'Sarah — Promised', verses: ['Genesis 18:1-15', 'Hebrews 11:11'] },
    ],
  },
];

export const STREAK_DAYS = 12;
export const MAX_STREAK = 28;
export const STREAK_START = 'Mar 15, 2025';

export const VERSE_BG = {
  morning: ['#C2547A', '#7B2255', '#2D0A1A'] as const,
  evening: ['#5B3A9E', '#2D1660', '#100525'] as const,
};
