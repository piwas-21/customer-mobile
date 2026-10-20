export const cancellationEnglish = {
  cancellation: {
    title: 'Decline preparation delay',
    explanation:
      'If you cannot accept the restaurant’s preparation delay, ask to cancel this order. The restaurant checks whether it is still eligible. This action does not issue a refund.',
    confirm: 'Yes, decline delay and request cancellation',
    keep: 'Keep order and return to receipt',
    unavailable:
      'This action could not be checked. Return to the receipt or contact the restaurant.',
    unknown:
      'The result is unconfirmed. Check the original action before changing your basket or placing another order.',
    check: 'Check original cancellation',
    retry: 'Retry original cancellation request',
    retryExplanation:
      'The restaurant has not recorded a result yet. The earlier request may still arrive. This retries that same request; it does not create another cancellation or refund.',
    confirmRetry: 'Retry the same cancellation request',
    outcome: {
      Pending: 'A cancellation request is unresolved. Check it before placing another order.',
      Unseen:
        'The restaurant has not recorded this cancellation yet. Your original request may still arrive. Check again or explicitly retry the same request.',
      Cancelled:
        'The restaurant confirmed cancellation of this order. No refund was issued by this action.',
      Refused:
        'The restaurant could not cancel this order through the app. Check the current receipt and contact the restaurant.',
    },
    reason: {
      OrderChanged: 'The order changed. Check the latest receipt and contact the restaurant.',
      NotAwaitingCustomerApproval:
        'This order is no longer waiting for your decision about a preparation delay.',
      RestaurantManaged: 'The restaurant needs to handle this order. Contact the restaurant.',
      FinancialReview:
        'The restaurant needs to review payments or adjustments before any cancellation. Contact the restaurant.',
      OrderingUnavailable:
        'This restaurant cannot accept this action in the app. Contact the restaurant.',
    },
  },
};
