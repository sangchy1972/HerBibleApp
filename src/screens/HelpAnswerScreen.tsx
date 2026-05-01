import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { HELP_ITEMS, SUPPORT_EMAIL } from '../constants/helpContent';
import type { RootStackScreenProps } from '../navigation/types';

const NOTO_REG = 'NotoSansSC_400Regular';
const NOTO_BOLD = 'NotoSansSC_700Bold';

export default function HelpAnswerScreen({ route, navigation }: RootStackScreenProps<'HelpAnswer'>) {
  const insets = useSafeAreaInsets();
  const item = HELP_ITEMS.find(h => h.id === route.params.id);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const onContact = () => {
    const subject = encodeURIComponent(`Her Bible support — ${item?.question ?? ''}`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };

  if (!item) {
    // Defensive: never crash on a stale link.
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Article not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>Answer</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 130 }]}
      >
        <Text style={styles.question}>{item.question}</Text>

        {item.sections.map((s, i) => (
          <View key={i} style={{ marginBottom: 18 }}>
            {s.heading && <Text style={styles.heading}>{s.heading}</Text>}
            {s.paragraphs?.map((p, j) => (
              <Text key={j} style={styles.paragraph}>{p}</Text>
            ))}
            {s.bullets?.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackPrompt}>Does this answer help?</Text>
          <View style={styles.feedbackBtns}>
            <TouchableOpacity
              onPress={() => setFeedback('down')}
              hitSlop={10}
              style={[styles.feedbackBtn, feedback === 'down' && styles.feedbackBtnActive]}
            >
              <Feather name="thumbs-down" size={18} color={feedback === 'down' ? ROSE : TXTSUB} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFeedback('up')}
              hitSlop={10}
              style={[styles.feedbackBtn, feedback === 'up' && styles.feedbackBtnActive]}
            >
              <Feather name="thumbs-up" size={18} color={feedback === 'up' ? ROSE : TXTSUB} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={onContact} activeOpacity={0.85} style={styles.contactBtn}>
          <Feather name="edit-3" size={20} color="#FFFFFF" />
          <Text style={styles.contactText}>Contact us</Text>
        </TouchableOpacity>
      </View>
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
  title: { fontSize: 22, fontFamily: NOTO_BOLD, color: TXT },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingHorizontal: P + 4, paddingTop: 18 },
  question: {
    fontSize: 22,
    fontFamily: NOTO_BOLD,
    color: TXT,
    lineHeight: 30,
    marginBottom: 18,
  },
  heading: {
    fontSize: 17,
    fontFamily: NOTO_BOLD,
    color: TXT,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    fontFamily: NOTO_REG,
    lineHeight: 24,
    color: TXT,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
    marginBottom: 8,
  },
  bulletDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: ROSE,
    marginTop: 9, marginRight: 12,
  },
  bulletText: { flex: 1, fontSize: 16, fontFamily: NOTO_REG, lineHeight: 24, color: TXT },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  feedbackPrompt: { fontSize: 15, fontFamily: NOTO_REG, color: TXTSUB },
  feedbackBtns: { flexDirection: 'row', gap: 10 },
  feedbackBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  feedbackBtnActive: { backgroundColor: `${ROSE}1A` },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: P + 4, paddingTop: 12,
    backgroundColor: '#FBF7F6',
  },
  contactBtn: {
    backgroundColor: ROSE,
    borderRadius: 28,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  contactText: { color: '#FFFFFF', fontSize: 18, fontFamily: NOTO_BOLD },
});
