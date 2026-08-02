// All 72 achievement badges per the v2.3 spec
// (`her_bible_logic_v2_3.html`).
//
// Each badge has:
//  - id: stable storage key. Never rename; bump a new id if you need to.
//  - category: groups the badge in the gallery (5 sections per spec).
//  - rarity: drives the badge frame color (common / rare / epic / legendary).
//  - iconKey: maps to a Feather/Ionicons icon inside the badge hex (used
//    only as a fallback when no PNG is registered in BADGE_IMAGES).
//  - name / rule: per-language strings. Falls back to English when a locale
//    is missing.
//  - condition: declarative trigger key. The evaluator translates each kind
//    to a boolean against the current snapshot. Keeping conditions as data
//    (rather than functions) keeps this file serializable and lets the
//    evaluator unit-test cleanly.
//  - repeatable: true for badges that re-trigger after a fresh run (matches
//    "可重复获得" in the spec). The AchievementsContext daily-caps repeatable
//    awards to one per calendar day so a user can't farm a single badge.
//
// Per spec §通用规则:
// • Streak badges count complete days only (prayer = morning AND evening
//   per user clarification; reading = at least one chapter that day).
// • Modulo badges (e.g. First Ten / A Hundred Words) re-fire every N
//   creations up to an optional cap.
//
// The condition kinds are documented in src/services/achievementsEvaluator.ts.

import type { LanguageCode } from '../state/TranslationsContext';

export type BadgeCategory = 'prayer' | 'scripture' | 'plan' | 'note' | 'milestone';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  iconKey: string;
  name: Partial<Record<LanguageCode, string>>;
  rule: Partial<Record<LanguageCode, string>>;
  condition: AchievementCondition;
  repeatable?: boolean;
}

// Discriminated union — the evaluator switches on `kind`.
export type AchievementCondition =
  | { kind: 'prayerStreak'; days: number }              // currentPrayerStreak >= N (complete days, m && e)
  | { kind: 'prayerCount'; total: number }              // totalPrayerCompleteDays >= N (legacy — kept for future "lifetime complete days" badges)
  | { kind: 'prayerEver' }                              // any prayer ever recorded (m or e); used by First Light per user spec
  | { kind: 'readPercent'; percent: number }            // readPercent >= N
  | { kind: 'chaptersRead'; total: number }             // chaptersRead >= N
  | { kind: 'readingStreak'; days: number }             // readingStreak >= N (consecutive days with ≥1 chapter)
  | { kind: 'notesCount'; total: number }               // notesCount >= N (one-shot trigger at exact crossing)
  | { kind: 'highlightsCount'; total: number }
  | { kind: 'notesCountModulo'; step: number; cap?: number }       // every `step` notes, optionally capped at `cap`
  | { kind: 'highlightsCountModulo'; step: number; cap?: number }
  | { kind: 'highlightedBooks'; total: number }         // distinct books with ≥1 highlight (legacy — unused)
  | { kind: 'booksRead'; total: number }                // booksTouched >= N (distinct books with ≥1 chapter)
  | { kind: 'planCount'; total: number }                // completedPlans.length >= N
  | { kind: 'planInWindow'; total: number; days: number } // N plans completed in last D days
  | { kind: 'planRepeated' }                            // hasRepeatedPlan
  | { kind: 'shareCount'; total: number }
  | { kind: 'tripleToday' }                             // prayer + reading + (note OR highlight) all same day
  | { kind: 'earlyBirdStreak'; days: number }           // prayer completed before 21:00 local, N days in a row
  | { kind: 'allThreeStreaks'; days: number }           // prayer + reading + plan all streak >= N (legacy — unused after v2.3)
  | { kind: 'riverOfLife'; prayerDays: number; readingDays: number; plansInWindow: number; windowDays: number }
                                                        // 三流并进: prayer streak ≥ A, reading streak ≥ B, plans completed in last `windowDays` ≥ C
  | { kind: 'anniversary' }                             // login on first-launch anniversary (repeatable yearly)
  | { kind: 'activeYears'; days: number; activeDaysMin?: number } // app age >= N days; optionally also active days total >= M
  | { kind: 'holdsAll'; ids: string[] };                // user holds all listed earned badges

// Helper: 7-language name/rule entries are awkward inline, so a couple of
// small typing helpers keep the table compact.
const N = (
  en: string, zhHans: string, zhHant: string, es: string, pt: string, de: string, fr: string,
): Partial<Record<LanguageCode, string>> => ({ en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, es, pt, de, fr });

const R = N; // same shape — alias for readability

