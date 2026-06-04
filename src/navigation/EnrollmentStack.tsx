import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useTranslation} from 'react-i18next';

import {EnrollmentProvider} from '@/screens/enrollment/EnrollmentContext';
import {EnrollmentReviewScreen} from '@/screens/enrollment/EnrollmentReviewScreen';
import {MultiAngleCaptureScreen} from '@/screens/enrollment/MultiAngleCaptureScreen';
import {ReferenceThumbnailScreen} from '@/screens/enrollment/ReferenceThumbnailScreen';
import {WorkerDetailsScreen} from '@/screens/enrollment/WorkerDetailsScreen';
import {colors} from '@/theme/colors';

export type EnrollmentStackParamList = {
  WorkerDetails: undefined;
  MultiAngleCapture: undefined;
  ReferenceThumbnail: undefined;
  EnrollmentReview: undefined;
};

const Stack = createStackNavigator<EnrollmentStackParamList>();

function EnrollmentNavigator(): React.JSX.Element {
  const {t} = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="WorkerDetails"
      screenOptions={{
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.primary,
        headerTitleStyle: {color: colors.text, fontWeight: '600'},
        headerShadowVisible: true,
      }}>
      <Stack.Screen
        name="WorkerDetails"
        component={WorkerDetailsScreen}
        options={{title: t('enrollment.title')}}
      />
      <Stack.Screen
        name="MultiAngleCapture"
        component={MultiAngleCaptureScreen}
        options={{title: t('enrollment.stepCapture'), headerShown: false}}
      />
      <Stack.Screen
        name="ReferenceThumbnail"
        component={ReferenceThumbnailScreen}
        options={{title: t('enrollment.stepThumbnail')}}
      />
      <Stack.Screen
        name="EnrollmentReview"
        component={EnrollmentReviewScreen}
        options={{title: t('enrollment.stepReview')}}
      />
    </Stack.Navigator>
  );
}

export function EnrollmentStack(): React.JSX.Element {
  return (
    <EnrollmentProvider>
      <EnrollmentNavigator />
    </EnrollmentProvider>
  );
}
