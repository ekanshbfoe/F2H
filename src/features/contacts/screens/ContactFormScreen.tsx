import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { Button, Callout, Card, Screen, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme';

import { ContactsError } from '../api';
import {
  contactFormSchema,
  contactPayloadSchema,
  MAX_PHONES,
  toForm,
  toPayloadInput,
  type ContactForm,
} from '../model';
import { contactHref } from '../routes';
import { useContacts } from '../store';

/** Add or edit one contact (spec 0003, AC-2, AC-6). `?id=` edits, no id adds. */
export function ContactFormScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useContacts((s) => (id ? s.items[id] : undefined));
  const save = useContacts((s) => s.save);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: toForm(existing?.payload ?? null),
  });
  const phones = useFieldArray({ control: form.control, name: 'phones' });

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      const payload = contactPayloadSchema.parse(
        toPayloadInput(values, existing?.payload.source ?? 'manual'),
      );
      const saved = await save(payload, existing);
      router.replace(contactHref(saved.id));
    } catch (e) {
      setError(
        e instanceof ContactsError && e.code === 'stale_version'
          ? 'Another phone changed this contact while you edited it. Go back, refresh, and edit again.'
          : e instanceof Error && /locked/.test(e.message)
            ? 'The vault locked. Unlock with your PIN and save again.'
            : 'Could not save the contact. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  });

  if (id && !existing) {
    return (
      <Screen title="Edit contact">
        <Callout tone="danger">This contact is no longer in your vault.</Callout>
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      </Screen>
    );
  }

  return (
    <Screen
      title={existing ? 'Edit contact' : 'New contact'}
      subtitle="Encrypted on this phone before it is saved."
      footer={
        <>
          <Button loading={busy} onPress={() => void submit()} testID="contact-save">
            Save
          </Button>
          <Button variant="ghost" disabled={busy} onPress={() => router.back()}>
            Cancel
          </Button>
        </>
      }
    >
      <Card style={{ gap: t.spacing.md }}>
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="words"
              testID="contact-name"
            />
          )}
        />
      </Card>

      <Card style={{ gap: t.spacing.md }}>
        <Text variant="heading">Numbers</Text>
        {phones.fields.map((f, i) => (
          <View key={f.id} style={{ gap: t.spacing.sm }}>
            <Controller
              control={form.control}
              name={`phones.${i}.number`}
              render={({ field, fieldState }) => (
                <TextField
                  label={`Number ${i + 1}`}
                  hint={
                    i === 0
                      ? 'A 10 digit mobile number gets +91; add + and the code for other countries.'
                      : undefined
                  }
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="phone-pad"
                  testID={`contact-number-${i}`}
                />
              )}
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Controller
                  control={form.control}
                  name={`phones.${i}.label`}
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Label"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      testID={`contact-label-${i}`}
                    />
                  )}
                />
              </View>
              {phones.fields.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove number ${i + 1}`}
                  onPress={() => phones.remove(i)}
                  hitSlop={8}
                  style={{ minHeight: t.sizes.touch, justifyContent: 'center' }}
                >
                  <Ionicons name="trash-outline" size={t.sizes.iconLg} color={t.colors.danger} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
        {form.formState.errors.phones?.message ? (
          <Text variant="caption" color="danger">
            {form.formState.errors.phones.message}
          </Text>
        ) : null}
        {phones.fields.length < MAX_PHONES ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => phones.append({ number: '', label: 'mobile' })}
            testID="contact-add-number"
          >
            Add another number
          </Button>
        ) : null}
      </Card>

      <Card style={{ gap: t.spacing.md }}>
        <Controller
          control={form.control}
          name="note"
          render={({ field, fieldState }) => (
            <TextField
              label="Note (optional)"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              multiline
              testID="contact-note"
            />
          )}
        />
      </Card>
      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  );
}
