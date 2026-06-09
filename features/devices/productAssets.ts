import {type ImageSourcePropType} from 'react-native';
import {DeviceType} from './types';

const productImages: Partial<Record<DeviceType, ImageSourcePropType>> = {
  'sprout-grower': require('../../assets/images/products/sprout-grower.png'),
};

export function getProductImageSource(type: DeviceType) {
  return productImages[type];
}
