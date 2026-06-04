import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {Button} from '@/components/Button';
import {Screen} from '@/components/Screen';
import {StepIndicator} from '@/components/StepIndicator';
import type {EnrollmentStackParamList} from '@/navigation/EnrollmentStack';
import {useEnrollment} from '@/screens/enrollment/EnrollmentContext';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';

type Props = StackScreenProps<EnrollmentStackParamList, 'ReferenceThumbnail'>;

export function ReferenceThumbnailScreen({
  navigation,
}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const {state, updateState} = useEnrollment();

  const frontal = state.captures.frontal ?? '';

  const onContinue = () => {
    updateState({thumbnailBase64: frontal});
    navigation.navigate('EnrollmentReview');
  };

  return (
    <Screen>
      <StepIndicator
        currentStep={3}
        totalSteps={4}
        label={t('enrollment.stepThumbnail')}
      />
      <Text style={styles.title}>{t('enrollment.stepThumbnail')}</Text>
      <Text style={styles.instruction}>
        {t('enrollment.thumbnailInstruction')}
      </Text>

      {frontal ? (
        <View style={styles.thumbBox}>
          <Text style={styles.thumbHint}>{t('enrollment.useFrontal')}</Text>
        </View>
      ) : (
        <Text style={styles.warn}>{t('common.error')}</Text>
      )}

      <Button
        label={t('common.next')}
        onPress={onContinue}
        disabled={!frontal}
        style={styles.next}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    marginBottom: spacing.md,
  },
  instruction: {
    ...typography.body,
    marginBottom: spacing.xl,
  },
  thumbBox: {
    flex: 1,
    minHeight: 200,
    backgroundColor: colors.surface,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.xl,
  },
  thumbHint: {
    ...typography.body,
    color: colors.success,
  },
  warn: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.xl,
  },
  next: {
    marginBottom: spacing.xxl,
  },
});
