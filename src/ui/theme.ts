import { useColorScheme } from 'react-native';
export const themes = {
  light: {
    background: '#F7F9FC',
    surface: '#FFFFFF',
    text: '#172C2A',
    secondary: '#4B5F63',
    accent: '#12634E',
    onAccent: '#FFFFFF',
    border: '#CFD9DC',
    danger: '#AF2535',
  },
  dark: {
    background: '#101C20',
    surface: '#1B2A30',
    text: '#F1F7F5',
    secondary: '#B4C8C8',
    accent: '#9DE0BF',
    onAccent: '#12271F',
    border: '#405257',
    danger: '#FFACB5',
  },
} as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const typography = { title: 32, heading: 23, body: 17, small: 14 } as const;
export function useTheme() {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
