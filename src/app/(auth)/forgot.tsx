import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { CascadeList } from '@/components/motion';
import { Badge, Button, Callout, Card, Row, Screen, Text, TextField } from '@/components/ui';
import { fetchMyGrant, redeemGrant, type MyGrant } from '@/features/auth/api';
import { newPasswordSchema, type NewPasswordForm } from '@/features/auth/model';
import { describeAuthError, pathFor } from '@/features/auth/routes';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme';

/** Forgot password (AC-15): redeem the Admin's recovery grant on this approved phone. */
export default function ForgotPasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'no_session' | 'no_grant' | 'ready' | 'done'>(
    'loading',
  );
  const [grant, setGrant] = useState<MyGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const load = useCallback(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) {
          setState('no_session');
          return;
        }
        return fetchMyGrant()
          .catch(() => null)
          .then((g) => {
            setGrant(g);
            setState(g ? 'ready' : 'no_grant');
          });
      })
      .catch(() => setState('no_grant'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = form.handleSubmit(async (values) => {
    if (!grant) return;
    setBusy(true);
    setError(null);
    try {
      const route = await redeemGrant(grant, values.password);
      setState('done');
      router.replace(pathFor(route));
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen
      title="Forgot your password?"
      subtitle="There is no reset email. The Admin issues a one time recovery grant for this exact phone."
      footer={
        state === 'ready' ? (
          <Button loading={busy} onPress={() => void submit()} testID="reset-submit">
            Set new password
          </Button>
        ) : (
          <Button variant="secondary" onPress={() => router.back()}>
            Back
          </Button>
        )
      }
    >
      {state === 'loading' ? <Callout>Checking for a recovery grant…</Callout> : null}

      {state === 'no_session' ? (
        <Card style={{ gap: t.spacing.md }}>
          <Badge tone="warning">Not signed in on this phone</Badge>
          <Text variant="body" color="muted">
            A grant can only be redeemed on a phone the Admin already approved and that is still
            signed in. If this phone never had your account, ask the Admin for a new invite instead.
          </Text>
        </Card>
      ) : null}

      {state === 'no_grant' ? (
        <Card style={{ gap: t.spacing.md }}>
          <Badge tone="neutral">No grant yet</Badge>
          <Text variant="body" color="muted">
            Ask the Admin to open Members, pick your name and this phone, and tap Create recovery
            grant. Then come back here.
          </Text>
          <Button
            variant="secondary"
            onPress={() => {
              setState('loading');
              void load();
            }}
          >
            Check again
          </Button>
        </Card>
      ) : null}

      {state === 'ready' && grant ? (
        <>
          <Card style={{ gap: t.spacing.sm }}>
            <Badge tone="success">Grant found</Badge>
            <Row dashed label="Valid until" value={new Date(grant.expires_at).toLocaleString()} />
          </Card>
          <Card style={{ gap: t.spacing.md }}>
            <CascadeList gap="md">
              <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                  <TextField
                    label="New password"
                    hint="At least 10 characters"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secure
                    autoComplete="new-password"
                  />
                )}
              />
              <Controller
                control={form.control}
                name="confirm"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Confirm new password"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    secure
                    autoComplete="new-password"
                  />
                )}
              />
            </CascadeList>
          </Card>
          <Callout>
            Your vault key is unsealed on this phone with the grant, then wrapped again under the
            new password. The Admin cannot see the password.
          </Callout>
        </>
      ) : null}

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  );
}
