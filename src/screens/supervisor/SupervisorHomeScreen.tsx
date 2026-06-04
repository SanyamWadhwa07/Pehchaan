import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {Button} from '@/components/Button';
import {Screen} from '@/components/Screen';
import {DEV_TEST_SITE_ID} from '@/constants/dev';
import type {SupervisorStackParamList} from '@/navigation/SupervisorStack';
import {usePendingAuthStore} from '@/stores/pendingAuthStore';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';

type Props = StackScreenProps<SupervisorStackParamList, 'SupervisorHome'>;

export function SupervisorHomeScreen({navigation}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const pending = usePendingAuthStore(s => s.session);
  const awaiting = pending?.status === 'awaiting_confirmation';

  return (
    <Screen>
      <Text style={styles.title}>{t('supervisorDashboard.title')}</Text>

      {awaiting ? (
        <Pressable
          style={styles.banner}
          onPress={() => navigation.navigate('SupervisorConfirmation')}>
          <Text style={styles.bannerTitle}>
            {t('supervisorDashboard.pendingAuth')}
          </Text>
          <Text style={styles.bannerCta}>
            {t('supervisorDashboard.reviewNow')}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>{t('supervisorDashboard.siteLabel')}</Text>
        <Text style={styles.value}>{DEV_TEST_SITE_ID.slice(0, 8)}…</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t('supervisorDashboard.syncStatus')}</Text>
        <Text style={styles.value}>
          {t('supervisorDashboard.pendingSync', {count: 0})}
        </Text>
      </View>

      <Button
        label={t('supervisorDashboard.registerWorker')}
        onPress={() => navigation.getParent()?.navigate('Registration')}
        style={styles.cta}
      />

      {__DEV__ ? (
        <Button
          label={t('enrollment.devEntry')}
          variant="secondary"
          onPress={() => navigation.getParent()?.navigate('Enrollment')}
          style={styles.cta}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {...typography.heading, marginBottom: spacing.lg},
  banner: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerTitle: {color: colors.onPrimary, fontWeight: '700', fontSize: 16},
  bannerCta: {
    color: colors.onPrimary,
    marginTop: 4,
    fontSize: 14,
    opacity: 0.9,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {...typography.label, marginBottom: 4},
  value: {...typography.body},
  cta: {marginTop: spacing.md},
});
