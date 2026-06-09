import type {ViewStyle} from 'react-native';

export const lightScreenBackgroundColor = '#f8f9f6';

export const lightScreenBackground: Pick<
  ViewStyle,
  'backgroundColor' | 'experimental_backgroundImage'
> = {
  backgroundColor: lightScreenBackgroundColor,
  experimental_backgroundImage: 'linear-gradient(to bottom, #f8f9f6, #e5e5e5)',
};
