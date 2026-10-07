import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  useFonts,
} from '@expo-google-fonts/poppins';

/** Loads the Poppins weights the typography tokens reference. */
export function useAppFonts(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });
  return { ready: loaded || error != null, error };
}
