import type { LanguageCode } from '../state/TranslationsContext';

// The puzzle artworks - 24 classical paintings of biblical scenes.
//
// CURATED, NOT COLLECTED. The source set held 74 works, and most of the ones
// cut were not Bible scenes at all: Saint Jerome, Francis of Assisi, the
// mystic marriage of Saint Catherine, the Coronation and the Marriage of the
// Virgin, the Presentation of Mary - post-biblical saints and apocryphal
// episodes out of the Protevangelium. Another handful were devotional
// Madonnas with the paying donor kneeling in frame. For a Bible app read by
// Protestants and Catholics alike, every painting has to be a scene she can
// look up, so each entry carries the reference it depicts.
//
// ORDER IS BIBLICAL CHRONOLOGY, Genesis to the resurrection appearances.
// puzzleView unlocks these by index, so she walks scripture in sequence as she
// plays - worth more than any arrangement by artist or by date.
//
// HOW MANY. 327 questions = 65 sets per bank cycle, 4 sets per painting. 24
// paintings = 96 sets, so the art outlasts a full pass through every question
// with room over. 74 would have been four cycles of art nobody reaches, at
// four times the translation cost.
//
// PUBLIC DOMAIN. Every artist died before 1900, and all 24 photographs come
// from Wikimedia Commons rather than from museum sites - several museums
// assert reproduction rights over their own photography of public-domain
// works, which is a claim we have no interest in testing.
//
// NOT BUNDLED, EXCEPT THE FIRST. The set is ~4.6 MB and the app already
// refuses 40 MB of CJK fonts for the same reason, so these stream from
// quiz.everlandapps.com/v1/art. Painting one ships in the binary so a user who
// has never been online still gets a real puzzle - see artSource().
//
// WARNING: ORDER IS DURABLE. completedPaintings indexes this array, so a user
// who finished painting 3 sees whatever sits at index 2 forever. APPEND only;
// never reorder, never delete.

const ART_BASE = 'https://quiz.everlandapps.com/v1/art';

type Localized = Partial<Record<LanguageCode, string>>;

export interface QuizArtwork {
  /** Catalogue number, and the CDN filename. Never reuse one. */
  id: string;
  /** Museum title. `en` is required in practice - the fallback reads it. */
  title: Localized;
  /** Latin-script name. de/fr/es/pt use it unchanged, so only CJK overrides. */
  artist: string;
  artistCjk?: Localized;
  /** As the museum dates it. A string because most are approximate. */
  year: string;
  /** English scripture reference for the scene. Book name localized at render
   *  through the existing book-name table, so this stays canonical English. */
  ref: string;
  /** width / height. The board takes its shape from this. */
  aspect: number;
  /** ~30 words: what the passage says, then one thing about the painting. */
  desc: Localized;
}

