import { StyleSheet, Text, View } from 'react-native';

export default function BootScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>F2H</Text>
      <Text style={styles.subtitle}>Family vault. Scaffold ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F8FF',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#2F5BEA',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
});
