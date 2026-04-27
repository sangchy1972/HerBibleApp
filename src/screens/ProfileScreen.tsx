import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Glass from '../components/shared/Glass';
import { ROSE, LAV, TXT, TXTSUB, P } from '../constants/theme';
import { SAVED_VERSES } from '../constants/data';

function SettingRow({ label, danger, isLast }: { label: string; danger?: boolean; isLast?: boolean }) {
  return (
    <View style={[styles.settingRow, !isLast && styles.settingBorder]}>
      <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
        <Text style={{ fontSize: 14 }}>{danger ? '🚪' : '→'}</Text>
      </View>
      <Text style={[styles.settingLabel, danger && { color: '#C84444' }]}>{label}</Text>
      {!danger && <Text style={{ color: TXTSUB, fontSize: 14 }}>›</Text>}
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
          { n: '12', label: 'Day Streak', icon: '🔥' },
          { n: '38', label: 'Days Read', icon: '📖' },
          { n: '9', label: 'Saved', icon: '🌸' },
        ].map((s, i) => (
          <Glass key={i} style={styles.statCard}>
            <Text style={styles.statIcon}>{s.icon}</Text>
            <Text style={styles.statNum}>{s.n}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Glass>
        ))}
      </View>

      {/* My Library */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Library</Text>
        <Text style={[styles.seeAll, { color: ROSE }]}>See all →</Text>
      </View>
      <View style={styles.libRow}>
        {[
          { label: 'Highlights', count: '24 verses', ac: ROSE },
          { label: 'Notes', count: '8 entries', ac: LAV },
          { label: 'Bookmarks', count: '12 saved', ac: '#F4B860' },
        ].map((t, i) => (
          <TouchableOpacity key={i} style={styles.libTile} activeOpacity={0.8}>
            <View style={[styles.libIcon, { backgroundColor: `${t.ac}1A` }]}>
              <Text style={{ fontSize: 18 }}>{i === 0 ? '✏' : i === 1 ? '📄' : '🔖'}</Text>
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
          <LinearGradient
            colors={[`${ROSE}25`, `${LAV}25`]}
            style={styles.journeyIcon}
          >
            <Text style={{ fontSize: 22 }}>📚</Text>
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
          <Text style={{ color: TXTSUB, fontSize: 14 }}>›</Text>
        </View>
      </Glass>

      {/* Saved Verses */}
      <View style={[styles.sectionHeader, { marginTop: 22 }]}>
        <Text style={styles.sectionTitle}>Saved Verses</Text>
        <Text style={[styles.seeAll, { color: ROSE }]}>See all →</Text>
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
  scroll: {
    paddingHorizontal: P,
    paddingTop: 0,
    paddingBottom: 24,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 18,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 30, fontWeight: '600', color: '#fff' },
  name: { fontSize: 22, fontWeight: '500', color: TXT, marginBottom: 3 },
  email: { fontSize: 12.5, color: TXTSUB },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  statCard: {
    flex: 1,
    padding: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statNum: { fontSize: 20, fontWeight: '700', color: TXT, marginBottom: 2 },
  statLabel: { fontSize: 11, color: TXTSUB },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 11,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: TXT },
  seeAll: { fontSize: 12, fontWeight: '600' },
  libRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  libTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    padding: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  libIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  libLabel: { fontSize: 13, fontWeight: '600', color: TXT, marginBottom: 2 },
  libCount: { fontSize: 11, color: TXTSUB, fontWeight: '500' },
  journeyCard: {
    marginBottom: 0,
    padding: 0,
    overflow: 'hidden',
  },
  journeyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    paddingHorizontal: 14,
  },
  journeyIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  journeyMeta: { flex: 1, minWidth: 0 },
  journeyTitle: { fontSize: 14.5, fontWeight: '600', color: TXT, marginBottom: 4 },
  journeyTrack: {
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(30,27,46,0.07)',
    overflow: 'hidden',
    marginBottom: 5,
  },
  journeyFill: {
    height: '100%',
    width: '8%',
    borderRadius: 5,
  },
  journeySub: { fontSize: 11.5, color: TXTSUB },
  savedVerse: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    marginBottom: 9,
  },
  savedRef: {
    fontSize: 11,
    color: ROSE,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  savedText: {
    fontSize: 14.5,
    fontStyle: 'italic',
    color: 'rgba(30,27,46,0.72)',
    lineHeight: 22,
  },
  settingsCard: {
    overflow: 'hidden',
    padding: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  settingBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,27,46,0.05)',
  },
  settingIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(30,27,46,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingIconDanger: {
    backgroundColor: 'rgba(216,82,82,0.10)',
  },
  settingLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: TXT },
  version: {
    fontSize: 11,
    color: TXTSUB,
    textAlign: 'center',
    marginTop: 18,
    opacity: 0.7,
  },
});
