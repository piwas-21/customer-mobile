import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { runtimeConfig } from '../../config';
import { tableAdmissionInbox } from '../../core/tableAdmissionInbox';
import { resolveScanEntry } from '../../core/scanEntry';
import Screen from '../../ui/Screen';
import Button from '../../ui/Button';
import Feedback from '../../ui/Feedback';
import { useRestaurant } from './RestaurantProvider';
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(false);
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { directory, select } = useRestaurant();
  if (!permission?.granted)
    return (
      <Screen bottom>
        <Feedback message={t('cameraPermission')} />
        <Button
          label={t('allowCamera')}
          onPress={() => {
            void requestPermission();
          }}
        />
      </Screen>
    );
  return (
    <Screen bottom>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          scanned
            ? undefined
            : ({ data }) => {
                setScanned(true);
                tableAdmissionInbox.clear();
                try {
                  if (!directory || !runtimeConfig) throw new Error('Directory required');
                  const link = resolveScanEntry(data, runtimeConfig.linkOrigin, directory);
                  if (link.destination !== 'menu' && link.destination !== 'table')
                    throw new Error('Destination unavailable');
                  if (!select(link.tenantId)) throw new Error('Restaurant unavailable');
                  if (link.destination === 'table' && link.reference) {
                    tableAdmissionInbox.receive(link.tenantId, link.reference);
                    router.replace('/table');
                  } else router.replace('/menu');
                } catch {
                  setError(true);
                }
              }
        }
      />
      {error ? (
        <Feedback
          message={t('invalidQr')}
          retry={() => {
            setError(false);
            setScanned(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ camera: { flex: 1, minHeight: 240 } });
