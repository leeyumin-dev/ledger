import { Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const adUnitId = Platform.select({
  ios: TestIds.BANNER,
  android: TestIds.BANNER,
});

export default function AdBanner() {
  return (
    <BannerAd
      unitId={adUnitId!}
      size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
    />
  );
}