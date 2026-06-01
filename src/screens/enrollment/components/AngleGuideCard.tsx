import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { CaptureAngle } from '@/types';

type AngleGuideCardProps = {
  angle: CaptureAngle;
  optional?: boolean;
  captured?: boolean;
};

export function AngleGuideCard({
  angle,
  optional = false,
  captured = false,
}: AngleGuideCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <View style={[styles.card, captured && styles.cardCaptured]}>
      <Text style={styles.title}>{t(`enrollment.angles.${angle}`)}</Text>
      {optional ? (
        <Text style={styles.optional}>{t('enrollment.optionalPpe')}</Text>
      ) : null}
      {captured ? (
        <Text style={styles.done}>{t('enrollment.captureComplete')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCaptured: {
    borderColor: colors.success,
  },
  title: {
    ...typography.body,
    fontWeight: '600',
  },
  optional: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  done: {
    ...typography.caption,
    color: colors.success,
    marginTop: spacing.sm,
  },
});
