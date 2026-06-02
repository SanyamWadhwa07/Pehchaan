import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ensureCameraPermission } from '@/hooks/useCameraPermission';
import type { AuthStackParamList } from '@/navigation/AuthStack';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Props = StackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const onStartAuth = async () => {
    setStarting(true);
    setPermissionDenied(false);
    try {
      const granted = await ensureCameraPermission();
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      navigation.navigate('QualityCheck');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={styles.brand}>{t('welcome.title')}</Text>
        <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>
        <Text style={styles.hint}>{t('welcome.hint')}</Text>

        {permissionDenied ? (
          <Text style={styles.error}>{t('welcome.permissionDenied')}</Text>
        ) : null}

        <Button
          label={t('welcome.startAuth')}
          onPress={() => void onStartAuth()}
          loading={starting}
          style={styles.primaryAction}
        />

        {__DEV__ ? (
          <Button
            label={t('enrollment.devEntry')}
            variant="secondary"
            onPress={() => navigation.getParent()?.navigate('Enrollment')}
            style={styles.secondaryAction}
          />
        ) : null}
      </View>

      {starting ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    ...typography.heading,
    fontSize: 28,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.lg,
  },
  hint: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  error: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  primaryAction: {
    marginBottom: spacing.md,
  },
  secondaryAction: {
    marginBottom: spacing.xxl,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 247, 250, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
