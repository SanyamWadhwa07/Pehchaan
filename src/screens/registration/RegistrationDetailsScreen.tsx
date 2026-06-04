import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {StackScreenProps} from '@react-navigation/stack';

import {Button} from '@/components/Button';
import {Screen} from '@/components/Screen';
import {TextField} from '@/components/TextField';
import {DEMO_FIELD_WORKER_PRESETS} from '@/constants/demoFieldWorkers';
import {hashIdNumber} from '@/lib/hashAadhaar';
import type {AppLanguage} from '@/i18n';
import type {RegistrationStackParamList} from '@/navigation/RegistrationStack';
import {useFieldRegistration} from '@/screens/registration/RegistrationContext';
import {colors} from '@/theme/colors';
import {spacing} from '@/theme/spacing';
import {typography} from '@/theme/typography';

type Props = StackScreenProps<
  RegistrationStackParamList,
  'RegistrationDetails'
>;

export function RegistrationDetailsScreen({
  navigation,
}: Props): React.JSX.Element {
  const {t} = useTranslation();
  const {state, updateState} = useFieldRegistration();

  const [name, setName] = useState(state.workerName);
  const [role, setRole] = useState(state.role);
  const [contact, setContact] = useState(state.contactNumber);
  const [idNumber, setIdNumber] = useState('');
  const [language, setLanguage] = useState<AppLanguage>(
    state.languagePreference,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onNext = () => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = t('registration.validationRequired');
    }
    if (!role.trim()) {
      nextErrors.role = t('registration.validationRequired');
    }
    if (!idNumber.trim()) {
      nextErrors.idNumber = t('registration.validationIdRequired');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    updateState({
      workerName: name.trim(),
      role: role.trim(),
      contactNumber: contact.trim(),
      aadhaarHash: hashIdNumber(idNumber),
      languagePreference: language,
    });
    navigation.navigate('FieldCapture');
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('registration.title')}</Text>
        <Text style={styles.step}>{t('registration.stepDetails')}</Text>

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
          error={errors.idNumber}
          secureTextEntry
        />
        <TextField
          label={t('registration.contactNumber')}
          value={contact}
          onChangeText={setContact}
          keyboardType="phone-pad"
        />

        <Text style={styles.langLabel}>
          {t('registration.languagePreference')}
        </Text>
        <View style={styles.langRow}>
          {(['en', 'hi'] as AppLanguage[]).map(lang => (
            <Pressable
              key={lang}
              style={[
                styles.langChip,
                language === lang && styles.langChipActive,
              ]}
              onPress={() => setLanguage(lang)}>
              <Text
                style={[
                  styles.langChipText,
                  language === lang && styles.langChipTextActive,
                ]}>
                {lang === 'en' ? t('settings.english') : t('settings.hindi')}
              </Text>
            </Pressable>
          ))}
        </View>

        {__DEV__ ? (
          <Button
            label={t('registration.fillDemoWorker')}
            variant="secondary"
            onPress={() => {
              const preset =
                DEMO_FIELD_WORKER_PRESETS[
                  Math.floor(Math.random() * DEMO_FIELD_WORKER_PRESETS.length)
                ]!;
              setName(preset.workerName);
              setRole(preset.role);
              setLanguage(preset.languagePreference);
              setIdNumber('123456789012');
            }}
            style={{marginTop: spacing.md}}
          />
        ) : null}

        <Button
          label={t('common.next')}
          onPress={onNext}
          style={{marginTop: spacing.lg}}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {...typography.heading, marginBottom: spacing.xs},
  step: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  langLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  langRow: {flexDirection: 'row', gap: spacing.sm},
  langChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  langChipText: {color: colors.text},
  langChipTextActive: {color: colors.onPrimary, fontWeight: '600'},
});
