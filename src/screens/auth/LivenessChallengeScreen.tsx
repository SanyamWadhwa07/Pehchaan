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

import {
  LIVENESS_CHALLENGE_TIMEOUT_MS,
  LIVENESS_MAX_ATTEMPTS,
} from '@/constants/auth';
import {useCameraPermission} from '@/hooks/useCameraPermission';
import {useCameraSession} from '@/hooks/useCameraSession';
import {buildLivenessSession} from '@/lib/buildLivenessSession';
import {livenessInstructionKey} from '@/lib/livenessI18n';
import {livenessChallengesForTier} from '@/lib/livenessSequence';
import {requiresSupervisorFlag} from '@/lib/authTier';
import type {AuthStackParamList} from '@/navigation/AuthStack';
import {FaceOverlay} from '@/screens/auth/components/FaceOverlay';
import {LivenessGuideCard} from '@/screens/auth/components/LivenessGuideCard';
import {captureFrameBurstBase64} from '@/lib/captureFrame';
import {runLivenessChallenge} from '@/services/liveness';
import {STUB_FACE_BOX} from '@/services/faceRecognition';
import {colors} from '@/theme/colors';
import type {LivenessChallenge, LivenessResult} from '@/types';

type Props = StackScreenProps<AuthStackParamList, 'Liveness'>;

export function LivenessChallengeScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const {recognition} = route.params;
  const device = useCameraDevice('front');
  const {hasPermission, isRequesting} = useCameraPermission();
  const {isActive, onCameraError} = useCameraSession();
  const [forceInactive, setForceInactive] = useState(false);
  const cameraActive = isActive && !forceInactive;

  const sequence = livenessChallengesForTier(recognition.authTier);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [results, setResults] = useState<LivenessResult[]>([]);
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(LIVENESS_CHALLENGE_TIMEOUT_MS / 1000),
  );
  const [running, setRunning] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const timedOutRef = useRef(false);
  const cameraRef = useRef<CameraType>(null);

  const currentChallenge: LivenessChallenge | undefined =
    sequence[challengeIndex];

  const finishToAuthResult = useCallback(
    (challengeResults: LivenessResult[]) => {
      const livenessSession = buildLivenessSession(challengeResults);
      navigation.replace('AuthResult', {
        recognition,
        livenessSession,
      });
    },
    [navigation, recognition],
  );

  const runChallenge = useCallback(async () => {
    if (!currentChallenge || running) {
      return;
    }
    setRunning(true);
    timedOutRef.current = false;
    const frames =
      cameraActive && hasPermission
        ? await captureFrameBurstBase64(cameraRef, 5, 350)
        : undefined;
    const result = await runLivenessChallenge(currentChallenge, frames);
    setRunning(false);

    if (timedOutRef.current) {
      return;
    }

    if (result.passed) {
      const next = [...results, result];
      setResults(next);
      if (challengeIndex >= sequence.length - 1) {
        finishToAuthResult(next);
        return;
      }
      setChallengeIndex(i => i + 1);
      setSecondsLeft(Math.ceil(LIVENESS_CHALLENGE_TIMEOUT_MS / 1000));
      return;
    }

    if (attempt >= LIVENESS_MAX_ATTEMPTS) {
      setShowOverride(true);
      return;
    }
    setAttempt(a => a + 1);
    setSecondsLeft(Math.ceil(LIVENESS_CHALLENGE_TIMEOUT_MS / 1000));
  }, [
    attempt,
    challengeIndex,
    currentChallenge,
    finishToAuthResult,
    results,
    cameraActive,
    hasPermission,
    running,
    sequence.length,
  ]);

  useEffect(() => {
    if (!currentChallenge || !cameraActive || showOverride) {
      return;
    }
    setSecondsLeft(Math.ceil(LIVENESS_CHALLENGE_TIMEOUT_MS / 1000));
    const tick = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(tick);
          timedOutRef.current = true;
          if (attempt >= LIVENESS_MAX_ATTEMPTS) {
            setShowOverride(true);
          } else {
            setAttempt(a => a + 1);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [attempt, cameraActive, challengeIndex, currentChallenge, showOverride]);

  useEffect(() => {
    if (!currentChallenge || showOverride || !cameraActive) {
      return;
    }
    const id = setTimeout(() => {
      void runChallenge();
    }, 1200);
    return () => clearTimeout(id);
  }, [
    cameraActive,
    challengeIndex,
    currentChallenge,
    runChallenge,
    showOverride,
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

  const onSupervisorOverride = () => {
    const failed: LivenessResult = {
      challenge: currentChallenge ?? 'blink',
      passed: false,
      durationMs: LIVENESS_CHALLENGE_TIMEOUT_MS,
    };
    finishToAuthResult([...results, failed]);
  };

  if (isRequesting || !hasPermission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('liveness.title')}</Text>
        <Text style={styles.muted}>{t('camera.noDevice')}</Text>
        <Pressable style={styles.overrideBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.overrideBtnText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  const stepNum = challengeIndex + 1;
  const stepTotal = sequence.length;

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
      <FaceOverlay box={STUB_FACE_BOX} passed={!showOverride} />

      <View style={styles.panel}>
        <Text style={styles.title}>{t('liveness.title')}</Text>
        <Text style={styles.step}>
          {t('liveness.step', {current: stepNum, total: stepTotal})}
        </Text>
        <Text style={styles.countdown}>
          {t('liveness.secondsLeft', {seconds: secondsLeft})}
        </Text>
        <Text style={styles.attempt}>
          {t('liveness.attempt', {count: attempt})}
        </Text>

        {currentChallenge && !showOverride ? (
          <LivenessGuideCard
            challenge={currentChallenge}
            instruction={t(livenessInstructionKey(currentChallenge))}
          />
        ) : null}

        {showOverride ? (
          <View style={styles.overrideBox}>
            <Text style={styles.overrideText}>
              {t('liveness.supervisorOverride')}
            </Text>
            <Pressable
              style={styles.overrideBtn}
              onPress={onSupervisorOverride}>
              <Text style={styles.overrideBtnText}>
                {t('liveness.continueAnyway')}
              </Text>
            </Pressable>
          </View>
        ) : running ? (
          <ActivityIndicator color={colors.accent} style={styles.spinner} />
        ) : null}

        {requiresSupervisorFlag(recognition.authTier) ? (
          <Text style={styles.flag}>{t('liveness.lowConfidenceFlag')}</Text>
        ) : null}
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
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  step: {color: colors.textSecondary, fontSize: 14, marginBottom: 2},
  countdown: {color: colors.accent, fontSize: 15, fontWeight: '600'},
  attempt: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  muted: {color: colors.textMuted, marginTop: 12},
  overrideBox: {marginTop: 12},
  overrideText: {color: colors.error, fontSize: 15, marginBottom: 12},
  overrideBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  overrideBtnText: {color: colors.onPrimary, fontWeight: '600'},
  spinner: {marginTop: 8},
  flag: {
    marginTop: 12,
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
  },
});
