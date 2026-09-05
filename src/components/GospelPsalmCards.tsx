import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { CARD_RADIUS, FONTS } from '../constants/theme';
import { useGospelsPsalms, type Slot } from '../state/GospelsPsalmsContext';
import { useTranslation } from '../state/TranslationsContext';
import { localizeBookName } from '../constants/bibleBookNames';
import { gpGospelHeroUrl, gpPsalmHeroUrl } from '../constants/gpHeroImages';
import { useT } from '../i18n/useT';

// Home-screen entry for the 89-day Gospels & Psalms plan — the TouchPoint-style
// banner redesign (owner 2026-09-06, from his reference screenshot): each slot
// is a FULL-BLEED photo card — the day's chapter art edge to edge, a dark
// legibility scrim, a small eyebrow line up top ("Gospel & Psalm · Morning"),
// and the day's reading references big in the middle. The old glyph-tile rows
// and the outer section title are gone; the eyebrow IS the section identity,
// the same way the verse hero and the reference TouchPoint card carry theirs.
//
// Layout stability rules carried over from the previous incarnation: the real
// structure renders from the FIRST frame (subtitles blank to a space while the
// store hydrates) so nothing below ever shifts and Android touch regions never
// go stale (see the 2026-08 frozen-touch-region incident).
const GREEN = '#3FAE6A';
const CARD_H = 160;

function SlotBanner({ slot, done, eyebrow, reading, art, onPress }: {
  slot: Slot; done: boolean; eyebrow: string; reading: string; art: string | null; onPress: () => void;
}) {
  const t = useT();
  // Art failure (offline first run, CDN hiccup) falls back to the slot-tinted
  // gradient underneath; reset when the day rolls and the url changes.
  const [artBroken, setArtBroken] = useState(false);
  useEffect(() => { setArtBroken(false); }, [art]);
  const fallback = slot === 'morning'
    ? (['#F6B5D0', '#B85C82'] as const)
    : (['#B9AEE0', '#4F3F82'] as const);
  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.88}>
      {/* Slot-tinted floor — always painted, covers art loading/failure. */}
      <LinearGradient colors={fallback} style={StyleSheet.absoluteFillObject} />
      {art != null && !artBroken && (
        <Image
          source={{ uri: art }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setArtBroken(true)}
        />
      )}
      {/* Dark scrim so the white copy reads over any painting (owner spec). */}
      <LinearGradient
        colors={['rgba(10,10,18,0.42)', 'rgba(10,10,18,0.22)', 'rgba(10,10,18,0.48)']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.bannerContent}>
        <View style={styles.eyebrowRow}>
          <Feather name={slot === 'morning' ? 'sunrise' : 'moon'} size={14} color="rgba(255,255,255,0.92)" />
          <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
        </View>
        <Text style={styles.reading} numberOfLines={2}>{reading}</Text>
        <View style={styles.footRow}>
          {done ? (
            <>
              <Feather name="check-circle" size={15} color={GREEN} />
              <Text style={styles.footDone}>{t('gp.slotComplete')}</Text>
            </>
          ) : (
            <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.85)" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function GospelPsalmCards({ onOpen }: { onOpen: (slot: Slot) => void }) {
  const t = useT();
  const { current: translation } = useTranslation();
  const { ready, morning, evening, planComplete } = useGospelsPsalms();

  const gospelBook = localizeBookName(translation.code, morning.today.gospel.bookSlug, morning.today.gospel.bookName);
  const psalmBook = localizeBookName(translation.code, 'psalms', 'Psalms');
  const mReading = !ready ? ' '
    : `${gospelBook} ${morning.today.gospel.chapter} · ${psalmBook} ${morning.today.morningPsalm.chapter}`;
  const eReading = !ready ? ' '
    : `${psalmBook} ${evening.today.eveningPsalm.chapter}`;

  return (
    <View>
      {ready && planComplete && <Text style={styles.completeNote}>{t('gp.planComplete')}</Text>}
      <SlotBanner
        slot="morning"
        done={ready && (morning.doneToday || morning.complete)}
        eyebrow={`${t('gp.section')} · ${t('gp.morning')}`}
        reading={mReading}
        art={ready ? gpGospelHeroUrl(morning.today.gospel) : null}
        onPress={() => onOpen('morning')}
      />
      <SlotBanner
        slot="evening"
        done={ready && (evening.doneToday || evening.complete)}
        eyebrow={`${t('gp.section')} · ${t('gp.evening')}`}
        reading={eReading}
        art={ready ? gpPsalmHeroUrl(evening.today.eveningPsalm) : null}
        onPress={() => onOpen('evening')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  completeNote: { fontSize: 12.5, color: GREEN, fontFamily: FONTS.latoBold, letterSpacing: 0.4, marginBottom: 2 },
  banner: {
    height: CARD_H, borderRadius: CARD_RADIUS, overflow: 'hidden', marginTop: 12,
  },
  bannerContent: { flex: 1, padding: 16, justifyContent: 'space-between' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: {
    fontSize: 12.5, color: 'rgba(255,255,255,0.92)', fontFamily: FONTS.latoBold,
    fontWeight: '700', letterSpacing: 0.8, flexShrink: 1,
  },
  // The day's reading, front and centre (owner: "写在中间").
  reading: {
    fontSize: 22, fontWeight: '600', color: '#FFFFFF', fontFamily: FONTS.loraBold,
    lineHeight: 29,
  },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footDone: { fontSize: 13, color: '#DFF5E7', fontFamily: FONTS.latoBold, fontWeight: '700', letterSpacing: 0.3 },
});
