import { useMemo, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HistoryReceipt } from '../../api/historyReceipt';
import Feedback from '../../ui/Feedback';
import BasketLine from '../basket/BasketLine';
import ReceiptSummary from './ReceiptSummary';
import { receiptFormatters } from './orderPresentation';
import { receiptRows } from './receiptRows';
type Props = Readonly<{
  value: HistoryReceipt | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  header?: ReactNode;
  footer?: ReactNode;
}>;
export default function ReceiptContent({ value, loading, failed, retry, header, footer }: Props) {
  const { t, i18n } = useTranslation();
  const rows = useMemo(
    () =>
      value
        ? receiptRows(value.items).map((row) => ({
            ...row,
            amount: value.currency ? row.amount : null,
          }))
        : [],
    [value],
  );
  const format = value ? receiptFormatters(value, i18n.language) : undefined;
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => (
        <BasketLine row={item} price={format!.price} edit={() => undefined} disabled />
      )}
      ListHeaderComponent={
        <View>
          {value ? <ReceiptSummary value={value} /> : null}
          {header}
          {loading ? <Feedback message={t('loading')} loading /> : null}
          {failed ? <Feedback message={t('receiptUnavailable')} retry={retry} /> : null}
        </View>
      }
      ListFooterComponent={<View>{footer}</View>}
    />
  );
}
