import { Platform, requireNativeComponent, ViewStyle } from 'react-native';

type NativeProps = {
  tokenKey: string;
  color?: string;
  fontSize?: number;
  iconOnly?: boolean;
  style?: ViewStyle;
};

const NativeAppTokenLabel = Platform.OS === 'ios'
  ? requireNativeComponent<NativeProps>('AppTokenLabel')
  : null;

type Props = {
  tokenKey: string;
  color?: string;
  fontSize?: number;
  iconOnly?: boolean;
  style?: ViewStyle;
};

export function AppTokenLabel({ tokenKey, color = '#f0ede8', fontSize = 14, iconOnly = false, style }: Props) {
  if (!NativeAppTokenLabel) return null;
  return (
    <NativeAppTokenLabel
      tokenKey={tokenKey}
      color={color}
      fontSize={fontSize}
      iconOnly={iconOnly}
      style={style}
    />
  );
}
