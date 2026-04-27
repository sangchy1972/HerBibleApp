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

export const FLOW_DATA = {
  morning: {
    verse: { ref: MV.ref, text: MV.text, label: 'Verse of the Day' },
    meditation: {
      title: 'Rest in the Shepherd',
      body: 'Sometimes we wrestle with a haunting question: Am I truly cared for? In the rush of every morning, amid the weight of expectations, we convince ourselves we have to carry it all alone. But this verse offers a radical truth that rewrites everything.\n\nSometimes we wrestle with a haunting question: Am I truly cared for? In the rush of every morning, amid the weight of expectations, we convince ourselves we have to carry it all alone. But this verse offers a radical truth that rewrites everything.\n\nSometimes we wrestle with a haunting question: Am I truly cared for? In the rush of every morning, amid the weight of expectations, we convince ourselves we have to carry it all alone. But this verse offers a radical truth that rewrites everything.',
    },
    action: {
      title: "Today's Practice",
      body: 'Spend five minutes sitting with this question: If God is my shepherd, what am I trying to carry alone today? Then write down one anxiety you can release into His care. Take one action today that reflects this trust — pause before a hard meeting, breathe before you reply, choose rest without guilt.',
    },
    prayer: {
      title: 'Closing Prayer',
      body: 'Heavenly Father, thank you for being my shepherd. You know every path I\'ll walk today and every weight I carry. Lead me beside still waters when I\'m overwhelmed. Restore my soul when I feel empty. Help me trust that I am not alone in this day. Your love is not a distant concept — it is the most personal truth I will ever know. I rest and delight in it now. Amen.',
    },
  },
  evening: {
    verse: { ref: EV.ref, text: EV.text, label: 'Verse of the Night' },
    meditation: {
      title: 'Dwell in the Shelter',
      body: 'Sometimes we wrestle with a haunting question: Am I truly safe? After a long day, amid replaying conversations and unfinished worries, we convince ourselves the world is too loud to rest in. But this verse offers a radical truth that rewrites everything.\n\nGod is your shelter — not a temporary roof, but the dwelling place of the Most High. The shadow of the Almighty is not a hiding spot; it is a home. He is not surprised by your day. He held the galaxies while you held your phone, and He is still here.\n\nWhen you feel restless, undone, or unable to switch off, pause and remember: you are held. The night is not yours to keep watch over. The God who never sleeps already does.',
    },
    action: {
      title: "Tonight's Practice",
      body: 'Spend five minutes sitting with this question: What am I still gripping that I need to hand over before I sleep? Then write down one fear you can release into His shelter. Take one action tonight that reflects this trust — close the laptop, silence the notifications, lie down with empty hands.',
    },
    prayer: {
      title: 'Closing Prayer',
      body: 'Father, thank you for being my refuge and my fortress. You have been with me through every hour of this day, and you are with me now as it ends. Take what I cannot put down. Quiet what I cannot silence. Hold what is too heavy for sleep. Let me rest in the shadow of your wings. Your love is not a distant concept — it is the most personal truth I will ever know. I rest and delight in it now. Amen.',
    },
  },
};

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
