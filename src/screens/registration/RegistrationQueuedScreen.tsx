import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import type { RegistrationStackParamList } from '@/navigation/RegistrationStack';
import { useFieldRegistration } from '@/screens/registration/RegistrationContext';
import { useAuthStore } from '@/stores/authStore';
import { queueFieldRegistration } from '@/services/registration/queueFieldRegistration';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Props = StackScreenProps<RegistrationStackParamList, 'RegistrationQueued'>;

export function RegistrationQueuedScreen({
  navigation,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { state, reset } = useFieldRegistration();
  const userId = useAuthStore((s) => s.user?.id);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await queueFieldRegistration({
        workerName: state.workerName,
        role: state.role,
        aadhaarRefHash: state.aadhaarHash,
        contactNumber: state.contactNumber,
        languagePreference: state.languagePreference,
        frontalCaptureBase64: state.frontalCaptureBase64,
        submittedBySupervisorId: userId ?? null,
      });
      if (__DEV__) {
        console.log('[registration] queued field registration for', state.workerName);
      }
      setDone(true);
      reset();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const onDone = () => {
    navigation.getParent()?.goBack();
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.title}>{t('registration.stepConfirm')}</Text>
        {done ? (
          <>
            <Text style={styles.success}>{t('registration.successQueued')}</Text>
            <Button label={t('common.confirm')} onPress={onDone} />
          </>
        ) : (
          <>
            <Text style={styles.line}>
              {state.workerName} · {state.role}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={t('common.submit')}
              onPress={() => void onSubmit()}
              loading={loading}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.heading, marginBottom: spacing.md },
  line: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  success: {
    ...typography.body,
    color: colors.success,
    marginBottom: spacing.lg,
    fontWeight: '600',
  },
  error: { color: colors.error, marginBottom: spacing.md },
});
