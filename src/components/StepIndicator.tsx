import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type StepIndicatorProps = {
  currentStep: number;
  totalSteps: number;
  label: string;
};

export function StepIndicator({
  currentStep,
  totalSteps,
  label,
}: StepIndicatorProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dots}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < currentStep ? styles.dotActive : null]}
          />
        ))}
      </View>
      <Text style={styles.counter}>
        {currentStep}/{totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  counter: {
    ...typography.caption,
  },
});
