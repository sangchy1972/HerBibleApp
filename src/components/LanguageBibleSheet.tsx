import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSheetPan, SheetBackdrop } from './shared/sheetPan';
import { useSheetSurface } from '../state/promptSurface';
import { ROSE, TXT, TXTSUB, P, FONTS, GREEN_DONE, BTN_RADIUS } from '../constants/theme';
import { TRANSLATIONS, useTranslation } from '../state/TranslationsContext';
import { useUILanguage, UI_LANGUAGES, type UILanguageCode } from '../state/UILanguageContext';
import { getDownloadState, type DownloadState } from '../services/bibleService';
import { useT } from '../i18n/useT';

// The Language & Bible-versions sheet: UI language chips on top (the Bible
// version FOLLOWS the language), the single matching Bible edition below with
// its download status + pause/resume. Moved out of ProfileScreen 2026-08-22 —
// the "Bible versions" row now lives on Settings.
//
// `onToast` surfaces the "downloading in the background" notice; the host
// screen owns the toast chrome so the sheet stays self-contained.
export default function LanguageBibleSheet({ onClose, onToast }: {
  onClose: () => void;
  onToast?: (msg: string, ms?: number) => void;
}) {
  const t = useT();
  const pan = useSheetPan(onClose, true);
  // Register with the prompt-surface gate so a nudge can't ambush the sheet.
  useSheetSurface(true);
  const { lang: uiLang, meta: uiMeta, setLang: setUILang } = useUILanguage();
  const { current: currentTranslation, pending: dlPending, setTranslation, pauseDownload, resumeDownload } = useTranslation();
  const [langExpanded, setLangExpanded] = useState(true);

  // Committing a UI language. The Bible version FOLLOWS the UI language, so this
  // ALSO kicks off the matching Bible download (storage + mobile data). Only
  // reached after the user confirms in pickLanguage's dialog.
  const commitLanguage = (code: UILanguageCode) => {
    setUILang(code);
    const tr = TRANSLATIONS.find(x => x.code === code);
    if (!tr) return;
    setTranslation(code);
    if (dlStates[code]?.status !== 'complete' && code !== currentTranslation.code) {
      onToast?.(t('sheet.langBible.toast.bibleDownloading', { name: tr.nativeName }), 3800);
    }
  };

  // Picking a UI language. Switching the whole UI + downloading a second Bible
  // is heavy and (for the UI part) hard to undo if you land on a script you
  // can't read — so a stray or curious tap must NOT commit silently. We gate the
  // commit behind a confirmation dialog that renders in the CURRENT (pre-switch)
  // language, so it's always readable. Nothing changes until the user confirms.
  const [langConfirm, setLangConfirm] = useState<UILanguageCode | null>(null);
  const pickLanguage = (code: UILanguageCode) => {
    if (code === uiLang) return;
    if (!TRANSLATIONS.find(x => x.code === code)) return;
    setLangConfirm(code);
  };

  // Download status per translation — loaded once on mount so the version row
  // can show "Downloaded / available offline" without re-querying. Live
  // progress while a switch is downloading comes from the context's `pending`.
  const [dlStates, setDlStates] = useState<Record<string, DownloadState>>({});
  useEffect(() => {
    Promise.all(
      TRANSLATIONS.map(tr => getDownloadState(tr.code).then(s => [tr.code, s] as const))
    ).then(entries => setDlStates(Object.fromEntries(entries)));
  }, []);
  // Reflect a completed background download into dlStates so the row flips to
  // the "downloaded" state once the context finishes + clears `pending`.
  const prevPendingRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevPendingRef.current;
    if (prev && !dlPending) {
      getDownloadState(prev).then(s => setDlStates(p => ({ ...p, [prev]: s })));
    }
    prevPendingRef.current = dlPending?.code ?? null;
  }, [dlPending]);

  return (
    <>
      <View style={styles.overlay}>
        <SheetBackdrop onClose={onClose} />
        <GestureDetector gesture={pan.gesture}>
        {/* maxHeight 88% + inner ScrollView — without these the 7-row list
            renders taller than the screen and the handle gets pushed above
            the status bar where it can't be reached for swipe-dismiss.
            See feedback_sheet_swipe_dismiss.md. */}
        <Animated.View style={[styles.sheet, { maxHeight: '88%' }, pan.sheetStyle]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('sheet.langBible.title')}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>

            {/* Language section — collapsible. Drives UI strings (and via
                UILanguageContext, the plans CDN locale). When collapsed, only the
                header + current-language chip stay visible so the Bible-
                versions list below dominates the sheet. */}
            <TouchableOpacity
              style={styles.langSectionHeader}
              onPress={() => setLangExpanded(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.langSectionTitle}>{t('sheet.langBible.languageHeader')}</Text>
              <View style={styles.langSectionTrigger}>
                <Text style={styles.langSectionCurrent}>{uiMeta.nativeName}</Text>
                <Feather name={langExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={ROSE} />
              </View>
            </TouchableOpacity>

            {langExpanded && (
              <View style={styles.langChipGrid}>
                {UI_LANGUAGES.map(l => {
                  const active = l.code === uiLang;
                  return (
                    <TouchableOpacity
                      key={l.code}
                      style={[styles.langChip, active && styles.langChipActive]}
                      onPress={() => pickLanguage(l.code)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                        {l.nativeName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Bible version — there's exactly one: the edition for the
                selected UI language (the Bible follows the language). We show
                only that row instead of the whole list, with its download
                status + a pause/resume control so the user can stop the
                background download on mobile data and resume on Wi-Fi. */}
            <Text style={styles.bibleSubHeader}>{t('sheet.langBible.versionsHeader')}</Text>

            {(() => {
              const tr = TRANSLATIONS.find(x => x.code === uiLang) ?? currentTranslation;
              const isPending = dlPending?.code === tr.code;
              const isPaused = !!(isPending && dlPending?.paused);
              const pct = isPending && dlPending && dlPending.total > 0
                ? Math.floor((dlPending.fetched / dlPending.total) * 100) : 0;
              const downloaded = !isPending && dlStates[tr.code]?.status === 'complete';
              return (
                <View style={styles.pickerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerName, { color: ROSE, fontWeight: '700' }]}>
                      {tr.nativeName}
                    </Text>
                    <Text style={styles.pickerEdition}>{tr.edition}</Text>
                    {isPending && !isPaused && (
                      <Text style={styles.pickerProgress}>{t('sheet.langBible.downloading', { pct })}</Text>
                    )}
                    {isPaused && (
                      <Text style={styles.pickerProgress}>{t('sheet.langBible.paused', { pct })}</Text>
                    )}
                    {downloaded && (
                      <Text style={styles.pickerComplete}>{t('sheet.langBible.readyOffline')}</Text>
                    )}
                    {!downloaded && !isPending && (
                      <Text style={styles.pickerProgress}>{t('sheet.langBible.downloadRequired')}</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {downloaded ? (
                      <Feather name="check-circle" size={24} color={GREEN_DONE} />
                    ) : isPaused ? (
                      <TouchableOpacity onPress={resumeDownload} hitSlop={12} style={styles.dlBtn}>
                        <Feather name="play" size={22} color={ROSE} />
                      </TouchableOpacity>
                    ) : isPending ? (
                      <TouchableOpacity onPress={pauseDownload} hitSlop={12} style={styles.dlBtn}>
                        <Feather name="pause" size={22} color={ROSE} />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setTranslation(tr.code)} hitSlop={12} style={styles.dlBtn}>
                        <Feather name="download" size={20} color={ROSE} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })()}
          </ScrollView>
        </Animated.View>
        </GestureDetector>
      </View>

      {/* Language-switch confirmation — branded in-app dialog (replaces the OS
          Alert). Text is localized to the CURRENT UI language via t(). */}
      {langConfirm && (() => {
        const tr = TRANSLATIONS.find(x => x.code === langConfirm);
        if (!tr) return null;
        const ready = dlStates[langConfirm]?.status === 'complete';
        const close = () => setLangConfirm(null);
        return (
          <Modal visible transparent animationType="fade" onRequestClose={close}>
            <View style={styles.dlgOverlay}>
              <View style={styles.dlgCard}>
                <Text style={styles.dlgTitle}>{t('sheet.langConfirm.title', { lang: tr.nativeName })}</Text>
                <Text style={styles.dlgBody}>
                  {ready
                    ? t('sheet.langConfirm.bodyReady', { lang: tr.nativeName })
                    : t('sheet.langConfirm.bodyDownload', { lang: tr.nativeName, edition: tr.edition })}
                </Text>
                <View style={styles.dlgActions}>
                  <TouchableOpacity onPress={close} style={styles.dlgCancel} activeOpacity={0.85}>
                    <Text style={styles.dlgCancelText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {t('sheet.langConfirm.cancel')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { const c = langConfirm; close(); commitLanguage(c); }}
                    style={styles.dlgConfirm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.dlgConfirmText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {ready ? t('sheet.langConfirm.confirm') : t('sheet.langConfirm.confirmDownload')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </>
  );
}

// Values mirror the Profile sheet family so the sheet reads identical wherever
// it opens from; the picker text/controls carry the +10% bump the owner asked
// for on this sheet specifically.
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: P,
    paddingTop: 14,
    paddingBottom: 36,
  },
  handle: {
    width: 50,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,46,0.16)',
    alignSelf: 'center',
    marginTop: -7,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TXT,
    marginBottom: 14,
    marginTop: 12,
  },
  langSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  langSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    fontFamily: FONTS.loraBold,
  },
  langSectionTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  langSectionCurrent: {
    fontSize: 15,
    fontWeight: '600',
    color: ROSE,
  },
  langChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  langChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: `${ROSE}14`,
  },
  langChipActive: {
    backgroundColor: ROSE,
  },
  langChipText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: ROSE,
  },
  langChipTextActive: {
    color: '#FFFFFF',
  },
  bibleSubHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: TXT,
    fontFamily: FONTS.loraBold,
    marginTop: 6,
    marginBottom: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  pickerName: { fontSize: 18, fontWeight: '600', color: TXT, marginBottom: 4 },
  pickerEdition: { fontSize: 14, color: TXTSUB },
  pickerProgress: { fontSize: 13, color: ROSE, fontWeight: '600', marginTop: 5 },
  pickerComplete: { fontSize: 13, color: GREEN_DONE, fontWeight: '600', marginTop: 5 },
  dlBtn: {
    minWidth: 48,
    height: 36,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: `${ROSE}14`,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  dlgOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,12,24,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  dlgCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  dlgTitle: {
    fontSize: 20,
    fontWeight: '600',                     // loraBold + 600 (never 700 on Android)
    fontFamily: FONTS.loraBold,
    color: TXT,
    marginBottom: 10,
  },
  dlgBody: {
    fontSize: 14.5,
    lineHeight: 21,
    color: TXTSUB,
    fontFamily: FONTS.lato, letterSpacing: 0.4,
    marginBottom: 22,
  },
  dlgActions: { flexDirection: 'row', alignSelf: 'stretch', gap: 10 },
  dlgCancel: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(30,27,46,0.06)',
  },
  dlgCancelText: { color: TXTSUB, fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
  dlgConfirm: {
    flex: 1.4,
    height: 46,
    borderRadius: BTN_RADIUS,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ROSE,
    paddingHorizontal: 8,
  },
  dlgConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: FONTS.latoBold, letterSpacing: 0.4 },
});
