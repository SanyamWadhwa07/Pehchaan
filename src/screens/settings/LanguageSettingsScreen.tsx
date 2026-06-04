import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';

import {Screen} from '@/components/Screen';
import {useAppLanguage} from '@/hooks/useAppLanguage';
import type {AppLanguage} from '@/i18n';
import {logout} from '@/services/auth/authService';
import {colors} from '@/theme/colors';

export function LanguageSettingsScreen(): React.JSX.Element {
  const {t} = useTranslation();
  const {language, setLanguage} = useAppLanguage();

  const options: {
    code: AppLanguage;
    labelKey: 'settings.english' | 'settings.hindi';
  }[] = [
    {code: 'en', labelKey: 'settings.english'},
    {code: 'hi', labelKey: 'settings.hindi'},
  ];

  return (
    <Screen>
      <Text style={styles.heading}>{t('settings.language')}</Text>
      <View style={styles.list}>
        {options.map(opt => {
          const selected = language === opt.code;
          return (
            <Pressable
              key={opt.code}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => void setLanguage(opt.code)}
              accessibilityRole="button"
              accessibilityState={{selected}}>
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}>
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.signOut}
        onPress={() => {
          void (async () => {
            await logout();
          })();
        }}
        accessibilityRole="button">
        <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  option: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  signOut: {
    marginTop: 32,
    padding: 16,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});
