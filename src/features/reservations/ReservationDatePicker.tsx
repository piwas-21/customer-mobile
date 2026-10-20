import { useEffect, useRef, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import BaseModal from '../../ui/BaseModal';
import Button from '../../ui/Button';
import { useTheme } from '../../ui/theme';
import { reservationPickerDay, reservationPickerValue } from './reservationCalendar';

type Props = Readonly<{
  day: string;
  minimum: string;
  onChoose: (day: string) => void;
  onClose: () => void;
}>;
export default function ReservationDatePicker({ day, minimum, onChoose, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [draft, setDraft] = useState(day);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = (value: string) => {
    if (mounted.current && value >= minimum) onChoose(value);
  };
  const picker = (
    <DateTimePicker
      value={reservationPickerValue(draft)}
      minimumDate={reservationPickerValue(minimum)}
      mode="date"
      timeZoneName="UTC"
      themeVariant={mode}
      accentColor={theme.accent}
      locale={i18n.language}
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      onValueChange={(_event, value) => {
        if (!mounted.current) return;
        const selected = reservationPickerDay(value);
        if (selected < minimum) return;
        if (Platform.OS === 'android') choose(selected);
        else setDraft(selected);
      }}
      onDismiss={() => {
        if (mounted.current) onClose();
      }}
    />
  );
  if (Platform.OS === 'android') return picker;
  return (
    <BaseModal title={t('reservationChooseDate')} onClose={onClose}>
      {picker}
      <Button
        label={t('reservationUseDate')}
        disabled={draft < minimum}
        onPress={() => choose(draft)}
      />
      <Button secondary label={t('close')} onPress={onClose} />
    </BaseModal>
  );
}
