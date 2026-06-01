import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StepIndicator } from '@/components/StepIndicator';
import { DEV_TEST_SITE_ID } from '@/constants/dev';
import type { EnrollmentStackParamList } from '@/navigation/EnrollmentStack';
import { useEnrollment } from '@/screens/enrollment/EnrollmentContext';
import { CAPTURE_SEQUENCE } from '@/screens/enrollment/types';
import { registerWorker } from '@/services/registration/registerWorker';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Props = StackScreenProps<EnrollmentStackParamList, 'EnrollmentReview'>;

export function EnrollmentReviewScreen({
  navigation,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { state, reset } = useEnrollment();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const captureCount = CAPTURE_SEQUENCE.filter((a) => state.captures[a]).length;

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await registerWorker({
        name: state.name,
        role: state.role,
        site_id: DEV_TEST_SITE_ID,
        aadhaar_ref_hash: state.aadhaarHash,
        language_preference: state.languagePreference,
      });
      setSuccess(true);
      reset();
    } catch {
      setError(t('enrollment.submitError'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Screen>
        <Text style={styles.success}>{t('enrollment.submitSuccess')}</Text>
        <Button
          label={t('common.confirm')}
          onPress={() => navigation.getParent()?.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        <StepIndicator
          currentStep={4}
          totalSteps={4}
          label={t('enrollment.stepReview')}
        />
        <Text style={styles.title}>{t('enrollment.reviewTitle')}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>{t('enrollment.reviewName')}</Text>
          <Text style={styles.value}>{state.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('enrollment.reviewRole')}</Text>
          <Text style={styles.value}>{state.role}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('enrollment.reviewLanguage')}</Text>
          <Text style={styles.value}>
            {t(
              state.languagePreference === 'en'
                ? 'settings.english'
                : 'settings.hindi',
            )}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('enrollment.reviewAngles')}</Text>
          <Text style={styles.value}>{captureCount}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t('enrollment.submitEnrollment')}
          onPress={() => void onSubmit()}
          loading={loading}
          style={styles.submit}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface,
  },
  label: {
    ...typography.label,
  },
  value: {
    ...typography.body,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.lg,
  },
  error: {
    ...typography.body,
    color: colors.error,
    marginVertical: spacing.md,
  },
  success: {
    ...typography.heading,
    color: colors.success,
    marginBottom: spacing.xl,
  },
  submit: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
});
