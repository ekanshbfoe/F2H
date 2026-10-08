import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CardDeck,
  CascadeList,
  GlowBox,
  MorphButton,
  SegmentedToggle,
  type GlowState,
  type MorphState,
} from '@/components/motion';
import { PinEntry, PinProgress } from '@/components/lock';
import { Avatar, Badge, Button, Callout, Card, Row, Sheet, Text, TextField } from '@/components/ui';
import { benchScrypt, localWrap, type KdfBenchResult } from '@/crypto';
import { useTheme } from '@/theme';

/** Dev only gallery of every primitive and motion. Not reachable in production. */
export default function GalleryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<0 | 1>(0);
  const [sheet, setSheet] = useState(false);
  const [morph, setMorph] = useState<MorphState>('idle');
  const [glow, setGlow] = useState<GlowState>('idle');
  const [deckKey, setDeckKey] = useState(0);
  const [email, setEmail] = useState('');
  const [bench, setBench] = useState<KdfBenchResult[] | 'running' | null>(null);
  const [pin, setPin] = useState('');
  const [unlockMs, setUnlockMs] = useState<number | 'running' | null>(null);

  useEffect(() => {
    if (morph === 'pending') {
      const id = setTimeout(() => setMorph('success'), 1500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [morph]);

  if (!__DEV__) return null;

  const cards = [
    { id: 'a', title: 'Your family’s vault', color: t.colors.warmOrange },
    { id: 'b', title: 'Encrypted before it leaves your phone', color: t.colors.warmYellow },
    { id: 'c', title: 'Admin approves every device', color: t.colors.warmRed },
  ];

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.huge,
        paddingHorizontal: t.sizes.sheetInset,
        gap: t.spacing.xxl,
        backgroundColor: t.colors.canvas,
      }}
    >
      <Text variant="title" accessibilityRole="header">
        Component gallery
      </Text>

      <Section title="Buttons">
        <Button onPress={() => undefined}>Primary</Button>
        <Button variant="secondary" onPress={() => undefined}>
          Secondary
        </Button>
        <Button variant="danger" onPress={() => undefined}>
          Danger
        </Button>
        <Button variant="ghost" fullWidth={false} onPress={() => undefined}>
          Ghost
        </Button>
        <Button loading onPress={() => undefined}>
          Loading
        </Button>
        <Button disabled onPress={() => undefined}>
          Disabled
        </Button>
      </Section>

      <Section title="Text fields">
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          hint="We never email you; the Admin approves you."
        />
        <TextField label="Password" value="hunter2hunter2" onChangeText={() => undefined} secure />
        <TextField
          label="Confirm password"
          value="nope"
          onChangeText={() => undefined}
          secure
          error="Passwords do not match"
        />
      </Section>

      <Section title="Cards, callouts, rows, badges">
        <Callout
          icon={<Ionicons name="information-circle" size={t.sizes.iconLg} color={t.colors.sky} />}
        >
          Brother wants to sign in from a new phone. Approve only if you recognise it.
        </Callout>
        <Row label="Device" value="Pixel 8" />
        <Row label="Location" value="Delhi, IN" dashed />
        <Row label="Open details" onPress={() => undefined} />
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
          <Badge>Neutral</Badge>
          <Badge tone="primary">Pending</Badge>
          <Badge tone="success">Approved</Badge>
          <Badge tone="danger">Revoked</Badge>
          <Badge tone="warning">Degraded</Badge>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
          <Avatar name="Ekansh Srivastava" />
          <Avatar name="Father" size="lg" />
        </View>
        <Card dashed elevation="flat">
          <Text variant="caption" color="muted">
            Dashed placeholder card
          </Text>
        </Card>
      </Section>

      <Section title="Segmented toggle + cascade">
        <SegmentedToggle options={['Login', 'Sign up']} value={mode} onChange={setMode} />
        <CascadeList>
          {mode === 1 ? (
            <TextField key="username" label="Username" value="" onChangeText={() => undefined} />
          ) : null}
          <TextField key="email" label="Email" value="" onChangeText={() => undefined} />
          <TextField
            key="password"
            label="Password"
            value=""
            onChangeText={() => undefined}
            secure
          />
          {mode === 1 ? (
            <TextField
              key="confirm"
              label="Confirm password"
              value=""
              onChangeText={() => undefined}
              secure
            />
          ) : null}
        </CascadeList>
      </Section>

      <Section title="Glow boxes">
        <View style={{ flexDirection: 'row', gap: t.spacing.md, justifyContent: 'center' }}>
          {['6', '9', '8', '8'].map((d, i) => (
            <GlowBox key={i} value={glow === 'idle' ? '' : d} state={glow} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
          {(['idle', 'filled', 'success', 'error'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              fullWidth={false}
              variant={glow === s ? 'primary' : 'secondary'}
              onPress={() => setGlow(s)}
            >
              {s}
            </Button>
          ))}
        </View>
      </Section>

      <Section title="Morph button + radial reveal">
        <View style={{ minHeight: 320 }}>
          <MorphButton
            state={morph}
            label="Approve"
            onPress={() => setMorph('pending')}
            pendingTitle="Approving"
            pendingSubtitle="Checking the device key"
            onStop={() => setMorph('idle')}
            success={
              <View style={{ alignItems: 'center', gap: t.spacing.md }}>
                <Ionicons name="checkmark-circle" size={64} color={t.colors.primary} />
                <Text variant="title" color="primary">
                  All set
                </Text>
                <Button variant="secondary" fullWidth={false} onPress={() => setMorph('idle')}>
                  Done
                </Button>
              </View>
            }
          >
            <Callout>Approving lets this phone open the vault with a PIN.</Callout>
            <Row label="Device" value="Pixel 8" dashed />
            <Row label="Where" value="Delhi, IN" dashed />
          </MorphButton>
        </View>
      </Section>

      <Section title="Sheet">
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Open sheet
        </Button>
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          onBack={() => setSheet(false)}
          title="Approve device"
          footer={<Button onPress={() => setSheet(false)}>Approve</Button>}
        >
          <Callout>Brother wants to sign in from a new phone.</Callout>
          <Row label="Device" value="Pixel 8" dashed />
          <Row label="Time" value="Just now" dashed />
        </Sheet>
      </Section>

      <Section title="Crypto bench">
        <Card>
          <Text variant="body" color="muted">
            scrypt r=8 p=1 on this device. Copy the numbers into the SCRYPT_DEFAULT comment in
            src/crypto/kdf.ts.
          </Text>
          {bench !== null && bench !== 'running'
            ? bench.map((r) => (
                <Row key={r.N} label={`N = 2^${Math.log2(r.N)}`} value={`${r.ms} ms`} />
              ))
            : null}
          <Button
            loading={bench === 'running'}
            onPress={() => {
              setBench('running');
              benchScrypt()
                .then(setBench)
                .catch(() => setBench(null));
            }}
          >
            Run KDF benchmark
          </Button>
        </Card>
        <Card>
          <Text variant="body" color="muted">
            One PIN unlock derivation (SCRYPT_DEFAULT plus HKDF). Record the number in the spec 0002
            follow up.
          </Text>
          {typeof unlockMs === 'number' ? (
            <Row label="Unlock derivation" value={`${unlockMs} ms`} />
          ) : null}
          <PinProgress visible={unlockMs === 'running'} label="Deriving" />
          <Button
            variant="secondary"
            loading={unlockMs === 'running'}
            onPress={() => {
              setUnlockMs('running');
              const salt = localWrap.generateDeviceSalt();
              const secret = localWrap.generateDeviceSecret();
              const started = Date.now();
              localWrap
                .deriveLocalWrapKey('482913', salt, secret)
                .then(() => setUnlockMs(Date.now() - started))
                .catch(() => setUnlockMs(null));
            }}
          >
            Time one PIN unlock
          </Button>
        </Card>
      </Section>

      <Section title="PIN entry">
        <Card style={{ alignItems: 'center' }}>
          <PinEntry value={pin} onChange={setPin} onComplete={() => setPin('')} />
        </Card>
      </Section>

      <Section title="Card deck (onboarding palette)">
        <CardDeck
          key={deckKey}
          cards={cards}
          keyOf={(c) => c.id}
          height={260}
          onEmpty={() => setDeckKey((k) => k + 1)}
          renderCard={(c) => (
            <Card elevation="floating" style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Text variant="title" style={{ color: c.color }}>
                {c.title}
              </Text>
              <Text variant="caption" color="muted">
                Swipe left or right
              </Text>
            </Card>
          )}
        />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.md }}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}
