import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {DEV_TEST_SITE_ID} from '@/constants/dev';
import type {SupervisorStackParamList} from '@/navigation/SupervisorStack';
import {useAuthStore} from '@/stores/authStore';
import {usePendingAuthStore} from '@/stores/pendingAuthStore';
import {queueAttendanceRecord} from '@/services/attendance/queueAttendanceRecord';
import {pushAttendance} from '@/services/integration';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';

type Props = StackScreenProps<
  SupervisorStackParamList,
  'SupervisorConfirmation'
>;

function hapticTap(): void {
  Vibration.vibrate(40);
}

export function SupervisorConfirmationScreen({
  navigation,
}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const session = usePendingAuthStore(s => s.session);
  const setStatus = usePendingAuthStore(s => s.setStatus);
  const supervisorId = useAuthStore(s => s.user?.id) ?? '';

  if (!session || session.status !== 'awaiting_confirmation') {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {t('supervisorDashboard.pendingAuth')}
        </Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  }

  const thumbUri = session.thumbnailBase64?.startsWith('data:')
    ? session.thumbnailBase64
    : session.thumbnailBase64?.startsWith('http')
    ? session.thumbnailBase64
    : undefined;

  const onConfirm = async () => {
    hapticTap();
    await queueAttendanceRecord({
      session,
      supervisorId,
      supervisorConfirmed: true,
    });
    setStatus('confirmed');
    void pushAttendance({
      workerId: session.workerId,
      siteId: session.siteId,
      deviceId: session.deviceId,
      supervisorId,
      supervisorConfirmed: true,
      authTimestamp: session.createdAt,
      confidence: session.confidence,
      livenessScore: session.livenessSession.score,
    });
    navigation.navigate('SupervisorHome');
  };

  const onReject = () => {
    hapticTap();
    setStatus('rejected');
    navigation.navigate('SupervisorHome');
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('supervisorConfirmation.title')}</Text>
      <Text style={styles.instruction}>
        {t('supervisorConfirmation.instruction')}
      </Text>

      {session.requiresSupervisorFlag ? (
        <Text style={styles.warn}>
          {t('supervisorConfirmation.lowConfidenceWarning')}
        </Text>
      ) : null}

      <View style={styles.photoFrame}>
        {thumbUri ? (
          <Image
            source={{uri: thumbUri}}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>👤</Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{session.workerName}</Text>
      <Text style={styles.meta}>
        {t('authResult.workerId', {id: session.workerId})}
      </Text>
      <Text style={styles.meta}>
        {t('supervisorDashboard.siteLabel')}: {DEV_TEST_SITE_ID.slice(0, 8)}…
      </Text>
      <Text style={styles.meta}>
        {t('supervisorDashboard.shiftLabel')}:{' '}
        {t('supervisorDashboard.shiftMorning')}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.confirm]}
          onPress={() => void onConfirm()}>
          <Text style={styles.btnText}>
            {t('supervisorConfirmation.confirm')}
          </Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.reject]} onPress={onReject}>
          <Text style={styles.btnText}>
            {t('supervisorConfirmation.reject')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.heading,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  instruction: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  warn: {
    color: colors.warning,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  photoFrame: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  photo: {width: '100%', height: '100%'},
  photoPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {fontSize: 64},
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  meta: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  actions: {marginTop: 'auto', gap: spacing.md},
  btn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirm: {backgroundColor: colors.success},
  reject: {backgroundColor: colors.error},
  btnText: {color: colors.onPrimary, fontSize: 17, fontWeight: '700'},
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {...typography.body, marginBottom: 16},
  link: {color: colors.primary, fontSize: 16},
});
