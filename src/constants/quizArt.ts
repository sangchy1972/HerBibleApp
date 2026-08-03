// The puzzle artworks — one painting per 4 completed quiz sets.
//
// 74 classical paintings of biblical subjects, all public domain: the works
// are centuries out of copyright, and a faithful photographic reproduction of
// a two-dimensional public-domain work carries no new copyright of its own.
// Sources are Wikimedia Commons; the catalogue that produced this file lives
// with the originals.
//
// NOT BUNDLED. The optimised set is ~15 MB and the app already refuses to ship
// 40 MB of CJK fonts for the same reason. They are fetched from
// quiz.everlandapps.com/v1/art/, the same bucket as the question banks, and
// PuzzleBoard renders a placeholder until the image lands.
//
// TITLE AND ARTIST ARE SHOWN. Partly because it is the decent thing to do with
// somebody's Caravaggio, and partly because it is the reward: she is not
// collecting a texture, she is collecting a painting that has a name.
//
// ⚠️ ORDER IS DURABLE. puzzleView addresses these by INDEX derived from
// completedSets, so a user who has finished painting 2 will see whatever sits
// at index 2 forever. APPEND new artwork; never reorder or delete, or you
// silently rewrite what people have already collected.

const ART_BASE = 'https://quiz.everlandapps.com/v1/art';

export interface QuizArtwork {
  /** Stable id and the CDN filename. Never reuse one. */
  id: string;
  title: string;
  artist: string;
  /** Year as the catalogue gives it — a string, since many are approximate. */
  year: string;
  /** width / height. Runs 1.0 to 1.49; the board takes its shape from this. */
  aspect: number;
}

