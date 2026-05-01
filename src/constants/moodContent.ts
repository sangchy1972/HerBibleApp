import type { Mood } from '../components/MoodEmoji';

// Placeholder verse-per-mood mapping. Swap with the real corpus when ready.
export interface MoodVerse { ref: string; text: string }

export const MOOD_VERSES: Record<Mood, MoodVerse> = {
  angry: {
    ref: 'James 1:19-20',
    text: 'Be quick to listen, slow to speak and slow to become angry, because human anger does not produce the righteousness that God desires.',
  },
  weak: {
    ref: '2 Corinthians 12:9',
    text: 'My grace is sufficient for you, for my power is made perfect in weakness.',
  },
  anxious: {
    ref: 'Philippians 4:6-7',
    text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
  },
  fearful: {
    ref: 'Isaiah 41:10',
    text: 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you.',
  },
  faithful: {
    ref: 'Hebrews 11:1',
    text: 'Now faith is confidence in what we hope for and assurance about what we do not see.',
  },
  sad: {
    ref: 'Psalm 34:18',
    text: 'The Lord is close to the brokenhearted and saves those who are crushed in spirit.',
  },
  calm: {
    ref: 'Psalm 46:10',
    text: 'Be still, and know that I am God.',
  },
  happy: {
    ref: 'John 16:24',
    text: 'So far you haven\'t asked for anything in my name. Ask and you will receive so that you can be completely happy.',
  },
  blessed: {
    ref: 'Numbers 6:24-26',
    text: 'The Lord bless you and keep you; the Lord make his face shine on you and be gracious to you.',
  },
};

// Sample "Did you know?" facts. Swap with the real bank later.
export interface FunFact { text: string; relatedRefs: string[] }
export const FUN_FACTS: FunFact[] = [
  {
    text: 'After meeting Jesus by a well, the Samaritan woman became an evangelist to her people. (John 4:7-29)',
    relatedRefs: ['Romans 16:22'],
  },
  {
    text: 'The shortest verse in the English Bible is "Jesus wept." — just two words.',
    relatedRefs: ['John 11:35'],
  },
  {
    text: 'Esther is one of only two books in the Bible named after a woman, alongside Ruth.',
    relatedRefs: ['Esther 4:14'],
  },
  {
    text: 'Mary Magdalene was the first person Jesus appeared to after the resurrection.',
    relatedRefs: ['John 20:11-18'],
  },
  {
    text: 'Deborah was a prophet, judge, and warrior who led Israel to victory.',
    relatedRefs: ['Judges 4:4-9'],
  },
];
