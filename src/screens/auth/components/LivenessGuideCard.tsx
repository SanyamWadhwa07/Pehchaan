import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import type { LivenessChallenge } from '@/types';

type Props = {
  challenge: LivenessChallenge;
  instruction: string;
};

const ICON: Record<LivenessChallenge, string> = {
  blink: '👁',
  turn_left: '↩',
  turn_right: '↪',
};

export function LivenessGuideCard({ challenge, instruction }: Props): React.JSX.Element {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.card}>
      <Animated.Text style={[styles.icon, { transform: [{ scale: pulse }] }]}>
        {ICON[challenge]}
      </Animated.Text>
      <Text style={styles.instruction}>{instruction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  instruction: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
});
