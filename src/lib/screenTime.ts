import { NativeModules } from 'react-native';

const { ScreenTimeModule } = NativeModules;

export async function requestScreenTimePermission(): Promise<string> {
  return await ScreenTimeModule.requestAuthorization();
}

export async function getAppUsage(date: string): Promise<any[]> {
  return await ScreenTimeModule.getUsageData(date);
}