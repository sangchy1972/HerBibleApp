import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { ROSE, LAV, TXT, TXTSUB } from '../constants/theme';
import { FLOW_DATA } from '../constants/data';

const { width, height } = Dimensions.get('window');
const PHONE_HEIGHT = 844;

interface PrayerFlowProps {
  morning: boolean;
  visible: boolean;
  onComplete: () => void;
  onClose: () => void;
}

function TimePickerSheet({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  const hours = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  const minutes = [0, 15, 30, 45];

  const Wheel = ({ values, value, onChange, format }: {
    values: any[];
    value: any;
    onChange: (v: any) => void;
    format?: (v: any) => string;
  }) => {
    const idx = values.indexOf(value);
    const items = [
      values[(idx - 1 + values.length) % values.length],
      values[idx],
      values[(idx + 1) % values.length],
    ];
    return (
      <View style={{ flex: 1, alignItems: 'center' }}>
        {items.map((v, i) => (
          <TouchableOpacity key={i} onPress={() => i !== 1 && onChange(v)} style={styles.wheelItem}>
            <Text style={[styles.wheelText, i === 1 ? styles.wheelActive : styles.wheelInactive]}>
              {format ? format(v) : String(v)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>What time do you want to be reminded?</Text>
      <View style={styles.wheelRow}>
        <Wheel values={hours} value={hour} onChange={setHour} />
        <Text style={styles.wheelColon}>:</Text>
        <Wheel values={minutes} value={minute} onChange={setMinute}
          format={v => String(v).padStart(2, '0')} />
        <Wheel values={['AM', 'PM']} value={ampm} onChange={setAmpm} />
      </View>
      <View style={styles.sheetBtns}>
        <TouchableOpacity onPress={onClose} style={styles.sheetBtnBack}>
          <Text style={[styles.sheetBtnText, { color: TXTSUB }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfirm} style={[styles.sheetBtnConfirm, { backgroundColor: ROSE }]}>
          <Text style={[styles.sheetBtnText, { color: '#fff', fontWeight: '700' }]}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PrayerFlow({ morning, visible, onComplete, onClose }: PrayerFlowProps) {
  const data = morning ? FLOW_DATA.morning : FLOW_DATA.evening;
  const colors = morning
    ? (['#C2547A', '#7B2255', '#2D0A1A'] as const)
    : (['#5B3A9E', '#2D1660', '#100525'] as const);
  const [page, setPage] = useState(0);
  const [amened, setAmened] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const SECTIONS = ['verse', 'meditation', 'action', 'prayer'];

  // Slide-up entrance animation
  const slideY = useRef(new Animated.Value(PHONE_HEIGHT)).current;
  useEffect(() => {
    if (visible) {
      slideY.setValue(PHONE_HEIGHT);
      Animated.spring(slideY, {
        toValue: 0,
        tension: 62,
        friction: 12,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Amen screen animations
  const amenFade = useRef(new Animated.Value(0)).current;
  const amenHandsY = useRef(new Animated.Value(40)).current;
  const farewell1 = useRef(new Animated.Value(0)).current;
  const farewell2 = useRef(new Animated.Value(0)).current;
  const farewell3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (amened) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(amenFade, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(amenHandsY, { toValue: 0, tension: 55, friction: 10, useNativeDriver: true }),
        ]),
        Animated.stagger(160, [
          Animated.timing(farewell1, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(farewell2, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(farewell3, { toValue: 1, duration: 420, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [amened]);

  // Sheet slide-up
  const sheetY = useRef(new Animated.Value(300)).current;
  useEffect(() => {
    if (showSheet) {
      sheetY.setValue(300);
      Animated.spring(sheetY, {
        toValue: 0,
        tension: 65,
        friction: 12,
        useNativeDriver: true,
      }).start();
    }
  }, [showSheet]);

  const handleScroll = (e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / height);
    if (idx !== page) setPage(idx);
  };

  const handleAmen = () => {
    setAmened(true);
    setTimeout(() => setShowSheet(true), 2200);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setTimeout(() => {
      onComplete();
      setAmened(false);
      setPage(0);
      amenFade.setValue(0);
      amenHandsY.setValue(40);
      farewell1.setValue(0);
      farewell2.setValue(0);
      farewell3.setValue(0);
    }, 280);
  };

  const makeFarewell = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, StyleSheet.absoluteFillObject, { transform: [{ translateY: slideY }] }]}>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFillObject} />

      {/* Top chrome */}
      {!amened && (
        <View style={styles.topChrome}>
          <TouchableOpacity onPress={onClose} style={styles.chromeBtn}>
            <Feather name="x" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.chromeBtn}>
            <Feather name="music" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Progress indicator */}
      {!amened && (
        <View style={styles.progressDots}>
          {SECTIONS.map((_, i) => (
            <View key={i} style={[
              styles.dot,
              { backgroundColor: i <= page ? '#fff' : 'rgba(255,255,255,0.35)' },
              i === page && styles.dotActive,
            ]} />
          ))}
          <Text style={styles.pageCount}>{page + 1} / {SECTIONS.length}</Text>
        </View>
      )}

      {/* Pages */}
      {!amened && (
        <ScrollView
          ref={scrollRef}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={StyleSheet.absoluteFillObject}
        >
          {/* Page 1 — Verse */}
          <View style={[styles.flowPage, { height }]}>
            <View style={styles.pageContent}>
              <Text style={styles.pageCaption}>{data.verse.label.toUpperCase()}</Text>
              <Text style={styles.pageRef}>{data.verse.ref}</Text>
              <Text style={styles.pageVerse}>"{data.verse.text}"</Text>
            </View>
          </View>

          {/* Page 2 — Meditation */}
          <View style={[styles.flowPage, { height }]}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <View style={styles.pageContent}>
                <Text style={styles.pageCaption}>MEDITATION</Text>
                <Text style={styles.pageHeading}>{data.meditation.title}</Text>
                {data.meditation.body.split('\n\n').map((p, i) => (
                  <Text key={i} style={styles.pageBody}>{p}</Text>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Page 3 — Action */}
          <View style={[styles.flowPage, { height }]}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <View style={styles.pageContent}>
                <Text style={styles.pageCaption}>ACTION STEP</Text>
                <Text style={styles.pageHeading}>{data.action.title}</Text>
                <Text style={styles.pageBody}>{data.action.body}</Text>
                <TouchableOpacity style={styles.reflectBtn}>
                  <Feather name="edit-2" size={16} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.reflectText}>Write a reflection</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>

          {/* Page 4 — Prayer */}
          <View style={[styles.flowPage, { height }]}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.pageScroll}>
              <View style={styles.pageContent}>
                <Text style={styles.pageCaption}>PRAYER</Text>
                <Text style={styles.pageHeading}>{data.prayer.title}</Text>
                <Text style={[styles.pageBody, { fontStyle: 'italic' }]}>{data.prayer.body}</Text>
                <TouchableOpacity onPress={handleAmen} style={styles.amenBtn}>
                  <Text style={[styles.amenText, { color: morning ? '#7B2255' : '#2D1660' }]}>Amen</Text>
                </TouchableOpacity>
                <Text style={styles.prayedCount}>187,881 prayed with you today</Text>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {/* Amen closing screen */}
      {amened && (
        <Animated.View style={[styles.amenScreen, { opacity: amenFade }]}>
          <TouchableOpacity onPress={onClose} style={[styles.chromeBtn, { position: 'absolute', top: 58, left: 18 }]}>
            <Feather name="x" size={16} color="#fff" />
          </TouchableOpacity>
          <Animated.View style={[styles.amenHands, { transform: [{ translateY: amenHandsY }] }]}>
            <FontAwesome5 name="praying-hands" size={80} color="rgba(255,255,255,0.92)" />
          </Animated.View>
          <Text style={styles.amenCaption}>CLOSING</Text>
          <Text style={styles.amenHeading}>
            We hope this prayer time encouraged you. Come back again soon.
          </Text>
          <Animated.Text style={[styles.amenFarewell, makeFarewell(farewell1)]}>In Jesus' name</Animated.Text>
          <Animated.Text style={[styles.amenFarewell, makeFarewell(farewell2)]}>Thank you, Lord</Animated.Text>
          <Animated.Text style={[styles.amenFarewell, makeFarewell(farewell3)]}>Bless us, O Lord</Animated.Text>
        </Animated.View>
      )}

      {/* Notification sheet */}
      {showSheet && (
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => !showTimePicker && handleSheetClose()}
        >
          <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
            {!showTimePicker ? (
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetHeading}>Make Prayer a Habit</Text>
                <Text style={styles.sheetDesc}>Get a daily reminder to spend time in prayer.</Text>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  style={[styles.setTimeBtn, { backgroundColor: 'rgba(232,97,154,0.10)' }]}
                >
                  <Text style={[styles.setTimeText, { color: ROSE }]}>Set Time</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSheetClose}>
                  <Text style={styles.notNowText}>Not now</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TimePickerSheet onConfirm={handleSheetClose} onClose={() => setShowTimePicker(false)} />
            )}
          </Animated.View>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { zIndex: 300 },
  topChrome: {
    position: 'absolute',
    top: 58, left: 18, right: 18,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chromeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressDots: {
    position: 'absolute', right: 22, bottom: 32,
    zIndex: 10, alignItems: 'center', gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 14, height: 14, borderRadius: 7 },
  pageCount: {
    marginTop: 10, fontSize: 9.5, letterSpacing: 1.4,
    fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase',
  },
  flowPage: { width, justifyContent: 'center' },
  pageScroll: { flex: 1 },
  pageContent: { paddingHorizontal: 26, paddingVertical: 100, justifyContent: 'center' },
  pageCaption: {
    fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginBottom: 8,
  },
  pageRef: {
    color: 'rgba(255,255,255,0.85)', fontWeight: '600',
    fontSize: 20, letterSpacing: 0.3, marginBottom: 26,
  },
  pageVerse: { fontSize: 20, lineHeight: 30, color: '#fff' },
  pageHeading: {
    fontSize: 22, fontWeight: '500', color: '#fff',
    lineHeight: 28, marginBottom: 18,
  },
  pageBody: {
    fontSize: 16, lineHeight: 27,
    color: 'rgba(255,255,255,0.88)', marginBottom: 16,
  },
  reflectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, padding: 12, paddingHorizontal: 18, marginTop: 10,
  },
  reflectText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  amenBtn: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 30, paddingVertical: 14,
    alignItems: 'center', marginTop: 32,
  },
  amenText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.8 },
  prayedCount: {
    fontSize: 11.5, color: 'rgba(255,255,255,0.55)',
    textAlign: 'center', marginTop: 14,
  },
  amenScreen: {
    flex: 1, paddingHorizontal: 28,
    paddingTop: 100, paddingBottom: 200, justifyContent: 'flex-end',
  },
  amenHands: { alignItems: 'center', marginBottom: 32 },
  amenCaption: {
    fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)', fontWeight: '600', marginBottom: 16,
  },
  amenHeading: {
    fontSize: 30, fontWeight: '600', color: '#fff',
    lineHeight: 36, marginBottom: 24,
  },
  amenFarewell: {
    fontSize: 18, fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)', lineHeight: 29,
  },
  sheetOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignSelf: 'center', marginBottom: 22,
  },
  sheetHeading: {
    textAlign: 'center', fontSize: 18, fontWeight: '700',
    color: TXT, marginBottom: 10,
  },
  sheetDesc: {
    textAlign: 'center', fontSize: 14, color: TXTSUB,
    lineHeight: 21, marginBottom: 22, paddingHorizontal: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: TXT, marginBottom: 18 },
  setTimeBtn: {
    alignSelf: 'center', paddingHorizontal: 38,
    paddingVertical: 13, borderRadius: 24, marginBottom: 14,
  },
  setTimeText: { fontSize: 15, fontWeight: '600' },
  notNowText: { textAlign: 'center', color: TXTSUB, fontSize: 14 },
  wheelRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginBottom: 8,
  },
  wheelItem: { paddingVertical: 8, alignItems: 'center' },
  wheelText: { fontSize: 18 },
  wheelActive: { fontSize: 24, fontWeight: '700', color: TXT },
  wheelInactive: { color: 'rgba(30,27,46,0.30)' },
  wheelColon: { fontSize: 22, fontWeight: '700', color: TXT },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 22 },
  sheetBtnBack: {
    flex: 1, paddingVertical: 13,
    backgroundColor: 'rgba(30,27,46,0.05)',
    borderRadius: 22, alignItems: 'center',
  },
  sheetBtnConfirm: { flex: 2, paddingVertical: 13, borderRadius: 22, alignItems: 'center' },
  sheetBtnText: { fontSize: 14, fontWeight: '600' },
});
