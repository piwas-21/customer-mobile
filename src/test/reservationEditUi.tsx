import { fireEvent, waitFor, type render } from '@testing-library/react-native';
import { reservationForms } from './reservationUi';
import { ownedReservationUiFixture } from './reservationOwnedUi';
import { reservationEditPath } from '../core/reservationPaths';
export async function reservationEditUiFixture(hidden = false) {
  const f = await ownedReservationUiFixture();
  const item = {
    reservationId: f.applied.reservationId,
    reservationDate: '2030-05-17',
    startTime: '18:00:00',
    endTime: '20:00:00',
    numberOfGuests: 6,
    status: 'Confirmed',
    specialRequests: 'Existing instructions',
  };
  const contact = {
    customerName: 'Existing customer',
    customerEmail: 'existing@example.test',
    customerPhone: '+41000000001',
  };
  const editContext = {
    schemaVersion: 1,
    tenantId: f.context.tenant.id,
    timeZone: 'Europe/Zurich',
    reservation: item,
    contact,
  };
  const review = {
    schemaVersion: 1,
    proof: { ...f.proof, ownerProof: 'protected_edit_review' },
    original: { ...item },
    proposed: { ...item },
    timeZone: 'Europe/Zurich',
  };
  f.fetcher.mockImplementation((url) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.endsWith('/bootstrap')) return Promise.resolve(f.reply(f.bootstrap.data));
    if (path === '/api/FormFieldConfiguration') {
      const forms = reservationForms();
      if (hidden)
        for (const field of forms[0]!.fields)
          if (['customerPhone', 'specialRequests'].includes(field.fieldKey))
            field.isVisible = false;
      return Promise.resolve(f.reply(forms));
    }
    if (path.endsWith('/availability'))
      return Promise.resolve(
        f.reply({
          schemaVersion: 1,
          reservationId: item.reservationId,
          date: parsed.searchParams.get('date'),
          numberOfGuests: Number(parsed.searchParams.get('numberOfGuests')),
          timeZone: 'Europe/Zurich',
          slots: [{ startTime: '20:00:00', endTime: '22:00:00' }],
        }),
      );
    if (path === reservationEditPath + '/prepare') return Promise.resolve(f.reply(review));
    if (path.startsWith(reservationEditPath)) return Promise.resolve(f.reply(f.applied));
    if (path.endsWith('/edit')) return Promise.resolve(f.reply(editContext));
    return Promise.resolve(f.reply(item));
  });
  return { ...f, item, contact, editContext, review };
}
export async function openReservationEditor(view: ReturnType<typeof render>) {
  const edit = await view.findByRole('button', { name: 'Change reservation' });
  await waitFor(() => expect(edit).not.toBeDisabled());
  fireEvent.press(edit);
  await view.findByLabelText('Name');
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Review booking changes' })).not.toBeDisabled(),
  );
}
