import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import Glass from '../components/shared/Glass';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { SAVED_VERSES } from '../constants/data';

function SmallFlame() {
  return (
    <Svg width={18} height={20} viewBox="0 0 100 110">
      <Path
        d="M50 5 C 38 28, 22 38, 22 62 C 22 83, 35 100, 50 100 C 65 100, 78 83, 78 62 C 78 48, 70 42, 70 42 C 70 50, 62 55, 58 52 C 60 38, 56 22, 50 5 Z"
        fill="#FF7043"
      />
      <Path
        d="M50 50 C 44 60, 40 68, 40 80 C 40 90, 45 96, 50 96 C 55 96, 60 90, 60 80 C 60 68, 56 60, 50 50 Z"
        fill="rgba(255,220,180,0.7)"
      />
    </Svg>
  );
}

function FlowerIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C10 5 7 6 7 9C7 11.5 9.2 13.5 12 13.5C14.8 13.5 17 11.5 17 9C17 6 14 5 12 2Z" fill={color} opacity={0.85} />
      <Path d="M12 22C10 19 7 18 7 15C7 12.5 9.2 10.5 12 10.5C14.8 10.5 17 12.5 17 15C17 18 14 19 12 22Z" fill={color} opacity={0.85} />
      <Path d="M2 12C5 10 6 7 9 7C11.5 7 13.5 9.2 13.5 12C13.5 14.8 11.5 17 9 17C6 17 5 14 2 12Z" fill={color} opacity={0.85} />
      <Path d="M22 12C19 10 18 7 15 7C12.5 7 10.5 9.2 10.5 12C10.5 14.8 12.5 17 15 17C18 17 19 14 22 12Z" fill={color} opacity={0.85} />
      <Path d="M12 15C13.657 15 15 13.657 15 12C15 10.343 13.657 9 12 9C10.343 9 9 10.343 9 12C9 13.657 10.343 15 12 15Z" fill={color} />
    </Svg>
  );
}

const SETTING_ICONS: Record<string, string> = {
  'Edit profile': 'user',
  'Notifications': 'bell',
  'Appearance': 'sun',
  'Privacy': 'lock',
  'Help & support': 'help-circle',
  'Share Her Bible': 'share-2',
};

function SettingRow({ label, danger, isLast }: { label: string; danger?: boolean; isLast?: boolean }) {
  const iconName = danger ? 'log-out' : (SETTING_ICONS[label] || 'chevron-right');
  return (
    <View style={[styles.settingRow, !isLast && styles.settingBorder]}>
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Feather name={iconName as any} size={15} color={danger ? '#C84444' : TXT} />
      </View>
      <Text style={[styles.settingLabel, danger && { color: '#C84444' }]}>{label}</Text>
      {!danger && <Feather name="chevron-right" size={16} color={TXTSUB} />}
    </View>
  );
}

