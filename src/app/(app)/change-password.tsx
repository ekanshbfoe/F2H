import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { CascadeList } from '@/components/motion';
import { Badge, Button, Callout, Card, Screen, TextField } from '@/components/ui';
import { changePassword } from '@/features/auth/api';
import { changePasswordSchema, type ChangePasswordForm } from '@/features/auth/model';
import { describeAuthError } from '@/features/auth/routes';
import { useTheme } from '@/theme';

/** Change password while unlocked (AC-16). */
export default function ChangePasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      await changePassword(values.current, values.password);
      setDone(true);
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen
      title="Change password"
      subtitle="Your vault key is wrapped again under the new password. The Admin recovery path is untouched."
      footer={
        done ? (
          <Button onPress={() => router.back()}>Done</Button>
        ) : (
          <Button loading={busy} onPress={() => void submit()} testID="change-submit">
            Update password
          </Button>
        )
      }
    >
      {done ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Badge tone="success">Password updated</Badge>
          <Callout>
            Use the new password the next time this phone asks for it. Other approved phones keep
            working.
          </Callout>
        </Card>
      ) : (
        <Card style={{ gap: t.spacing.md }}>
          <CascadeList gap="md">
            <Controller
              control={form.control}
              name="current"
              render={({ field, fieldState }) => (
                <TextField
                  label="Current password"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  secure
                  autoComplete="current-password"
                />
              )}
            />
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
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Card>
      )}
    </Screen>
  );
}
