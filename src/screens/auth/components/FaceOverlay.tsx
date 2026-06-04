import React from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';

import {colors} from '@/theme/colors';
import type {FaceDetection} from '@/types';

type FaceOverlayProps = {
  box: FaceDetection['box'];
  passed: boolean;
};

export function FaceOverlay({
  box,
  passed,
}: FaceOverlayProps): React.JSX.Element {
  const [layout, setLayout] = React.useState({width: 0, height: 0});

  const onLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setLayout({width, height});
  };

  const borderColor = passed ? colors.faceBox : colors.faceBoxFail;

  const frameStyle =
    layout.width > 0
      ? {
          left: box.x * layout.width,
          top: box.y * layout.height,
          width: box.width * layout.width,
          height: box.height * layout.height,
          borderColor,
        }
      : {borderColor};

  return (
    <View style={styles.container} onLayout={onLayout} pointerEvents="none">
      <View style={[styles.box, frameStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 12,
  },
});
