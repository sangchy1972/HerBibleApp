import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { useNotes } from '../state/NotesContext';
import { useUILanguage, type UILanguageCode } from '../state/UILanguageContext';
import { localeFor } from '../i18n/locale';
import type { RootStackScreenProps } from '../navigation/types';
import { useT } from '../i18n/useT';

const formatDate = (iso: string, lang: UILanguageCode) => {
  try {
    return new Date(iso).toLocaleDateString(localeFor(lang), {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return ''; }
};

export default function ReflectionsScreen({ navigation }: RootStackScreenProps<'Reflections'>) {
  const t = useT();
  const { lang } = useUILanguage();
  const insets = useSafeAreaInsets();
  const { notes } = useNotes();

  const reflections = useMemo(() => notes.filter(n => n.kind === 'reflection'), [notes]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('reflections.title')}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      {reflections.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="edit-3" size={36} color={TXTSUB} />
          <Text style={styles.emptyTitle}>{t('reflections.empty')}</Text>
          <Text style={styles.emptyHint}>
            After your morning or evening prayer, tap "Write a reflection" — what you save will live here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        >
          {reflections.map(r => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.date}>{formatDate(r.savedAt, lang)}</Text>
              {r.verseRef && (
                <View style={styles.versePreview}>
                  <Text style={styles.verseRef}>{r.verseRef}</Text>
                  {r.verseText ? <Text style={styles.verseText}>"{r.verseText}"</Text> : null}
                </View>
              )}
              <Text style={styles.body}>{r.text}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: P,
    paddingBottom: 14,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { padding: P, gap: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  date: {
    fontSize: 12,
    fontWeight: '700',
    color: TXTSUB,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  versePreview: {
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  verseRef: {
    fontSize: 12,
    fontWeight: '700',
    color: ROSE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  verseText: { fontSize: 16, lineHeight: 23, color: TXT, fontWeight: '500' },
  body: { fontSize: 17, lineHeight: 25, color: TXT },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, gap: 14,
  },
  emptyTitle: { fontSize: 19, fontWeight: '700', color: TXT },
  emptyHint: {
    fontSize: 15, lineHeight: 22, color: TXTSUB, textAlign: 'center',
  },
});
