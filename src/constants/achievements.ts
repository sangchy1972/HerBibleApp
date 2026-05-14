// All 42 achievement badges for the Faith Achievement gallery.
//
// Each badge has:
//  - id: stable storage key. Never rename; bump a new id if you need to.
//  - category: groups the badge in the gallery.
//  - rarity: drives the badge frame color.
//  - iconKey: maps to a Feather/Ionicons icon inside the badge hex.
//  - name / rule: per-language strings. Falls back to English when a
//    locale is missing.
//  - condition: declarative trigger key — the evaluator translates each
//    key to a boolean against the current snapshot. Keeping conditions as
//    data (rather than functions) keeps this file serializable and lets
//    the evaluator unit-test cleanly.
//  - repeatable: true for streak badges that re-trigger after a fresh run
//    (matches the screenshot's "x4" / "x2" earn counts).
//
// The condition keys are documented in src/services/achievementsEvaluator.ts.

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
  | { kind: 'prayerStreak'; days: number }              // current consecutive complete days >= N
  | { kind: 'prayerCount'; total: number }              // totalComplete >= N
  | { kind: 'readPercent'; percent: number }            // % of Bible read >= N
  | { kind: 'chaptersRead'; total: number }
  | { kind: 'readingStreak'; days: number }             // ActivityContext.streak >= N
  | { kind: 'notesCount'; total: number }
  | { kind: 'highlightsCount'; total: number }
  | { kind: 'highlightedBooks'; total: number }         // distinct books with at least one highlight (legacy — currently unused)
  | { kind: 'booksRead'; total: number }                // distinct books with ≥1 chapter read
  | { kind: 'planCount'; total: number }                // plans completed (lifetime) >= N
  | { kind: 'planInWindow'; total: number; days: number } // N plans in last `days` days
  | { kind: 'planRepeated' }                            // same plan completed 2+ times
  | { kind: 'shareCount'; total: number }
  | { kind: 'tripleToday' }                             // prayer + reading + note all same day
  | { kind: 'earlyBirdStreak'; days: number }           // before-7am prayer N days in a row
  | { kind: 'allThreeStreaks'; days: number }           // prayer + reading + plan all streak >= N
  | { kind: 'anniversary' }                             // login on first-launch anniversary
  | { kind: 'activeYears'; days: number }               // app age >= N days AND active today
  | { kind: 'holdsAll'; ids: string[] };                // user holds all listed earned badges

// Helper: short-form name/rule entries are awkward at 7-language granularity,
// so we lean on a couple of small typing helpers to keep the table compact.
const N = (
  en: string, zhHans: string, zhHant: string, es: string, pt: string, de: string, fr: string,
): Partial<Record<LanguageCode, string>> => ({ en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, es, pt, de, fr });

const R = N; // same shape — alias for readability

