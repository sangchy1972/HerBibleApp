import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import MoodCalendar from '../components/MoodCalendar';
import { TXT, P } from '../constants/theme';
import type { RootStackScreenProps } from '../navigation/types';

export default function MoodCalendarScreen({ navigation }: RootStackScreenProps<'MoodCalendar'>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.closeBtn}>
          <Feather name="x" size={22} color={TXT} />
        </TouchableOpacity>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        <MoodCalendar />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F6' },
  topRow: { paddingHorizontal: P, paddingBottom: 4, alignItems: 'flex-end' },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  scroll: { paddingHorizontal: P + 2 },
});
