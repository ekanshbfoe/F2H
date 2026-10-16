import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Pressable, Switch, View } from 'react-native';

import { Badge, Button, Callout, Card, Screen, Text, TextField } from '@/components/ui';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { VaultItemError } from '@/features/vault/items';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useTheme } from '@/theme';

import {
  DEFAULT_OPTIONS,
  generatePassword,
  MAX_LENGTH,
  MIN_LENGTH,
  strengthBits,
  strengthLabel,
  type GeneratorOptions,
  type SetName,
} from '../generator';
import { categoryIcon } from '../components';
import {
  canonicalCategory,
  CATEGORY_MAX,
  categoryChoices,
  categoryHint,
  categoryLabel,
  credentialFormSchema,
  credentialPayloadSchema,
  FIELD_MAX,
  starterFields,
  toForm,
  toPayloadInput,
  type Category,
  type CredentialForm,
} from '../model';
import { credentialHref } from '../routes';
import { useCredentials } from '../store';

const SET_LABEL: Record<SetName, string> = {
  lower: 'a to z',
  upper: 'A to Z',
  digits: '0 to 9',
  symbols: 'Symbols',
};

/** Add or edit one credential (spec 0004, AC-2, AC-3, AC-5). `?id=` edits, no id adds. */
export function CredentialFormScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock('f2h:credential-form');
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useCredentials((s) => (id ? s.items[id] : undefined));
  const items = useCredentials((s) => s.items);
  const save = useCredentials((s) => s.save);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  const [draft, setDraft] = useState('');
  const form = useForm<CredentialForm>({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: toForm(existing?.payload ?? null),
  });
  const fields = useFieldArray({ control: form.control, name: 'fields' });
  const { release } = useDiscardGuard(form.formState.isDirty);
  const category = useWatch({ control: form.control, name: 'category' });

  // every preset and every name the family already used; a name typed just now joins them
  const choices = useMemo(() => {
    const list = categoryChoices(Object.values(items));
    return list.includes(category) ? list : [...list, category];
  }, [items, category]);

  const addCategory = () => {
    const name = canonicalCategory(newName);
    if (!name) return;
    pickCategory(name);
    setNaming(false);
    setNewName('');
  };

  const pickCategory = (c: Category) => {
    const before = form.getValues();
    form.setValue('category', c);
    // a new item that still holds only untouched starter rows gets the new category's starters
    const untouched = before.fields.every((f) => !f.value);
    if (!existing && untouched) fields.replace(starterFields(c));
  };

  const regenerate = (o: GeneratorOptions) => {
    setOptions(o);
    setDraft(generatePassword(o));
  };

  const submit = form.handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      const payload = credentialPayloadSchema.parse(toPayloadInput(values));
      const saved = await save(payload, existing);
      release();
      router.replace(credentialHref(saved.id));
    } catch (e) {
      setError(
        e instanceof VaultItemError && e.code === 'stale_version'
          ? 'Another phone changed this credential while you edited it. Go back, refresh, and edit again.'
          : e instanceof Error && /locked/.test(e.message)
            ? 'The vault locked. Unlock with your PIN and save again.'
            : 'Could not save. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  });

  if (id && !existing) {
    return (
      <Screen title="Edit credential">
        <Callout tone="danger">This credential is no longer in your vault.</Callout>
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      </Screen>
    );
  }

  const bits = strengthBits(options);

  return (
    <Screen
      title={existing ? 'Edit credential' : 'New credential'}
      subtitle="Encrypted on this phone before it is saved."
      footer={
        <>
          <Button loading={busy} onPress={() => void submit()} testID="credential-save">
            Save
          </Button>
          <Button variant="ghost" disabled={busy} onPress={() => router.back()}>
            Cancel
          </Button>
        </>
      }
    >
      <Card style={{ gap: t.spacing.md }}>
        <Text variant="label" color="primary">
          Category
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Category"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}
        >
          {choices.map((c) => {
            const selected = c === category;
            return (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={categoryLabel(c)}
                onPress={() => pickCategory(c)}
                testID={`credential-category-${c}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.xs,
                  minHeight: t.sizes.touch,
                  paddingHorizontal: t.spacing.md,
                  borderRadius: t.radii.pill,
                  backgroundColor: selected ? t.colors.primary : t.colors.canvas,
                  borderWidth: t.sizes.hairline,
                  borderColor: selected ? t.colors.primary : t.colors.line,
                }}
              >
                <Ionicons
                  name={categoryIcon(c)}
                  size={t.sizes.icon}
                  color={selected ? t.colors.onPrimary : t.colors.primary}
                />
                <Text variant="label" color={selected ? 'onPrimary' : 'ink'}>
                  {categoryLabel(c)}
                </Text>
              </Pressable>
            );
          })}
          {naming ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New category"
              onPress={() => setNaming(true)}
              testID="credential-category-new"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.xs,
                minHeight: t.sizes.touch,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radii.pill,
                borderWidth: t.sizes.hairline,
                borderStyle: 'dashed',
                borderColor: t.colors.lineStrong,
              }}
            >
              <Ionicons name="add" size={t.sizes.icon} color={t.colors.primary} />
              <Text variant="label" color="primary">
                New
              </Text>
            </Pressable>
          )}
        </View>
        {naming ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Category name"
                placeholder="Game pass, School, Insurance"
                value={newName}
                onChangeText={setNewName}
                maxLength={CATEGORY_MAX}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addCategory}
                testID="credential-category-name"
              />
            </View>
            <Button
              size="sm"
              fullWidth={false}
              onPress={addCategory}
              disabled={!newName.trim()}
              testID="credential-category-add"
            >
              Add
            </Button>
          </View>
        ) : null}
        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <TextField
              label="Title"
              placeholder={categoryHint(category)}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              testID="credential-title"
            />
          )}
        />
        <Controller
          control={form.control}
          name="username"
          render={({ field, fieldState }) => (
            <TextField
              label="Username or email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoCorrect={false}
              testID="credential-username-input"
            />
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secure
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              testID="credential-password-input"
            />
          )}
        />
        <Button
          variant="ghost"
          size="sm"
          onPress={() => {
            setShowGenerator((v) => !v);
            if (!draft) setDraft(generatePassword(options));
          }}
          testID="credential-generator-toggle"
        >
          {showGenerator ? 'Hide the generator' : 'Make a strong password'}
        </Button>
        {showGenerator ? (
          <View
            style={{
              gap: t.spacing.md,
              padding: t.spacing.md,
              borderRadius: t.radii.lg,
              backgroundColor: t.colors.skyTint,
            }}
            testID="credential-generator"
          >
            <Text variant="label" selectable testID="credential-generated">
              {draft}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Badge tone={bits >= 80 ? 'success' : bits >= 60 ? 'warning' : 'danger'}>
                {`${strengthLabel(bits)} · ${bits} bits`}
              </Badge>
              <View style={{ flex: 1 }} />
              <Stepper
                value={options.length}
                onChange={(length) => regenerate({ ...options, length })}
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {(Object.keys(SET_LABEL) as SetName[]).map((k) => {
                const on = options.sets[k];
                const last = on && Object.values(options.sets).filter(Boolean).length === 1;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: last }}
                    disabled={last}
                    onPress={() => regenerate({ ...options, sets: { ...options.sets, [k]: !on } })}
                    testID={`credential-set-${k}`}
                    style={{
                      paddingHorizontal: t.spacing.md,
                      minHeight: t.sizes.touch - 8,
                      justifyContent: 'center',
                      borderRadius: t.radii.pill,
                      backgroundColor: on ? t.colors.primary : t.colors.surface,
                    }}
                  >
                    <Text variant="caption" color={on ? 'onPrimary' : 'ink'}>
                      {SET_LABEL[k]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => regenerate(options)}
                  testID="credential-regenerate"
                >
                  New one
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  size="sm"
                  onPress={() => {
                    form.setValue('password', draft, { shouldValidate: true, shouldDirty: true });
                    setShowGenerator(false);
                  }}
                  testID="credential-use-generated"
                >
                  Use this password
                </Button>
              </View>
            </View>
          </View>
        ) : null}
        <Controller
          control={form.control}
          name="url"
          render={({ field, fieldState }) => (
            <TextField
              label="Website (optional)"
              placeholder="bank.example.com"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="credential-url-input"
            />
          )}
        />
      </Card>

      <Card style={{ gap: t.spacing.md }}>
        <Text variant="heading">Extra fields</Text>
        {fields.fields.map((f, i) => (
          <View key={f.id} style={{ gap: t.spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Controller
                  control={form.control}
                  name={`fields.${i}.label`}
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Field name"
                      value={field.value}
                      onChangeText={field.onChange}
                      error={fieldState.error?.message}
                      testID={`credential-field-label-${i}`}
                    />
                  )}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove field ${i + 1}`}
                onPress={() => fields.remove(i)}
                hitSlop={8}
                style={{ minHeight: t.sizes.touch, justifyContent: 'center' }}
              >
                <Ionicons name="trash-outline" size={t.sizes.iconLg} color={t.colors.danger} />
              </Pressable>
            </View>
            <Controller
              control={form.control}
              name={`fields.${i}.secret`}
              render={({ field: secretField }) => (
                <>
                  <Controller
                    control={form.control}
                    name={`fields.${i}.value`}
                    render={({ field, fieldState }) => (
                      <TextField
                        label="Value"
                        value={field.value}
                        onChangeText={field.onChange}
                        error={fieldState.error?.message}
                        secure={secretField.value}
                        autoCapitalize="none"
                        autoCorrect={false}
                        testID={`credential-field-value-${i}`}
                      />
                    )}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                    <Text variant="caption" style={{ flex: 1 }}>
                      Hide it until revealed
                    </Text>
                    <Switch
                      value={secretField.value}
                      onValueChange={secretField.onChange}
                      accessibilityLabel={`Field ${i + 1} is secret`}
                      trackColor={{ true: t.colors.primary, false: t.colors.lineStrong }}
                      testID={`credential-field-secret-${i}`}
                    />
                  </View>
                </>
              )}
            />
          </View>
        ))}
        {fields.fields.length < FIELD_MAX ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => fields.append({ label: '', value: '', secret: false })}
            testID="credential-add-field"
          >
            Add a field
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
              testID="credential-note"
            />
          )}
        />
      </Card>
      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  const step = (d: number) => onChange(Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, value + d)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Shorter"
        disabled={value <= MIN_LENGTH}
        onPress={() => step(-4)}
        hitSlop={6}
        testID="credential-length-down"
      >
        <Ionicons name="remove-circle-outline" size={t.sizes.iconLg} color={t.colors.primary} />
      </Pressable>
      <Text variant="label" accessibilityLabel={`${value} characters`} testID="credential-length">
        {String(value)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Longer"
        disabled={value >= MAX_LENGTH}
        onPress={() => step(4)}
        hitSlop={6}
        testID="credential-length-up"
      >
        <Ionicons name="add-circle-outline" size={t.sizes.iconLg} color={t.colors.primary} />
      </Pressable>
    </View>
  );
}
