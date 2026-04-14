import { Platform, requireNativeComponent, ViewStyle } from 'react-native';

type NativeProps = {
  tokenKey: string;
  color?: string;
  fontSize?: number;
  style?: ViewStyle;
};

const NativeAppTokenLabel = Platform.OS === 'ios'
  ? requireNativeComponent<NativeProps>('AppTokenLabel')
  : null;

type Props = {
  tokenKey: string;
  color?: string;
  fontSize?: number;
  style?: ViewStyle;
};

export function AppTokenLabel({ tokenKey, color = '#f0ede8', fontSize = 14, style }: Props) {
  if (!NativeAppTokenLabel) return null;
  return (
    <NativeAppTokenLabel
      tokenKey={tokenKey}
      color={color}
      fontSize={fontSize}
      style={style}
    />
  );
}