export const ACHIEVEMENTS: Achievement[] = [
  // ───── Prayer (8) ────────────────────────────────────────────────
  {
    id: 'prayer.first', category: 'prayer', rarity: 'common', iconKey: 'candle',
    name: N('First Light', '初次祷告', '初次禱告', 'Primera Luz', 'Primeira Luz', 'Erstes Licht', 'Première Lumière'),
    rule: R('Complete your very first prayer check-in', '完成第一次祈祷打卡', '完成第一次祈禱打卡', 'Completa tu primer registro de oración', 'Complete seu primeiro registro', 'Ersten Gebets-Check-in abschließen', 'Premier enregistrement de prière'),
    condition: { kind: 'prayerCount', total: 1 },
  },
  {
    id: 'prayer.streak3', category: 'prayer', rarity: 'common', iconKey: 'sunrise',
    name: N('Three-Day Glow', '三日晨星', '三日晨星', 'Tres Días', 'Três Dias', 'Drei Tage', 'Trois Jours'),
    rule: R('Pray 3 days in a row', '连续祈祷 3 天', '連續祈禱 3 天', 'Ora 3 días seguidos', 'Ore 3 dias seguidos', '3 Tage in Folge beten', 'Prier 3 jours de suite'),
    condition: { kind: 'prayerStreak', days: 3 }, repeatable: true,
  },
  {
    id: 'prayer.streak7', category: 'prayer', rarity: 'rare', iconKey: 'star',
    name: N('Seven-Day Radiance', '七日灵光', '七日靈光', 'Siete Días', 'Sete Dias', 'Sieben Tage', 'Sept Jours'),
    rule: R('Pray every day for 7 days straight', '连续祈祷 7 天', '連續祈禱 7 天', 'Ora 7 días seguidos', 'Ore 7 dias seguidos', '7 Tage in Folge beten', 'Prier 7 jours de suite'),
    condition: { kind: 'prayerStreak', days: 7 }, repeatable: true,
  },
  {
    id: 'prayer.streak14', category: 'prayer', rarity: 'rare', iconKey: 'moon',
    name: N('Fortnight Faithful', '半月守望', '半月守望', 'Quincena Fiel', 'Quinzena Fiel', 'Vierzehn Tage', 'Quinzaine Fidèle'),
    rule: R('Pray every day for 14 days straight', '连续祈祷 14 天', '連續祈禱 14 天', 'Ora 14 días seguidos', 'Ore 14 dias seguidos', '14 Tage in Folge beten', 'Prier 14 jours de suite'),
    condition: { kind: 'prayerStreak', days: 14 }, repeatable: true,
  },
  {
    id: 'prayer.streak30', category: 'prayer', rarity: 'epic', iconKey: 'flame',
    name: N('A Month of Grace', '月月同行', '月月同行', 'Un Mes de Gracia', 'Um Mês de Graça', 'Ein Monat Gnade', 'Un Mois de Grâce'),
    rule: R('Pray every day for 30 consecutive days', '连续祈祷 30 天', '連續祈禱 30 天', 'Ora 30 días consecutivos', 'Ore 30 dias consecutivos', '30 Tage in Folge beten', 'Prier 30 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 30 }, repeatable: true,
  },
  {
    id: 'prayer.streak90', category: 'prayer', rarity: 'epic', iconKey: 'feather',
    name: N('Three-Month Covenant', '三月圣约', '三月聖約', 'Pacto Trimestral', 'Aliança Trimestral', 'Drei-Monats-Bund', 'Pacte de Trois Mois'),
    rule: R('Pray every day for 90 consecutive days', '连续祈祷 90 天', '連續祈禱 90 天', 'Ora 90 días consecutivos', 'Ore 90 dias consecutivos', '90 Tage in Folge beten', 'Prier 90 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 90 },
  },
  {
    id: 'prayer.streak100', category: 'prayer', rarity: 'legendary', iconKey: 'award',
    name: N('Hundred Days of Prayer', '百日祷告者', '百日禱告者', 'Cien Días de Oración', 'Cem Dias de Oração', 'Hundert Tage des Gebets', 'Cent Jours de Prière'),
    rule: R('Pray every day for 100 consecutive days', '连续祈祷满 100 天', '連續祈禱滿 100 天', 'Ora 100 días consecutivos', 'Ore 100 dias consecutivos', '100 Tage in Folge beten', 'Prier 100 jours consécutifs'),
    condition: { kind: 'prayerStreak', days: 100 },
  },
  {
    id: 'prayer.streak365', category: 'prayer', rarity: 'legendary', iconKey: 'sun',
    name: N('A Year of Devotion', '整年敬虔', '整年敬虔', 'Un Año de Devoción', 'Um Ano de Devoção', 'Ein Jahr Hingabe', 'Une Année de Dévotion'),
    rule: R('Pray every single day for a full year', '连续祈祷满 365 天', '連續祈禱滿 365 天', 'Ora todos los días durante un año entero', 'Ore todos os dias por um ano inteiro', 'Ein ganzes Jahr täglich beten', 'Prier chaque jour pendant une année entière'),
    condition: { kind: 'prayerStreak', days: 365 },
  },

  // ───── Scripture (9) ─────────────────────────────────────────────
  {
    id: 'scripture.first', category: 'scripture', rarity: 'common', iconKey: 'book',
    name: N('First Page', '开卷有益', '開卷有益', 'Primera Página', 'Primeira Página', 'Erste Seite', 'Première Page'),
    rule: R('Read your very first chapter of the Bible', '完成第一章圣经阅读', '完成第一章聖經閱讀', 'Lee tu primer capítulo', 'Leia seu primeiro capítulo', 'Erstes Kapitel lesen', 'Lis ton premier chapitre'),
    condition: { kind: 'chaptersRead', total: 1 },
  },
  {
    id: 'scripture.read5', category: 'scripture', rarity: 'common', iconKey: 'leaf',
    name: N('Seedling Faith', '幼苗初发', '幼苗初發', 'Fe Naciente', 'Fé Nascente', 'Keimender Glaube', 'Foi Naissante'),
    rule: R('Read 5% of the Bible', '累计阅读圣经达 5%', '累積閱讀聖經達 5%', 'Lee el 5% de la Biblia', 'Leia 5% da Bíblia', '5% der Bibel lesen', 'Lire 5% de la Bible'),
    condition: { kind: 'readPercent', percent: 5 },
  },
  {
    id: 'scripture.read10', category: 'scripture', rarity: 'rare', iconKey: 'scroll',
    name: N('One in Ten', '十分之一', '十分之一', 'Diez Por Ciento', 'Dez Por Cento', 'Zehn Prozent', 'Dix Pour Cent'),
    rule: R('Read 10% of the Bible', '累计阅读圣经达 10%', '累積閱讀聖經達 10%', 'Lee el 10% de la Biblia', 'Leia 10% da Bíblia', '10% der Bibel lesen', 'Lire 10% de la Bible'),
    condition: { kind: 'readPercent', percent: 10 },
  },
  {
    id: 'scripture.read25', category: 'scripture', rarity: 'rare', iconKey: 'mountain',
    name: N('A Quarter Through', '四分之一', '四分之一', 'Un Cuarto', 'Um Quarto', 'Ein Viertel', 'Un Quart'),
    rule: R('Read 25% of the Bible', '累计阅读圣经达 25%', '累積閱讀聖經達 25%', 'Lee el 25% de la Biblia', 'Leia 25% da Bíblia', '25% der Bibel lesen', 'Lire 25% de la Bible'),
    condition: { kind: 'readPercent', percent: 25 },
  },
  {
    id: 'scripture.read50', category: 'scripture', rarity: 'epic', iconKey: 'book-open',
    name: N('Halfway Home', '半部圣典', '半部聖典', 'La Mitad', 'Metade', 'Auf Halbem Weg', 'À Mi-Chemin'),
    rule: R('Read 50% of the Bible', '累计阅读圣经达 50%', '累積閱讀聖經達 50%', 'Lee el 50% de la Biblia', 'Leia 50% da Bíblia', '50% der Bibel lesen', 'Lire 50% de la Bible'),
    condition: { kind: 'readPercent', percent: 50 },
  },
  {
    id: 'scripture.read75', category: 'scripture', rarity: 'epic', iconKey: 'trending-up',
    name: N('Three Quarters', '四分之三', '四分之三', 'Tres Cuartos', 'Três Quartos', 'Drei Viertel', 'Trois Quarts'),
    rule: R('Read 75% of the Bible', '累计阅读圣经达 75%', '累積閱讀聖經達 75%', 'Lee el 75% de la Biblia', 'Leia 75% da Bíblia', '75% der Bibel lesen', 'Lire 75% de la Bible'),
    condition: { kind: 'readPercent', percent: 75 },
  },
  {
    id: 'scripture.read100', category: 'scripture', rarity: 'legendary', iconKey: 'award',
    name: N('The Whole Word', '全书见证', '全書見證', 'La Palabra Completa', 'A Palavra Toda', 'Das ganze Wort', 'La Parole Entière'),
    rule: R('Read the entire Bible — all 100%', '通读完整部圣经 100%', '通讀完整部聖經 100%', 'Lee toda la Biblia, el 100%', 'Leia toda a Bíblia — 100%', 'Die gesamte Bibel lesen', 'Lire toute la Bible — 100%'),
    condition: { kind: 'readPercent', percent: 100 },
  },
  {
    id: 'scripture.streak7', category: 'scripture', rarity: 'rare', iconKey: 'calendar',
    name: N('Seven Scripture Days', '七日书卷', '七日書卷', 'Siete Días de Lectura', 'Sete Dias de Leitura', 'Sieben Lese-Tage', 'Sept Jours de Lecture'),
    rule: R('Complete your daily reading 7 days in a row', '连续 7 天每天完成当日阅读', '連續 7 天每天完成當日閱讀', 'Lee cada día durante 7 días seguidos', 'Complete a leitura diária 7 dias seguidos', '7 Tage in Folge täglich lesen', 'Lecture quotidienne 7 jours de suite'),
    condition: { kind: 'readingStreak', days: 7 }, repeatable: true,
  },
  {
    id: 'scripture.streak30', category: 'scripture', rarity: 'epic', iconKey: 'calendar',
    name: N('Month of the Word', '月读不辍', '月讀不輟', 'Mes de la Palabra', 'Mês da Palavra', 'Monat des Wortes', 'Mois de la Parole'),
    rule: R('Complete your daily reading 30 days in a row', '连续 30 天每天完成当日阅读', '連續 30 天每天完成當日閱讀', 'Lee cada día durante 30 días seguidos', 'Complete a leitura diária 30 dias seguidos', '30 Tage in Folge täglich lesen', 'Lecture quotidienne 30 jours de suite'),
    condition: { kind: 'readingStreak', days: 30 },
  },
  {
    id: 'scripture.books10', category: 'scripture', rarity: 'rare', iconKey: 'gift',
    name: N('Verse Collector', '金句收藏家', '金句收藏家', 'Coleccionista de Versículos', 'Colecionadora', 'Vers-Sammlerin', 'Collectionneuse de Versets'),
    rule: R('Read at least one chapter from 10 different books of the Bible', '阅读 10 本不同圣经书卷', '閱讀 10 本不同聖經書卷', 'Lee al menos un capítulo de 10 libros distintos', 'Leia pelo menos um capítulo de 10 livros distintos', 'Lies aus 10 verschiedenen Büchern', "Lis au moins un chapitre dans 10 livres différents"),
    condition: { kind: 'booksRead', total: 10 },
  },
  {
    id: 'scripture.books20', category: 'scripture', rarity: 'epic', iconKey: 'gift',
    name: N('Page Pilgrim', '行路阅卷', '行路閱卷', 'Peregrina de Páginas', 'Peregrina das Páginas', 'Seiten-Pilgerin', 'Pèlerine des Pages'),
    rule: R('Read at least one chapter from 20 different books of the Bible', '阅读 20 本不同圣经书卷', '閱讀 20 本不同聖經書卷', 'Lee de 20 libros distintos', 'Leia de 20 livros distintos', 'Lies aus 20 verschiedenen Büchern', '20 livres différents lus'),
    condition: { kind: 'booksRead', total: 20 },
  },
  {
    id: 'scripture.books30', category: 'scripture', rarity: 'epic', iconKey: 'gift',
    name: N('Scripture Scholar', '勤研学者', '勤研學者', 'Erudita de las Escrituras', 'Erudita das Escrituras', 'Schrift-Gelehrte', 'Érudite des Écritures'),
    rule: R('Read at least one chapter from 30 different books of the Bible', '阅读 30 本不同圣经书卷', '閱讀 30 本不同聖經書卷', 'Lee de 30 libros distintos', 'Leia de 30 livros distintos', 'Lies aus 30 verschiedenen Büchern', '30 livres différents lus'),
    condition: { kind: 'booksRead', total: 30 },
  },
  {
    id: 'scripture.books50', category: 'scripture', rarity: 'legendary', iconKey: 'gift',
    name: N('Bible Cartographer', '圣经导航者', '聖經導航者', 'Cartógrafa Bíblica', 'Cartógrafa Bíblica', 'Bibel-Kartografin', 'Cartographe Biblique'),
    rule: R('Read at least one chapter from 50 different books of the Bible', '阅读 50 本不同圣经书卷', '閱讀 50 本不同聖經書卷', 'Lee de 50 libros distintos', 'Leia de 50 livros distintos', 'Lies aus 50 verschiedenen Büchern', '50 livres différents lus'),
    condition: { kind: 'booksRead', total: 50 },
  },

  // ───── Study Plans (9) ───────────────────────────────────────────
  {
    id: 'plan.first', category: 'plan', rarity: 'common', iconKey: 'target',
    name: N('First Step', '破冰启程', '破冰啟程', 'Primer Paso', 'Primeiro Passo', 'Erster Schritt', 'Premier Pas'),
    rule: R('Complete your very first study plan', '第一次完成一个学习计划', '第一次完成一個學習計劃', 'Completa tu primer plan de estudio', 'Complete seu primeiro plano', 'Ersten Studienplan abschließen', 'Terminer ton premier plan'),
    condition: { kind: 'planCount', total: 1 },
  },
  {
    id: 'plan.count3', category: 'plan', rarity: 'rare', iconKey: 'compass',
    name: N('Three Journeys', '三计并进', '三計並進', 'Tres Jornadas', 'Três Jornadas', 'Drei Reisen', 'Trois Voyages'),
    rule: R('Complete 3 study plans in total', '累计完成 3 个学习计划', '累積完成 3 個學習計劃', 'Completa 3 planes en total', 'Complete 3 planos no total', 'Insgesamt 3 Studienpläne', '3 plans au total'),
    condition: { kind: 'planCount', total: 3 },
  },
  {
    id: 'plan.count7', category: 'plan', rarity: 'epic', iconKey: 'trophy',
    name: N('Seven Summits', '七步登峰', '七步登峰', 'Siete Cumbres', 'Sete Cumes', 'Sieben Gipfel', 'Sept Sommets'),
    rule: R('Complete 7 study plans in total', '累计完成 7 个学习计划', '累積完成 7 個學習計劃', 'Completa 7 planes en total', 'Complete 7 planos no total', 'Insgesamt 7 Studienpläne', '7 plans au total'),
    condition: { kind: 'planCount', total: 7 },
  },
  {
    id: 'plan.count15', category: 'plan', rarity: 'epic', iconKey: 'layers',
    name: N('Fifteen Chapters', '十五书学者', '十五書學者', 'Quince Capítulos', 'Quinze Capítulos', 'Fünfzehn Kapitel', 'Quinze Chapitres'),
    rule: R('Complete 15 study plans in total', '累计完成 15 个学习计划', '累積完成 15 個學習計劃', 'Completa 15 planes en total', 'Complete 15 planos no total', 'Insgesamt 15 Studienpläne', '15 plans au total'),
    condition: { kind: 'planCount', total: 15 },
  },
  {
    id: 'plan.count30', category: 'plan', rarity: 'legendary', iconKey: 'award',
    name: N('Plan Master', '计划大师', '計劃大師', 'Maestra de Planes', 'Mestre em Planos', 'Plan-Meisterin', 'Maîtresse des Plans'),
    rule: R('Complete 30 study plans in total', '累计完成 30 个学习计划', '累積完成 30 個學習計劃', 'Completa 30 planes en total', 'Complete 30 planos no total', 'Insgesamt 30 Studienpläne', '30 plans au total'),
    condition: { kind: 'planCount', total: 30 },
  },
  {
    id: 'plan.speed3in7', category: 'plan', rarity: 'rare', iconKey: 'zap',
    name: N('Three in a Week', '一周三计', '一週三計', 'Tres en una Semana', 'Três em uma Semana', 'Drei in einer Woche', 'Trois en une Semaine'),
    rule: R('Complete 3 study plans within 7 days', '7 天内完成 3 个学习计划', '7 天內完成 3 個學習計劃', 'Completa 3 planes en 7 días', 'Complete 3 planos em 7 dias', '3 Pläne in 7 Tagen', '3 plans en 7 jours'),
    condition: { kind: 'planInWindow', total: 3, days: 7 },
  },
  {
    id: 'plan.speed5in30', category: 'plan', rarity: 'epic', iconKey: 'zap',
    name: N('Month in Full Bloom', '月内无休', '月內無休', 'Mes en Flor', 'Mês em Flor', 'Monat in voller Blüte', 'Mois en Floraison'),
    rule: R('Complete 5 study plans within 30 days', '30 天内完成 5 个学习计划', '30 天內完成 5 個學習計劃', 'Completa 5 planes en 30 días', 'Complete 5 planos em 30 dias', '5 Pläne in 30 Tagen', '5 plans en 30 jours'),
    condition: { kind: 'planInWindow', total: 5, days: 30 },
  },
  {
    id: 'plan.speed10in30', category: 'plan', rarity: 'legendary', iconKey: 'zap',
    name: N('Devoted Learner', '计划狂人', '計劃狂人', 'Estudiante Devota', 'Estudiosa Devota', 'Eifrige Lernerin', 'Apprenante Dévouée'),
    rule: R('Complete 10 study plans within 30 days', '30 天内完成 10 个学习计划', '30 天內完成 10 個學習計劃', 'Completa 10 planes en 30 días', 'Complete 10 planos em 30 dias', '10 Pläne in 30 Tagen', '10 plans en 30 jours'),
    condition: { kind: 'planInWindow', total: 10, days: 30 },
  },
  {
    id: 'plan.deepRoots', category: 'plan', rarity: 'rare', iconKey: 'refresh-cw',
    name: N('Deep Roots', '二刷精研', '二刷精研', 'Raíces Profundas', 'Raízes Profundas', 'Tiefe Wurzeln', 'Racines Profondes'),
    rule: R('Complete the same study plan a second time', '重复完成同一个学习计划（2遍）', '重複完成同一個學習計劃（2遍）', 'Completa el mismo plan dos veces', 'Complete o mesmo plano duas vezes', 'Denselben Plan ein zweites Mal', "Même plan d'étude deux fois"),
    condition: { kind: 'planRepeated' },
  },

  // ───── Notes & Highlights (8) ────────────────────────────────────
  {
    id: 'note.first', category: 'note', rarity: 'common', iconKey: 'edit-3',
    name: N('First Reflection', '初写灵感', '初寫靈感', 'Primera Reflexión', 'Primeira Reflexão', 'Erste Reflexion', 'Première Réflexion'),
    rule: R('Write your very first note', '创建第一条笔记', '創建第一條筆記', 'Escribe tu primera nota', 'Escreva sua primeira nota', 'Erste Notiz schreiben', 'Écrire ta première note'),
    condition: { kind: 'notesCount', total: 1 },
  },
  {
    id: 'highlight.first', category: 'note', rarity: 'common', iconKey: 'type',
    name: N('First Highlight', '高亮初心', '高亮初心', 'Primer Subrayado', 'Primeiro Destaque', 'Erste Markierung', 'Premier Surlignage'),
    rule: R('Highlight a verse for the first time', '第一次高亮一段经文', '第一次高亮一段經文', 'Subraya un versículo por primera vez', 'Destaque um versículo pela primeira vez', 'Vers zum ersten Mal markieren', 'Surligner un verset pour la première fois'),
    condition: { kind: 'highlightsCount', total: 1 },
  },
  {
    id: 'note.count10', category: 'note', rarity: 'rare', iconKey: 'edit-3',
    name: N('Ten Reflections', '十则箴言', '十則箴言', 'Diez Reflexiones', 'Dez Reflexões', 'Zehn Reflexionen', 'Dix Réflexions'),
    rule: R('Create 10 notes in total', '累计创建 10 条笔记', '累積創建 10 條筆記', 'Crea 10 notas en total', 'Crie 10 notas no total', 'Insgesamt 10 Notizen', '10 notes au total'),
    condition: { kind: 'notesCount', total: 10 },
  },
  {
    id: 'highlight.count50', category: 'note', rarity: 'rare', iconKey: 'type',
    name: N('Fifty Lights', '五十光芒', '五十光芒', 'Cincuenta Luces', 'Cinquenta Luzes', 'Fünfzig Lichter', 'Cinquante Lumières'),
    rule: R('Highlight 50 Bible passages in total', '累计高亮 50 段经文', '累積高亮 50 段經文', 'Subraya 50 pasajes en total', 'Destaque 50 passagens no total', '50 Stellen markieren', 'Surligner 50 passages'),
    condition: { kind: 'highlightsCount', total: 50 },
  },
  {
    id: 'note.count100', category: 'note', rarity: 'epic', iconKey: 'layers',
    name: N('A Hundred Words', '百则随想', '百則隨想', 'Cien Palabras', 'Cem Palavras', 'Hundert Worte', 'Cent Mots'),
    rule: R('Create 100 notes in total', '累计创建 100 条笔记', '累積創建 100 條筆記', 'Crea 100 notas en total', 'Crie 100 notas no total', 'Insgesamt 100 Notizen', '100 notes au total'),
    condition: { kind: 'notesCount', total: 100 },
  },
  {
    id: 'highlight.count300', category: 'note', rarity: 'epic', iconKey: 'star',
    name: N('Three Hundred Stars', '三百高亮', '三百高亮', 'Trescientas Estrellas', 'Trezentas Estrelas', 'Dreihundert Sterne', 'Trois Cents Étoiles'),
    rule: R('Highlight 300 Bible passages in total', '累计高亮 300 段经文', '累積高亮 300 段經文', 'Subraya 300 pasajes en total', 'Destaque 300 passagens no total', '300 Stellen markieren', 'Surligner 300 passages'),
    condition: { kind: 'highlightsCount', total: 300 },
  },
  {
    id: 'note.count500', category: 'note', rarity: 'legendary', iconKey: 'archive',
    name: N('Living Library', '灵修文库', '靈修文庫', 'Biblioteca Viva', 'Biblioteca Viva', 'Lebendige Bibliothek', 'Bibliothèque Vivante'),
    rule: R('Create 500 notes in total', '累计创建 500 条笔记', '累積創建 500 條筆記', 'Crea 500 notas en total', 'Crie 500 notas no total', 'Insgesamt 500 Notizen', '500 notes au total'),
    condition: { kind: 'notesCount', total: 500 },
  },

  // ───── Milestones (9) ────────────────────────────────────────────
  {
    id: 'milestone.dawn7', category: 'milestone', rarity: 'rare', iconKey: 'sunrise',
    name: N('Dawn Devotion', '晨曦敬拜', '晨曦敬拜', 'Devoción al Amanecer', 'Devoção ao Amanhecer', 'Morgenandacht', 'Dévotion à l’Aube'),
    rule: R('Complete prayer before 7 AM, 7 days in a row', '连续 7 天在早上 7 点前完成祈祷', '連續 7 天在早上 7 點前完成祈禱', 'Ora antes de las 7 AM durante 7 días', 'Complete a oração antes das 7h por 7 dias', '7 Tage vor 7 Uhr beten', 'Prière avant 7h, 7 jours de suite'),
    condition: { kind: 'earlyBirdStreak', days: 7 },
  },
  {
    id: 'milestone.triple', category: 'milestone', rarity: 'epic', iconKey: 'plus-circle',
    name: N('Body, Soul & Spirit', '身心灵合一', '身心靈合一', 'Cuerpo, Alma y Espíritu', 'Corpo, Alma e Espírito', 'Körper, Seele & Geist', 'Corps, Âme & Esprit'),
    rule: R('Complete Prayer, Reading, and a Note all in one day', '同一天完成祈祷 + 阅读 + 笔记三项', '同一天完成祈禱 + 閱讀 + 筆記三項', 'Completa Oración, Lectura y Nota el mismo día', 'Complete Oração, Leitura e Nota no mesmo dia', 'Gebet, Lesen und Notiz an einem Tag', 'Prière, Lecture et Note le même jour'),
    condition: { kind: 'tripleToday' }, repeatable: true,
  },
  {
    id: 'milestone.share1', category: 'milestone', rarity: 'common', iconKey: 'share-2',
    name: N('Share the Word', '以爱传道', '以愛傳道', 'Comparte la Palabra', 'Compartilhe a Palavra', 'Teile das Wort', 'Partager la Parole'),
    rule: R('Share a Bible verse with a friend for the first time', '第一次分享一段经文给好友', '第一次分享一段經文給好友', 'Comparte un versículo por primera vez', 'Compartilhe um versículo pela primeira vez', 'Vers erstmals mit einer Freundin teilen', 'Partager un verset pour la première fois'),
    condition: { kind: 'shareCount', total: 1 },
  },
  {
    id: 'milestone.share3', category: 'milestone', rarity: 'rare', iconKey: 'mail',
    name: N('Sower of Hope', '播种希望', '播種希望', 'Sembradora de Esperanza', 'Semeadora de Esperança', 'Säerin der Hoffnung', "Semeuse d'Espérance"),
    rule: R('Share verses or study plans 3 times in total', '累计分享经文或计划 3 次', '累積分享經文或計劃 3 次', 'Comparte versículos o planes 3 veces', 'Compartilhe versículos ou planos 3 vezes', 'Insgesamt 3 Mal teilen', 'Partager des versets 3 fois'),
    condition: { kind: 'shareCount', total: 3 },
  },
  {
    id: 'milestone.share5', category: 'milestone', rarity: 'rare', iconKey: 'mail',
    name: N('Faithful Sower', '播种者', '播種者', 'Sembradora Fiel', 'Semeadora Fiel', 'Treue Säerin', 'Semeuse Fidèle'),
    rule: R('Share verses or study plans 5 times in total', '累计分享经文或计划 5 次', '累積分享經文或計劃 5 次', 'Comparte versículos o planes 5 veces', 'Compartilhe versículos ou planos 5 vezes', 'Insgesamt 5 Mal teilen', 'Partager des versets 5 fois'),
    condition: { kind: 'shareCount', total: 5 },
  },
  {
    id: 'milestone.anniversary', category: 'milestone', rarity: 'epic', iconKey: 'calendar',
    name: N('Anniversary Blessing', '周年纪念', '週年紀念', 'Bendición de Aniversario', 'Bênção de Aniversário', 'Jahrestags-Segen', "Bénédiction d'Anniversaire"),
    rule: R('Log in on the anniversary of joining Her Bible', '在账号注册一周年当天登录并打卡', '在帳號註冊一週年當天登錄並打卡', 'Inicia sesión el aniversario de tu registro', 'Entre no app no aniversário do seu cadastro', 'Am Jahrestag der Registrierung einloggen', "Se connecter le jour de l'anniversaire d'inscription"),
    condition: { kind: 'anniversary' },
  },
  {
    id: 'milestone.river30', category: 'milestone', rarity: 'legendary', iconKey: 'activity',
    name: N('River of Life', '三流并进', '三流並進', 'Río de Vida', 'Rio da Vida', 'Strom des Lebens', 'Fleuve de Vie'),
    rule: R('Keep Prayer, Reading & Study Plan streaks all going for 30 days simultaneously', '祈祷、阅读、学习计划连续打卡同时达 30 天', '祈禱、閱讀、學習計劃連續打卡同時達 30 天', 'Mantén los 3 hábitos simultáneamente 30 días', 'Mantenha Oração, Leitura e Plano por 30 dias', 'Alle 3 Gewohnheiten 30 Tage gleichzeitig', '3 habitudes simultanément 30 jours'),
    condition: { kind: 'allThreeStreaks', days: 30 },
  },
  {
    id: 'milestone.fullYear', category: 'milestone', rarity: 'legendary', iconKey: 'clock',
    name: N('A Full Year', '整整一年', '整整一年', 'Un Año Completo', 'Um Ano Completo', 'Ein volles Jahr', 'Une Année Entière'),
    rule: R('Stay active in Her Bible for 365 days', '在应用中保持活跃满 365 天', '在應用中保持活躍滿 365 天', 'Permanece activa en la app durante 365 días', 'Permaneça ativa no app por 365 dias', '365 Tage lang aktiv bleiben', "Rester active pendant 365 jours"),
    condition: { kind: 'activeYears', days: 365 },
  },
  {
    id: 'milestone.crown', category: 'milestone', rarity: 'legendary', iconKey: 'award',
    name: N('Crown of Grace', '至高荣耀', '至高榮耀', 'Corona de Gracia', 'Coroa de Graça', 'Krone der Gnade', 'Couronne de Grâce'),
    rule: R('Hold The Whole Word + A Year of Devotion + Plan Master simultaneously', '同时持有「全书见证」「整年敬虔」「计划大师」', '同時持有「全書見證」「整年敬虔」「計劃大師」', 'Posee las tres leyendas simultáneamente', 'Tenha as três legendárias simultaneamente', 'Die drei Legendären gleichzeitig besitzen', 'Détenir les trois légendaires simultanément'),
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
  earnedDescription: (name: string) => string;
  ok: string;
  viewDetails: string;
  categories: Record<BadgeCategory, string>;
}

const UI: Record<LanguageCode, AchievementUiStrings> = {
  en: {
    title: 'Achievement', awarded: 'Badges Awarded', toCollect: 'Badges to be Collected',
    congrats: 'CONGRATS', earnedDescription: (n) => `You've earned the "${n}" badge`,
    ok: 'OK', viewDetails: 'View Details',
    categories: { prayer: 'Prayer', scripture: 'Scripture', plan: 'Study Plans', note: 'Notes & Highlights', milestone: 'Milestones' },
  },
  'zh-Hans': {
    title: '成就', awarded: '已获得徽章', toCollect: '待获得徽章',
    congrats: '恭喜', earnedDescription: (n) => `你获得了「${n}」徽章`,
    ok: '好的', viewDetails: '查看详情',
    categories: { prayer: '祈祷', scripture: '阅读', plan: '学习计划', note: '笔记与高亮', milestone: '综合成就' },
  },
  'zh-Hant': {
    title: '成就', awarded: '已獲得徽章', toCollect: '待獲得徽章',
    congrats: '恭喜', earnedDescription: (n) => `你獲得了「${n}」徽章`,
    ok: '好的', viewDetails: '查看詳情',
    categories: { prayer: '祈禱', scripture: '閱讀', plan: '學習計劃', note: '筆記與高亮', milestone: '綜合成就' },
  },
  de: {
    title: 'Erfolge', awarded: 'Erhaltene Abzeichen', toCollect: 'Noch zu sammeln',
    congrats: 'GLÜCKWUNSCH', earnedDescription: (n) => `Du hast das Abzeichen „${n}" erhalten`,
    ok: 'OK', viewDetails: 'Details ansehen',
    categories: { prayer: 'Gebet', scripture: 'Schrift', plan: 'Studienpläne', note: 'Notizen & Markierungen', milestone: 'Meilensteine' },
  },
  fr: {
    title: 'Réussites', awarded: 'Badges obtenus', toCollect: 'Badges à collecter',
    congrats: 'FÉLICITATIONS', earnedDescription: (n) => `Tu as obtenu le badge « ${n} »`,
    ok: 'OK', viewDetails: 'Voir détails',
    categories: { prayer: 'Prière', scripture: 'Écriture', plan: 'Plans d’étude', note: 'Notes & surlignages', milestone: 'Jalons' },
  },
  es: {
    title: 'Logros', awarded: 'Insignias obtenidas', toCollect: 'Insignias por obtener',
    congrats: 'FELICIDADES', earnedDescription: (n) => `Has obtenido la insignia «${n}»`,
    ok: 'OK', viewDetails: 'Ver detalles',
    categories: { prayer: 'Oración', scripture: 'Escritura', plan: 'Planes de estudio', note: 'Notas y subrayados', milestone: 'Hitos' },
  },
  pt: {
    title: 'Conquistas', awarded: 'Distintivos obtidos', toCollect: 'Distintivos a coletar',
    congrats: 'PARABÉNS', earnedDescription: (n) => `Você ganhou o distintivo "${n}"`,
    ok: 'OK', viewDetails: 'Ver detalhes',
    categories: { prayer: 'Oração', scripture: 'Escritura', plan: 'Planos de estudo', note: 'Notas e destaques', milestone: 'Marcos' },
  },
};

export function achievementUi(code: LanguageCode): AchievementUiStrings {
  return UI[code] || UI.en;
}