export const QUIZ_ART: readonly QuizArtwork[] = [
  {
    id: '051', aspect: 1.407, ref: 'Genesis 24',
    artist: 'Bartolomé Esteban Murillo', year: 'c.1655',
    artistCjk: { 'zh-Hans': '巴托洛梅·埃斯特万·牟利罗', 'zh-Hant': '巴托洛梅·埃斯特萬·牟利羅' },
    title: {
      en: 'Rebecca and Eliezer',
      'zh-Hans': '利百加与以利以谢',
      'zh-Hant': '利百加與以利以謝',
      de: 'Rebekka und Elieser',
      fr: 'Rébecca et Éliézer',
      es: 'Rebeca y Eliezer',
      pt: 'Rebeca e Eliézer',
    },
    desc: {
      en: 'Genesis 24. Abraham\'s servant asks a stranger for water, and she waters his camels too. Murillo staged it as an ordinary Andalusian square, village women idling by the well.',
      'zh-Hans': '创世记 24。亚伯拉罕的仆人向陌生女子讨水，她连他的骆驼也一并饮了。牟利罗把场景搬进寻常的安达卢西亚广场，村妇闲坐井边。',
      'zh-Hant': '創世記 24。亞伯拉罕的僕人向陌生女子討水，她連他的駱駝也一併飲了。牟利羅將場景移到尋常的安達魯西亞廣場，村婦閒坐井邊。',
      de: '1. Mose 24. Abrahams Knecht bittet eine Fremde um Wasser, und sie tränkt auch seine Kamele. Murillo verlegt die Szene auf einen gewöhnlichen andalusischen Platz, Dorffrauen müßig am Brunnen.',
      fr: 'Genèse 24. Le serviteur d\'Abraham demande à boire à une inconnue, qui abreuve aussi ses chameaux. Murillo en fait une place andalouse ordinaire, où des villageoises s\'attardent près du puits.',
      es: 'Génesis 24. El siervo de Abraham pide agua a una desconocida, y ella abreva también sus camellos. Murillo lo situó en una plaza andaluza cualquiera, con aldeanas ociosas junto al pozo.',
      pt: 'Gênesis 24. O servo de Abraão pede água a uma desconhecida, e ela dá de beber também aos camelos. Murillo o situou numa praça andaluza comum, com aldeãs paradas junto ao poço.',
    },
  },
  {
    id: '085', aspect: 1.212, ref: 'Genesis 27',
    artist: 'Govert Flinck', year: '1638',
    artistCjk: { 'zh-Hans': '霍弗特·弗林克', 'zh-Hant': '霍弗特·弗林克' },
    title: {
      en: 'Isaac Blessing Jacob',
      'zh-Hans': '以撒祝福雅各',
      'zh-Hant': '以撒祝福雅各',
      de: 'Isaak segnet Jakob',
      fr: 'Isaac bénissant Jacob',
      es: 'Isaac bendiciendo a Jacob',
      pt: 'Isaque abençoando Jacó',
    },
    desc: {
      en: 'Genesis 27. Blind Isaac blesses the younger son, who has covered his arms in goatskin. Flinck, Rembrandt\'s pupil, put Rebekah behind the bed, watching the deception she had arranged.',
      'zh-Hans': '创世记 27。眼瞎的以撒祝福了以山羊皮裹臂的次子。伦勃朗的学生弗林克把利百加安排在床后，注视着由她一手策划的欺瞒。',
      'zh-Hant': '創世記 27。眼瞎的以撒祝福了以山羊皮裹臂的次子。林布蘭的學生弗林克將利百加安排在床後，注視著由她一手策劃的欺瞞。',
      de: '1. Mose 27. Der blinde Isaak segnet den jüngeren Sohn, dessen Arme in Ziegenfell gehüllt sind. Flinck, Rembrandts Schüler, stellt Rebekka hinter das Bett, Zeugin des von ihr eingefädelten Betrugs.',
      fr: 'Genèse 27. Isaac aveugle bénit le cadet, dont les bras sont couverts de peaux de chevreau. Flinck, élève de Rembrandt, place Rébecca derrière le lit, veillant sur la ruse qu\'elle a montée.',
      es: 'Génesis 27. Isaac, ciego, bendice al hijo menor, que se ha cubierto los brazos con pieles de cabrito. Flinck, discípulo de Rembrandt, puso a Rebeca tras la cama, vigilando el engaño que ella tramó.',
      pt: 'Gênesis 27. Isaque, cego, abençoa o filho mais novo, que cobriu os braços com peles de cabrito. Flinck, discípulo de Rembrandt, pôs Rebeca atrás da cama, vigiando o engano que ela armou.',
    },
  },
  {
    id: '024', aspect: 1.398, ref: 'Exodus 32',
    artist: 'Nicolas Poussin', year: '1634',
    artistCjk: { 'zh-Hans': '尼古拉·普桑', 'zh-Hant': '尼古拉·普桑' },
    title: {
      en: 'The Adoration of the Golden Calf',
      'zh-Hans': '崇拜金牛犊',
      'zh-Hant': '崇拜金牛犢',
      de: 'Die Anbetung des Goldenen Kalbes',
      fr: 'L\'Adoration du Veau d\'or',
      es: 'La adoración del becerro de oro',
      pt: 'A Adoração do Bezerro de Ouro',
    },
    desc: {
      en: 'Exodus 32. While Moses is on the mountain, Israel melts its jewellery into a calf and dances. Poussin paints the dance as beautiful, which is exactly what makes it frightening.',
      'zh-Hans': '出埃及记 32。摩西还在山上，以色列人已熔了首饰铸成牛犊，围着起舞。普桑把这场舞画得极美，而正是这份美让人心惊。',
      'zh-Hant': '出埃及記 32。摩西還在山上，以色列人已熔了首飾鑄成牛犢，圍著起舞。普桑把這場舞畫得極美，而正是這份美讓人心驚。',
      de: '2. Mose 32. Während Mose auf dem Berg ist, schmilzt Israel seinen Schmuck zu einem Kalb und tanzt. Poussin malt den Tanz schön — und gerade das macht ihn erschreckend.',
      fr: 'Exode 32. Pendant que Moïse est sur la montagne, Israël fond ses bijoux en un veau et danse. Poussin peint cette danse comme belle, et c\'est précisément ce qui la rend effrayante.',
      es: 'Éxodo 32. Mientras Moisés está en el monte, Israel funde sus joyas en un becerro y danza. Poussin pinta la danza como algo hermoso, y eso es justamente lo que la vuelve aterradora.',
      pt: 'Êxodo 32. Enquanto Moisés está no monte, Israel funde suas joias num bezerro e dança. Poussin pinta a dança como algo belo, e é exatamente isso que a torna assustadora.',
    },
  },
  {
    id: '042', aspect: 1.266, ref: '1 Samuel 18',
    artist: 'Rembrandt', year: 'c.1651',
    artistCjk: { 'zh-Hans': '伦勃朗', 'zh-Hant': '林布蘭' },
    title: {
      en: 'Saul and David',
      'zh-Hans': '扫罗与大卫',
      'zh-Hant': '掃羅與大衛',
      de: 'Saul und David',
      fr: 'Saül et David',
      es: 'Saúl y David',
      pt: 'Saul e Davi',
    },
    desc: {
      en: '1 Samuel 18. David plays the harp to quiet the king\'s black moods, and the spear waits in Saul\'s hand. Rembrandt has Saul dry one eye on the heavy curtain.',
      'zh-Hans': '撒母耳记上 18。大卫弹琴平息王的阴郁，扫罗手中的枪却按兵不动。伦勃朗让扫罗以厚重的帷幔拭去一只眼里的泪。',
      'zh-Hant': '撒母耳記上 18。大衛彈琴平息王的陰鬱，掃羅手中的槍卻按兵不動。林布蘭讓掃羅以厚重的帷幔拭去一隻眼裡的淚。',
      de: '1. Samuel 18. David spielt die Harfe gegen die finsteren Anwandlungen des Königs, der Speer wartet in Sauls Hand. Rembrandt lässt Saul ein Auge am schweren Vorhang trocknen.',
      fr: '1 Samuel 18. David joue de la harpe pour apaiser les humeurs noires du roi, et la lance attend dans la main de Saül. Rembrandt montre Saül essuyant un œil au lourd rideau.',
      es: '1 Samuel 18. David toca el arpa para calmar los ánimos sombríos del rey, y la lanza espera en la mano de Saúl. Rembrandt muestra a Saúl secándose un ojo con la pesada cortina.',
      pt: '1 Samuel 18. Davi toca a harpa para acalmar os humores sombrios do rei, e a lança espera na mão de Saul. Rembrandt mostra Saul enxugando um olho na pesada cortina.',
    },
  },
  {
    id: '084', aspect: 1.492, ref: '1 Kings 3',
    artist: 'Nicolas Poussin', year: '1649',
    artistCjk: { 'zh-Hans': '尼古拉·普桑', 'zh-Hant': '尼古拉·普桑' },
    title: {
      en: 'The Judgment of Solomon',
      'zh-Hans': '所罗门的审判',
      'zh-Hant': '所羅門的審判',
      de: 'Das Urteil Salomos',
      fr: 'Le Jugement de Salomon',
      es: 'El juicio de Salomón',
      pt: 'O Julgamento de Salomão',
    },
    desc: {
      en: '1 Kings 3. Solomon calls for a sword, and the real mother gives up her claim rather than see the child halved. Poussin himself thought this his best painting.',
      'zh-Hans': '列王纪上 3。所罗门吩咐取刀来，真母亲宁可放弃亲权，也不愿孩子被劈成两半。普桑自认这是他最好的一幅画。',
      'zh-Hant': '列王紀上 3。所羅門吩咐取刀來，真母親寧可放棄親權，也不願孩子被劈成兩半。普桑自認這是他最好的一幅畫。',
      de: '1. Könige 3. Salomo lässt ein Schwert bringen, und die wahre Mutter gibt ihren Anspruch auf, statt das Kind geteilt zu sehen. Poussin hielt dieses Bild für sein bestes.',
      fr: '1 Rois 3. Salomon réclame une épée, et la vraie mère renonce à sa revendication plutôt que de voir l\'enfant partagé en deux. Poussin tenait lui-même ce tableau pour son meilleur.',
      es: '1 Reyes 3. Salomón pide una espada, y la verdadera madre renuncia a su reclamo antes que ver partido al niño. El propio Poussin consideraba este su mejor cuadro.',
      pt: '1 Reis 3. Salomão pede uma espada, e a verdadeira mãe abre mão de sua reivindicação em vez de ver a criança dividida. O próprio Poussin considerava esta a sua melhor pintura.',
    },
  },
  {
    id: '031', aspect: 1.312, ref: 'Esther 5',
    artist: 'Artemisia Gentileschi', year: 'c.1628',
    artistCjk: { 'zh-Hans': '阿尔泰米西娅·真蒂莱斯基', 'zh-Hant': '阿特蜜希雅·真蒂萊希' },
    title: {
      en: 'Esther before Ahasuerus',
      'zh-Hans': '以斯帖在亚哈随鲁面前',
      'zh-Hant': '以斯帖在亞哈隨魯面前',
      de: 'Esther vor Ahasver',
      fr: 'Esther devant Assuérus',
      es: 'Ester ante Asuero',
      pt: 'Ester diante de Assuero',
    },
    desc: {
      en: 'Esther 5. Esther risks her life going unsummoned to the king; here she faints as he rises. Artemisia painted a servant and dog at his feet, then covered them with marble.',
      'zh-Hans': '以斯帖记 5。以斯帖未蒙宣召见王，冒死而入；画中她在王起身时晕倒。真蒂莱斯基原画了脚边的仆童与狗，后用大理石地面覆盖。',
      'zh-Hant': '以斯帖記 5。以斯帖未蒙宣召見王，冒死而入；畫中她在王起身時暈倒。真蒂萊希原畫了腳邊的僕童與狗，後以大理石地面覆蓋。',
      de: 'Ester 5. Ungerufen tritt Ester vor den König und riskiert ihr Leben; hier sinkt sie in Ohnmacht, als er sich erhebt. Artemisia übermalte einen Diener und einen Hund zu seinen Füßen mit Marmor.',
      fr: 'Esther 5. Esther risque sa vie en se présentant au roi sans être appelée ; ici elle défaille quand il se lève. Artemisia peignit une servante et un chien à ses pieds, puis les recouvrit de marbre.',
      es: 'Ester 5. Ester arriesga la vida al presentarse ante el rey sin ser llamada; aquí se desmaya cuando él se levanta. Artemisia pintó una criada y un perro a sus pies, y luego los cubrió con mármol.',
      pt: 'Ester 5. Ester arrisca a vida ao apresentar-se ao rei sem ser chamada; aqui ela desfalece quando ele se levanta. Artemisia pintou uma criada e um cão a seus pés, e depois os cobriu com mármore.',
    },
  },
  {
    id: '005', aspect: 1.256, ref: 'Daniel 5',
    artist: 'Rembrandt', year: '1636',
    artistCjk: { 'zh-Hans': '伦勃朗', 'zh-Hant': '林布蘭' },
    title: {
      en: 'Belshazzar\'s Feast',
      'zh-Hans': '伯沙撒的盛宴',
      'zh-Hant': '伯沙撒的盛宴',
      de: 'Das Gastmahl des Belsazar',
      fr: 'Le Festin de Balthazar',
      es: 'El festín de Baltasar',
      pt: 'O Festim de Baltazar',
    },
    desc: {
      en: 'Daniel 5. A hand writes on the wall mid-feast and the king recoils, spilling wine. Rembrandt took the Hebrew from a rabbi friend\'s book and set it in vertical columns.',
      'zh-Hans': '但以理书 5。宴席正酣，有手在墙上写字，王骇然后仰，酒杯倾覆。伦勃朗从拉比友人的书中取来希伯来文，并排成竖列。',
      'zh-Hant': '但以理書 5。宴席正酣，有手在牆上寫字，王駭然後仰，酒杯傾覆。林布蘭自拉比友人的書中取來希伯來文，並排成直行。',
      de: 'Daniel 5. Mitten im Gelage schreibt eine Hand an die Wand, der König fährt zurück und verschüttet den Wein. Rembrandt entnahm die hebräischen Zeichen dem Buch eines befreundeten Rabbiners und setzte sie in Spalten.',
      fr: 'Daniel 5. Une main écrit sur le mur en plein festin et le roi recule, renversant le vin. Rembrandt a tiré l\'hébreu du livre d\'un ami rabbin et l\'a disposé en colonnes verticales.',
      es: 'Daniel 5. Una mano escribe en el muro en plena fiesta y el rey retrocede, derramando el vino. Rembrandt tomó el hebreo del libro de un amigo rabino y lo dispuso en columnas verticales.',
      pt: 'Daniel 5. Uma mão escreve na parede em pleno banquete e o rei recua, derramando o vinho. Rembrandt tirou o hebraico do livro de um amigo rabino e o dispôs em colunas verticais.',
    },
  },
  {
    id: '050', aspect: 1.477, ref: 'Daniel 6',
    artist: 'Peter Paul Rubens', year: '1615',
    artistCjk: { 'zh-Hans': '彼得·保罗·鲁本斯', 'zh-Hant': '彼得·保羅·魯本斯' },
    title: {
      en: 'Daniel in the Lions\' Den',
      'zh-Hans': '狮穴中的但以理',
      'zh-Hant': '獅穴中的但以理',
      de: 'Daniel in der Löwengrube',
      fr: 'Daniel dans la fosse aux lions',
      es: 'Daniel en el foso de los leones',
      pt: 'Daniel na cova dos leões',
    },
    desc: {
      en: 'Daniel 6. Daniel spends the night among lions and comes out untouched at dawn. Rubens told a buyer the lions were done from life, then traded the picture for antique marbles.',
      'zh-Hans': '但以理书 6。但以理在狮子中过了一夜，天亮时毫发无伤。鲁本斯告诉买主狮子皆写生而成，随后以此画换取了古代大理石雕。',
      'zh-Hant': '但以理書 6。但以理在獅子中過了一夜，天亮時毫髮無傷。魯本斯告訴買主獅子皆寫生而成，隨後以此畫換取古代大理石雕。',
      de: 'Daniel 6. Daniel verbringt die Nacht unter Löwen und kommt im Morgengrauen unversehrt heraus. Rubens versicherte einem Käufer, die Löwen seien nach dem Leben gemalt, und tauschte das Bild dann gegen antike Marmorstücke.',
      fr: 'Daniel 6. Daniel passe la nuit parmi les lions et en sort indemne à l\'aube. Rubens assura à un acheteur que les lions étaient peints d\'après nature, puis échangea le tableau contre des marbres antiques.',
      es: 'Daniel 6. Daniel pasa la noche entre leones y sale ileso al amanecer. Rubens aseguró a un comprador que los leones estaban tomados del natural, y luego cambió el cuadro por mármoles antiguos.',
      pt: 'Daniel 6. Daniel passa a noite entre leões e sai ileso ao amanhecer. Rubens garantiu a um comprador que os leões foram feitos do natural, e depois trocou o quadro por mármores antigos.',
    },
  },
  {
    id: '039', aspect: 1.217, ref: 'Luke 1:26-38',
    artist: 'Sandro Botticelli', year: 'c.1489',
    artistCjk: { 'zh-Hans': '桑德罗·波提切利', 'zh-Hant': '山德羅·波提且利' },
    title: {
      en: 'The Annunciation',
      'zh-Hans': '天使报喜',
      'zh-Hant': '天使報喜',
      de: 'Mariä Verkündigung',
      fr: 'L\'Annonciation',
      es: 'La Anunciación',
      pt: 'A Anunciação',
    },
    desc: {
      en: 'Luke 1. Gabriel kneels; Mary bends away and consents. Botticelli left a gap between their reaching hands; a Florentine moneychanger paid for the panel in 1489 for his family chapel.',
      'zh-Hans': '路加福音 1。加百列屈膝，马利亚侧身应允。波提切利在二人伸出的手之间留了空隙；1489 年佛罗伦萨一位兑换商出资，为家族礼拜堂而作。',
      'zh-Hant': '路加福音 1。加百列屈膝，馬利亞側身應允。波提且利在二人伸出的手之間留了空隙；1489 年佛羅倫斯一位兌換商出資，為家族禮拜堂而作。',
      de: 'Lukas 1. Gabriel kniet; Maria weicht zurück und willigt ein. Botticelli ließ eine Lücke zwischen den ausgestreckten Händen; ein Florentiner Geldwechsler bezahlte die Tafel 1489 für seine Familienkapelle.',
      fr: 'Luc 1. Gabriel s\'agenouille ; Marie se détourne et consent. Botticelli a laissé un vide entre leurs mains tendues ; un changeur florentin paya le panneau en 1489 pour sa chapelle familiale.',
      es: 'Lucas 1. Gabriel se arrodilla; María se inclina hacia atrás y consiente. Botticelli dejó un vacío entre las manos tendidas; un cambista florentino pagó la tabla en 1489 para su capilla familiar.',
      pt: 'Lucas 1. Gabriel se ajoelha; Maria se inclina para trás e consente. Botticelli deixou um vazio entre as mãos estendidas; um cambista florentino pagou o painel em 1489 para sua capela familiar.',
    },
  },
  {
    id: '021', aspect: 1.223, ref: 'Luke 2:8-20',
    artist: 'Giorgione', year: 'c.1505',
    artistCjk: { 'zh-Hans': '乔尔乔内', 'zh-Hant': '喬久內' },
    title: {
      en: 'Adoration of the Shepherds',
      'zh-Hans': '牧羊人的朝拜',
      'zh-Hant': '牧羊人的朝拜',
      de: 'Anbetung der Hirten',
      fr: 'L\'Adoration des bergers',
      es: 'La adoración de los pastores',
      pt: 'A Adoração dos Pastores',
    },
    desc: {
      en: 'Luke 2. Shepherds leave their flock and kneel at the mouth of a dark cave. Scholars still argue whether this is Giorgione or the young Titian; the quarrel ended one famous friendship.',
      'zh-Hans': '路加福音 2。牧羊人撇下羊群，跪在幽暗的洞口前。学界至今争论此画出自乔尔乔内还是年轻的提香，这场争执曾终结一段著名友谊。',
      'zh-Hant': '路加福音 2。牧羊人撇下羊群，跪在幽暗的洞口前。學界至今爭論此畫出自喬久內還是年輕的提香，這場爭執曾終結一段著名的友誼。',
      de: 'Lukas 2. Hirten verlassen ihre Herde und knien am Eingang einer dunklen Höhle. Ob Giorgione oder der junge Tizian das Bild schuf, ist bis heute strittig; der Streit beendete eine berühmte Freundschaft.',
      fr: 'Luc 2. Des bergers quittent leur troupeau et s\'agenouillent à l\'entrée d\'une grotte obscure. Les spécialistes débattent encore : Giorgione ou le jeune Titien ? La querelle a brisé une amitié célèbre.',
      es: 'Lucas 2. Unos pastores dejan su rebaño y se arrodillan a la boca de una cueva oscura. Los estudiosos aún discuten si es Giorgione o el joven Tiziano; la disputa acabó con una amistad célebre.',
      pt: 'Lucas 2. Pastores deixam o rebanho e se ajoelham à boca de uma gruta escura. Os estudiosos ainda discutem se é Giorgione ou o jovem Ticiano; a disputa encerrou uma amizade célebre.',
    },
  },
  {
    id: '001', aspect: 1.003, ref: 'Matthew 2:1-12',
    artist: 'Leonardo da Vinci', year: '1482',
    artistCjk: { 'zh-Hans': '列奥纳多·达·芬奇', 'zh-Hant': '李奧納多·達文西' },
    title: {
      en: 'Adoration of the Magi',
      'zh-Hans': '三博士来朝',
      'zh-Hant': '三博士來朝',
      de: 'Anbetung der Könige',
      fr: 'L\'Adoration des mages',
      es: 'La adoración de los Magos',
      pt: 'A Adoração dos Magos',
    },
    desc: {
      en: 'Matthew 2. Wise men from the East follow a star and kneel before the child. Leonardo abandoned the panel unfinished, which is why the figures behind stay ghosts in brown underpaint.',
      'zh-Hans': '马太福音 2。东方博士随星而来，跪拜幼童。达·芬奇未完成便弃置此板，后排人物因而只留作褐色底稿中的幢幢暗影。',
      'zh-Hant': '馬太福音 2。東方博士隨星而來，跪拜幼童。達文西未完成便棄置此木板，後排人物因而只留作褐色底稿中的幢幢暗影。',
      de: 'Matthäus 2. Weise aus dem Morgenland folgen einem Stern und knien vor dem Kind. Leonardo ließ die Tafel unvollendet; deshalb bleiben die hinteren Gestalten Schemen in brauner Untermalung.',
      fr: 'Matthieu 2. Des mages venus d\'Orient suivent une étoile et s\'agenouillent devant l\'enfant. Léonard laissa le panneau inachevé : les figures du fond restent des fantômes dans une sous-couche brune.',
      es: 'Mateo 2. Unos magos de Oriente siguen una estrella y se arrodillan ante el niño. Leonardo dejó la tabla sin terminar, y por eso las figuras del fondo siguen siendo fantasmas en imprimación parda.',
      pt: 'Mateus 2. Magos do Oriente seguem uma estrela e se ajoelham diante do menino. Leonardo deixou o painel inacabado, e por isso as figuras ao fundo permanecem fantasmas na base parda.',
    },
  },
  {
    id: '007', aspect: 1.24, ref: 'Matthew 2:13-15',
    artist: 'Caravaggio', year: '1597',
    artistCjk: { 'zh-Hans': '卡拉瓦乔', 'zh-Hant': '卡拉瓦喬' },
    title: {
      en: 'Rest on the Flight into Egypt',
      'zh-Hans': '逃亡埃及途中的休息',
      'zh-Hant': '逃往埃及途中的休息',
      de: 'Ruhe auf der Flucht nach Ägypten',
      fr: 'Le Repos pendant la fuite en Égypte',
      es: 'Descanso en la huida a Egipto',
      pt: 'Descanso na Fuga para o Egito',
    },
    desc: {
      en: 'Matthew 2. Warned in a dream, Joseph takes the child and his mother into Egypt. Caravaggio painted the music Joseph holds up precisely enough that a scholar identified the motet in 1983.',
      'zh-Hans': '马太福音 2。约瑟梦中得警示，带幼童和母亲下埃及。卡拉瓦乔把约瑟手中的乐谱画得极精确，学者 1983 年辨认出了那首经文歌。',
      'zh-Hant': '馬太福音 2。約瑟夢中得警示，帶幼童和母親下埃及。卡拉瓦喬把約瑟手中的樂譜畫得極精確，學者 1983 年辨認出了那首經文歌。',
      de: 'Matthäus 2. Im Traum gewarnt, bringt Josef das Kind und seine Mutter nach Ägypten. Caravaggio malte die Noten in Josefs Händen so genau, dass ein Forscher 1983 die Motette bestimmen konnte.',
      fr: 'Matthieu 2. Averti en songe, Joseph emmène l\'enfant et sa mère en Égypte. Caravage a peint la partition que Joseph tient assez précisément pour qu\'un chercheur identifie le motet en 1983.',
      es: 'Mateo 2. Advertido en sueños, José lleva al niño y a su madre a Egipto. Caravaggio pintó la partitura que sostiene José con tal precisión que un estudioso identificó el motete en 1983.',
      pt: 'Mateus 2. Avisado em sonho, José leva o menino e sua mãe ao Egito. Caravaggio pintou a partitura que José segura com tal precisão que um estudioso identificou o moteto em 1983.',
    },
  },
  {
    id: '091', aspect: 1.29, ref: 'Matthew 3:13-17',
    artist: 'Joachim Patinir', year: 'c.1515',
    artistCjk: { 'zh-Hans': '约阿希姆·帕蒂尼尔', 'zh-Hant': '約阿希姆·帕提尼爾' },
    title: {
      en: 'The Baptism of Christ',
      'zh-Hans': '基督受洗',
      'zh-Hant': '基督受洗',
      de: 'Die Taufe Christi',
      fr: 'Le Baptême du Christ',
      es: 'El bautismo de Cristo',
      pt: 'O Batismo de Cristo',
    },
    desc: {
      en: 'Matthew 3. John pours Jordan water over Christ\'s head and the Spirit descends. Patinir was the first Netherlandish painter to treat landscape as the subject; the valley recedes into blue haze.',
      'zh-Hans': '马太福音 3。约翰以约旦河水浇在基督头上，圣灵随即降下。帕蒂尼尔是首位以风景为主题的尼德兰画家；河谷远退，隐入蓝色雾霭。',
      'zh-Hant': '馬太福音 3。約翰以約旦河水澆在基督頭上，聖靈隨即降下。帕提尼爾是首位以風景為主題的尼德蘭畫家；河谷遠退，隱入藍色霧靄。',
      de: 'Matthäus 3. Johannes gießt Jordanwasser über das Haupt Christi, und der Geist kommt herab. Patinir war der erste Niederländer, der die Landschaft zum Thema machte; das Tal verliert sich in blauem Dunst.',
      fr: 'Matthieu 3. Jean verse l\'eau du Jourdain sur la tête du Christ et l\'Esprit descend. Patinir fut le premier peintre des anciens Pays-Bas à traiter le paysage comme sujet ; la vallée s\'efface dans une brume bleue.',
      es: 'Mateo 3. Juan derrama agua del Jordán sobre la cabeza de Cristo y el Espíritu desciende. Patinir fue el primer pintor neerlandés en tratar el paisaje como tema; el valle se pierde en bruma azul.',
      pt: 'Mateus 3. João derrama água do Jordão sobre a cabeça de Cristo e o Espírito desce. Patinir foi o primeiro pintor neerlandês a tratar a paisagem como tema; o vale se dissolve em bruma azul.',
    },
  },
  {
    id: '009', aspect: 1.14, ref: 'Matthew 4:1-11',
    artist: 'Ivan Kramskoi', year: '1872',
    artistCjk: { 'zh-Hans': '伊万·克拉姆斯科伊', 'zh-Hant': '伊凡·克拉姆斯柯依' },
    title: {
      en: 'Christ in the Wilderness',
      'zh-Hans': '荒野中的基督',
      'zh-Hant': '荒野中的基督',
      de: 'Christus in der Wüste',
      fr: 'Le Christ dans le désert',
      es: 'Cristo en el desierto',
      pt: 'Cristo no deserto',
    },
    desc: {
      en: 'Matthew 4. Forty days without food in the desert, and the tempter comes. Kramskoi leaves the tempter out entirely, giving only a man on grey stones, hands locked, at first light.',
      'zh-Hans': '马太福音 4。旷野中禁食四十天，试探者随之而来。克拉姆斯科伊索性略去试探者，只留一人坐在灰石上，双手交握，天色初明。',
      'zh-Hant': '馬太福音 4。曠野中禁食四十天，試探者隨之而來。克拉姆斯柯依索性略去試探者，只留一人坐在灰石上，雙手交握，天色初明。',
      de: 'Matthäus 4. Vierzig Tage ohne Speise in der Wüste, dann kommt der Versucher. Kramskoi lässt ihn ganz weg und zeigt nur einen Mann auf grauem Gestein, die Hände verschränkt, im ersten Licht.',
      fr: 'Matthieu 4. Quarante jours sans nourriture au désert, puis le tentateur survient. Kramskoï l\'omet entièrement : il ne reste qu\'un homme sur des pierres grises, les mains nouées, aux premières lueurs.',
      es: 'Mateo 4. Cuarenta días sin comer en el desierto, y llega el tentador. Kramskói lo suprime por completo: solo queda un hombre sobre piedras grises, con las manos entrelazadas, a primera luz.',
      pt: 'Mateus 4. Quarenta dias sem comer no deserto, e vem o tentador. Kramskoi o suprime por completo: resta apenas um homem sobre pedras cinzentas, mãos entrelaçadas, à primeira luz.',
    },
  },
  {
    id: '002', aspect: 1.059, ref: 'Matthew 9:9',
    artist: 'Caravaggio', year: 'c.1599',
    artistCjk: { 'zh-Hans': '卡拉瓦乔', 'zh-Hant': '卡拉瓦喬' },
    title: {
      en: 'The Calling of Saint Matthew',
      'zh-Hans': '圣马太蒙召',
      'zh-Hant': '聖馬太蒙召',
      de: 'Berufung des heiligen Matthäus',
      fr: 'La Vocation de saint Matthieu',
      es: 'La vocación de san Mateo',
      pt: 'A Vocação de São Mateus',
    },
    desc: {
      en: 'Matthew 9:9. Christ points across a dim room at a tax collector, who points back — me? Caravaggio set it in a Roman tavern and lit it like an interrogation.',
      'zh-Hans': '马太福音 9:9。基督在昏暗的屋中指向一名税吏，那人反指自己——是我吗？卡拉瓦乔把场景设在罗马酒馆，光打得像一场审讯。',
      'zh-Hant': '馬太福音 9:9。基督在昏暗的屋中指向一名稅吏，那人反指自己——是我嗎？卡拉瓦喬把場景設在羅馬酒館，光打得像一場審訊。',
      de: 'Matthäus 9,9. Christus zeigt durch einen dämmrigen Raum auf einen Zöllner, der zurückzeigt — ich? Caravaggio verlegt die Szene in eine römische Schenke und beleuchtet sie wie ein Verhör.',
      fr: 'Matthieu 9:9. Le Christ désigne, dans une salle sombre, un collecteur d\'impôts qui pointe le doigt en retour — moi ? Caravage situe la scène dans une taverne romaine et l\'éclaire comme un interrogatoire.',
      es: 'Mateo 9:9. Cristo señala, a través de una sala en penumbra, a un recaudador que responde señalándose — ¿yo? Caravaggio lo situó en una taberna romana y lo iluminó como un interrogatorio.',
      pt: 'Mateus 9:9. Cristo aponta, através de uma sala em penumbra, para um cobrador de impostos que aponta de volta — eu? Caravaggio situou a cena numa taverna romana e a iluminou como um interrogatório.',
    },
  },
  {
    id: '003', aspect: 1.494, ref: 'John 2:1-11',
    artist: 'Paolo Veronese', year: '1562',
    artistCjk: { 'zh-Hans': '保罗·委罗内塞', 'zh-Hant': '保羅·委羅內塞' },
    title: {
      en: 'The Wedding at Cana',
      'zh-Hans': '迦拿的婚礼',
      'zh-Hant': '迦拿的婚禮',
      de: 'Die Hochzeit zu Kana',
      fr: 'Les Noces de Cana',
      es: 'Las bodas de Caná',
      pt: 'As Bodas de Caná',
    },
    desc: {
      en: 'John 2. The wine runs out, and Christ turns six jars of washing water into better wine. Napoleon\'s troops took the canvas from Venice in 1797 and cut it in half for transport.',
      'zh-Hans': '约翰福音 2。酒用尽了，基督把六口洁净用的水缸变成更好的酒。1797 年拿破仑军队将此画掠出威尼斯，为便运输截成两半。',
      'zh-Hant': '約翰福音 2。酒用盡了，基督把六口潔淨用的水缸變成更好的酒。1797 年拿破崙軍隊將此畫掠出威尼斯，為便運輸截成兩半。',
      de: 'Johannes 2. Der Wein geht aus, und Christus verwandelt sechs Krüge Reinigungswasser in besseren Wein. Napoleons Truppen holten die Leinwand 1797 aus Venedig und zerschnitten sie für den Transport.',
      fr: 'Jean 2. Le vin vient à manquer, et le Christ change six jarres d\'eau de purification en un vin meilleur. Les troupes de Napoléon emportèrent la toile de Venise en 1797, coupée en deux pour le transport.',
      es: 'Juan 2. Se acaba el vino, y Cristo convierte seis tinajas de agua de purificación en un vino mejor. Las tropas de Napoleón se llevaron el lienzo de Venecia en 1797, cortado en dos para transportarlo.',
      pt: 'João 2. O vinho acaba, e Cristo transforma seis talhas de água de purificação em vinho melhor. As tropas de Napoleão levaram a tela de Veneza em 1797, cortada ao meio para o transporte.',
    },
  },
  {
    id: '047', aspect: 1.229, ref: 'John 2:13-17',
    artist: 'El Greco', year: '1600',
    artistCjk: { 'zh-Hans': '埃尔·格列柯', 'zh-Hant': '艾爾·葛雷柯' },
    title: {
      en: 'Christ Driving the Money Changers from the Temple',
      'zh-Hans': '基督将商贩逐出圣殿',
      'zh-Hant': '基督將商販逐出聖殿',
      de: 'Die Vertreibung der Händler aus dem Tempel',
      fr: 'Le Christ chassant les marchands du Temple',
      es: 'La expulsión de los mercaderes del templo',
      pt: 'A Expulsão dos Mercadores do Templo',
    },
    desc: {
      en: 'John 2. Christ makes a whip of cords and clears the temple courtyard of traders and cattle. El Greco returned to this one subject at least four times across forty years.',
      'zh-Hans': '约翰福音 2。基督用绳作鞭，把商贩与牲畜赶出圣殿外院。埃尔·格列柯在四十年间至少四度重画这同一题材。',
      'zh-Hant': '約翰福音 2。基督用繩作鞭，把商販與牲畜趕出聖殿外院。艾爾·葛雷柯在四十年間至少四度重畫這同一題材。',
      de: 'Johannes 2. Christus flicht eine Geißel aus Stricken und treibt Händler und Vieh aus dem Tempelvorhof. El Greco kehrte in vierzig Jahren mindestens viermal zu diesem einen Thema zurück.',
      fr: 'Jean 2. Le Christ tresse un fouet de cordes et chasse de la cour du Temple les marchands et le bétail. Le Greco revint à ce seul sujet au moins quatre fois en quarante ans.',
      es: 'Juan 2. Cristo hace un azote de cuerdas y despeja el atrio del Templo de mercaderes y ganado. El Greco volvió a este único asunto al menos cuatro veces a lo largo de cuarenta años.',
      pt: 'João 2. Cristo faz um azorrague de cordas e limpa o pátio do Templo de mercadores e animais. El Greco voltou a este único tema ao menos quatro vezes ao longo de quarenta anos.',
    },
  },
  {
    id: '041', aspect: 1.318, ref: 'Matthew 17:1-8',
    artist: 'Giovanni Bellini', year: '1478',
    artistCjk: { 'zh-Hans': '乔凡尼·贝利尼', 'zh-Hant': '喬凡尼·貝里尼' },
    title: {
      en: 'Transfiguration of Christ',
      'zh-Hans': '基督显圣容',
      'zh-Hant': '基督顯聖容',
      de: 'Die Verklärung Christi',
      fr: 'La Transfiguration du Christ',
      es: 'La Transfiguración de Cristo',
      pt: 'A Transfiguração de Cristo',
    },
    desc: {
      en: 'Matthew 17. Christ\'s face changes on the mountain, and Moses and Elijah appear beside him. Bellini set it not on a peak but a low grassy ledge, with farmland and a herdsman behind.',
      'zh-Hans': '马太福音 17。基督在山上变了形像，摩西与以利亚显现在旁。贝利尼没有把场景放在山巅，而是一片低矮草坡，身后是农田与牧人。',
      'zh-Hant': '馬太福音 17。基督在山上變了形像，摩西與以利亞顯現在旁。貝里尼沒有把場景放在山巔，而是一片低矮草坡，身後是農田與牧人。',
      de: 'Matthäus 17. Auf dem Berg verwandelt sich das Angesicht Christi, und Mose und Elia treten neben ihn. Bellini wählte keinen Gipfel, sondern einen niedrigen Grashang, dahinter Ackerland und ein Hirte.',
      fr: 'Matthieu 17. Le visage du Christ change sur la montagne, et Moïse et Élie paraissent à ses côtés. Bellini place la scène non sur un sommet mais sur un ressaut herbeux, champs et bouvier à l\'arrière.',
      es: 'Mateo 17. El rostro de Cristo se transforma en el monte, y Moisés y Elías aparecen junto a él. Bellini no lo situó en una cumbre, sino en un rellano herboso, con labrantíos y un pastor detrás.',
      pt: 'Mateus 17. O rosto de Cristo se transfigura no monte, e Moisés e Elias aparecem ao seu lado. Bellini o situou não num cume, mas num patamar gramado, com lavouras e um vaqueiro ao fundo.',
    },
  },
  {
    id: '088', aspect: 1.108, ref: 'Luke 15:11-32',
    artist: 'Bartolomé Esteban Murillo', year: 'c.1667',
    artistCjk: { 'zh-Hans': '巴托洛梅·埃斯特万·牟利罗', 'zh-Hant': '巴托洛梅·埃斯特萬·牟利羅' },
    title: {
      en: 'The Return of the Prodigal Son',
      'zh-Hans': '浪子回头',
      'zh-Hant': '浪子回頭',
      de: 'Die Rückkehr des verlorenen Sohnes',
      fr: 'Le Retour du fils prodigue',
      es: 'El regreso del hijo pródigo',
      pt: 'O Retorno do Filho Pródigo',
    },
    desc: {
      en: 'Luke 15. The son who spent everything comes home barefoot, and his father runs before he can finish apologising. The older brother, who stayed, is not in this frame.',
      'zh-Hans': '路加福音 15。散尽家财的儿子赤脚归来，话未说完，父亲已迎面跑来。那位留在家中的长子，不在这幅画里。',
      'zh-Hant': '路加福音 15。散盡家財的兒子赤腳歸來，話未說完，父親已迎面跑來。那位留在家中的長子，不在這幅畫裡。',
      de: 'Lukas 15. Der Sohn, der alles verprasst hat, kommt barfuß heim, und der Vater läuft ihm entgegen, ehe er sein Bekenntnis beenden kann. Der ältere Bruder, der blieb, fehlt im Bild.',
      fr: 'Luc 15. Le fils qui a tout dépensé rentre pieds nus, et son père court vers lui avant qu\'il ait fini de s\'excuser. Le frère aîné, celui qui est resté, n\'est pas dans ce cadre.',
      es: 'Lucas 15. El hijo que lo gastó todo vuelve descalzo, y su padre corre antes de que termine de disculparse. El hermano mayor, el que se quedó, no está en este cuadro.',
      pt: 'Lucas 15. O filho que gastou tudo volta descalço, e o pai corre antes que ele termine de se desculpar. O irmão mais velho, o que ficou, não está neste quadro.',
    },
  },
  {
    id: '040', aspect: 1.17, ref: 'Matthew 26:17-30',
    artist: 'El Greco', year: 'c.1567',
    artistCjk: { 'zh-Hans': '埃尔·格列柯', 'zh-Hant': '艾爾·葛雷柯' },
    title: {
      en: 'The Last Supper',
      'zh-Hans': '最后的晚餐',
      'zh-Hant': '最後的晚餐',
      de: 'Das Abendmahl',
      fr: 'La Cène',
      es: 'La última cena',
      pt: 'A Última Ceia',
    },
    desc: {
      en: 'Matthew 26. At the Passover table Christ breaks bread and says one of them will betray him. El Greco painted it early, in Venice, on a panel barely half a metre wide.',
      'zh-Hans': '马太福音 26。逾越节席间，基督擘饼，说他们中间有一人要卖他。埃尔·格列柯早年在威尼斯所作，画板宽不足半米。',
      'zh-Hant': '馬太福音 26。逾越節席間，基督擘餅，說他們中間有一人要賣他。艾爾·葛雷柯早年在威尼斯所作，畫板寬不足半公尺。',
      de: 'Matthäus 26. Am Passamahl bricht Christus das Brot und sagt, einer von ihnen werde ihn verraten. El Greco malte es früh, in Venedig, auf eine Tafel von kaum einem halben Meter Breite.',
      fr: 'Matthieu 26. À la table de la Pâque, le Christ rompt le pain et annonce que l\'un d\'eux le livrera. Le Greco l\'a peint tôt, à Venise, sur un panneau d\'à peine un demi-mètre de large.',
      es: 'Mateo 26. En la mesa de la Pascua Cristo parte el pan y anuncia que uno de ellos lo entregará. El Greco lo pintó pronto, en Venecia, sobre una tabla de apenas medio metro de ancho.',
      pt: 'Mateus 26. À mesa da Páscoa, Cristo parte o pão e diz que um deles o trairá. El Greco a pintou cedo, em Veneza, sobre um painel de apenas meio metro de largura.',
    },
  },
  {
    id: '023', aspect: 1.093, ref: 'Luke 22:54-62',
    artist: 'Rembrandt', year: '1660',
    artistCjk: { 'zh-Hans': '伦勃朗', 'zh-Hant': '林布蘭' },
    title: {
      en: 'The Denial of Saint Peter',
      'zh-Hans': '彼得不认主',
      'zh-Hant': '彼得不認主',
      de: 'Die Verleugnung Petri',
      fr: 'Le Reniement de saint Pierre',
      es: 'La negación de san Pedro',
      pt: 'A Negação de São Pedro',
    },
    desc: {
      en: 'Luke 22. A servant girl holds a candle to Peter\'s face and he swears he never knew the man. Rembrandt put Christ in the dark background, turning to look.',
      'zh-Hans': '路加福音 22。使女举烛照向彼得的脸，他发誓从不认识那人。伦勃朗把基督安置在幽暗的背景里，正回过头来看。',
      'zh-Hant': '路加福音 22。使女舉燭照向彼得的臉，他發誓從不認識那人。林布蘭把基督安置在幽暗的背景裡，正回過頭來看。',
      de: 'Lukas 22. Eine Magd hält Petrus eine Kerze ins Gesicht, und er schwört, den Mann nie gekannt zu haben. Rembrandt setzt Christus in den dunklen Hintergrund, sich umwendend.',
      fr: 'Luc 22. Une servante approche une chandelle du visage de Pierre, et il jure n\'avoir jamais connu cet homme. Rembrandt place le Christ dans le fond obscur, se retournant pour regarder.',
      es: 'Lucas 22. Una criada acerca una vela al rostro de Pedro, y él jura que nunca conoció a ese hombre. Rembrandt situó a Cristo en el fondo oscuro, volviéndose para mirar.',
      pt: 'Lucas 22. Uma criada aproxima uma vela do rosto de Pedro, e ele jura que nunca conheceu aquele homem. Rembrandt pôs Cristo no fundo escuro, voltando-se para olhar.',
    },
  },
  {
    id: '078', aspect: 1.336, ref: 'Matthew 28:1-10',
    artist: 'Peter Paul Rubens', year: 'c.1611',
    artistCjk: { 'zh-Hans': '彼得·保罗·鲁本斯', 'zh-Hant': '彼得·保羅·魯本斯' },
    title: {
      en: 'The Resurrection of Christ',
      'zh-Hans': '基督复活',
      'zh-Hant': '基督復活',
      de: 'Die Auferstehung Christi',
      fr: 'La Résurrection du Christ',
      es: 'La resurrección de Cristo',
      pt: 'A Ressurreição de Cristo',
    },
    desc: {
      en: 'Matthew 28. The guards fall like dead men as Christ steps from the tomb. Rubens made it a grave marker for an Antwerp printer and his wife; their name-saints occupy the wings.',
      'zh-Hans': '马太福音 28。基督步出坟墓，看守的人仆倒如死人。鲁本斯为安特卫普一位印刷商夫妇画作墓碑画，两翼是他们的同名圣徒。',
      'zh-Hant': '馬太福音 28。基督步出墳墓，看守的人仆倒如死人。魯本斯為安特衛普一位印刷商夫婦畫作墓碑畫，兩翼是他們的同名聖徒。',
      de: 'Matthäus 28. Die Wächter fallen wie tot, als Christus aus dem Grab tritt. Rubens schuf das Bild als Grabmal für einen Antwerpener Drucker und seine Frau; ihre Namenspatrone füllen die Flügel.',
      fr: 'Matthieu 28. Les gardes tombent comme morts tandis que le Christ sort du tombeau. Rubens en fit un monument funéraire pour un imprimeur anversois et sa femme ; leurs saints patrons occupent les volets.',
      es: 'Mateo 28. Los guardias caen como muertos mientras Cristo sale del sepulcro. Rubens lo hizo como monumento funerario de un impresor de Amberes y su esposa; sus santos patronos ocupan las alas.',
      pt: 'Mateus 28. Os guardas caem como mortos enquanto Cristo sai do sepulcro. Rubens o fez como monumento fúnebre de um impressor de Antuérpia e sua esposa; os santos padroeiros ocupam as portas laterais.',
    },
  },
  {
    id: '004', aspect: 1.406, ref: 'Luke 24:13-35',
    artist: 'Caravaggio', year: '1601',
    artistCjk: { 'zh-Hans': '卡拉瓦乔', 'zh-Hant': '卡拉瓦喬' },
    title: {
      en: 'Supper at Emmaus',
      'zh-Hans': '以马忤斯的晚餐',
      'zh-Hant': '以馬忤斯的晚餐',
      de: 'Das Abendmahl in Emmaus',
      fr: 'Le Souper à Emmaüs',
      es: 'La cena de Emaús',
      pt: 'A Ceia em Emaús',
    },
    desc: {
      en: 'Luke 24. Two travellers recognise Christ only when he breaks the bread. Caravaggio tipped a basket of overripe fruit past the table\'s edge, into the space where you are standing.',
      'zh-Hans': '路加福音 24。两名旅人直到基督擘饼才认出他。卡拉瓦乔让一篮熟透的果子探出桌沿，伸进观者所站的位置。',
      'zh-Hant': '路加福音 24。兩名旅人直到基督擘餅才認出他。卡拉瓦喬讓一籃熟透的果子探出桌沿，伸進觀者所站的位置。',
      de: 'Lukas 24. Zwei Wanderer erkennen Christus erst, als er das Brot bricht. Caravaggio kippt einen Korb überreifer Früchte über die Tischkante hinaus — in den Raum, in dem der Betrachter steht.',
      fr: 'Luc 24. Deux voyageurs ne reconnaissent le Christ qu\'au moment où il rompt le pain. Caravage fait basculer une corbeille de fruits trop mûrs au bord de la table, dans l\'espace où vous vous tenez.',
      es: 'Lucas 24. Dos caminantes reconocen a Cristo solo cuando parte el pan. Caravaggio inclinó un cesto de fruta demasiado madura más allá del borde de la mesa, hacia el espacio donde estás de pie.',
      pt: 'Lucas 24. Dois viajantes reconhecem Cristo somente quando ele parte o pão. Caravaggio inclinou um cesto de frutas maduras demais para além da borda da mesa, no espaço onde você está.',
    },
  },
  {
    id: '012', aspect: 1.347, ref: 'John 20:24-29',
    artist: 'Caravaggio', year: '1601',
    artistCjk: { 'zh-Hans': '卡拉瓦乔', 'zh-Hant': '卡拉瓦喬' },
    title: {
      en: 'The Incredulity of Saint Thomas',
      'zh-Hans': '圣多马的怀疑',
      'zh-Hant': '聖多馬的懷疑',
      de: 'Der ungläubige Thomas',
      fr: 'L\'Incrédulité de saint Thomas',
      es: 'La incredulidad de santo Tomás',
      pt: 'A Incredulidade de São Tomé',
    },
    desc: {
      en: 'John 20. Thomas will not believe until he touches the wound, so Christ takes his wrist and guides it in. Caravaggio gave none of the four heads a halo.',
      'zh-Hans': '约翰福音 20。多马非摸到伤口不肯信，基督便握住他的手腕，引他探入。卡拉瓦乔没有给画中四个头颅任何一圈光环。',
      'zh-Hant': '約翰福音 20。多馬非摸到傷口不肯信，基督便握住他的手腕，引他探入。卡拉瓦喬沒有給畫中四個頭顱任何一圈光環。',
      de: 'Johannes 20. Thomas will nicht glauben, ehe er die Wunde berührt; da fasst Christus sein Handgelenk und führt es hinein. Keinem der vier Köpfe gab Caravaggio einen Heiligenschein.',
      fr: 'Jean 20. Thomas ne croira pas avant d\'avoir touché la plaie ; le Christ lui prend le poignet et l\'y conduit. Caravage n\'a donné d\'auréole à aucune des quatre têtes.',
      es: 'Juan 20. Tomás no cree hasta tocar la herida, así que Cristo le toma la muñeca y la guía dentro. Caravaggio no dio aureola a ninguna de las cuatro cabezas.',
      pt: 'João 20. Tomé não crê enquanto não tocar a chaga, e Cristo lhe toma o pulso e o conduz até ela. Caravaggio não deu auréola a nenhuma das quatro cabeças.',
    },
  },
] as const;

