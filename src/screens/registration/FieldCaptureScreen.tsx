import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {
  Camera,
  useCameraDevice,
  type Camera as CameraType,
} from 'react-native-vision-camera';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {Button} from '@/components/Button';
import {useCameraPermission} from '@/hooks/useCameraPermission';
import {useCameraSession} from '@/hooks/useCameraSession';
import {captureFrameBase64, useCaptureInFlight} from '@/lib/captureFrame';
import {qualityCheckTranslationKey} from '@/lib/qualityI18n';
import type {RegistrationStackParamList} from '@/navigation/RegistrationStack';
import {FaceOverlay} from '@/screens/auth/components/FaceOverlay';
import {useFieldRegistration} from '@/screens/registration/RegistrationContext';
import {checkFaceQuality, STUB_FACE_BOX} from '@/services/faceRecognition';
import {colors} from '@/theme/colors';
import type {QualityCheck} from '@/types';

type Props = StackScreenProps<RegistrationStackParamList, 'FieldCapture'>;

const POLL_MS = 500;

export function FieldCaptureScreen({navigation}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const {updateState} = useFieldRegistration();
  const device = useCameraDevice('front');
  const {hasPermission, isRequesting} = useCameraPermission();
  const {isActive, onCameraError} = useCameraSession();
  const [forceInactive, setForceInactive] = useState(false);
  const cameraActive = isActive && !forceInactive;
  const [quality, setQuality] = useState<QualityCheck | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
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
  }, [cameraActive, release, tryAcquire]);

  useEffect(() => {
    if (hasPermission && cameraActive) {
      void pollQuality();
      const id = setInterval(() => void pollQuality(), POLL_MS);
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

  const onAccept = async () => {
    if (!quality?.passed || accepting) {
      return;
    }
    setAccepting(true);
    setCaptureError(null);
    const frame = cameraActive ? await captureFrameBase64(cameraRef) : null;
    if (!frame) {
      setCaptureError(t('registration.captureFailed'));
      setAccepting(false);
      return;
    }
    updateState({frontalCaptureBase64: frame});
    setForceInactive(true);
    setAccepting(false);
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
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        photo
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
        {captureError ? <Text style={styles.fail}>{captureError}</Text> : null}
        <Button
          label={t('registration.acceptCapture')}
          onPress={() => void onAccept()}
          disabled={!quality?.passed || accepting}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
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
    maxHeight: '45%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  hint: {fontSize: 15, color: colors.textSecondary, marginBottom: 12},
  feedback: {fontSize: 15, marginBottom: 12},
  pass: {color: colors.success},
  fail: {color: colors.error},
  muted: {color: colors.textMuted},
  btn: {marginTop: 8},
});
