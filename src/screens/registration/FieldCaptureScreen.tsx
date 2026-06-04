import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { useCameraSession } from '@/hooks/useCameraSession';
import { qualityCheckTranslationKey } from '@/lib/qualityI18n';
import type { RegistrationStackParamList } from '@/navigation/RegistrationStack';
import { FaceOverlay } from '@/screens/auth/components/FaceOverlay';
import { useFieldRegistration } from '@/screens/registration/RegistrationContext';
import { checkFaceQuality, STUB_FACE_BOX } from '@/services/faceRecognition';
import { colors } from '@/theme/colors';
import type { QualityCheck } from '@/types';

type Props = StackScreenProps<RegistrationStackParamList, 'FieldCapture'>;

export function FieldCaptureScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { updateState } = useFieldRegistration();
  const device = useCameraDevice('front');
  const { hasPermission, isRequesting } = useCameraPermission();
  const { isActive, onCameraError } = useCameraSession();
  const [forceInactive, setForceInactive] = useState(false);
  const cameraActive = isActive && !forceInactive;
  const [quality, setQuality] = useState<QualityCheck | null>(null);

  const pollQuality = useCallback(async () => {
    setQuality(await checkFaceQuality());
  }, []);

  useEffect(() => {
    if (hasPermission && cameraActive) {
      void pollQuality();
      const id = setInterval(() => void pollQuality(), 500);
      return () => clearInterval(id);
    }
  }, [hasPermission, cameraActive, pollQuality]);

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

  const onAccept = () => {
    const placeholder = `data:image/jpeg;base64,field-frontal-${Date.now()}`;
    updateState({ frontalCaptureBase64: placeholder });
    setForceInactive(true);
    navigation.navigate('RegistrationQueued');
  };

  if (isRequesting || !hasPermission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('camera.noDevice')}</Text>
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
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        onError={onCameraError}
      />
      <FaceOverlay box={STUB_FACE_BOX} passed={quality?.passed ?? false} />
      <View style={styles.panel}>
        <Text style={styles.title}>{t('registration.capturePhoto')}</Text>
        <Text style={styles.hint}>{t('registration.captureInstruction')}</Text>
        {feedbackKey ? (
          <Text
            style={[
              styles.feedback,
              quality?.passed ? styles.pass : styles.fail,
            ]}>
            {t(feedbackKey)}
          </Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
        <Button
          label={t('registration.acceptCapture')}
          onPress={onAccept}
          disabled={!quality?.passed}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 36,
    backgroundColor: colors.panelOnCamera,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  hint: { fontSize: 15, color: colors.textSecondary, marginBottom: 12 },
  feedback: { fontSize: 15, marginBottom: 12 },
  pass: { color: colors.success },
  fail: { color: colors.error },
  muted: { color: colors.textMuted },
  btn: { marginTop: 8 },
});