export const QUIZ_ART_COUNT = QUIZ_ART.length;

/** The painting that ships in the binary. An id, not `QUIZ_ART[0].id`: the
 *  header bans reordering but not PREPENDING, and a prepend would silently hand
 *  Murillo's picture to whatever entry took index 0. */
export const FIRST_ART_ID = '051';

/** Bundled copy of the FIRST painting. A device that has never had a network
 *  still finishes puzzle one; every later board waits on the CDN. */
export const FIRST_ART_LOCAL = require('../../assets/puzzle/first.jpg');

/** Full image, ~1200px on the long side. */
export const artUrl = (a: QuizArtwork) => `${ART_BASE}/full/${a.id}.jpg`;
/** 420px, for the collection grid. Its own file rather than a Cloudflare
 *  transform: the transform host list in services/cfImage.ts covers the covers
 *  domain only, and a resize that silently no-ops pushes 4.6 MB into a grid. */
export const artThumbUrl = (a: QuizArtwork) => `${ART_BASE}/thumb/${a.id}.jpg`;

/** Image source for a board: the bundled asset for painting one, a URL after. */
export function artSource(a: QuizArtwork) {
  return a.id === FIRST_ART_ID ? FIRST_ART_LOCAL : { uri: artUrl(a) };
}

/** Same split for the collection grid. Without it the offline user finishes her
 *  first puzzle, opens the collection, and finds one grey square -- which is the
 *  picture bundling the file was supposed to prevent. The bundled JPEG is
 *  1200px and gets scaled down for the cell; a second 420px copy in the binary
 *  would cost more than the scale does. */
