import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ROSE, TXT, TXTSUB, FONTS } from '../../constants/theme';
import { useT } from '../../i18n/useT';

// The Explore tab's search field. Always visible at the top of Explore (owner
// 2026-08-09 chose a persistent field over a magnifier + overlay), so it is a
// plain row in the page's scroll — this screen pins nothing.
//
// Chrome follows the two search surfaces the app already has: the ink-wash pill
// and x-circle clear from Profile's sheet search, the ROSE "Cancel" text link
// from the Bible reader's search bar. `Cancel` only appears while searching, so
// the browse state stays visually quiet.
//
// It does NOT own the query — PlanScreen does, because the query decides whether
// the page renders the browse layout or results.

export default function PlanSearchField({
  value, onChangeText, onFocus, onBlur, onSubmit, active, onCancel, disabled, inputRef,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** The keyboard's Search key. Must be the caller's blurSearch, never a bare
   *  Keyboard.dismiss — see the note at the call site. */
  onSubmit: () => void;
  /** Searching (focused or non-empty) — reveals Cancel. */
  active: boolean;
  onCancel: () => void;
  /** True while a guide is running; see PlanScreen. */
  disabled?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const t = useT();
  return (
    <View style={styles.row}>
      <View style={[styles.pill, disabled && styles.pillDisabled]}>
        <Feather name="search" size={18} color={TXTSUB} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          editable={!disabled}
          placeholder={t('planSearch.placeholder')}
          placeholderTextColor={TXTSUB}
          style={styles.input}
          returnKeyType="search"
          // NOT Keyboard.dismiss — §6b rule 2, which this file's own feature wrote:
          // a bare dismiss hides the keyboard on Android while the input KEEPS
          // focus, so onBlur never fires and `searchFocused` stops matching
          // reality. It gates useSheetSurface, so a lie there holds the global
          // sheetDepth and silences every blocking prompt while she is just
          // reading results. Every other exit already routes through blurSearch;
          // the keyboard's own Search key was the one that did not.
          onSubmitEditing={onSubmit}
          autoCorrect={false}
          autoCapitalize="none"
          // Longest plan title in the catalog is 66 characters; past that she is
          // not searching.
          maxLength={64}
          // We draw our own clear button so it looks the same on both platforms.
          clearButtonMode="never"
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={t('planSearch.placeholder')}
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('planSearch.clear')}
          >
            <Feather name="x-circle" size={17} color={TXTSUB} />
          </TouchableOpacity>
        )}
      </View>
      {active && (
        <TouchableOpacity onPress={onCancel} hitSlop={8} style={styles.cancelBtn}>
          {/* Capped: German "Abbrechen" at max Dynamic Type would squeeze the
              flex:1 pill beside it down to a sliver. */}
          <Text style={styles.cancelText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  // flex, never a width — this row sits inside the page's horizontal padding.
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,                 // minHeight, not height: at max Dynamic Type a
    paddingVertical: 6,            // fixed 44 clips the input against the pill
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(30,27,46,0.05)',
  },
  pillDisabled: { opacity: 0.45 },
  // `padding: 0` matters on Android, where TextInput ships its own vertical
  // padding and would otherwise sit off-centre in a fixed-height pill.
  input: { flex: 1, minWidth: 0, fontSize: 16, fontFamily: FONTS.lato, color: TXT, padding: 0 },
  cancelBtn: { paddingLeft: 12 },
  cancelText: { fontSize: 15.5, fontWeight: '700', fontFamily: FONTS.latoBold, color: ROSE },
});
