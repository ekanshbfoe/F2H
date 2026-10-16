import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

const READER = require('../../../../assets/pdfjs/viewer.html');

type Message = { type: 'ready' } | { type: 'loaded'; pages: number } | { type: 'error' };

/**
 * A decrypted PDF drawn on this phone by the bundled pdf.js page (assets/pdfjs/viewer.html). The
 * page has no network: it gets the file as base64 through a message and may not navigate
 * anywhere, so nothing in the PDF can reach out.
 */
export function PdfView({ uri, onFail }: { uri: string; onFail: () => void }) {
  const t = useTheme();
  const ref = useRef<WebView>(null);
  const [reader, setReader] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    if (msg.type === 'ready') {
      try {
        const data = await new File(uri).base64();
        ref.current?.postMessage(JSON.stringify({ type: 'open', data }));
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
