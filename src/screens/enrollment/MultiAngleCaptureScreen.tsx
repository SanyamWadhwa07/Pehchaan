import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { useCameraSession } from '@/hooks/useCameraSession';
import { qualityCheckTranslationKey } from '@/lib/qualityI18n';
import type { EnrollmentStackParamList } from '@/navigation/EnrollmentStack';
import { AngleGuideCard } from '@/screens/enrollment/components/AngleGuideCard';
import { useEnrollment } from '@/screens/enrollment/EnrollmentContext';
import {
  CAPTURE_SEQUENCE,
  OPTIONAL_CAPTURE_ANGLES,
} from '@/screens/enrollment/types';
import { FaceOverlay } from '@/screens/auth/components/FaceOverlay';
import { checkFaceQuality, STUB_FACE_BOX } from '@/services/faceRecognition';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { CaptureAngle, QualityCheck } from '@/types';

type Props = StackScreenProps<EnrollmentStackParamList, 'MultiAngleCapture'>;

export function MultiAngleCaptureScreen({
  navigation,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { state, updateState } = useEnrollment();
  const device = useCameraDevice('front');
  const { hasPermission, isRequesting } = useCameraPermission();
  const { isActive, onCameraError } = useCameraSession();
  const [forceInactive, setForceInactive] = useState(false);
  const cameraActive = isActive && !forceInactive;

  const [angleIndex, setAngleIndex] = useState(0);
  const [quality, setQuality] = useState<QualityCheck | null>(null);

  const currentAngle = CAPTURE_SEQUENCE[angleIndex]!;
  const isOptional = OPTIONAL_CAPTURE_ANGLES.includes(currentAngle);

  const pollQuality = useCallback(async () => {
    setQuality(await checkFaceQuality());
  }, []);

  useEffect(() => {
    if (hasPermission && cameraActive) {
      void pollQuality();
    }
  }, [
    hasPermission,
    cameraActive,
    angleIndex,
    pollQuality,
  ]);

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

  const saveCapture = () => {
    const placeholder = `data:image/jpeg;base64,enrollment-${currentAngle}-${Date.now()}`;
    updateState({
      captures: { ...state.captures, [currentAngle]: placeholder },
    });
    goNext();
  };

  const goNext = () => {
    if (angleIndex >= CAPTURE_SEQUENCE.length - 1) {
      navigation.navigate('ReferenceThumbnail');
      return;
    }
    setAngleIndex((i) => i + 1);
    setQuality(null);
  };

  const skipOptional = () => {
    goNext();
  };

  if (isRequesting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>{t('camera.permissionDenied')}</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.message}>{t('common.loading')}</Text>
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
        <StepIndicator
          currentStep={2}
          totalSteps={4}
          label={t('enrollment.stepCapture')}
        />
        <AngleGuideCard
          angle={currentAngle}
          optional={isOptional}
          captured={Boolean(state.captures[currentAngle])}
        />
        {feedbackKey ? (
          <Text
            style={[
              styles.feedback,
              quality?.passed ? styles.pass : styles.fail,
            ]}>
            {t(feedbackKey)}
          </Text>
        ) : null}

        <Button
          label={t('enrollment.acceptCapture')}
          onPress={saveCapture}
          disabled={!quality?.passed}
        />
        {isOptional ? (
          <Button
            label={t('enrollment.skipPpe')}
            variant="secondary"
            onPress={skipOptional}
            style={styles.skip}
          />
        ) : null}
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
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.panelOnCamera,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  feedback: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  pass: {
    color: colors.success,
  },
  fail: {
    color: colors.error,
  },
  message: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
  },
  skip: {
    marginTop: spacing.md,
  },
});
