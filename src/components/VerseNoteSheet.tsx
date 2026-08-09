import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Keyboard, Platform, Alert,
} from 'react-native';
import { useSheetSurface } from '../state/promptSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ROSE, TXT, TXTSUB, P, FONTS } from '../constants/theme';
import { useNotes, type Note } from '../state/NotesContext';
import { useT } from '../i18n/useT';

interface Props {
  verseRef: string;
  verseText: string;
  // When provided, the sheet opens in edit mode: prefilled with the note's
  // current text and Save routes to editNote instead of addNote.
  existingNote?: Note;
  onClose: () => void;
  onSaved?: () => void;
}

export default function VerseNoteSheet({ verseRef, verseText, existingNote, onClose, onSaved }: Props) {
  // These sheets live INSIDE their screen, but the root-mounted nudges are later
  // siblings of the navigator — so a nudge's zIndex 60 beats this sheet's 200 and
  // would land on top, orphaning it behind a second scrim. Claiming the surface
  // holds every blocking prompt back for as long as this is mounted.
  useSheetSurface(true);
  const insets = useSafeAreaInsets();
  const t = useT();
  const { addNote, editNote } = useNotes();
  const [text, setText] = useState(existingNote?.text ?? '');
  const isEdit = !!existingNote;

  // "dirty" = the Save button should do something. In create mode that's any
  // non-empty text; in edit mode the text must also actually differ from the
  // existing note (otherwise tapping Cancel shouldn't trigger the discard
  // prompt, and Save should be visually disabled).
  const trimmed = text.trim();
  const dirty = isEdit
    ? trimmed.length > 0 && trimmed !== existingNote!.text
    : trimmed.length > 0;

  const closeWithoutSave = () => {
    Keyboard.dismiss();
    onClose();
  };

  const save = () => {
    if (dirty) {
      if (isEdit) {
        editNote(existingNote!.id, text);
      } else {
        addNote(text, { ref: verseRef, text: verseText });
      }
      onSaved?.();
    }
    closeWithoutSave();
  };

  // Asks before discarding when there's unsaved text. Same prompt for backdrop
  // tap and swipe-down — anything that means "I want this sheet gone".
  const attemptDismiss = () => {
    if (!dirty) { closeWithoutSave(); return; }
    Alert.alert(
      t('verseNote.discard.title'),
      t('verseNote.discard.body'),
      [
        { text: t('verseNote.discard.discard'), style: 'destructive', onPress: closeWithoutSave },
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('verseNote.save'), onPress: save },
      ],
    );
  };

  // Swipe-down → attemptDismiss. Animate the sheet with the gesture so it
  // feels physical, then snap back / hand off based on threshold.
  // Seeded off-screen so the SAME value drives the entrance and the swipe-down
  // pan — no second transform to fight it. `entering=` was banned here for the
  // usual reason (§2 rule 2): this sheet is mounted inside an RN <Modal> by
  // PlanDayWalk, and a dropped animation left a colourless alpha-1 absolute-fill
  // root in a native window with the sheet off-screen and the dismiss target
  // inside an opacity-0 subtree.
  const dragY = useSharedValue(SHEET_TRAVEL);
  const dim = useSharedValue(0);
  useEffect(() => {
    dim.value = withTiming(1, { duration: 300 });
    dragY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    const wd = setTimeout(() => { dim.value = 1; dragY.value = 0; }, 900);
    return () => clearTimeout(wd);
  }, [dim, dragY]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate((e) => { 'worklet'; if (e.translationY > 0) dragY.value = e.translationY; })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 800) {
        dragY.value = withTiming(0, { duration: 220 });   // snap visually back
        runOnJS(attemptDismiss)();
      } else {
        dragY.value = withTiming(0, { duration: 220 });
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }, dimStyle]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={attemptDismiss} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, sheetStyle]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.inner, { paddingBottom: insets.bottom + 16 }]}
          >
            {/* Tapping the static area dismisses the keyboard but keeps the sheet open. */}
            <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss}>
              <View style={styles.handle} />
              <View style={styles.header}>
                <TouchableOpacity onPress={attemptDismiss} hitSlop={10}>
                  <Text style={styles.cancel}>{t('verseNote.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{isEdit ? t('verseNote.title.edit') : t('verseNote.title.new')}</Text>
                <TouchableOpacity onPress={save} hitSlop={10}>
                  <Text style={[styles.saveBtn, !dirty && { color: 'rgba(230,63,105,0.45)' }]}>{t('verseNote.save')}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.versePreview}>
                <Text style={styles.verseRef}>{verseRef}</Text>
                <Text style={styles.verseText}>{verseText}</Text>
              </View>
            </TouchableOpacity>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('verseNote.placeholder')}
              placeholderTextColor={TXTSUB}
              multiline
              autoFocus
              textAlignVertical="top"
              style={styles.input}
            />
          </KeyboardAvoidingView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Entrance travel — generous; it only has to start off-screen.
const SHEET_TRAVEL = 900;

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 200 },
  sheet: {
    height: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    paddingHorizontal: P + 4,
    paddingTop: 6,
  },
  handle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
    marginVertical: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '600', color: TXT, fontFamily: FONTS.loraBold },                                  // Lora 600 per user
  cancel: { fontSize: 17, color: TXTSUB, fontWeight: '500' },                   // +10%
  saveBtn: { fontSize: 17, color: ROSE, fontWeight: '700' },                    // +10%
  versePreview: {
    backgroundColor: 'rgba(230,63,105,0.06)',
    borderRadius: 18.2,                                                          // 14 → 18.2 (+30 % card radius per user)
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  verseRef: {
    fontSize: 13,                                                                // +10% (12 → 13)
    fontWeight: '700',
    color: ROSE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  verseText: {
    fontSize: 16.2,                                                              // 18 → 16.2 (-10 % per user)
    lineHeight: 26,
    color: TXT,
    fontWeight: '500',
    fontFamily: FONTS.merriweather,                                              // Merriweather per user — matches the Bible reader's verse face
  },
  input: {
    flex: 1,
    fontSize: 18.05,                                                             // 19 → 18.05 (-5 % per user)
    lineHeight: 28,
    color: TXT,
    backgroundColor: 'rgba(30,27,46,0.04)',
    borderRadius: 14,
    padding: 16,
    textAlignVertical: 'top',
    fontFamily: FONTS.lato, letterSpacing: 0.4,                                                      // Lato Regular for the input + placeholder per user
  },
});
