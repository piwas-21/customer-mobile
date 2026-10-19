import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import Field from '../../ui/Field';
import QuantityStepper from '../../ui/QuantityStepper';
import Feedback from '../../ui/Feedback';
import { typography, useTheme } from '../../ui/theme';
import { MAX_ITEM_QUANTITY, quantityIsValid } from '../../domain/customization';
import useBasketItemEdit, { type BasketItemEditProps } from './useBasketItemEdit';
export default function BasketItemEditor(props: BasketItemEditProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const form = useBasketItemEdit(props);
  const name = props.selection.name ?? t('itemDetails');
  return (
    <BaseModal
      title={t(form.removing ? 'removeBasketTitle' : 'editBasketItem', { name })}
      onClose={form.close}
    >
      {props.changed ? <Feedback message={t('basketEditChanged')} /> : null}
      {form.removing ? (
        <Text style={[styles.body, { color: theme.text }]}>
          {t('removeBasketConfirmation', { name, quantity: props.selection.quantity })}
        </Text>
      ) : (
        <>
          {quantityIsValid(props.selection.quantity) ? (
            <QuantityStepper
              label={t('quantity')}
              value={form.quantity}
              minimum={1}
              maximum={MAX_ITEM_QUANTITY}
              disabled={!form.editable}
              onChange={form.setQuantity}
            />
          ) : (
            <Feedback
              message={t('basketQuantityUnsupported', { quantity: props.selection.quantity })}
            />
          )}
          <Field
            label={t('orderNotes')}
            value={form.notes}
            onChangeText={form.setNotes}
            multiline
            maxLength={500}
            editable={form.editable}
            {...(form.notes.length > 500 ? { error: t('basketNotesTooLong') } : {})}
          />
          <Text style={[styles.body, { color: theme.secondary }]}>{t('basketEditPriceHint')}</Text>
        </>
      )}
      {form.failed ? <Feedback message={t('basketEditFailed')} /> : null}
      {form.removing ? (
        <Button
          destructive
          label={t('confirmRemoveBasketItem')}
          busy={form.busy}
          disabled={!form.editable}
          onPress={() => {
            void form.remove();
          }}
        />
      ) : (
        <>
          <Button
            label={t('saveProfile')}
            busy={form.busy}
            disabled={!form.editable || !form.valid}
            onPress={() => {
              void form.save();
            }}
          />
          <Button
            destructive
            label={t('removeBasketItem')}
            disabled={!form.editable}
            onPress={() => form.setRemoving(true)}
          />
        </>
      )}
      {form.removing ? (
        <Button
          secondary
          label={t('keepBasketItem')}
          disabled={form.busy}
          onPress={() => form.setRemoving(false)}
        />
      ) : null}
      <Button secondary label={t('close')} disabled={form.busy} onPress={form.close} />
    </BaseModal>
  );
}
const styles = StyleSheet.create({ body: { fontSize: typography.body } });
