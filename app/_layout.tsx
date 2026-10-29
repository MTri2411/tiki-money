import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Lora_500Medium } from '@expo-google-fonts/lora';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider } from '@/components/AuthProvider';
import { CategoryProvider } from '@/components/CategoryProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Lora_500Medium,
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <CategoryProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </CategoryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
