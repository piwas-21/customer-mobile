import { tablesEnglish } from './translations/tables.en';
import { loyaltyEnglish } from './translations/loyalty.en';
import { nativeAccountEnglish } from './translations/nativeAccount.en';
import { reservationsEnglish } from './translations/reservations.en';
import { cancellationEnglish } from './translations/cancellation.en';
import { addressesEnglish } from './translations/addresses.en';
import { cacheEnglish } from './translations/cache.en';
import { accountEnglish } from './translations/account.en';
import { deletionEnglish } from './translations/deletion.en';
import { ordersEnglish } from './translations/orders.en';
import { checkoutEnglish } from './translations/checkout.en';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
const i18n = createInstance();
const en = {
  ...loyaltyEnglish,
  ...tablesEnglish,
  ...reservationsEnglish,
  ...nativeAccountEnglish,
  ...cacheEnglish,
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
  checkout: 'Checkout',
  reviewOrder: 'Review order',
  ...checkoutEnglish,
  ...ordersEnglish,
  ...cancellationEnglish,
  ...deletionEnglish,
  basket: 'Basket',
  basketCount: 'Basket · {{count}}',
  quantity: 'Quantity',
  decreaseQuantity: 'Decrease {{name}}',
  increaseQuantity: 'Increase {{name}}',
  optionQuantity: '{{name}} quantity',
  choicesRemaining_one: 'Choose {{count}} more',
  choicesRemaining_other: 'Choose {{count}} more',
  choicesSelected_one: '{{count}} selected',
  choicesSelected_other: '{{count}} selected',
  choiceLimits: 'Choose {{minimum}}–{{maximum}} options',
  portionLimits: 'Choose {{minimum}}–{{maximum}} portions',
  next: 'Next',
  addToBasket: 'Add to basket',
  baseOption: 'Original',
  ingredients: 'Ingredients',
  sauces: 'Sauces',
  requiredSide: 'Included with this dish',
  includedChoice: 'Included',
  dishSize: 'Choose a size',
  reviewBundle: 'Review your bundle',
  bundlePortions: '{{quantity}} × {{name}} per bundle',
  componentNotes: 'Instructions for {{name}} (optional)',
  bundleParentRequired:
    'Go back to the dish selection and choose the dish needed for this required choice.',
  reviewDish: 'Review your dish',
  orderNotes: 'Instructions for the kitchen (optional)',
  orderPriceHint: 'The restaurant confirms price and availability when you add this dish.',
  menuChanged: 'The menu changed. Please review your choices again.',
  stepProgress: 'Step {{current}} of {{total}}',
  selectedQuantity: '{{name}} × {{quantity}}',
  withoutIngredient: 'Without {{name}}',
  back: 'Back',
  openBasket: 'Open basket',
  basketEmpty: 'Your basket is empty.',
  basketUnavailable: 'Your basket could not be loaded. Try again before adding more dishes.',
  basketPending: 'An earlier change needs confirmation. Resolve it before changing your basket.',
  recoverBasket: 'Check earlier change',
  basketAddFailed:
    'We could not confirm the add. Open your basket to check before trying another dish.',
  close: 'Close',
  editBasketItem: 'Edit {{name}}',
  removeBasketItem: 'Remove item',
  removeBasketTitle: 'Remove {{name}}?',
  removeBasketConfirmation:
    'Remove {{name}} × {{quantity}} and all its included choices from your basket?',
  confirmRemoveBasketItem: 'Yes, remove item',
  keepBasketItem: 'Keep item',
  basketEditChanged:
    'Your basket changed. Close this editor and review the current item before editing again.',
  basketQuantityUnsupported:
    'This item has quantity {{quantity}}. Change this quantity on the restaurant website, or remove the item here.',
  basketNotesTooLong: 'Use up to 500 characters for kitchen instructions.',
  basketEditPriceHint:
    'The restaurant will confirm the updated price. Included choices stay with this item.',
  basketEditFailed:
    'We could not confirm the change. Close this editor and resolve the pending change in your basket.',
  stopBasketRetry: 'Stop retrying this change',
  confirmBasketCancellation: 'Confirm and check outcome',
  finishBasketCancellation: 'Finish cancellation check',
  basketCancelExplanation:
    'We will ask the restaurant to stop this change if it has not happened yet. An already applied change stays in your basket. This does not undo or remove an item.',
  basketCancelling: 'A cancellation check is pending. Finish it before changing your basket.',
  basketAlreadyApplied:
    'The earlier change was already applied. It has not been undone. Review your current basket.',
  basketCancelled: 'The earlier change was stopped. Review your current basket before continuing.',
  basketResolutionFailed:
    'The result is still unconfirmed. Your basket stays protected. Try this check again.',
  reviewBasket: 'Review current basket',
  chooseOrderType: 'How would you like to order?',
  changeOrderType: '{{type}} · Change',
  orderTypeDineIn: 'Dine in',
  orderTypeTakeaway: 'Takeaway',
  orderTypeDelivery: 'Delivery',
  orderTypesUnavailable: 'Ordering options are unavailable. Try again or ask the restaurant.',
  channelKeepExplanation:
    'Change to {{type}} and keep your items. The restaurant will update your total.',
  channelRemoveExplanation:
    'These items and their included choices are unavailable for {{type}}. Confirm to remove the listed items and update your order type and total.',
  confirmChannel: 'Change to {{type}}',
  confirmChannelRemovals: 'Remove listed items and change to {{type}}',
  channelReviewChanged: 'Your basket changed. Go back and review the ordering option again.',
  channelChangeFailed:
    'We could not confirm this change. Close this screen and check your basket before trying again.',
  serverPricedBasket: 'Prices confirmed by the restaurant',
  subtotal: 'Subtotal',
  total: 'Total',
  deliveryFee: 'Delivery fee',
  discount: 'Discount',
  checkoutPreparing: 'Checkout is being prepared. Your basket is saved for this restaurant.',
  checkoutReview: 'Review order total',
  checkoutReviewChanged: 'Your basket changed. Close this review and check the current basket.',
  checkoutQuoteUnavailable:
    'The restaurant could not confirm this total. Try again or return to your basket.',
  checkoutPriceChanged: 'Current prices differ from your basket. Review the updated total.',
  checkoutReviewOnly: 'This is a price review. No order or payment has been submitted.',
  availablePaymentMethods: 'Available payment methods',
  checkoutPaymentCash: 'Cash',
  checkoutPaymentCreditCard: 'Card at the restaurant',
  checkoutPaymentOnlinePayment: 'Online payment',
  pointsCredit: 'Points credit',
  tip: 'Tip',
  tax: 'Tax',
  scanQr: 'Scan restaurant QR',
  cameraPermission: 'Allow the camera to scan the restaurant’s QR code.',
  allowCamera: 'Allow camera',
  invalidQr: 'This QR code could not be opened. Use the restaurant’s app link or try another code.',
  ...accountEnglish,
  ...addressesEnglish,
  priceUnavailable: 'Price unavailable',
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