export function artThumbSource(a: QuizArtwork) {
  return a.id === FIRST_ART_ID ? FIRST_ART_LOCAL : { uri: artThumbUrl(a) };
}

/** Never throws, never returns undefined - a reward screen is the last place
 *  an out-of-range index should be allowed to land. */
export function artworkAt(index: number): QuizArtwork {
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return QUIZ_ART[Math.max(0, Math.min(i, QUIZ_ART.length - 1))];
}

// All three fall back to English rather than to empty. A half-translated
// locale then renders a real caption in the wrong language, which is legible;
// a blank one reads as a bug.
export const artTitle = (a: QuizArtwork, lang: LanguageCode): string =>
  a.title[lang] || a.title.en || '';
export const artDesc = (a: QuizArtwork, lang: LanguageCode): string =>
  a.desc[lang] || a.desc.en || '';
export const artArtist = (a: QuizArtwork, lang: LanguageCode): string =>
  a.artistCjk?.[lang] || a.artist;

/** "Title - Artist, year", for share images and the collection detail. */
export function artCaption(a: QuizArtwork, lang: LanguageCode): string {
  const who = artArtist(a, lang);
  return a.year ? `${artTitle(a, lang)} — ${who}, ${a.year}` : `${artTitle(a, lang)} — ${who}`;
}
