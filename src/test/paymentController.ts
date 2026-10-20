import { CustomerPaymentController } from '../core/customerPaymentController';
import { SessionController } from '../core/sessionController';
import { paymentFixture, paymentDecision } from './customerPayment';
import { response } from './transport';
export async function paymentControllerFixture(customer = false) {
  const f = await paymentFixture(customer);
  const sessions = new SessionController(f.context, f.client, f.repository);
  await sessions.initialize();
  const browser = jest.fn<Promise<unknown>, [string]>().mockResolvedValue({ type: 'cancel' });
  const controller = new CustomerPaymentController(
    f.context,
    f.repository,
    sessions,
    f.principal,
    ['https://checkout.example.test'],
    browser,
  );
  return { ...f, sessions, browser, controller };
}
export const paymentReply = (outcome: Parameters<typeof paymentDecision>[0]) =>
  response({ success: true, data: paymentDecision(outcome) });
