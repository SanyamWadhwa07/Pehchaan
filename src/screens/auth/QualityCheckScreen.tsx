import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  type Camera as CameraType,
} from 'react-native-vision-camera';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import type {AuthStackParamList} from '@/navigation/AuthStack';
import {qualityCheckTranslationKey} from '@/lib/qualityI18n';
import {useCameraPermission} from '@/hooks/useCameraPermission';
import {useCameraSession} from '@/hooks/useCameraSession';
import {captureFrameBase64, useCaptureInFlight} from '@/lib/captureFrame';
import {checkFaceQuality, STUB_FACE_BOX} from '@/services/faceRecognition';
import {FaceOverlay} from '@/screens/auth/components/FaceOverlay';
import {colors} from '@/theme/colors';
import type {QualityCheck} from '@/types';

type Props = StackScreenProps<AuthStackParamList, 'QualityCheck'>;

const POLL_MS = 500;

export function QualityCheckScreen({navigation}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const device = useCameraDevice('front');
  const {hasPermission, isRequesting} = useCameraPermission();
  const [quality, setQuality] = useState<QualityCheck | null>(null);
  const [polling, setPolling] = useState(true);
  const {isActive, onCameraError} = useCameraSession();
  const [forceInactive, setForceInactive] = useState(false);
  const cameraActive = isActive && !forceInactive;
  const cameraRef = useRef<CameraType>(null);
  const {tryAcquire, release} = useCaptureInFlight();

  const pollQuality = useCallback(async () => {
    if (!tryAcquire()) {
      return;
    }
    try {
      const frame = cameraActive ? await captureFrameBase64(cameraRef) : null;
      const result = await checkFaceQuality(frame ?? undefined);
      setQuality(result);
    } finally {
      release();
    }
  }, [cameraActive, tryAcquire, release]);

  useEffect(() => {
    if (!hasPermission || !polling || !cameraActive) {
      return;
    }
    void pollQuality();
    const id = setInterval(() => {
      void pollQuality();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasPermission, polling, cameraActive, pollQuality]);

  // Stable pass ~1s before advancing (avoids stub flicker).
  useEffect(() => {
    if (!quality?.passed || !cameraActive) {
      return;
    }
    const id = setTimeout(() => {
      setPolling(false);
      setForceInactive(true);
      navigation.navigate('Recognition');
    }, 1000);
    return () => clearTimeout(id);
  }, [quality?.passed, cameraActive, navigation]);

  useEffect(() => {
    const beforeRemoveUnsub = navigation.addListener('beforeRemove', () => {
      setForceInactive(true);
    });
    const focusUnsub = navigation.addListener('focus', () => {
      setForceInactive(false);
    });
    return () => {
      beforeRemoveUnsub();
      focusUnsub();
    };
  }, [navigation]);

  const onRetry = () => {
    setPolling(true);
    void pollQuality();
  };

  if (isRequesting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('qualityCheck.title')}</Text>
        <Text style={styles.message}>{t('camera.permissionDenied')}</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('qualityCheck.title')}</Text>
        <Text style={styles.message}>{t('camera.noDevice')}</Text>
        <Pressable style={styles.retryButton} onPress={() => navigation.popToTop()}>
          <Text style={styles.retryText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  const feedbackKey =
    quality?.passed === true
      ? 'qualityCheck.pass'
      : quality?.failReason
      ? qualityCheckTranslationKey(quality.failReason)
      : null;

  return (
    <View style={styles.root}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        photo
        onError={onCameraError}
      />
      <FaceOverlay box={STUB_FACE_BOX} passed={quality?.passed ?? false} />

      <View style={styles.topBar}>
        <Pressable
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button">
          <Text style={styles.settingsLabel}>{t('settings.title')}</Text>
        </Pressable>
      </View>

      <View style={styles.feedback}>
        <Text style={styles.title}>{t('qualityCheck.title')}</Text>
        {feedbackKey ? (
          <Text
            style={[
              styles.message,
              quality?.passed ? styles.pass : styles.fail,
            ]}>
            {t(feedbackKey)}
          </Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}

        {!quality?.passed && quality != null && (
          <Pressable style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    gap: 8,
  },
  settingsButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: colors.text,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  settingsLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  feedback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 36,
    backgroundColor: colors.panelOnCamera,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  pass: {
    color: colors.success,
  },
  fail: {
    color: colors.error,
  },
  muted: {
    color: colors.textMuted,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
});
