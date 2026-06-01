import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import type { AuthStackParamList } from '@/navigation/AuthStack';
import { qualityCheckTranslationKey } from '@/lib/qualityI18n';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { checkFaceQuality, STUB_FACE_BOX } from '@/services/faceRecognition';
import { FaceOverlay } from '@/screens/auth/components/FaceOverlay';
import { colors } from '@/theme/colors';
import type { QualityCheck } from '@/types';

type Props = StackScreenProps<AuthStackParamList, 'QualityCheck'>;

const POLL_MS = 500;

export function QualityCheckScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const device = useCameraDevice('front');
  const { hasPermission, isRequesting } = useCameraPermission();
  const [quality, setQuality] = useState<QualityCheck | null>(null);
  const [polling, setPolling] = useState(true);

  const pollQuality = useCallback(async () => {
    const result = await checkFaceQuality();
    setQuality(result);
  }, []);

  useEffect(() => {
    if (!hasPermission || !polling) {
      return;
    }
    void pollQuality();
    const id = setInterval(() => {
      void pollQuality();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasPermission, polling, pollQuality]);

  const onRetry = () => {
    setPolling(true);
    void pollQuality();
  };

  if (isRequesting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
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
        <Text style={styles.message}>{t('camera.noDevice')}</Text>
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
      <Camera style={StyleSheet.absoluteFill} device={device} isActive={polling} />
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
          <ActivityIndicator color={colors.primary} />
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
  },
  settingsButton: {
    backgroundColor: colors.overlay,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  settingsLabel: {
    color: colors.primaryText,
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
    backgroundColor: colors.overlay,
  },
  title: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
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
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: colors.primaryText,
    fontWeight: '600',
  },
});
