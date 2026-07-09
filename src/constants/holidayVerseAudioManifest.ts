// AUTO-GENERATED from the Holiday Verse EN audio folder — do not edit by hand.
// Maps each holiday verseId (m_001 / e_001 = holiday day index) to its four
// narration mp3 filenames. Mirrors dailyVerseAudioManifest but for the holiday
// override audio (separate CDN folder + cache, see holiday* in
// dailyVerseAudioCdn.ts / dailyVerseAudioService.ts).
import type { DailyVerseAudioManifest } from './dailyVerseAudioCdn';
import { HOLIDAY_VERSE_AUDIO_BASE, DAILY_VERSE_AUDIO_LANG } from './dailyVerseAudioCdn';

export const HOLIDAY_VERSE_AUDIO_MANIFEST: DailyVerseAudioManifest = {
  version: 1,
  // Informational only — real URLs are built per-language via holidayVerseAudioUrl
  // (UPPERCASE lang folder). Kept pointing at the EN folder for reference.
  base_url: `${HOLIDAY_VERSE_AUDIO_BASE}/${DAILY_VERSE_AUDIO_LANG.toUpperCase()}`,
  step_order: ['scripture', 'reflection', 'simple-step', 'prayer'],
  verses: {
    "e_001": {
      "scripture": "e_001_new-years-day_evening_01_scripture.mp3",
      "reflection": "e_001_new-years-day_evening_02_reflection.mp3",
      "simple-step": "e_001_new-years-day_evening_03_simple-step.mp3",
      "prayer": "e_001_new-years-day_evening_04_prayer.mp3"
    },
    "e_002": {
      "scripture": "e_002_ash-wednesday_evening_01_scripture.mp3",
      "reflection": "e_002_ash-wednesday_evening_02_reflection.mp3",
      "simple-step": "e_002_ash-wednesday_evening_03_simple-step.mp3",
      "prayer": "e_002_ash-wednesday_evening_04_prayer.mp3"
    },
    "e_003": {
      "scripture": "e_003_palm-sunday_evening_01_scripture.mp3",
      "reflection": "e_003_palm-sunday_evening_02_reflection.mp3",
      "simple-step": "e_003_palm-sunday_evening_03_simple-step.mp3",
      "prayer": "e_003_palm-sunday_evening_04_prayer.mp3"
    },
    "e_004": {
      "scripture": "e_004_good-friday_evening_01_scripture.mp3",
      "reflection": "e_004_good-friday_evening_02_reflection.mp3",
      "simple-step": "e_004_good-friday_evening_03_simple-step.mp3",
      "prayer": "e_004_good-friday_evening_04_prayer.mp3"
    },
    "e_005": {
      "scripture": "e_005_easter-sunday_evening_01_scripture.mp3",
      "reflection": "e_005_easter-sunday_evening_02_reflection.mp3",
      "simple-step": "e_005_easter-sunday_evening_03_simple-step.mp3",
      "prayer": "e_005_easter-sunday_evening_04_prayer.mp3"
    },
    "e_006": {
      "scripture": "e_006_pentecost_evening_01_scripture.mp3",
      "reflection": "e_006_pentecost_evening_02_reflection.mp3",
      "simple-step": "e_006_pentecost_evening_03_simple-step.mp3",
      "prayer": "e_006_pentecost_evening_04_prayer.mp3"
    },
    "e_007": {
      "scripture": "e_007_thanksgiving-day_evening_01_scripture.mp3",
      "reflection": "e_007_thanksgiving-day_evening_02_reflection.mp3",
      "simple-step": "e_007_thanksgiving-day_evening_03_simple-step.mp3",
      "prayer": "e_007_thanksgiving-day_evening_04_prayer.mp3"
    },
    "e_008": {
      "scripture": "e_008_first-sunday-of-advent_evening_01_scripture.mp3",
      "reflection": "e_008_first-sunday-of-advent_evening_02_reflection.mp3",
      "simple-step": "e_008_first-sunday-of-advent_evening_03_simple-step.mp3",
      "prayer": "e_008_first-sunday-of-advent_evening_04_prayer.mp3"
    },
    "e_009": {
      "scripture": "e_009_christmas-day_evening_01_scripture.mp3",
      "reflection": "e_009_christmas-day_evening_02_reflection.mp3",
      "simple-step": "e_009_christmas-day_evening_03_simple-step.mp3",
      "prayer": "e_009_christmas-day_evening_04_prayer.mp3"
    },
    "e_010": {
      "scripture": "e_010_new-years-eve_evening_01_scripture.mp3",
      "reflection": "e_010_new-years-eve_evening_02_reflection.mp3",
      "simple-step": "e_010_new-years-eve_evening_03_simple-step.mp3",
      "prayer": "e_010_new-years-eve_evening_04_prayer.mp3"
    },
    "m_001": {
      "scripture": "m_001_new-years-day_morning_01_scripture.mp3",
      "reflection": "m_001_new-years-day_morning_02_reflection.mp3",
      "simple-step": "m_001_new-years-day_morning_03_simple-step.mp3",
      "prayer": "m_001_new-years-day_morning_04_prayer.mp3"
    },
    "m_002": {
      "scripture": "m_002_ash-wednesday_morning_01_scripture.mp3",
      "reflection": "m_002_ash-wednesday_morning_02_reflection.mp3",
      "simple-step": "m_002_ash-wednesday_morning_03_simple-step.mp3",
      "prayer": "m_002_ash-wednesday_morning_04_prayer.mp3"
    },
    "m_003": {
      "scripture": "m_003_palm-sunday_morning_01_scripture.mp3",
      "reflection": "m_003_palm-sunday_morning_02_reflection.mp3",
      "simple-step": "m_003_palm-sunday_morning_03_simple-step.mp3",
      "prayer": "m_003_palm-sunday_morning_04_prayer.mp3"
    },
    "m_004": {
      "scripture": "m_004_good-friday_morning_01_scripture.mp3",
      "reflection": "m_004_good-friday_morning_02_reflection.mp3",
      "simple-step": "m_004_good-friday_morning_03_simple-step.mp3",
      "prayer": "m_004_good-friday_morning_04_prayer.mp3"
    },
    "m_005": {
      "scripture": "m_005_easter-sunday_morning_01_scripture.mp3",
      "reflection": "m_005_easter-sunday_morning_02_reflection.mp3",
      "simple-step": "m_005_easter-sunday_morning_03_simple-step.mp3",
      "prayer": "m_005_easter-sunday_morning_04_prayer.mp3"
    },
    "m_006": {
      "scripture": "m_006_pentecost_morning_01_scripture.mp3",
      "reflection": "m_006_pentecost_morning_02_reflection.mp3",
      "simple-step": "m_006_pentecost_morning_03_simple-step.mp3",
      "prayer": "m_006_pentecost_morning_04_prayer.mp3"
    },
    "m_007": {
      "scripture": "m_007_thanksgiving-day_morning_01_scripture.mp3",
      "reflection": "m_007_thanksgiving-day_morning_02_reflection.mp3",
      "simple-step": "m_007_thanksgiving-day_morning_03_simple-step.mp3",
      "prayer": "m_007_thanksgiving-day_morning_04_prayer.mp3"
    },
    "m_008": {
      "scripture": "m_008_first-sunday-of-advent_morning_01_scripture.mp3",
      "reflection": "m_008_first-sunday-of-advent_morning_02_reflection.mp3",
      "simple-step": "m_008_first-sunday-of-advent_morning_03_simple-step.mp3",
      "prayer": "m_008_first-sunday-of-advent_morning_04_prayer.mp3"
    },
    "m_009": {
      "scripture": "m_009_christmas-day_morning_01_scripture.mp3",
      "reflection": "m_009_christmas-day_morning_02_reflection.mp3",
      "simple-step": "m_009_christmas-day_morning_03_simple-step.mp3",
      "prayer": "m_009_christmas-day_morning_04_prayer.mp3"
    },
    "m_010": {
      "scripture": "m_010_new-years-eve_morning_01_scripture.mp3",
      "reflection": "m_010_new-years-eve_morning_02_reflection.mp3",
      "simple-step": "m_010_new-years-eve_morning_03_simple-step.mp3",
      "prayer": "m_010_new-years-eve_morning_04_prayer.mp3"
    }
  },
};
