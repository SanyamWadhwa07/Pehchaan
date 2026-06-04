import type {TextStyle} from 'react-native';

import {colors} from '@/theme/colors';

export const typography = {
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 28,
  } satisfies TextStyle,
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    lineHeight: 22,
  } satisfies TextStyle,
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 18,
  } satisfies TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 16,
  } satisfies TextStyle,
} as const;