export const ACHIEVEMENTS: Achievement[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // PRAYER (8) — rose pink palette
  // Per user clarification: "complete day" requires BOTH morning + evening.
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'prayer.first', category: 'prayer', rarity: 'common', iconKey: 'candle',
    name: N('First Light', '初次祷告', '初次禱告', 'Primera Luz', 'Primeira Luz', 'Erstes Licht', 'Première Lumière'),
    rule: R('Complete your very first prayer check-in', '完成第一次祈祷打卡', '完成第一次祈禱打卡', 'Completa tu primer registro de oración', 'Complete seu primeiro registro', 'Ersten Gebets-Check-in abschließen', 'Premier enregistrement de prière'),
    // Per user direction: First Light fires on the FIRST Amen tap (either
    // morning or evening) — distinct from streak badges which require both
    // prayers / day. The `prayerEver` kind reads PrayerContext.everPrayed
    // directly, so a single morning tap on Day 1 is sufficient.
    condition: { kind: 'prayerEver' },
  },
  {
    id: 'prayer.streak3', category: 'prayer', rarity: 'common', iconKey: 'sunrise',
    name: N('Three-Day Glow', '三日晨星', '三日晨星', 'Tres Días', 'Três Dias', 'Drei Tage', 'Trois Jours'),
    rule: R('Pray morning + evening 3 days in a row', '连续 3 天完成早晚祷', '連續 3 天完成早晚禱', 'Ora mañana + noche 3 días seguidos', 'Ore manhã + noite 3 dias seguidos', '3 Tage in Folge morgens und abends', 'Prier matin + soir 3 jours de suite'),
    condition: { kind: 'prayerStreak', days: 3 }, repeatable: true,
  },
  {
    id: 'prayer.streak7', category: 'prayer', rarity: 'rare', iconKey: 'star',
    name: N('Seven-Day Radiance', '七日灵光', '七日靈光', 'Siete Días', 'Sete Dias', 'Sieben Tage', 'Sept Jours'),
    rule: R('Pray morning + evening 7 days in a row', '连续 7 天完成早晚祷', '連續 7 天完成早晚禱', 'Ora mañana + noche 7 días seguidos', 'Ore manhã + noite 7 dias seguidos', '7 Tage in Folge morgens und abends', 'Prier matin + soir 7 jours de suite'),
    condition: { kind: 'prayerStreak', days: 7 }, repeatable: true,
  },
  {
    id: 'prayer.streak14', category: 'prayer', rarity: 'rare', iconKey: 'moon',
    name: N('Fortnight Faithful', '半月守望', '半月守望', 'Quincena Fiel', 'Quinzena Fiel', 'Vierzehn Tage', 'Quinzaine Fidèle'),
    rule: R('Pray morning + evening 14 days in a row', '连续 14 天完成早晚祷', '連續 14 天完成早晚禱', 'Ora 14 días seguidos', 'Ore 14 dias seguidos', '14 Tage in Folge', 'Prier 14 jours de suite'),
    condition: { kind: 'prayerStreak', days: 14 }, repeatable: true,
  },
  {
    id: 'prayer.streak30', category: 'prayer', rarity: 'epic', iconKey: 'flame',
    name: N('A Month of Grace', '月月同行', '月月同行', 'Un Mes de Gracia', 'Um Mês de Graça', 'Ein Monat Gnade', 'Un Mois de Grâce'),
    rule: R('Pray morning + evening 30 consecutive days', '连续 30 天完成早晚祷', '連續 30 天完成早晚禱', 'Ora 30 días consecutivos', 'Ore 30 dias consecutivos', '30 Tage in Folge', 'Prier 30 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 30 }, repeatable: true,
  },
  {
    id: 'prayer.streak90', category: 'prayer', rarity: 'epic', iconKey: 'feather',
    name: N('Three-Month Covenant', '三月圣约', '三月聖約', 'Pacto Trimestral', 'Aliança Trimestral', 'Drei-Monats-Bund', 'Pacte de Trois Mois'),
    rule: R('Pray morning + evening 90 consecutive days', '连续 90 天完成早晚祷', '連續 90 天完成早晚禱', 'Ora 90 días consecutivos', 'Ore 90 dias consecutivos', '90 Tage in Folge', 'Prier 90 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 90 }, repeatable: true,
  },
  {
    id: 'prayer.streak100', category: 'prayer', rarity: 'legendary', iconKey: 'award',
    name: N('Hundred Days of Prayer', '百日祷告者', '百日禱告者', 'Cien Días de Oración', 'Cem Dias de Oração', 'Hundert Tage des Gebets', 'Cent Jours de Prière'),
    rule: R('Pray morning + evening 100 consecutive days', '连续 100 天完成早晚祷', '連續 100 天完成早晚禱', 'Ora 100 días consecutivos', 'Ore 100 dias consecutivos', '100 Tage in Folge', 'Prier 100 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 100 }, repeatable: true,
  },
  {
    id: 'prayer.streak365', category: 'prayer', rarity: 'legendary', iconKey: 'sun',
    name: N('A Year of Devotion', '整年敬虔', '整年敬虔', 'Un Año de Devoción', 'Um Ano de Devoção', 'Ein Jahr Hingabe', 'Une Année de Dévotion'),
    rule: R('Pray morning + evening every day for a full year', '连续 365 天完成早晚祷', '連續 365 天完成早晚禱', 'Ora todos los días un año entero', 'Ore todos os dias por um ano inteiro', 'Ein ganzes Jahr täglich', 'Prier chaque jour pendant une année'),
    condition: { kind: 'prayerStreak', days: 365 }, repeatable: true,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SCRIPTURE READING (10) — sage green palette
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'scripture.first', category: 'scripture', rarity: 'common', iconKey: 'book',
    name: N('First Page', '开卷有益', '開卷有益', 'Primera Página', 'Primeira Página', 'Erste Seite', 'Première Page'),
    rule: R('Read your very first chapter of the Bible', '完成第一章圣经阅读', '完成第一章聖經閱讀', 'Lee tu primer capítulo', 'Leia seu primeiro capítulo', 'Erstes Kapitel lesen', 'Lis ton premier chapitre'),
    condition: { kind: 'chaptersRead', total: 1 },
  },
  {
    id: 'scripture.read5', category: 'scripture', rarity: 'common', iconKey: 'leaf',
    name: N('Seedling Faith', '幼苗初发', '幼苗初發', 'Fe Naciente', 'Fé Nascente', 'Keimender Glaube', 'Foi Naissante'),
    rule: R('Read 5% of the Bible (≈60 chapters)', '累计阅读 5%（约 60 章）', '累積閱讀 5%（約 60 章）', 'Lee el 5% de la Biblia', 'Leia 5% da Bíblia', '5% der Bibel lesen', 'Lire 5% de la Bible'),
    condition: { kind: 'readPercent', percent: 5 },
  },
  {
    id: 'scripture.read10', category: 'scripture', rarity: 'rare', iconKey: 'scroll',
    name: N('One in Ten', '十分之一', '十分之一', 'Diez Por Ciento', 'Dez Por Cento', 'Zehn Prozent', 'Dix Pour Cent'),
    rule: R('Read 10% of the Bible (≈119 chapters)', '累计阅读 10%（约 119 章）', '累積閱讀 10%（約 119 章）', 'Lee el 10%', 'Leia 10%', '10% der Bibel', 'Lire 10%'),
    condition: { kind: 'readPercent', percent: 10 },
  },
  {
    id: 'scripture.read25', category: 'scripture', rarity: 'rare', iconKey: 'mountain',
    name: N('A Quarter Through', '四分之一', '四分之一', 'Un Cuarto', 'Um Quarto', 'Ein Viertel', 'Un Quart'),
    rule: R('Read 25% of the Bible (≈298 chapters)', '累计阅读 25%（约 298 章）', '累積閱讀 25%（約 298 章）', 'Lee el 25%', 'Leia 25%', '25% der Bibel', 'Lire 25%'),
    condition: { kind: 'readPercent', percent: 25 },
  },
  {
    id: 'scripture.read50', category: 'scripture', rarity: 'epic', iconKey: 'book-open',
    name: N('Halfway Home', '半部圣典', '半部聖典', 'La Mitad', 'Metade', 'Auf Halbem Weg', 'À Mi-Chemin'),
    rule: R('Read 50% of the Bible (≈595 chapters)', '累计阅读 50%（约 595 章）', '累積閱讀 50%（約 595 章）', 'Lee el 50%', 'Leia 50%', '50% der Bibel', 'Lire 50%'),
    condition: { kind: 'readPercent', percent: 50 },
  },
  {
    id: 'scripture.read75', category: 'scripture', rarity: 'epic', iconKey: 'trending-up',
    name: N('Three Quarters', '四分之三', '四分之三', 'Tres Cuartos', 'Três Quartos', 'Drei Viertel', 'Trois Quarts'),
    rule: R('Read 75% of the Bible (≈892 chapters)', '累计阅读 75%（约 892 章）', '累積閱讀 75%（約 892 章）', 'Lee el 75%', 'Leia 75%', '75% der Bibel', 'Lire 75%'),
    condition: { kind: 'readPercent', percent: 75 },
  },
  {
    id: 'scripture.read100', category: 'scripture', rarity: 'legendary', iconKey: 'award',
    name: N('The Whole Word', '全书见证', '全書見證', 'La Palabra Completa', 'A Palavra Toda', 'Das ganze Wort', 'La Parole Entière'),
    rule: R('Read the entire Bible — all 1,189 chapters', '通读完整部圣经（全 1,189 章）', '通讀完整部聖經（全 1,189 章）', 'Lee toda la Biblia', 'Leia toda a Bíblia', 'Die gesamte Bibel lesen', 'Lire toute la Bible'),
    condition: { kind: 'readPercent', percent: 100 },
  },
  {
    id: 'scripture.streak3', category: 'scripture', rarity: 'common', iconKey: 'calendar',
    name: N('Three Reading Days', '三日书香', '三日書香', 'Tres Días de Lectura', 'Três Dias de Leitura', 'Drei Lese-Tage', 'Trois Jours de Lecture'),
    rule: R('Complete daily reading 3 days in a row', '连续 3 天每天完成阅读', '連續 3 天每天完成閱讀', 'Lee 3 días seguidos', 'Leia 3 dias seguidos', '3 Tage in Folge lesen', '3 jours de suite de lecture'),
    condition: { kind: 'readingStreak', days: 3 }, repeatable: true,
  },
  {
    id: 'scripture.streak7', category: 'scripture', rarity: 'rare', iconKey: 'calendar',
    name: N('Seven Scripture Days', '七日书卷', '七日書卷', 'Siete Días de Lectura', 'Sete Dias de Leitura', 'Sieben Lese-Tage', 'Sept Jours de Lecture'),
    rule: R('Complete daily reading 7 days in a row', '连续 7 天每天完成阅读', '連續 7 天每天完成閱讀', 'Lee 7 días seguidos', 'Leia 7 dias seguidos', '7 Tage in Folge lesen', '7 jours de suite'),
    condition: { kind: 'readingStreak', days: 7 }, repeatable: true,
  },
  {
    id: 'scripture.streak30', category: 'scripture', rarity: 'epic', iconKey: 'calendar',
    name: N('Month of the Word', '月读不辍', '月讀不輟', 'Mes de la Palabra', 'Mês da Palavra', 'Monat des Wortes', 'Mois de la Parole'),
    rule: R('Complete daily reading 30 days in a row', '连续 30 天每天完成阅读', '連續 30 天每天完成閱讀', 'Lee 30 días seguidos', 'Leia 30 dias seguidos', '30 Tage in Folge', '30 jours de suite'),
    condition: { kind: 'readingStreak', days: 30 }, repeatable: true,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STUDY PLANS (14) — amber gold palette
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'plan.first', category: 'plan', rarity: 'common', iconKey: 'target',
    name: N('First Step', '破冰启程', '破冰啟程', 'Primer Paso', 'Primeiro Passo', 'Erster Schritt', 'Premier Pas'),
    rule: R('Complete your very first study plan', '第一次完成一个学习计划', '第一次完成一個學習計劃', 'Completa tu primer plan', 'Complete seu primeiro plano', 'Ersten Plan abschließen', 'Terminer ton premier plan'),
    condition: { kind: 'planCount', total: 1 },
  },
  {
    id: 'plan.count2', category: 'plan', rarity: 'common', iconKey: 'navigation',
    name: N('Second Journey', '再启征程', '再啟征程', 'Segunda Jornada', 'Segunda Jornada', 'Zweite Reise', 'Deuxième Voyage'),
    rule: R('Complete 2 study plans in total', '累计完成 2 个学习计划', '累積完成 2 個學習計劃', 'Completa 2 planes', 'Complete 2 planos', 'Insgesamt 2 Pläne', '2 plans au total'),
    condition: { kind: 'planCount', total: 2 },
  },
  {
    id: 'plan.count3', category: 'plan', rarity: 'rare', iconKey: 'compass',
    name: N('Three Journeys', '三计并进', '三計並進', 'Tres Jornadas', 'Três Jornadas', 'Drei Reisen', 'Trois Voyages'),
    rule: R('Complete 3 study plans in total', '累计完成 3 个学习计划', '累積完成 3 個學習計劃', 'Completa 3 planes', 'Complete 3 planos', 'Insgesamt 3 Pläne', '3 plans au total'),
    condition: { kind: 'planCount', total: 3 },
  },
  {
    id: 'plan.count7', category: 'plan', rarity: 'epic', iconKey: 'trophy',
    name: N('Seven Summits', '七步登峰', '七步登峰', 'Siete Cumbres', 'Sete Cumes', 'Sieben Gipfel', 'Sept Sommets'),
    rule: R('Complete 7 study plans in total', '累计完成 7 个学习计划', '累積完成 7 個學習計劃', 'Completa 7 planes', 'Complete 7 planos', 'Insgesamt 7 Pläne', '7 plans au total'),
    condition: { kind: 'planCount', total: 7 },
  },
  {
    id: 'plan.count10', category: 'plan', rarity: 'epic', iconKey: 'list',
    name: N('Ten Plans', '十计学者', '十計學者', 'Diez Planes', 'Dez Planos', 'Zehn Pläne', 'Dix Plans'),
    rule: R('Complete 10 study plans in total', '累计完成 10 个学习计划', '累積完成 10 個學習計劃', 'Completa 10 planes', 'Complete 10 planos', 'Insgesamt 10 Pläne', '10 plans au total'),
    condition: { kind: 'planCount', total: 10 },
  },
  {
    id: 'plan.count12', category: 'plan', rarity: 'epic', iconKey: 'grid',
    name: N('Twelve Paths', '十二条路', '十二條路', 'Doce Caminos', 'Doze Caminhos', 'Zwölf Pfade', 'Douze Chemins'),
    rule: R('Complete 12 study plans in total', '累计完成 12 个学习计划', '累積完成 12 個學習計劃', 'Completa 12 planes', 'Complete 12 planos', 'Insgesamt 12 Pläne', '12 plans au total'),
    condition: { kind: 'planCount', total: 12 },
  },
  {
    id: 'plan.count15', category: 'plan', rarity: 'epic', iconKey: 'layers',
    name: N('Fifteen Chapters', '十五书学者', '十五書學者', 'Quince Capítulos', 'Quinze Capítulos', 'Fünfzehn Kapitel', 'Quinze Chapitres'),
    rule: R('Complete 15 study plans in total', '累计完成 15 个学习计划', '累積完成 15 個學習計劃', 'Completa 15 planes', 'Complete 15 planos', 'Insgesamt 15 Pläne', '15 plans au total'),
    condition: { kind: 'planCount', total: 15 },
  },
  {
    id: 'plan.count20', category: 'plan', rarity: 'epic', iconKey: 'crosshair',
    name: N('Twenty Plans', '二十计大成', '二十計大成', 'Veinte Planes', 'Vinte Planos', 'Zwanzig Pläne', 'Vingt Plans'),
    rule: R('Complete 20 study plans in total', '累计完成 20 个学习计划', '累積完成 20 個學習計劃', 'Completa 20 planes', 'Complete 20 planos', 'Insgesamt 20 Pläne', '20 plans au total'),
    condition: { kind: 'planCount', total: 20 },
  },
  {
    id: 'plan.count25', category: 'plan', rarity: 'epic', iconKey: 'flag',
    name: N('Twenty-Five Steps', '二十五步', '二十五步', 'Veinticinco Pasos', 'Vinte e Cinco Passos', 'Fünfundzwanzig Schritte', 'Vingt-Cinq Pas'),
    rule: R('Complete 25 study plans in total', '累计完成 25 个学习计划', '累積完成 25 個學習計劃', 'Completa 25 planes', 'Complete 25 planos', 'Insgesamt 25 Pläne', '25 plans au total'),
    condition: { kind: 'planCount', total: 25 },
  },
  {
    id: 'plan.count30', category: 'plan', rarity: 'legendary', iconKey: 'award',
    name: N('Plan Master', '计划大师', '計劃大師', 'Maestra de Planes', 'Mestre em Planos', 'Plan-Meisterin', 'Maîtresse des Plans'),
    rule: R('Complete 30 study plans in total', '累计完成 30 个学习计划', '累積完成 30 個學習計劃', 'Completa 30 planes', 'Complete 30 planos', 'Insgesamt 30 Pläne', '30 plans au total'),
    condition: { kind: 'planCount', total: 30 },
  },
  {
    id: 'plan.speed3in7', category: 'plan', rarity: 'rare', iconKey: 'zap',
    name: N('Three in a Week', '一周三计', '一週三計', 'Tres en una Semana', 'Três em uma Semana', 'Drei in einer Woche', 'Trois en une Semaine'),
    rule: R('Complete 3 study plans within 7 days', '7 天内完成 3 个学习计划', '7 天內完成 3 個學習計劃', 'Completa 3 planes en 7 días', 'Complete 3 planos em 7 dias', '3 Pläne in 7 Tagen', '3 plans en 7 jours'),
    condition: { kind: 'planInWindow', total: 3, days: 7 }, repeatable: true,
  },
  {
    id: 'plan.speed5in30', category: 'plan', rarity: 'epic', iconKey: 'zap',
    name: N('Month in Full Bloom', '月内无休', '月內無休', 'Mes en Flor', 'Mês em Flor', 'Monat in voller Blüte', 'Mois en Floraison'),
    rule: R('Complete 5 study plans within 30 days', '30 天内完成 5 个学习计划', '30 天內完成 5 個學習計劃', 'Completa 5 planes en 30 días', 'Complete 5 planos em 30 dias', '5 Pläne in 30 Tagen', '5 plans en 30 jours'),
    condition: { kind: 'planInWindow', total: 5, days: 30 }, repeatable: true,
  },
  {
    id: 'plan.speed10in30', category: 'plan', rarity: 'legendary', iconKey: 'zap',
    name: N('Devoted Learner', '计划狂人', '計劃狂人', 'Estudiante Devota', 'Estudiosa Devota', 'Eifrige Lernerin', 'Apprenante Dévouée'),
    rule: R('Complete 10 study plans within 30 days', '30 天内完成 10 个学习计划', '30 天內完成 10 個學習計劃', 'Completa 10 planes en 30 días', 'Complete 10 planos em 30 dias', '10 Pläne in 30 Tagen', '10 plans en 30 jours'),
    condition: { kind: 'planInWindow', total: 10, days: 30 }, repeatable: true,
  },
  {
    id: 'plan.deepRoots', category: 'plan', rarity: 'rare', iconKey: 'refresh-cw',
    name: N('Deep Roots', '二刷精研', '二刷精研', 'Raíces Profundas', 'Raízes Profundas', 'Tiefe Wurzeln', 'Racines Profondes'),
    rule: R('Complete the same study plan a second time', '重复完成同一个学习计划（2 遍）', '重複完成同一個學習計劃（2 遍）', 'Completa el mismo plan dos veces', 'Complete o mesmo plano duas vezes', 'Denselben Plan ein zweites Mal', "Même plan deux fois"),
    condition: { kind: 'planRepeated' }, repeatable: true,
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NOTES & HIGHLIGHTS + BOOKS (31) — lavender purple palette
  // First-tier badges (10 / 100) re-fire as modulo every N up to a cap.
  // Discrete tiers (15, 20, 25, 30, 40, 50, 75, 150, 200, 250, 300) fire
  // exactly once each, with `repeatable: true` left off because the equality
  // can only happen on a single creation event.
  // Books moved here from scripture per spec organization.
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'note.first', category: 'note', rarity: 'common', iconKey: 'edit-3',
    name: N('First Reflection', '初写灵感', '初寫靈感', 'Primera Reflexión', 'Primeira Reflexão', 'Erste Reflexion', 'Première Réflexion'),
    rule: R('Write your very first note', '创建第一条笔记', '創建第一條筆記', 'Escribe tu primera nota', 'Escreva sua primeira nota', 'Erste Notiz schreiben', 'Écrire ta première note'),
    condition: { kind: 'notesCount', total: 1 },
  },
  {
    id: 'highlight.first', category: 'note', rarity: 'common', iconKey: 'type',
    name: N('First Highlight', '高亮初心', '高亮初心', 'Primer Subrayado', 'Primeiro Destaque', 'Erste Markierung', 'Premier Surlignage'),
    rule: R('Highlight a verse for the first time', '第一次高亮一段经文', '第一次高亮一段經文', 'Subraya un versículo por primera vez', 'Destaque um versículo pela primeira vez', 'Vers zum ersten Mal markieren', 'Surligner un verset'),
    condition: { kind: 'highlightsCount', total: 1 },
  },
  // First Ten — re-fires every 10 notes up to 100 (10/20/30/.../100).
  {
    id: 'note.count10', category: 'note', rarity: 'common', iconKey: 'edit-3',
    name: N('First Ten', '十条笔记', '十條筆記', 'Diez Notas', 'Dez Notas', 'Zehn Notizen', 'Dix Notes'),
    rule: R('Reach a multiple of 10 notes (up to 100)', '每达 10 条笔记触发（≤100）', '每達 10 條筆記觸發（≤100）', 'Cada 10 notas (hasta 100)', 'A cada 10 notas (até 100)', 'Alle 10 Notizen (bis 100)', 'Toutes les 10 notes (jusqu\'à 100)'),
    condition: { kind: 'notesCountModulo', step: 10, cap: 100 }, repeatable: true,
  },
  // Ten Lights — re-fires every 10 highlights up to 100.
  {
    id: 'highlight.count10', category: 'note', rarity: 'common', iconKey: 'sun',
    name: N('Ten Lights', '十处高亮', '十處高亮', 'Diez Luces', 'Dez Luzes', 'Zehn Lichter', 'Dix Lumières'),
    rule: R('Reach a multiple of 10 highlights (up to 100)', '每达 10 处高亮触发（≤100）', '每達 10 處高亮觸發（≤100）', 'Cada 10 destacados (hasta 100)', 'A cada 10 destaques (até 100)', 'Alle 10 Markierungen (bis 100)', 'Toutes les 10 surlignages (jusqu\'à 100)'),
    condition: { kind: 'highlightsCountModulo', step: 10, cap: 100 }, repeatable: true,
  },
  {
    id: 'note.count15', category: 'note', rarity: 'common', iconKey: 'edit-3',
    name: N('Two Weeks of Words', '两周随想', '兩週隨想', 'Dos Semanas', 'Duas Semanas', 'Zwei Wochen Worte', 'Deux Semaines de Mots'),
    rule: R('Reach 15 notes total', '累计 15 条笔记', '累積 15 條筆記', 'Alcanza 15 notas', 'Alcance 15 notas', '15 Notizen erreichen', 'Atteindre 15 notes'),
    condition: { kind: 'notesCount', total: 15 },
  },
  {
    id: 'highlight.count15', category: 'note', rarity: 'common', iconKey: 'sun',
    name: N('Illuminated', '十五光芒', '十五光芒', 'Iluminada', 'Iluminada', 'Erleuchtet', 'Illuminée'),
    rule: R('Reach 15 highlights total', '累计 15 处高亮', '累積 15 處高亮', 'Alcanza 15 destacados', 'Alcance 15 destaques', '15 Markierungen', 'Atteindre 15 surlignages'),
    condition: { kind: 'highlightsCount', total: 15 },
  },
  {
    id: 'note.count20', category: 'note', rarity: 'rare', iconKey: 'edit-3',
    name: N('Twenty Notes', '二十条笔记', '二十條筆記', 'Veinte Notas', 'Vinte Notas', 'Zwanzig Notizen', 'Vingt Notes'),
    rule: R('Reach 20 notes total', '累计 20 条笔记', '累積 20 條筆記', 'Alcanza 20 notas', 'Alcance 20 notas', '20 Notizen', 'Atteindre 20 notes'),
    condition: { kind: 'notesCount', total: 20 },
  },
  {
    id: 'highlight.count20', category: 'note', rarity: 'rare', iconKey: 'sun',
    name: N('Twenty Highlights', '二十处高亮', '二十處高亮', 'Veinte Destacados', 'Vinte Destaques', 'Zwanzig Markierungen', 'Vingt Surlignages'),
    rule: R('Reach 20 highlights total', '累计 20 处高亮', '累積 20 處高亮', 'Alcanza 20 destacados', 'Alcance 20 destaques', '20 Markierungen', 'Atteindre 20 surlignages'),
    condition: { kind: 'highlightsCount', total: 20 },
  },
  {
    id: 'note.count25', category: 'note', rarity: 'rare', iconKey: 'edit-3',
    name: N('A Month of Words', '一月箴言', '一月箴言', 'Un Mes de Palabras', 'Um Mês de Palavras', 'Ein Monat der Worte', 'Un Mois de Mots'),
    rule: R('Reach 25 notes total', '累计 25 条笔记', '累積 25 條筆記', 'Alcanza 25 notas', 'Alcance 25 notas', '25 Notizen', 'Atteindre 25 notes'),
    condition: { kind: 'notesCount', total: 25 },
  },
  {
    id: 'highlight.count25', category: 'note', rarity: 'rare', iconKey: 'sun',
    name: N('Shining Verses', '二十五光芒', '二十五光芒', 'Versos Brillantes', 'Versos Brilhantes', 'Strahlende Verse', 'Versets Brillants'),
    rule: R('Reach 25 highlights total', '累计 25 处高亮', '累積 25 處高亮', 'Alcanza 25 destacados', 'Alcance 25 destaques', '25 Markierungen', 'Atteindre 25 surlignages'),
    condition: { kind: 'highlightsCount', total: 25 },
  },
  {
    id: 'note.count30', category: 'note', rarity: 'rare', iconKey: 'edit-3',
    name: N('Thirty Reflections', '三十随想', '三十隨想', 'Treinta Reflexiones', 'Trinta Reflexões', 'Dreißig Reflexionen', 'Trente Réflexions'),
    rule: R('Reach 30 notes total', '累计 30 条笔记', '累積 30 條筆記', 'Alcanza 30 notas', 'Alcance 30 notas', '30 Notizen', 'Atteindre 30 notes'),
    condition: { kind: 'notesCount', total: 30 },
  },
  {
    id: 'highlight.count30', category: 'note', rarity: 'rare', iconKey: 'sun',
    name: N('Thirty Rays', '三十光芒', '三十光芒', 'Treinta Rayos', 'Trinta Raios', 'Dreißig Strahlen', 'Trente Rayons'),
    rule: R('Reach 30 highlights total', '累计 30 处高亮', '累積 30 處高亮', 'Alcanza 30 destacados', 'Alcance 30 destaques', '30 Markierungen', 'Atteindre 30 surlignages'),
    condition: { kind: 'highlightsCount', total: 30 },
  },
  {
    id: 'note.count40', category: 'note', rarity: 'rare', iconKey: 'edit-3',
    name: N('Forty Thoughts', '四十随笔', '四十隨筆', 'Cuarenta Pensamientos', 'Quarenta Pensamentos', 'Vierzig Gedanken', 'Quarante Pensées'),
    rule: R('Reach 40 notes total', '累计 40 条笔记', '累積 40 條筆記', 'Alcanza 40 notas', 'Alcance 40 notas', '40 Notizen', 'Atteindre 40 notes'),
    condition: { kind: 'notesCount', total: 40 },
  },
  {
    id: 'highlight.count40', category: 'note', rarity: 'rare', iconKey: 'sun',
    name: N('Forty Beams', '四十光束', '四十光束', 'Cuarenta Rayos', 'Quarenta Feixes', 'Vierzig Strahlen', 'Quarante Faisceaux'),
    rule: R('Reach 40 highlights total', '累计 40 处高亮', '累積 40 處高亮', 'Alcanza 40 destacados', 'Alcance 40 destaques', '40 Markierungen', 'Atteindre 40 surlignages'),
    condition: { kind: 'highlightsCount', total: 40 },
  },
  {
    id: 'note.count50', category: 'note', rarity: 'epic', iconKey: 'edit-3',
    name: N('Fifty Reflections', '五十随想', '五十隨想', 'Cincuenta Reflexiones', 'Cinquenta Reflexões', 'Fünfzig Reflexionen', 'Cinquante Réflexions'),
    rule: R('Reach 50 notes total', '累计 50 条笔记', '累積 50 條筆記', 'Alcanza 50 notas', 'Alcance 50 notas', '50 Notizen', 'Atteindre 50 notes'),
    condition: { kind: 'notesCount', total: 50 },
  },
  {
    id: 'highlight.count50', category: 'note', rarity: 'epic', iconKey: 'sun',
    name: N('Fifty Lights', '五十光芒', '五十光芒', 'Cincuenta Luces', 'Cinquenta Luzes', 'Fünfzig Lichter', 'Cinquante Lumières'),
    rule: R('Reach 50 highlights total', '累计 50 处高亮', '累積 50 處高亮', 'Alcanza 50 destacados', 'Alcance 50 destaques', '50 Markierungen', 'Atteindre 50 surlignages'),
    condition: { kind: 'highlightsCount', total: 50 },
  },
  {
    id: 'note.count75', category: 'note', rarity: 'epic', iconKey: 'edit-3',
    name: N('Faithful Pen', '忠实之笔', '忠實之筆', 'Pluma Fiel', 'Caneta Fiel', 'Treuer Stift', 'Plume Fidèle'),
    rule: R('Reach 75 notes total', '累计 75 条笔记', '累積 75 條筆記', 'Alcanza 75 notas', 'Alcance 75 notas', '75 Notizen', 'Atteindre 75 notes'),
    condition: { kind: 'notesCount', total: 75 },
  },
  // A Hundred Words / Hundred Highlights — modulo every 100 (no cap).
  {
    id: 'note.count100', category: 'note', rarity: 'epic', iconKey: 'layers',
    name: N('A Hundred Words', '百则随想', '百則隨想', 'Cien Palabras', 'Cem Palavras', 'Hundert Worte', 'Cent Mots'),
    rule: R('Reach a multiple of 100 notes', '每达 100 条笔记触发', '每達 100 條筆記觸發', 'Cada 100 notas', 'A cada 100 notas', 'Alle 100 Notizen', 'Toutes les 100 notes'),
    condition: { kind: 'notesCountModulo', step: 100 }, repeatable: true,
  },
  {
    id: 'highlight.count100', category: 'note', rarity: 'epic', iconKey: 'star',
    name: N('Hundred Highlights', '百处高亮', '百處高亮', 'Cien Destacados', 'Cem Destaques', 'Hundert Markierungen', 'Cent Surlignages'),
    rule: R('Reach a multiple of 100 highlights', '每达 100 处高亮触发', '每達 100 處高亮觸發', 'Cada 100 destacados', 'A cada 100 destaques', 'Alle 100 Markierungen', 'Toutes les 100 surlignages'),
    condition: { kind: 'highlightsCountModulo', step: 100 }, repeatable: true,
  },
  {
    id: 'note.count150', category: 'note', rarity: 'epic', iconKey: 'edit-3',
    name: N('Living Word', '灵活之言', '靈活之言', 'Palabra Viva', 'Palavra Viva', 'Lebendiges Wort', 'Parole Vivante'),
    rule: R('Reach 150 notes total', '累计 150 条笔记', '累積 150 條筆記', 'Alcanza 150 notas', 'Alcance 150 notas', '150 Notizen', 'Atteindre 150 notes'),
    condition: { kind: 'notesCount', total: 150 },
  },
  {
    id: 'highlight.count150', category: 'note', rarity: 'epic', iconKey: 'sun',
    name: N('Radiant', '光芒四射', '光芒四射', 'Radiante', 'Radiante', 'Strahlend', 'Rayonnante'),
    rule: R('Reach 150 highlights total', '累计 150 处高亮', '累積 150 處高亮', 'Alcanza 150 destacados', 'Alcance 150 destaques', '150 Markierungen', 'Atteindre 150 surlignages'),
    condition: { kind: 'highlightsCount', total: 150 },
  },
  {
    id: 'note.count200', category: 'note', rarity: 'legendary', iconKey: 'edit-3',
    name: N('Two Hundred Notes', '两百随想', '兩百隨想', 'Doscientas Notas', 'Duzentas Notas', 'Zweihundert Notizen', 'Deux Cents Notes'),
    rule: R('Reach 200 notes total', '累计 200 条笔记', '累積 200 條筆記', 'Alcanza 200 notas', 'Alcance 200 notas', '200 Notizen', 'Atteindre 200 notes'),
    condition: { kind: 'notesCount', total: 200 },
  },
  {
    id: 'highlight.count200', category: 'note', rarity: 'legendary', iconKey: 'star',
    name: N('Two Hundred Stars', '两百星光', '兩百星光', 'Doscientas Estrellas', 'Duzentas Estrelas', 'Zweihundert Sterne', 'Deux Cents Étoiles'),
    rule: R('Reach 200 highlights total', '累计 200 处高亮', '累積 200 處高亮', 'Alcanza 200 destacados', 'Alcance 200 destaques', '200 Markierungen', 'Atteindre 200 surlignages'),
    condition: { kind: 'highlightsCount', total: 200 },
  },
  {
    id: 'note.count250', category: 'note', rarity: 'legendary', iconKey: 'archive',
    name: N('Growing Library', '成长文库', '成長文庫', 'Biblioteca en Crecimiento', 'Biblioteca em Crescimento', 'Wachsende Bibliothek', 'Bibliothèque Grandissante'),
    rule: R('Reach 250 notes total', '累计 250 条笔记', '累積 250 條筆記', 'Alcanza 250 notas', 'Alcance 250 notas', '250 Notizen', 'Atteindre 250 notes'),
    condition: { kind: 'notesCount', total: 250 },
  },
  {
    id: 'highlight.count250', category: 'note', rarity: 'legendary', iconKey: 'star',
    name: N('Star-filled', '满天繁星', '滿天繁星', 'Llena de Estrellas', 'Cheia de Estrelas', 'Sternenvoll', 'Étoilée'),
    rule: R('Reach 250 highlights total', '累计 250 处高亮', '累積 250 處高亮', 'Alcanza 250 destacados', 'Alcance 250 destaques', '250 Markierungen', 'Atteindre 250 surlignages'),
    condition: { kind: 'highlightsCount', total: 250 },
  },
  {
    id: 'note.count300', category: 'note', rarity: 'legendary', iconKey: 'edit-3',
    name: N('Three Hundred Notes', '三百篇章', '三百篇章', 'Trescientas Notas', 'Trezentas Notas', 'Dreihundert Notizen', 'Trois Cents Notes'),
    rule: R('Reach 300 notes total', '累计 300 条笔记', '累積 300 條筆記', 'Alcanza 300 notas', 'Alcance 300 notas', '300 Notizen', 'Atteindre 300 notes'),
    condition: { kind: 'notesCount', total: 300 },
  },
  {
    id: 'highlight.count300', category: 'note', rarity: 'legendary', iconKey: 'star',
    name: N('Three Hundred Stars', '三百高亮', '三百高亮', 'Trescientas Estrellas', 'Trezentas Estrelas', 'Dreihundert Sterne', 'Trois Cents Étoiles'),
    rule: R('Reach 300 highlights total', '累计 300 处高亮', '累積 300 處高亮', 'Alcanza 300 destacados', 'Alcance 300 destaques', '300 Markierungen', 'Atteindre 300 surlignages'),
    condition: { kind: 'highlightsCount', total: 300 },
  },
  // Books — moved to note category per spec organization. Same ids and
  // images reused; only the category label changes.
  {
    id: 'scripture.books10', category: 'note', rarity: 'common', iconKey: 'gift',
    name: N('Ten Books', '十卷之旅', '十卷之旅', 'Diez Libros', 'Dez Livros', 'Zehn Bücher', 'Dix Livres'),
    rule: R('Read every chapter of 10 different books', '完整读完 10 个书卷', '完整讀完 10 個書卷', 'Lee 10 libros completos', 'Leia 10 livros completos', '10 vollständige Bücher', '10 livres lus en entier'),
    condition: { kind: 'booksRead', total: 10 },
  },
  {
    id: 'scripture.books20', category: 'note', rarity: 'rare', iconKey: 'gift',
    name: N('Twenty Books', '二十卷学者', '二十卷學者', 'Veinte Libros', 'Vinte Livros', 'Zwanzig Bücher', 'Vingt Livres'),
    rule: R('Read every chapter of 20 different books', '完整读完 20 个书卷', '完整讀完 20 個書卷', 'Lee 20 libros completos', 'Leia 20 livros completos', '20 vollständige Bücher', '20 livres lus en entier'),
    condition: { kind: 'booksRead', total: 20 },
  },
  {
    id: 'scripture.books30', category: 'note', rarity: 'epic', iconKey: 'gift',
    name: N('Thirty Books', '三十卷深耕', '三十卷深耕', 'Treinta Libros', 'Trinta Livros', 'Dreißig Bücher', 'Trente Livres'),
    rule: R('Read every chapter of 30 different books', '完整读完 30 个书卷', '完整讀完 30 個書卷', 'Lee 30 libros completos', 'Leia 30 livros completos', '30 vollständige Bücher', '30 livres lus en entier'),
    condition: { kind: 'booksRead', total: 30 },
  },
  {
    id: 'scripture.books50', category: 'note', rarity: 'legendary', iconKey: 'gift',
    name: N('Fifty Books', '五十卷完读', '五十卷完讀', 'Cincuenta Libros', 'Cinquenta Livros', 'Fünfzig Bücher', 'Cinquante Livres'),
    rule: R('Read every chapter of 50 different books (≈76% of 66)', '完整读完 50 个书卷（66 卷的约 76%）', '完整讀完 50 個書卷（66 卷的約 76%）', 'Lee 50 libros completos', 'Leia 50 livros completos', '50 vollständige Bücher', '50 livres lus en entier'),
    condition: { kind: 'booksRead', total: 50 },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MILESTONES (9) — rose copper palette
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'milestone.dawn7', category: 'milestone', rarity: 'rare', iconKey: 'sunrise',
    // User-chosen threshold: prayer completed before 21:00 local. Spec says
    // "07:00 morning only"; keeping the user's looser interpretation per
    // their direction. If the badge name reads off vs. the rule, swap to
    // a friendlier name later.
    name: N('Dawn Devotion', '晨曦敬拜', '晨曦敬拜', 'Devoción al Amanecer', 'Devoção ao Amanhecer', 'Morgenandacht', 'Dévotion à l’Aube'),
    rule: R(
      'Complete prayer before 9 PM, 7 days in a row',
      '连续 7 天在晚上 9 点前完成祈祷',
      '連續 7 天在晚上 9 點前完成祈禱',
      'Ora antes de las 9 PM durante 7 días',
      'Complete a oração antes das 21h por 7 dias',
      '7 Tage vor 21 Uhr beten',
      'Prière avant 21h, 7 jours de suite',
    ),
    condition: { kind: 'earlyBirdStreak', days: 7 }, repeatable: true,
  },
  {
    id: 'milestone.triple', category: 'milestone', rarity: 'epic', iconKey: 'plus-circle',
    name: N('Body, Soul & Spirit', '身心灵合一', '身心靈合一', 'Cuerpo, Alma y Espíritu', 'Corpo, Alma e Espírito', 'Körper, Seele & Geist', 'Corps, Âme & Esprit'),
    rule: R('Complete Prayer + Reading + Note/Highlight in one day', '同一天完成祈祷 + 阅读 + 笔记/高亮', '同一天完成祈禱 + 閱讀 + 筆記/高亮', 'Oración + Lectura + Nota mismo día', 'Oração + Leitura + Nota no mesmo dia', 'Gebet + Lesen + Notiz an einem Tag', 'Prière + Lecture + Note même jour'),
    condition: { kind: 'tripleToday' }, repeatable: true,
  },
  {
    id: 'milestone.share1', category: 'milestone', rarity: 'common', iconKey: 'share-2',
    name: N('Share the Word', '以爱传道', '以愛傳道', 'Comparte la Palabra', 'Compartilhe a Palavra', 'Teile das Wort', 'Partager la Parole'),
    rule: R('Share a Bible verse for the first time', '第一次分享一段经文', '第一次分享一段經文', 'Comparte un versículo por primera vez', 'Compartilhe um versículo pela primeira vez', 'Vers erstmals teilen', 'Partager un verset'),
    condition: { kind: 'shareCount', total: 1 },
  },
  {
    id: 'milestone.share3', category: 'milestone', rarity: 'rare', iconKey: 'mail',
    // v2.3: "Faithful Sower" is the 3-share badge (was 5-share in v1).
    name: N('Faithful Sower', '播种者', '播種者', 'Sembradora Fiel', 'Semeadora Fiel', 'Treue Säerin', 'Semeuse Fidèle'),
    rule: R('Share verses or plans 3 times in total', '累计分享 3 次', '累積分享 3 次', 'Comparte 3 veces', 'Compartilhe 3 vezes', 'Insgesamt 3 Mal teilen', 'Partager 3 fois'),
    condition: { kind: 'shareCount', total: 3 },
  },
  {
    id: 'milestone.share5', category: 'milestone', rarity: 'epic', iconKey: 'mail',
    // v2.3: "Light to the World" is the 5-share badge (was unnamed in v1).
    name: N('Light to the World', '世界之光', '世界之光', 'Luz del Mundo', 'Luz do Mundo', 'Licht der Welt', 'Lumière du Monde'),
    rule: R('Share verses or plans 5 times in total', '累计分享 5 次', '累積分享 5 次', 'Comparte 5 veces', 'Compartilhe 5 vezes', 'Insgesamt 5 Mal teilen', 'Partager 5 fois'),
    condition: { kind: 'shareCount', total: 5 },
  },
  {
    id: 'milestone.anniversary', category: 'milestone', rarity: 'epic', iconKey: 'calendar',
    name: N('Anniversary Blessing', '周年纪念', '週年紀念', 'Bendición de Aniversario', 'Bênção de Aniversário', 'Jahrestags-Segen', "Bénédiction d'Anniversaire"),
    rule: R('Log in on the anniversary of joining Her Bible', '在账号注册一周年当天登录并打卡', '在帳號註冊一週年當天登錄並打卡', 'Inicia sesión el aniversario de tu registro', 'Entre no app no aniversário do seu cadastro', 'Am Jahrestag einloggen', "Se connecter le jour de l'anniversaire"),
    condition: { kind: 'anniversary' }, repeatable: true,    // re-fires each year
  },
  {
    id: 'milestone.river30', category: 'milestone', rarity: 'legendary', iconKey: 'activity',
    // v2.3: prayer streak ≥ 30 AND reading streak ≥ 30 AND ≥ 3 plans done in
    // the same 30-day window. Was simpler "all three streaks ≥ 30" in v1.
    name: N('River of Life', '三流并进', '三流並進', 'Río de Vida', 'Rio da Vida', 'Strom des Lebens', 'Fleuve de Vie'),
    rule: R('Prayer streak 30 + Reading streak 30 + 3 plans in last 30 days', '祈祷连续 30 天 + 阅读连续 30 天 + 30 天内完成 3 个学习计划', '祈禱連續 30 天 + 閱讀連續 30 天 + 30 天內完成 3 個學習計劃', '30 días oración + 30 días lectura + 3 planes en 30 días', '30 dias oração + 30 dias leitura + 3 planos em 30 dias', '30 Tage Gebet + 30 Tage Lesen + 3 Pläne in 30 Tagen', '30 jours prière + 30 jours lecture + 3 plans en 30 jours'),
    condition: { kind: 'riverOfLife', prayerDays: 30, readingDays: 30, plansInWindow: 3, windowDays: 30 }, repeatable: true,
  },
  {
    id: 'milestone.fullYear', category: 'milestone', rarity: 'legendary', iconKey: 'clock',
    // v2.3: 365 days since first launch AND ≥ 300 active days total.
    name: N('A Full Year', '整整一年', '整整一年', 'Un Año Completo', 'Um Ano Completo', 'Ein volles Jahr', 'Une Année Entière'),
    rule: R('365 days since signup with at least 300 active days', '注册满 365 天且累计活跃 300 天以上', '註冊滿 365 天且累計活躍 300 天以上', '365 días desde registro + 300 días activos', '365 dias desde cadastro + 300 dias ativos', '365 Tage seit Registrierung + 300 aktive Tage', '365 jours depuis inscription + 300 jours actifs'),
    condition: { kind: 'activeYears', days: 365, activeDaysMin: 300 },
  },
  {
    id: 'milestone.crown', category: 'milestone', rarity: 'legendary', iconKey: 'award',
    name: N('Crown of Grace', '至高荣耀', '至高榮耀', 'Corona de Gracia', 'Coroa de Graça', 'Krone der Gnade', 'Couronne de Grâce'),
    rule: R('Hold The Whole Word + A Year of Devotion + Plan Master simultaneously', '同时持有「全书见证」「整年敬虔」「计划大师」', '同時持有「全書見證」「整年敬虔」「計劃大師」', 'Posee las tres leyendas simultáneamente', 'Tenha as três legendárias simultaneamente', 'Die drei Legendären gleichzeitig', 'Détenir les trois légendaires'),
    condition: { kind: 'holdsAll', ids: ['scripture.read100', 'prayer.streak365', 'plan.count30'] },
  },
];

export function localizedAchievementName(a: Achievement, code: LanguageCode): string {
  return a.name[code] || a.name.en || a.id;
}

export function localizedAchievementRule(a: Achievement, code: LanguageCode): string {
  return a.rule[code] || a.rule.en || '';
}

// Localized section + UI labels for the gallery screen.
export interface AchievementUiStrings {
  title: string;
  awarded: string;
  toCollect: string;
  congrats: string;
  /** Full-screen unlock page title (sentence case, with "!"). */
  congratsTitle: string;
  /** Small label at the top of the unlock card. */
  newAchievement: string;
  /** Primary CTA on the unlock screen — accept/keep the badge. */
  collect: string;
  /**
   * Tiny corner pill on a badge she hasn't looked at yet. Must stay SHORT —
   * it sits on an 88 px badge, so anything past ~6 characters starts covering
   * the artwork it is meant to draw attention to. Uppercase where the language
   * has a case distinction.
   */
  newRibbon: string;
  earnedDescription: (name: string) => string;
  ok: string;
  viewDetails: string;
  categories: Record<BadgeCategory, string>;
}

const UI: Record<LanguageCode, AchievementUiStrings> = {
  en: {
    title: 'Achievement', awarded: 'Badges Awarded', toCollect: 'Badges to be Collected',
    congrats: 'CONGRATS', congratsTitle: 'Congrats!', newAchievement: 'New Achievement', collect: 'Collect', newRibbon: 'NEW',
    earnedDescription: (n) => `You've earned the "${n}" badge`,
    ok: 'Continue', viewDetails: 'View Details',
    categories: { prayer: 'Prayer', scripture: 'Scripture', plan: 'Study Plans', note: 'Notes & Highlights', milestone: 'Milestones' },
  },
  'zh-Hans': {
    title: '成就', awarded: '已获得徽章', toCollect: '待获得徽章',
    congrats: '恭喜', congratsTitle: '恭喜!', newAchievement: '新成就', collect: '收下', newRibbon: 'NEW',
    earnedDescription: (n) => `你获得了「${n}」徽章`,
    ok: '继续', viewDetails: '查看详情',
    categories: { prayer: '祈祷', scripture: '阅读', plan: '学习计划', note: '笔记与高亮', milestone: '综合成就' },
  },
  'zh-Hant': {
    title: '成就', awarded: '已獲得徽章', toCollect: '待獲得徽章',
    congrats: '恭喜', congratsTitle: '恭喜!', newAchievement: '新成就', collect: '收下', newRibbon: 'NEW',
    earnedDescription: (n) => `你獲得了「${n}」徽章`,
    ok: '繼續', viewDetails: '查看詳情',
    categories: { prayer: '祈禱', scripture: '閱讀', plan: '學習計劃', note: '筆記與高亮', milestone: '綜合成就' },
  },
  de: {
    title: 'Erfolge', awarded: 'Erhaltene Abzeichen', toCollect: 'Noch zu sammeln',
    congrats: 'GLÜCKWUNSCH', congratsTitle: 'Glückwunsch!', newAchievement: 'Neuer Erfolg', collect: 'Einsammeln', newRibbon: 'NEU',
    earnedDescription: (n) => `Du hast das Abzeichen „${n}" erhalten`,
    ok: 'Weiter', viewDetails: 'Details ansehen',
    categories: { prayer: 'Gebet', scripture: 'Schrift', plan: 'Studienpläne', note: 'Notizen & Markierungen', milestone: 'Meilensteine' },
  },
  fr: {
    title: 'Réussites', awarded: 'Badges obtenus', toCollect: 'Badges à collecter',
    congrats: 'FÉLICITATIONS', congratsTitle: 'Félicitations !', newAchievement: 'Nouveau succès', collect: 'Récupérer', newRibbon: 'NOUV.',
    earnedDescription: (n) => `Tu as obtenu le badge « ${n} »`,
    ok: 'Continuer', viewDetails: 'Voir détails',
    categories: { prayer: 'Prière', scripture: 'Écriture', plan: 'Plans d’étude', note: 'Notes & surlignages', milestone: 'Jalons' },
  },
  es: {
    title: 'Logros', awarded: 'Insignias obtenidas', toCollect: 'Insignias por obtener',
    congrats: 'FELICIDADES', congratsTitle: '¡Felicidades!', newAchievement: 'Nuevo logro', collect: 'Recoger', newRibbon: 'NUEVO',
    earnedDescription: (n) => `Has obtenido la insignia «${n}»`,
    ok: 'Continuar', viewDetails: 'Ver detalles',
    categories: { prayer: 'Oración', scripture: 'Escritura', plan: 'Planes de estudio', note: 'Notas y subrayados', milestone: 'Hitos' },
  },
  pt: {
    title: 'Conquistas', awarded: 'Distintivos obtidos', toCollect: 'Distintivos a coletar',
    congrats: 'PARABÉNS', congratsTitle: 'Parabéns!', newAchievement: 'Nova conquista', collect: 'Coletar', newRibbon: 'NOVO',
    earnedDescription: (n) => `Você ganhou o distintivo "${n}"`,
    ok: 'Continuar', viewDetails: 'Ver detalhes',
    categories: { prayer: 'Oração', scripture: 'Escritura', plan: 'Planos de estudo', note: 'Notas e destaques', milestone: 'Marcos' },
  },
};

export function achievementUi(code: LanguageCode): AchievementUiStrings {
  return UI[code] || UI.en;
}
