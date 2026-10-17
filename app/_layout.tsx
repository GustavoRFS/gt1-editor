import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme';
import { persistOptions, queryClient } from '../src/query/queryClient';
import '../src/i18n';
import '../global.css';

function AppStack() {
  const isRestoring = useIsRestoring();

  if (isRestoring) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <StatusBar style="light" />
      <AppStack />
    </PersistQueryClientProvider>
  );
}
