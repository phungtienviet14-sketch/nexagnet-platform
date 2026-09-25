import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { BUILD_INFO } from '../../config/build-info';
import type { TrackingStatus } from '../../location/background-task';
import type { LocationFacts } from '../../location/location-state';

/**
 * SU THAT VE VI TRI tren may nay — doc tu he dieu hanh, dua cho `describeLocation()` cua nen noi
 * thanh cau. Cung cach doc voi man "Tài khoản"; trinh duyet thi noi thang khong bam nen.
 */
export async function readLocationFacts(tracking: TrackingStatus): Promise<LocationFacts> {
  if (Platform.OS === 'web') {
    return {
      servicesEnabled: true,
      foreground: 'undetermined',
      foregroundCanAskAgain: true,
      background: 'undetermined',
      buildSupportsBackground: false,
      backgroundTaskRunning: false,
      platform: 'web',
    };
  }
  const [services, foreground, background] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
    BUILD_INFO.backgroundLocationBuild
      ? Location.getBackgroundPermissionsAsync()
      : Promise.resolve(null),
  ]);
  return {
    servicesEnabled: services,
    foreground: foreground.status as LocationFacts['foreground'],
    foregroundCanAskAgain: foreground.canAskAgain,
    background: (background?.status ?? 'undetermined') as LocationFacts['background'],
    buildSupportsBackground: BUILD_INFO.backgroundLocationBuild,
    backgroundTaskRunning: tracking.running,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}
