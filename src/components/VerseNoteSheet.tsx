import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Keyboard, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, SlideInDown, Easing,
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ROSE, TXT, TXTSUB, P } from '../constants/theme';
import { useNotes, type Note } from '../state/NotesContext';

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
  const insets = useSafeAreaInsets();
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
      'Save your note?',
      'You\'ve started writing. Save it before closing?',
      [
        { text: 'Discard', style: 'destructive', onPress: closeWithoutSave },
        { text: 'Cancel',  style: 'cancel' },
        { text: 'Save',    onPress: save },
      ],
    );
  };

  // Swipe-down → attemptDismiss. Animate the sheet with the gesture so it
  // feels physical, then snap back / hand off based on threshold.
  const dragY = useSharedValue(0);
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
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={attemptDismiss} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SlideInDown.duration(500).delay(100).easing(Easing.out(Easing.cubic))}
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
                  <Text style={styles.cancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{isEdit ? 'Edit note' : 'Note'}</Text>
                <TouchableOpacity onPress={save} hitSlop={10}>
                  <Text style={[styles.saveBtn, !dirty && { color: 'rgba(232,97,154,0.45)' }]}>Save</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.versePreview}>
                <Text style={styles.verseRef}>{verseRef}</Text>
                <Text style={styles.verseText}>"{verseText}"</Text>
              </View>
            </TouchableOpacity>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write your thoughts about this verse…"
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
  title: { fontSize: 19, fontWeight: '700', color: TXT },                       // +10%
  cancel: { fontSize: 17, color: TXTSUB, fontWeight: '500' },                   // +10%
  saveBtn: { fontSize: 17, color: ROSE, fontWeight: '700' },                    // +10%
  versePreview: {
    backgroundColor: 'rgba(232,97,154,0.06)',
    borderRadius: 14,
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
    fontSize: 18,                                                                // +10%
    lineHeight: 26,
    color: TXT,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    fontSize: 19,                                                                // +10%
    lineHeight: 28,
    color: TXT,
    backgroundColor: 'rgba(30,27,46,0.04)',
    borderRadius: 14,
    padding: 16,
    textAlignVertical: 'top',
  },
});
