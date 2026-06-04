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

import {useCameraPermission} from '@/hooks/useCameraPermission';
import {useCameraSession} from '@/hooks/useCameraSession';
import {useAuthStore} from '@/stores/authStore';
import type {AuthStackParamList} from '@/navigation/AuthStack';
import {resolveActiveSiteId} from '@/lib/activeSiteId';
import {captureFrameBase64} from '@/lib/captureFrame';
import {buildRecognitionCandidates} from '@/services/faceRecognition/candidates';
import {runRecognition} from '@/services/faceRecognition';
import {colors} from '@/theme/colors';
import type {RecognitionResult} from '@/types';

type Props = StackScreenProps<AuthStackParamList, 'Recognition'>;

export function RecognitionScreen({navigation}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const session = useAuthStore(s => s.session);
  const siteId = resolveActiveSiteId(session);
  const device = useCameraDevice('front');
  const {hasPermission, isRequesting} = useCameraPermission();
  const {isActive, onCameraError} = useCameraSession();
  const cameraRef = useRef<CameraType>(null);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const ranRef = useRef(false);

  const run = useCallback(async () => {
    setLoading(true);
    const frame =
      hasPermission && device && isActive
        ? await captureFrameBase64(cameraRef)
        : null;
    const candidates = await buildRecognitionCandidates(siteId);
    const r = await runRecognition(frame ?? undefined, candidates);
    setResult(r);
    setLoading(false);
    if (r.workerId) {
      navigation.replace('Liveness', {recognition: r});
    }
  }, [device, hasPermission, isActive, navigation, siteId]);

  useEffect(() => {
    if (ranRef.current) {
      return;
    }
    if (isRequesting) {
      return;
    }
    if (!hasPermission || !device) {
      if (!isRequesting) {
        ranRef.current = true;
        void run();
      }
      return;
    }
    ranRef.current = true;
    const id = setTimeout(() => {
      void run();
    }, 400);
    return () => clearTimeout(id);
  }, [device, hasPermission, isRequesting, run]);

  if (!hasPermission && !isRequesting && !loading && result == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('recognition.failed')}</Text>
        <Text style={styles.muted}>{t('camera.permissionDenied')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.root}>
        {device && hasPermission ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            photo
            onError={onCameraError}
          />
        ) : null}
        <View style={styles.centeredOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>{t('recognition.running')}</Text>
        </View>
      </View>
    );
  }

  if (!result?.workerId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('recognition.failed')}</Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            ranRef.current = false;
            void run();
          }}>
          <Text style={styles.buttonText}>{t('common.retry')}</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={() => navigation.navigate('QualityCheck')}>
          <Text style={styles.linkText}>{t('recognition.backToQuality')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  muted: {
    color: colors.textMuted,
    marginTop: 12,
  },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  link: {
    padding: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
  },
});
