import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';

import {colors} from '@/theme/colors';
import type {LivenessChallenge} from '@/types';

type Props = {
  challenge: LivenessChallenge;
  instruction: string;
  /** Stronger pulse when the capture window is open. */
  active?: boolean;
};

const ICON: Record<LivenessChallenge, string> = {
  blink: '👁',
  turn_left: '↩',
  turn_right: '↪',
};

export function LivenessGuideCard({
  challenge,
  instruction,
  active = false,
}: Props): React.JSX.Element {
  const pulse = useRef(new Animated.Value(1)).current;
  const peak = active ? 1.18 : 1.08;
  const duration = active ? 400 : 600;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: peak,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, peak, pulse]);

  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <Animated.Text style={[styles.icon, {transform: [{scale: pulse}]}]}>
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
  cardActive: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: 4,
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
