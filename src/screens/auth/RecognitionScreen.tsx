import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import type { AuthStackParamList } from '@/navigation/AuthStack';
import { runRecognition } from '@/services/faceRecognition';
import { colors } from '@/theme/colors';
import type { RecognitionResult } from '@/types';

type Props = StackScreenProps<AuthStackParamList, 'Recognition'>;

export function RecognitionScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RecognitionResult | null>(null);

  const run = async () => {
    setLoading(true);
    const r = await runRecognition();
    setResult(r);
    setLoading(false);
    if (r.workerId) {
      navigation.replace('Liveness', { recognition: r });
    }
  };

  useEffect(() => {
    void run();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.muted}>{t('recognition.running')}</Text>
      </View>
    );
  }

  if (!result?.workerId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('recognition.failed')}</Text>
        <Pressable style={styles.button} onPress={() => void run()}>
          <Text style={styles.buttonText}>{t('common.retry')}</Text>
        </Pressable>
        <Pressable
          style={styles.link}
          onPress={() => navigation.navigate('QualityCheck')}>
          <Text style={styles.linkText}>{t('recognition.backToQuality')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  muted: {
    color: colors.textMuted,
    marginTop: 12,
  },
  button: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  link: {
    padding: 8,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
  },
});
