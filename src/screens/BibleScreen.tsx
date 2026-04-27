import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { OT, NT, PSALM_23, RECENT_SEARCHES } from '../constants/data';

const HL_COLORS = [
  { name: 'rose', bg: 'rgba(232,97,154,0.22)', dot: '#EC4F8F' },
  { name: 'lav', bg: 'rgba(157,127,224,0.20)', dot: '#9C7BE6' },
  { name: 'amber', bg: 'rgba(244,184,96,0.30)', dot: '#F4B860' },
  { name: 'sage', bg: 'rgba(136,184,152,0.28)', dot: '#7CB793' },
  { name: 'sky', bg: 'rgba(123,163,224,0.24)', dot: '#7BA8E0' },
];

function BookDrawer({ onClose, testament, setTestament, currentBook, onPick }: {
  onClose: () => void;
  testament: 'OT' | 'NT';
  setTestament: (v: 'OT' | 'NT') => void;
  currentBook: string;
  onPick: (b: string) => void;
}) {
  const books = testament === 'OT' ? OT : NT;
  return (
    <View style={styles.drawerOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.drawer}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Books</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={18} color={TXT} />
          </TouchableOpacity>
        </View>
        <View style={styles.pillRow}>
          <TouchableOpacity
            onPress={() => setTestament('OT')}
            style={[styles.drawerPill, { backgroundColor: testament === 'OT' ? ROSE : 'transparent' }]}
          >
            <Text style={[styles.drawerPillText, { color: testament === 'OT' ? '#fff' : TXTSUB }]}>
              Old Testament · 39
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTestament('NT')}
            style={[styles.drawerPill, { backgroundColor: testament === 'NT' ? LAV : 'transparent' }]}
          >
            <Text style={[styles.drawerPillText, { color: testament === 'NT' ? '#fff' : TXTSUB }]}>
              New Testament · 27
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.bookGrid}>
            {books.map((b, i) => {
              const isCurrent = b === currentBook;
              return (
                <TouchableOpacity
                  key={b}
                  onPress={() => onPick(b)}
                  style={[styles.bookCell, isCurrent && styles.bookCellActive]}
                >
                  <Text style={styles.bookNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={[styles.bookName, isCurrent && { color: ROSE, fontWeight: '700' }]}>{b}</Text>
                  {isCurrent && <View style={styles.bookAccent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function SearchOverlay({ onClose, onPick }: {
  onClose: () => void;
  onPick: (b: string) => void;
}) {
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState(RECENT_SEARCHES);
  const allBooks = [...OT, ...NT];
  const results = q ? allBooks.filter(b => b.toLowerCase().includes(q.toLowerCase())) : null;

  return (
    <View style={styles.searchOverlay}>
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <Feather name="search" size={15} color={TXTSUB} style={{ marginRight: 6 }} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search"
            placeholderTextColor={TXTSUB}
            style={styles.searchInput}
            autoFocus
          />
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.cancelText, { color: ROSE }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.searchScroll}>
        {!q && recents.length > 0 && (
          <View>
            <View style={styles.recentHeader}>
              <Text style={styles.recentLabel}>RECENT</Text>
              <TouchableOpacity onPress={() => setRecents([])}>
                <Text style={{ fontSize: 12, color: TXTSUB }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {recents.map(term => (
              <TouchableOpacity
                key={term}
                onPress={() => setQ(term)}
                style={styles.recentRow}
              >
                <Feather name="clock" size={13} color={TXTSUB} />
                <Text style={styles.recentTerm}>{term}</Text>
                <TouchableOpacity onPress={() => setRecents(r => r.filter(x => x !== term))}>
                  <Feather name="x" size={13} color={TXTSUB} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {q && results && (
          <View>
            <Text style={styles.resultsLabel}>Books · {results.length}</Text>
            {results.length === 0 ? (
              <Text style={styles.noResults}>No results for "{q}"</Text>
            ) : results.map(b => (
              <TouchableOpacity key={b} onPress={() => onPick(b)} style={styles.resultRow}>
                <Text style={styles.resultBook}>{b}</Text>
                <Feather name="chevron-right" size={14} color={TXTSUB} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ReaderSheet({ onClose, fontSize, setFontSize, lineH, setLineH, theme, setTheme }: {
  onClose: () => void;
  fontSize: number;
  setFontSize: (v: number) => void;
  lineH: number;
  setLineH: (v: number) => void;
  theme: string;
  setTheme: (v: string) => void;
}) {
  const THEME_OPTS = [
    { id: 'default', color: '#FBF7F6' },
    { id: 'cream', color: '#FAF6E8' },
    { id: 'rose', color: '#FBEEEE' },
    { id: 'sage', color: '#EAF1E6' },
    { id: 'dark', color: '#1A1620' },
  ];

  return (
    <View style={styles.readerOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.readerSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.readerHeader}>
          <Text style={styles.readerTitle}>Reader</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={18} color={TXT} />
          </TouchableOpacity>
        </View>

        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Font size</Text>
          <Text style={styles.sliderValue}>{fontSize}px</Text>
        </View>
        <View style={styles.sliderBtns}>
          <TouchableOpacity onPress={() => setFontSize(Math.max(13, fontSize - 1))} style={styles.sliderBtn}>
            <Text style={styles.sliderBtnText}>A−</Text>
          </TouchableOpacity>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${(fontSize - 13) / (26 - 13) * 100}%` as any }]} />
          </View>
          <TouchableOpacity onPress={() => setFontSize(Math.min(26, fontSize + 1))} style={styles.sliderBtn}>
            <Text style={[styles.sliderBtnText, { fontSize: 18 }]}>A+</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sliderRow, { marginTop: 16 }]}>
          <Text style={styles.sliderLabel}>Line height</Text>
          <Text style={styles.sliderValue}>{lineH.toFixed(2)}</Text>
        </View>
        <View style={styles.sliderBtns}>
          <TouchableOpacity onPress={() => setLineH(Math.max(1.3, parseFloat((lineH - 0.1).toFixed(2))))} style={styles.sliderBtn}>
            <Text style={styles.sliderBtnText}>–</Text>
          </TouchableOpacity>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${(lineH - 1.3) / (2.2 - 1.3) * 100}%` as any }]} />
          </View>
          <TouchableOpacity onPress={() => setLineH(Math.min(2.2, parseFloat((lineH + 0.1).toFixed(2))))} style={styles.sliderBtn}>
            <Text style={styles.sliderBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sliderLabel, { marginTop: 18, marginBottom: 10 }]}>Theme</Text>
        <View style={styles.themeRow}>
          {THEME_OPTS.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTheme(t.id)}
              style={[styles.themeCircle, {
                backgroundColor: t.color,
                borderWidth: theme === t.id ? 2 : 1,
                borderColor: theme === t.id ? ROSE : 'rgba(30,27,46,0.12)',
              }]}
            >
              {theme === t.id && <Feather name="check" size={12} color={t.id === 'dark' ? '#fff' : TXT} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const THEMES: Record<string, { bg: string; txt: string; sub: string }> = {
  default: { bg: 'transparent', txt: TXT, sub: TXTSUB },
  cream: { bg: '#FAF6E8', txt: '#3A2E1F', sub: '#7A6A52' },
  rose: { bg: '#FBEEEE', txt: '#4A2530', sub: '#876672' },
  sage: { bg: '#EAF1E6', txt: '#26331F', sub: '#5C6B53' },
  dark: { bg: '#1A1620', txt: '#F5F0EC', sub: '#9C95A6' },
};

export default function BibleScreen() {
  const [book, setBook] = useState('Psalms');
  const [chapter, setChapter] = useState(23);
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fontSize, setFontSize] = useState(17);
  const [lineH, setLineH] = useState(1.75);
  const [theme, setTheme] = useState('default');
  const [fontMenu, setFontMenu] = useState(false);
  const [selVerse, setSelVerse] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<Record<number, string>>({});
  const [testament, setTestament] = useState<'OT' | 'NT'>(OT.includes(book) ? 'OT' : 'NT');
  const scrollRef = useRef<ScrollView>(null);
  const TH = THEMES[theme];

  const verses = PSALM_23;

  const handleVerseTap = (idx: number) => {
    setSelVerse(v => v === idx ? null : idx);
  };

  const toggleHighlight = (color: string) => {
    if (selVerse === null) return;
    setHighlights(h => {
      const n = { ...h };
      if (n[selVerse] === color) delete n[selVerse];
      else n[selVerse] = color;
      return n;
    });
    setSelVerse(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: TH.bg === 'transparent' ? '#FBF7F6' : TH.bg }]}>
      {/* Pinned header */}
      <View style={[styles.bibleHeader, {
        borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(30,27,46,0.05)',
        backgroundColor: TH.bg === 'transparent' ? '#FBF7F6' : TH.bg,
      }]}>
        <TouchableOpacity onPress={() => setDrawer(true)} style={styles.iconBtn}>
          <Feather name="menu" size={18} color={TH.txt} />
        </TouchableOpacity>
        <Text style={[styles.bookTitle, { color: TH.txt }]}>{book} {chapter}</Text>
        <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.iconBtn}>
          <Feather name="search" size={18} color={TH.txt} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFontMenu(v => !v)} style={styles.iconBtn}>
          <Text style={[styles.iconBtnText, styles.fontT, { color: TH.txt }]}>T</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable verses */}
      <ScrollView
        ref={scrollRef}
        style={styles.verseScroll}
        contentContainerStyle={styles.verseContent}
        showsVerticalScrollIndicator={false}
        onScroll={() => setSelVerse(null)}
        scrollEventThrottle={16}
      >
        <Text style={[styles.chapterTitle, { color: TH.txt }]}>{book} {chapter}</Text>

        {verses.map((v, i) => {
          const hl = highlights[i];
          const hlColor = hl ? HL_COLORS.find(c => c.name === hl)?.bg : undefined;
          const isSel = selVerse === i;
          return (
            <TouchableOpacity key={i} onPress={() => handleVerseTap(i)} activeOpacity={0.7}>
              <Text style={[
                styles.verse,
                { fontSize, lineHeight: fontSize * lineH, color: TH.txt, marginBottom: 18 },
                (hlColor || isSel) && { backgroundColor: hlColor || 'rgba(30,27,46,0.04)', borderRadius: 6, padding: 4 },
              ]}>
                <Text style={[styles.verseNum, { color: LAV, fontSize: fontSize * 0.72 }]}>{i + 1}  </Text>
                {v}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Verse toolbar */}
      {selVerse !== null && (
        <View style={styles.verseToolbar}>
          <View style={styles.toolbarColors}>
            {HL_COLORS.map(c => (
              <TouchableOpacity
                key={c.name}
                onPress={() => toggleHighlight(c.name)}
                style={[styles.colorDot, { backgroundColor: c.dot },
                  highlights[selVerse] === c.name && styles.colorDotSelected,
                ]}
              />
            ))}
            <TouchableOpacity
              onPress={() => { setHighlights(h => { const n = { ...h }; if (selVerse !== null) delete n[selVerse]; return n; }); setSelVerse(null); }}
              style={styles.colorDotClear}
            >
              <Feather name="x" size={11} color={TXTSUB} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolbarDivider} />
          <View style={styles.toolbarActions}>
            {['Copy', 'Image', 'Notes', 'Share'].map(a => (
              <TouchableOpacity key={a} onPress={() => setSelVerse(null)} style={styles.toolbarAction}>
                <Text style={styles.toolbarActionText}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Floating audio button */}
      <TouchableOpacity style={styles.audioBtn}>
        <Feather name="headphones" size={20} color={ROSE} />
      </TouchableOpacity>

      {/* Drawers/overlays */}
      {drawer && (
        <BookDrawer
          onClose={() => setDrawer(false)}
          testament={testament}
          setTestament={setTestament}
          currentBook={book}
          onPick={b => { setBook(b); setChapter(1); setDrawer(false); }}
        />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onPick={b => { setBook(b); setChapter(1); setSearchOpen(false); }}
        />
      )}
      {fontMenu && (
        <ReaderSheet
          onClose={() => setFontMenu(false)}
          fontSize={fontSize} setFontSize={setFontSize}
          lineH={lineH} setLineH={setLineH}
          theme={theme} setTheme={setTheme}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    inset: 0,
  } as any,
  bibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingVertical: 8,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 16 },
  fontT: { fontSize: 16, fontWeight: '600' },
  bookTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  verseScroll: {
    flex: 1,
  },
  verseContent: {
    paddingHorizontal: P + 4,
    paddingBottom: 130,
    paddingTop: 12,
  },
  chapterTitle: {
    fontSize: 30,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 26,
    marginTop: 12,
  },
  verse: {
    lineHeight: 30,
    color: TXT,
  },
  verseNum: {
    fontWeight: '600',
    color: LAV,
  },
  verseToolbar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 110,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    padding: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 30,
  },
  toolbarColors: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorDotSelected: {
    transform: [{ scale: 1.1 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  colorDotClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(30,27,46,0.22)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarDivider: {
    height: 1,
    backgroundColor: 'rgba(30,27,46,0.06)',
    marginHorizontal: -14,
    marginBottom: 8,
  },
  toolbarActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolbarAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  toolbarActionText: {
    fontSize: 11,
    color: TXT,
    fontWeight: '500',
  },
  audioBtn: {
    position: 'absolute',
    bottom: 100,
    right: P + 2,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: ROSE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ROSE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 40,
  },
  drawerOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 120,
    backgroundColor: 'rgba(30,27,46,0.30)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FBF7F6',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    padding: P,
    paddingTop: 26,
    maxHeight: '85%',
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: TXT,
  },
  closeBtn: {
    width: 30,
    height: 34,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  drawerPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  drawerPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 4,
  },
  bookCell: {
    width: '30%',
    borderRadius: 11,
    padding: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  bookCellActive: {
    backgroundColor: 'rgba(249,168,201,0.45)',
    borderColor: 'rgba(232,97,154,0.35)',
  },
  bookNum: {
    fontSize: 10,
    color: TXTSUB,
    marginBottom: 3,
  },
  bookName: {
    fontSize: 12,
    fontWeight: '500',
    color: TXT,
    lineHeight: 16,
  },
  bookAccent: {
    marginTop: 5,
    height: 2.5,
    width: '60%',
    borderRadius: 2,
    backgroundColor: ROSE,
  },
  searchOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 130,
    backgroundColor: '#FBF7F6',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: P,
    paddingTop: 52,
    paddingBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingLeft: 14,
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 8,
    fontSize: 14,
    color: TXT,
  },
  cancelText: { fontSize: 14, fontWeight: '600', paddingHorizontal: 4 },
  searchScroll: {
    flex: 1,
    paddingHorizontal: P,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    marginBottom: 8,
  },
  recentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  clockIcon: { fontSize: 14 },
  recentTerm: { flex: 1, fontSize: 14, color: TXT },
  resultsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginVertical: 10,
    marginBottom: 8,
  },
  noResults: { fontSize: 13, color: TXTSUB, padding: 30, textAlign: 'center' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.06)',
  },
  resultBook: { flex: 1, fontSize: 14, color: TXT, fontWeight: '500' },
  readerOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 120,
    backgroundColor: 'rgba(20,16,28,0.55)',
    justifyContent: 'flex-end',
  },
  readerSheet: {
    backgroundColor: '#FBF7F6',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: P,
    paddingTop: 14,
    paddingBottom: 110,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,46,0.18)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  readerTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: TXT,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sliderLabel: { fontSize: 13, fontWeight: '600', color: TXT },
  sliderValue: { fontSize: 11, color: TXTSUB },
  sliderBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sliderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${ROSE}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderBtnText: { fontSize: 14, color: ROSE, fontWeight: '700' },
  sliderTrack: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: `${ROSE}1F`,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: ROSE,
    borderRadius: 4,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
