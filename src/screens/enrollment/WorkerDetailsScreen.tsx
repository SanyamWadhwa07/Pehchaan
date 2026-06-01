import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { DEV_TEST_SITE_ID } from '@/constants/dev';
import { hashIdNumber } from '@/lib/hashAadhaar';
import type { AppLanguage } from '@/i18n';
import type { EnrollmentStackParamList } from '@/navigation/EnrollmentStack';
import { useEnrollment } from '@/screens/enrollment/EnrollmentContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Props = StackScreenProps<EnrollmentStackParamList, 'WorkerDetails'>;

export function WorkerDetailsScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { state, updateState } = useEnrollment();

  const [name, setName] = useState(state.name);
  const [role, setRole] = useState(state.role);
  const [contactNumber, setContactNumber] = useState(state.contactNumber);
  const [idNumber, setIdNumber] = useState('');
  const [language, setLanguage] = useState<AppLanguage>(state.languagePreference);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onNext = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = t('enrollment.validationRequired');
    }
    if (!role.trim()) {
      nextErrors.role = t('enrollment.validationRequired');
    }
    if (!idNumber.trim()) {
      nextErrors.idNumber = t('enrollment.validationIdRequired');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    updateState({
      name: name.trim(),
      role: role.trim(),
      contactNumber: contactNumber.trim(),
      languagePreference: language,
      aadhaarHash: hashIdNumber(idNumber),
    });
    navigation.navigate('MultiAngleCapture');
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <StepIndicator
          currentStep={1}
          totalSteps={4}
          label={t('enrollment.stepDetails')}
        />
        <Text style={styles.title}>{t('enrollment.title')}</Text>
        <Text style={styles.site}>
          {t('enrollment.siteLabel')}: {t('enrollment.siteStub')} ({DEV_TEST_SITE_ID.slice(0, 8)}…)
        </Text>

        <TextField
          label={t('registration.name')}
          value={name}
          onChangeText={setName}
          error={errors.name}
        />
        <TextField
          label={t('registration.role')}
          value={role}
          onChangeText={setRole}
          error={errors.role}
        />
        <TextField
          label={t('registration.idNumber')}
          value={idNumber}
          onChangeText={setIdNumber}
          keyboardType="number-pad"
          secureTextEntry
          error={errors.idNumber}
        />
        <TextField
          label={t('registration.contactNumber')}
          value={contactNumber}
          onChangeText={setContactNumber}
          keyboardType="phone-pad"
        />

        <Text style={styles.langLabel}>{t('registration.languagePreference')}</Text>
        <View style={styles.langRow}>
          {(['en', 'hi'] as AppLanguage[]).map((code) => (
            <Pressable
              key={code}
              style={[styles.langChip, language === code && styles.langChipActive]}
              onPress={() => setLanguage(code)}>
              <Text
                style={[
                  styles.langChipText,
                  language === code && styles.langChipTextActive,
                ]}>
                {t(code === 'en' ? 'settings.english' : 'settings.hindi')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button label={t('common.next')} onPress={onNext} style={styles.next} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  site: {
    ...typography.caption,
    marginBottom: spacing.xl,
  },
  langLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  langRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  langChip: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langChipActive: {
    borderColor: colors.primary,
  },
  langChipText: {
    ...typography.body,
    color: colors.text,
  },
  langChipTextActive: {
    color: colors.primaryText,
    fontWeight: '600',
  },
  next: {
    marginBottom: spacing.xxl,
  },
});
