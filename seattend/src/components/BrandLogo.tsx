import { Image } from 'react-native';

type BrandLogoProps = {
  width?: number;
  height?: number;
};

export default function BrandLogo({ width = 132, height = 48 }: BrandLogoProps) {
  return (
    <Image
      source={require('../../assets/Samridhi_Enterprises_logo.png')}
      resizeMode="contain"
      accessibilityLabel="Samridhi Enterprises logo"
      style={{ width, height }}
    />
  );
}
