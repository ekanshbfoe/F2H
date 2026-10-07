import Constants from 'expo-constants';
import * as Device from 'expo-device';

export interface DeviceInfo {
  model: string;
  os: string;
  app_version: string;
  name: string;
}

/** What the phone tells the server about itself (spec value sourcing: expo-device, app.json version). */
export function getDeviceInfo(): DeviceInfo {
  const model = Device.modelName ?? 'Unknown phone';
  const os = [Device.osName ?? 'OS', Device.osVersion ?? ''].join(' ').trim();
  return {
    model,
    os,
    app_version: Constants.expoConfig?.version ?? '0.0.0',
    name: Device.deviceName ?? model,
  };
}
