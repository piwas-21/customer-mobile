import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
const i18n = createInstance();
const en = {
  appName: 'Sofra',
  chooseRestaurant: 'Find your restaurant',
  restaurantIntro: 'Your favourites, at your table or on the go.',
  searchRestaurants: 'Search restaurants',
  menu: 'Menu',
  orders: 'Orders',
  account: 'Account',
  switchRestaurant: 'Switch restaurant',
  tryAgain: 'Try again',
  loading: 'Loading…',
  unavailable: 'We could not reach the restaurants. Try again shortly.',
  noRestaurants: 'No restaurants found. Try a different name.',
  searchMenu: 'Search the menu',
  menuUnavailable: 'The menu is unavailable right now. Please try again.',
  emptyMenu: 'There are no dishes to show yet.',
  recordedAllergens: 'Recorded allergens: {{allergens}}',
  allergensUnknown: 'Allergen information unavailable. Please ask the restaurant.',
  unavailableDish: 'Currently unavailable',
  viewDish: 'View {{name}}',
  basket: 'Basket',
  quantity: 'Quantity',
  next: 'Next',
  addToBasket: 'Add to basket',
  scanQr: 'Scan restaurant QR',
  cameraPermission: 'Allow the camera to scan the restaurant’s QR code.',
  allowCamera: 'Allow camera',
  invalidQr: 'This QR code could not be opened. Use the restaurant’s app link or try another code.',
  accountIntro: 'Your account belongs to the selected restaurant.',
  accountUnavailable:
    'Account access is being prepared for this restaurant. You can continue browsing the menu.',
  ordersIntro: 'Order updates will appear here for this restaurant.',
  priceUnavailable: 'Price unavailable',
  noOrders: 'Order history is not available yet. You can continue exploring the menu.',
  backToMenu: 'Explore the menu',
  itemDetails: 'Dish details',
  safeWeb: 'Continue on restaurant website',
  webHelp: 'The restaurant website is available while native ordering is being prepared.',
};
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: getLocales()[0]?.languageCode ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
export default i18n;
