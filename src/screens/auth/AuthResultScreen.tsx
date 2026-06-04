import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {DEV_TEST_DEVICE_ID, DEV_TEST_SITE_ID} from '@/constants/dev';
import {requiresSupervisorFlag} from '@/lib/authTier';
import {resolveWorkerDisplay} from '@/lib/resolveWorkerDisplay';
import type {AuthStackParamList} from '@/navigation/AuthStack';
import {usePendingAuthStore} from '@/stores/pendingAuthStore';
import {colors} from '@/theme/colors';

type Props = StackScreenProps<AuthStackParamList, 'AuthResult'>;

export function AuthResultScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const {recognition, livenessSession} = route.params;
  const setSession = usePendingAuthStore(s => s.setSession);
  const pending = usePendingAuthStore(s => s.session);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const workerId = recognition.workerId!;
      const display = await resolveWorkerDisplay(workerId);
      setSession({
        status: 'awaiting_confirmation',
        workerId,
        workerName: display.name,
        thumbnailBase64: display.thumbnailBase64,
        siteId: DEV_TEST_SITE_ID,
        deviceId: DEV_TEST_DEVICE_ID,
        confidence: recognition.confidence,
        authTier: recognition.authTier,
        livenessSession,
        requiresSupervisorFlag: requiresSupervisorFlag(recognition.authTier),
        createdAt: new Date().toISOString(),
      });
      setReady(true);
    })();
  }, [livenessSession, recognition, setSession]);

  const rejected = pending?.status === 'rejected';

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>
        {rejected ? t('authResult.rejected') : t('authResult.success')}
      </Text>
      {!rejected ? (
        <>
          <Text style={styles.line}>
            {t('authResult.workerName', {
              name: pending?.workerName ?? '—',
            })}
          </Text>
          <Text style={styles.line}>
            {t('authResult.workerId', {id: pending?.workerId ?? '—'})}
          </Text>
          <Text style={styles.waiting}>
            {t('authResult.waitingConfirmation')}
          </Text>
          {!livenessSession.passed ? (
            <Text style={styles.warn}>{t('liveness.supervisorOverride')}</Text>
          ) : null}
        </>
      ) : null}
      <Pressable
        style={styles.button}
        onPress={() =>
          navigation.reset({index: 0, routes: [{name: 'Welcome'}]})
        }>
        <Text style={styles.buttonText}>{t('authResult.done')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  line: {color: colors.textSecondary, fontSize: 16, marginBottom: 8},
  waiting: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  warn: {
    color: colors.warning,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    marginTop: 32,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {color: colors.onAccent, fontWeight: '600'},
});