export const QUIZ_ART: readonly QuizArtwork[] = [
  { id: '001', title: 'Adoration of the Magi', artist: 'Leonardo da Vinci', year: '1482', aspect: 1.003 },
  { id: '002', title: 'The Calling of Saint Matthew', artist: 'Caravaggio', year: '1609', aspect: 1.059 },
  { id: '003', title: 'The Wedding at Cana', artist: 'Paolo Veronese', year: '1562', aspect: 1.494 },
  { id: '004', title: 'Supper at Emmaus', artist: 'Caravaggio', year: '1601', aspect: 1.406 },
  { id: '005', title: 'Belshazzar\'s Feast', artist: 'Rembrandt', year: '1636', aspect: 1.256 },
  { id: '006', title: 'Alba Madonna', artist: 'Raphael', year: '1510', aspect: 1 },
  { id: '007', title: 'Rest on the Flight into Egypt', artist: 'Caravaggio', year: '1597', aspect: 1.24 },
  { id: '008', title: 'Madonna with Canon Joris van der Paele', artist: 'Jan van Eyck', year: '1436', aspect: 1.288 },
  { id: '009', title: 'Christ in the Wilderness', artist: 'Ivan Kramskoi', year: '1872', aspect: 1.14 },
  { id: '012', title: 'The Incredulity of Saint Thomas', artist: 'Caravaggio', year: '1601', aspect: 1.347 },
  { id: '013', title: 'Madonna of the Magnificat', artist: 'Sandro Botticelli', year: '1483', aspect: 1 },
  { id: '014', title: 'Saint Jerome Writing', artist: 'Caravaggio', year: '1607', aspect: 1.457 },
  { id: '015', title: 'Saint Jerome', artist: 'Caravaggio', year: '1606', aspect: 1.373 },
  { id: '017', title: 'The Appearance of Christ Before the People', artist: 'Alexander Ivanov', year: '1847', aspect: 1.434 },
  { id: '018', title: 'Saint Francis of Assisi in Ecstasy', artist: 'Caravaggio', year: '1594', aspect: 1.389 },
  { id: '019', title: 'Cestello Annunciation', artist: 'Sandro Botticelli', year: '1489', aspect: 1.057 },
  { id: '020', title: 'Madonna del Prato', artist: 'Giovanni Bellini', year: '1500', aspect: 1.292 },
  { id: '021', title: 'Adoration of the Shepherds', artist: 'Giorgione', year: '1507', aspect: 1.223 },
  { id: '022', title: 'Jacob Blessing the Sons of Joseph', artist: 'Rembrandt', year: '1656', aspect: 1.18 },
  { id: '023', title: 'The Denial of Saint Peter', artist: 'Rembrandt', year: '1660', aspect: 1.093 },
  { id: '024', title: 'The Adoration of the Golden Calf', artist: 'Nicolas Poussin', year: '1634', aspect: 1.398 },
  { id: '025', title: 'The Gypsy Madonna', artist: 'Titian', year: '1510', aspect: 1.289 },
  { id: '026', title: 'Christ Among the Doctors', artist: 'Albrecht Dürer', year: '1506', aspect: 1.247 },
  { id: '028', title: 'Terranuova Madonna', artist: 'Raphael', year: '1505', aspect: 1.001 },
  { id: '029', title: 'Presentation at the Temple', artist: 'Andrea Mantegna', year: '1400', aspect: 1.25 },
  { id: '031', title: 'Esther before Ahasuerus', artist: 'Artemisia Gentileschi', year: '1629', aspect: 1.312 },
  { id: '034', title: 'The Vision of Saint Eustace', artist: 'Pisanello', year: '1400', aspect: 1.216 },
  { id: '036', title: 'The Holy Family with a Bird', artist: 'Bartolomé Esteban Murillo', year: '1650', aspect: 1.333 },
  { id: '037', title: 'Madonna of the Rabbit', artist: 'Titian', year: '1530', aspect: 1.231 },
  { id: '038', title: 'Christ with singing and music-making Angels', artist: 'Hans Memling', year: '1489', aspect: 1.271 },
  { id: '039', title: 'The Annunciation', artist: 'Sandro Botticelli', year: '1487', aspect: 1.217 },
  { id: '040', title: 'The Last Supper', artist: 'El Greco', year: '1568', aspect: 1.17 },
  { id: '041', title: 'Transfiguration of Christ', artist: 'Giovanni Bellini', year: '1478', aspect: 1.318 },
  { id: '042', title: 'Saul and David', artist: 'Rembrandt', year: '1650', aspect: 1.266 },
  { id: '044', title: 'Aldobrandini Madonna', artist: 'Titian', year: '1532', aspect: 1.422 },
  { id: '046', title: 'Madonna and Child', artist: 'Giovanni Bellini', year: '1510', aspect: 1.41 },
  { id: '047', title: 'Christ Driving the Money Changers from the Temple', artist: 'El Greco', year: '1600', aspect: 1.229 },
  { id: '050', title: 'Daniel in the Lions\' Den', artist: 'Peter Paul Rubens', year: '1615', aspect: 1.477 },
  { id: '051', title: 'Rebecca and Eliezer', artist: 'Bartolomé Esteban Murillo', year: '1660', aspect: 1.407 },
  { id: '054', title: 'Presentation of Christ in the Temple', artist: 'Fra Bartolomeo', year: '1516', aspect: 1.026 },
  { id: '056', title: 'Madonna of the Napkin', artist: 'Bartolomé Esteban Murillo', year: '1668', aspect: 1.066 },
  { id: '057', title: 'Bache Madonna', artist: 'Titian', year: '1508', aspect: 1.223 },
  { id: '058', title: 'Annunciation with Saints John the Baptist and Andrew', artist: 'Filippino Lippi', year: '1485', aspect: 1.069 },
  { id: '059', title: 'The Mystic Marriage of Saint Catherine with Saints', artist: 'Lorenzo Lotto', year: '1524', aspect: 1.151 },
  { id: '060', title: 'The Mystical Marriage of Saint Catherine', artist: 'Lorenzo Lotto', year: '1506', aspect: 1.294 },
  { id: '061', title: 'Joseph with Jacob in Egypt', artist: 'Pontormo', year: '1518', aspect: 1.12 },
  { id: '063', title: 'Coronation of the Virgin', artist: 'Filippo Lippi', year: '1441', aspect: 1.327 },
  { id: '064', title: 'Apparition of the Apostle Peter to Saint Peter Nolasco', artist: 'Francisco de Zurbarán', year: '1629', aspect: 1.261 },
  { id: '066', title: 'Marriage of the Virgin', artist: 'Robert Campin', year: '1420', aspect: 1.139 },
  { id: '067', title: 'The Supper at Emmaus', artist: 'Rembrandt', year: '1628', aspect: 1.119 },
  { id: '069', title: 'Madonna of Jacob Floreins', artist: 'Hans Memling', year: '1485', aspect: 1.245 },
  { id: '072', title: 'Madonna del Padiglione', artist: 'Sandro Botticelli', year: '1490', aspect: 1.005 },
  { id: '073', title: 'Madonna and Child with Two Donors', artist: 'Lorenzo Lotto', year: '1525', aspect: 1.341 },
  { id: '074', title: 'Madonna with Child between Sts. Flavian and Onuphrius', artist: 'Lorenzo Lotto', year: '1506', aspect: 1.277 },
  { id: '075', title: 'The Virgin and Child between two Saints', artist: 'Giovanni Bellini', year: '1490', aspect: 1.32 },
  { id: '076', title: 'Martelli Annunciation', artist: 'Filippo Lippi', year: '1445', aspect: 1.062 },
  { id: '077', title: 'Angel Playing the Lute', artist: 'Rosso Fiorentino', year: '1518', aspect: 1.254 },
  { id: '078', title: 'The Resurrection of Christ', artist: 'Peter Paul Rubens', year: '1611', aspect: 1.336 },
  { id: '079', title: 'Annunciation of San Giovanni Valdarno', artist: 'Fra Angelico', year: '1430', aspect: 1.018 },
  { id: '080', title: 'Saint Jerome in His Study', artist: 'Niccolò Antonio Colantonio', year: '1444', aspect: 1.201 },
  { id: '081', title: 'The Marriage of the Virgin', artist: 'Luca Giordano', year: '1688', aspect: 1.162 },
  { id: '082', title: 'Virgin with the Child and Scenes from the Life of St Anne', artist: 'Filippo Lippi', year: '1452', aspect: 1 },
  { id: '083', title: 'Visitation', artist: 'Piero di Cosimo', year: '1490', aspect: 1.041 },
  { id: '084', title: 'The Judgment of Solomon', artist: 'Nicolas Poussin', year: '1649', aspect: 1.492 },
  { id: '085', title: 'Isaac Blessing Jacob', artist: 'Govert Flinck', year: '1638', aspect: 1.212 },
  { id: '088', title: 'The Return of the Prodigal Son', artist: 'Bartolomé Esteban Murillo', year: '1668', aspect: 1.108 },
  { id: '089', title: 'The Adoration of the Shepherds', artist: 'Georges de La Tour', year: '1645', aspect: 1.265 },
  { id: '090', title: 'Adoration of the Child', artist: 'Gerard van Honthorst', year: '1620', aspect: 1.351 },
  { id: '091', title: 'The Baptism of Christ', artist: 'Joachim Patinir', year: '1510', aspect: 1.29 },
  { id: '092', title: 'Virgin and Child, with Saints and Donor', artist: 'Jan van Eyck', year: '1442', aspect: 1.309 },
  { id: '097', title: 'The Adoration of the Magi', artist: 'Andrea Mantegna', year: '1495', aspect: 1.303 },
  { id: '098', title: 'Presentation of the Virgin Mary at the Temple', artist: 'Giovanni Battista Cima da Conegliano', year: '1496', aspect: 1.376 },
  { id: '099', title: 'The Virgin and Child with Saints', artist: 'Lorenzo Lotto', year: '1505', aspect: 1.31 },
  { id: '100', title: 'Madonna with the Child and Sts Rock and Sebastian', artist: 'Lorenzo Lotto', year: '1518', aspect: 1.322 },
] as const;

/** How many paintings exist. Fed to puzzleView, which CLAMPS to it. */
export const QUIZ_ART_COUNT = QUIZ_ART.length;

/** Full-size image, ~1200px on the long side. */
export const artUrl = (a: QuizArtwork) => `${ART_BASE}/full/${a.id}.jpg`;
/** 420px, for the collection grid. Its own file rather than a Cloudflare
 *  transform: the transform host list in services/cfImage.ts covers the covers
 *  domain only, and a resize that silently fails would show a 15 MB grid. */
export const artThumbUrl = (a: QuizArtwork) => `${ART_BASE}/thumb/${a.id}.jpg`;

/** Never throws and never returns undefined — a reward screen is the last
 *  place an out-of-range index should be allowed to land. */
export function artworkAt(index: number): QuizArtwork {
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  return QUIZ_ART[Math.max(0, Math.min(i, QUIZ_ART.length - 1))];
}
