import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { POLICIES } from '../constants/aboutContent';
import type { RootStackScreenProps } from '../navigation/types';

export default function PolicyScreen({ route, navigation }: RootStackScreenProps<'Policy'>) {
  const insets = useSafeAreaInsets();
  const doc = POLICIES[route.params.id];

  if (!doc) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Document not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={TXT} />
        </TouchableOpacity>
        <Text style={styles.title}>{doc.title}</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={styles.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={styles.updated}>Last updated · {doc.updatedOn}</Text>

        {doc.sections.map((s, i) => (
          <View key={i} style={{ marginBottom: 22 }}>
            {s.heading && <Text style={styles.heading}>{s.heading}</Text>}
            {s.paragraphs?.map((p, j) => <Text key={j} style={styles.paragraph}>{p}</Text>)}
            {s.bullets?.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
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
  title: { fontSize: 20, fontWeight: '700', color: TXT, flex: 1, textAlign: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(30,27,46,0.08)' },
  scroll: { paddingHorizontal: P + 4, paddingTop: 18 },
  updated: { fontSize: 12, color: TXTSUB, fontStyle: 'italic', marginBottom: 16 },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 23,
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
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: ROSE,
    marginTop: 9, marginRight: 12,
  },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 23, color: TXT },
});
