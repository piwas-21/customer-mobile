import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { runtimeConfig } from '../../config';
import type { Directory } from '../../core/directory';
import Button from '../../ui/Button';
import SavedMenusModal from './SavedMenusModal';
export default function SavedMenusControl({
  directory,
}: Readonly<{ directory: Directory | undefined }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!runtimeConfig) return null;
  return (
    <>
      <Button label={t('savedMenus')} secondary onPress={() => setOpen(true)} />
      {open ? (
        <SavedMenusModal
          environment={runtimeConfig.environment}
          directory={directory}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
