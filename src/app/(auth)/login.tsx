import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CascadeList, SegmentedToggle } from '@/components/motion';
import { Button, Callout, Card, Screen, Text, TextField } from '@/components/ui';
import { fetchRecoveryPubkey, signIn, signUp } from '@/features/auth/api';
import { formatConnectionCheck, runConnectionCheck } from '@/features/auth/diagnostics';
import { loginSchema, signupSchema, type LoginForm, type SignupForm } from '@/features/auth/model';
import { describeAuthError, pathFor } from '@/features/auth/routes';
import { getDeviceInfo } from '@/services/device-info';
import { useTheme } from '@/theme';

type Mode = 0 | 1; // 0 = Login, 1 = Sign up

/** Login / Sign up (AC-1): the reference toggle, cascading fields, one primary button. */
export default function LoginScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);

  const login = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', deviceName: getDeviceInfo().name },
    mode: 'onBlur',
  });
  const signup = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: '', email: '', inviteCode: '', password: '', confirm: '' },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (mode !== 1 || fingerprint) return;
    fetchRecoveryPubkey()
      .then((r) => setFingerprint(r?.fingerprint ?? ''))
      .catch(() => setFingerprint(''));
  }, [mode, fingerprint]);

  const submit = async (run: () => Promise<Parameters<typeof pathFor>[0]>) => {
    setBusy(true);
    setError(null);
    try {
      const route = await run();
      router.replace(pathFor(route));
    } catch (e) {
      if (__DEV__) console.warn('auth failed', e);
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bare>
      <View
        style={{
          backgroundColor: t.colors.primary,
          paddingTop: insets.top + t.spacing.xl,
          paddingBottom: t.spacing.huge + t.spacing.xl,
          paddingHorizontal: t.sizes.sheetInset,
          alignItems: 'center',
          gap: t.spacing.sm,
          borderBottomLeftRadius: t.radii.xxl,
          borderBottomRightRadius: t.radii.xxl,
        }}
      >
        <Image
          source={require('../../../assets/images/splash-icon.png')}
          accessibilityLabel="F2H bear mascot"
          style={{
            width: t.sizes.hero * 0.8,
            height: t.sizes.hero * 0.8,
            borderRadius: t.radii.xl,
          }}
        />
        <Text variant="display" color="onPrimary" accessibilityRole="header">
          F2H
        </Text>
        <Text variant="body" color="onPrimary" align="center" style={{ opacity: 0.85 }}>
          {mode === 0
            ? 'Welcome back. Your vault stays locked until this phone is yours.'
            : 'Join the family vault with the invite code the Admin gave you.'}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: t.sizes.sheetInset,
          marginTop: -t.spacing.huge,
          gap: t.spacing.lg,
        }}
      >
        <Card elevation="floating" style={{ gap: t.spacing.lg }}>
          <SegmentedToggle
            options={['Login', 'Sign up']}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            testID="auth-mode"
          />

          {mode === 0 ? (
            <CascadeList key="login" gap="md">
              <Controller
                control={login.control}
                name="email"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Email"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    testID="login-email"
                  />
                )}
              />
              <Controller
                control={login.control}
                name="password"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Password"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secure
                    autoComplete="current-password"
                    testID="login-password"
                  />
                )}
              />
              <Controller
                control={login.control}
                name="deviceName"
                render={({ field }) => (
                  <TextField
                    label="This is my phone"
                    hint="The name the Admin sees when approving it"
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </CascadeList>
          ) : (
            <CascadeList key="signup" gap="md">
              <Controller
                control={signup.control}
                name="displayName"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Your name"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoComplete="name"
                    testID="signup-name"
                  />
                )}
              />
              <Controller
                control={signup.control}
                name="email"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Email"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    testID="signup-email"
                  />
                )}
              />
              <Controller
                control={signup.control}
                name="inviteCode"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Invite code"
                    hint="8 characters from the Admin"
                    value={field.value}
                    onChangeText={(v) => field.onChange(v.toUpperCase())}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    testID="signup-invite"
                  />
                )}
              />
              <Controller
                control={signup.control}
                name="password"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Password"
                    hint="At least 10 characters. It never leaves this phone in the clear."
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secure
                    autoComplete="new-password"
                    testID="signup-password"
                  />
                )}
              />
              <Controller
                control={signup.control}
                name="confirm"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Confirm password"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secure
                    autoComplete="new-password"
                    testID="signup-confirm"
                  />
                )}
              />
            </CascadeList>
          )}

          {mode === 1 && fingerprint !== null ? (
            <Callout tone={fingerprint ? 'info' : 'danger'}>
              {fingerprint
                ? `Admin key fingerprint ${fingerprint}. Ask the Admin to read theirs aloud; they must match.`
                : 'The Admin has not finished setup yet. Ask them to open F2H first.'}
            </Callout>
          ) : null}

          {error ? <Callout tone="danger">{error}</Callout> : null}

          <Button
            loading={busy}
            onPress={() =>
              mode === 0
                ? login.handleSubmit((form) => submit(() => signIn(form)))()
                : signup.handleSubmit((form) => submit(() => signUp(form)))()
            }
            testID="auth-submit"
          >
            {mode === 0 ? 'Log in' : 'Create my account'}
          </Button>
        </Card>

        {mode === 0 ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/(auth)/forgot')}
            style={{ minHeight: t.sizes.touch, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text variant="label" color="primary">
              Forgot your password?
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" color="muted" align="center">
            Your account waits for the Admin to approve this phone before anything opens.
          </Text>
        )}
        {__DEV__ ? (
          <Card elevation="flat" style={{ gap: t.spacing.sm }}>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setDiagnostics('Checking…');
                runConnectionCheck()
                  .then((r) => setDiagnostics(formatConnectionCheck(r)))
                  .catch((e: unknown) => setDiagnostics(e instanceof Error ? e.message : 'failed'));
              }}
              testID="connection-check"
            >
              Connection check (dev)
            </Button>
            {diagnostics ? (
              <Text variant="caption" color="muted" selectable>
                {diagnostics}
              </Text>
            ) : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
