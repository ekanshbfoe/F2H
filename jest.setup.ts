// Global test setup. Keep it minimal; feature tests add their own mocks.
import 'react-native-gesture-handler/jestSetup';

// Reanimated 4 runs in Jest through react-native-worklets' resolver (jest.config.js),
// which swaps the native worklets bindings for their JS fallbacks.
require('react-native-reanimated').setUpTests();
