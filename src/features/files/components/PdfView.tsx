import { Asset } from 'expo-asset';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Text } from '@/components/ui';
import { toBase64 } from '@/crypto';
import { expoFileAdapter } from '@/services/file-adapter';
import { useTheme } from '@/theme';

const READER = require('../../../../assets/pdfjs/viewer.html');

type Message =
  { type: 'ready' } | { type: 'next' } | { type: 'loaded'; pages: number } | { type: 'error' };

/** Bytes per message: small parts keep the file from sitting in memory as one huge string. */
const PART = 384 * 1024;
/** A reader that has the whole file but has not drawn it by now is treated as stuck. */
const DRAW_TIMEOUT_MS = 30_000;

/**
 * A decrypted PDF drawn on this phone by the bundled pdf.js page (assets/pdfjs/viewer.html). The
 * page has no network: it gets the file in base64 parts through messages, one part per answer
 * from the page, and may not navigate anywhere, so nothing in the PDF can reach out. A reader
 * that dies (an old phone out of memory) or stalls hands over to `onFail`.
 */
export function PdfView({ uri, onFail }: { uri: string; onFail: () => void }) {
  const t = useTheme();
  const ref = useRef<WebView>(null);
  const [reader, setReader] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sent = useRef(0);
  const size = useRef(0);
  const [handedOver, setHandedOver] = useState(false);

  useEffect(() => {
    if (!handedOver || loaded) return undefined;
    const id = setTimeout(onFail, DRAW_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [handedOver, loaded, onFail]);

  useEffect(() => {
    let live = true;
    const asset = Asset.fromModule(READER);
    asset
      .downloadAsync()
      .then(() => {
        if (live) setReader(asset.localUri ?? asset.uri);
      })
      .catch(() => {
        if (live) onFail();
      });
    return () => {
      live = false;
    };
  }, [onFail]);

  const onMessage = async (e: WebViewMessageEvent) => {
    let msg: Message;
    try {
      msg = JSON.parse(e.nativeEvent.data) as Message;
    } catch {
      return;
    }
    const send = (m: object) => ref.current?.postMessage(JSON.stringify(m));
    if (msg.type === 'ready') {
      try {
        size.current = await expoFileAdapter.size(uri);
        sent.current = 0;
        send({ type: 'begin', size: size.current });
      } catch {
        onFail();
      }
    } else if (msg.type === 'next') {
      if (sent.current >= size.current) {
        send({ type: 'end' });
        setHandedOver(true);
        return;
      }
      try {
        const bytes = await expoFileAdapter.read(uri, sent.current, PART);
        sent.current += bytes.length;
        if (bytes.length === 0) sent.current = size.current;
        send({ type: 'part', data: toBase64(bytes) });
      } catch {
        onFail();
      }
    } else if (msg.type === 'loaded') {
      setLoaded(true);
    } else {
      onFail();
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {reader ? (
        <WebView
          ref={ref}
          source={{ uri: reader }}
          originWhitelist={['file://*']}
          allowFileAccess
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          incognito
          setSupportMultipleWindows={false}
          // the reader page itself, nothing else: no link in a PDF opens anything
          onShouldStartLoadWithRequest={(r) => r.url === reader}
          onMessage={(e) => void onMessage(e)}
          onError={onFail}
          onRenderProcessGone={onFail}
          style={{ backgroundColor: t.colors.canvas }}
          testID="file-pdf"
        />
      ) : null}
      {!loaded ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.center,
            { backgroundColor: t.colors.canvas, gap: t.spacing.sm },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator color={t.colors.primary} />
          <Text variant="caption" color="muted">
            Opening the PDF…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