export default function ProfileScreen() {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {/* Hero */}
      <View style={styles.hero}>
        <LinearGradient colors={['#F9A8C9', '#E8619A']} style={styles.avatar}>
          <Text style={styles.avatarText}>S</Text>
        </LinearGradient>
        <Text style={styles.name}>Sarah</Text>
        <Text style={styles.email}>sarah@email.com</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { n: '12', label: 'Day Streak' },
          { n: '38', label: 'Days Read' },
          { n: '9', label: 'Saved' },
        ].map((s, i) => (
          <Glass key={i} style={styles.statCard}>
            <View style={styles.statIconWrap}>
              {i === 0 ? <SmallFlame /> : i === 1
                ? <Feather name="book-open" size={18} color={ROSE} />
                : <FlowerIcon color={ROSE} />
              }
            </View>
            <Text style={styles.statNum}>{s.n}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Glass>
        ))}
      </View>

      {/* My Library */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Library</Text>
        <TouchableOpacity style={styles.seeAllRow}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all</Text>
          <Feather name="chevron-right" size={13} color={ROSE} />
        </TouchableOpacity>
      </View>
      <View style={styles.libRow}>
        {[
          { label: 'Highlights', count: '24 verses', ac: ROSE, icon: 'edit-2' },
          { label: 'Notes', count: '8 entries', ac: LAV, icon: 'file-text' },
          { label: 'Bookmarks', count: '12 saved', ac: '#F4B860', icon: 'bookmark' },
        ].map((t, i) => (
          <TouchableOpacity key={i} style={styles.libTile} activeOpacity={0.8}>
            <View style={[styles.libIcon, { backgroundColor: `${t.ac}1A` }]}>
              <Feather name={t.icon as any} size={18} color={t.ac} />
            </View>
            <Text style={styles.libLabel}>{t.label}</Text>
            <Text style={styles.libCount}>{t.count}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Faith Journey */}
      <Text style={[styles.sectionTitle, { marginBottom: 11 }]}>Faith Journey</Text>
      <Glass style={styles.journeyCard}>
        <View style={styles.journeyInner}>
          <LinearGradient colors={[`${ROSE}25`, `${LAV}25`]} style={styles.journeyIcon}>
            <Feather name="book" size={22} color={ROSE} />
          </LinearGradient>
          <View style={styles.journeyMeta}>
            <Text style={styles.journeyTitle}>Through the Bible</Text>
            <View style={styles.journeyTrack}>
              <LinearGradient
                colors={[ROSE, LAV]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.journeyFill}
              />
            </View>
            <Text style={styles.journeySub}>5 of 66 books · 8% complete</Text>
          </View>
          <Feather name="chevron-right" size={16} color={TXTSUB} />
        </View>
      </Glass>

      {/* Saved Verses */}
      <View style={[styles.sectionHeader, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>Saved Verses</Text>
        <TouchableOpacity style={styles.seeAllRow}>
          <Text style={[styles.seeAll, { color: ROSE }]}>See all</Text>
          <Feather name="chevron-right" size={13} color={ROSE} />
        </TouchableOpacity>
      </View>
      {SAVED_VERSES.slice(0, 2).map((v, i) => (
        <TouchableOpacity key={i} style={styles.savedVerse} activeOpacity={0.85}>
          <Text style={styles.savedRef}>{v.ref}</Text>
          <Text style={styles.savedText}>{v.text}</Text>
        </TouchableOpacity>
      ))}

      {/* Account */}
      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 11 }]}>Account</Text>
      <Glass style={styles.settingsCard}>
        <SettingRow label="Edit profile" />
        <SettingRow label="Notifications" />
        <SettingRow label="Appearance" />
        <SettingRow label="Privacy" />
        <SettingRow label="Help & support" />
        <SettingRow label="Share Her Bible" isLast />
      </Glass>

      <Glass style={[styles.settingsCard, { marginTop: 14 }]}>
        <SettingRow label="Sign out" danger isLast />
      </Glass>

      <Text style={styles.version}>Her Bible · v1.0.0</Text>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: P, paddingTop: 0, paddingBottom: 24 },
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 18 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 30, fontWeight: '600', color: '#fff' },
  name: { fontSize: 22, fontWeight: '500', color: TXT, marginBottom: 3 },
  email: { fontSize: 12.5, color: TXTSUB },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: { flex: 1, padding: 14, paddingHorizontal: 10, alignItems: 'center' },
  statIconWrap: { marginBottom: 4, height: 22, alignItems: 'center', justifyContent: 'center' },
  statNum: { fontSize: 20, fontWeight: '700', color: TXT, marginBottom: 2 },
  statLabel: { fontSize: 11, color: TXTSUB },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 11,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: TXT },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll: { fontSize: 12, fontWeight: '600' },
  libRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  libTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14, padding: 14, paddingHorizontal: 10, alignItems: 'center',
  },
  libIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  libLabel: { fontSize: 13, fontWeight: '600', color: TXT, marginBottom: 2 },
  libCount: { fontSize: 11, color: TXTSUB, fontWeight: '500' },
  journeyCard: { marginBottom: 0, padding: 0, overflow: 'hidden' },
  journeyInner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, padding: 16, paddingHorizontal: 14,
  },
  journeyIcon: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  journeyMeta: { flex: 1, minWidth: 0 },
  journeyTitle: { fontSize: 14.5, fontWeight: '600', color: TXT, marginBottom: 4 },
  journeyTrack: {
    height: 5, borderRadius: 5,
    backgroundColor: 'rgba(30,27,46,0.07)', overflow: 'hidden', marginBottom: 5,
  },
  journeyFill: { height: '100%', width: '8%', borderRadius: 5 },
  journeySub: { fontSize: 11.5, color: TXTSUB },
  savedVerse: {
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12, marginBottom: 9,
  },
  savedRef: { fontSize: 11, color: ROSE, fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  savedText: { fontSize: 14.5, fontStyle: 'italic', color: 'rgba(30,27,46,0.72)', lineHeight: 22 },
  settingsCard: { overflow: 'hidden', padding: 0 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, paddingHorizontal: 16, paddingVertical: 13,
  },
  settingBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(30,27,46,0.05)' },
  settingIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(30,27,46,0.04)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  settingIconDanger: { backgroundColor: 'rgba(216,82,82,0.10)' },
  settingLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: TXT },
  version: { fontSize: 11, color: TXTSUB, textAlign: 'center', marginTop: 18, opacity: 0.7 },
});
