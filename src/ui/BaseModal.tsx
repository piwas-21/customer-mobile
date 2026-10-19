import type { PropsWithChildren } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Screen from './Screen';
import { spacing, typography, useTheme } from './theme';
type Props = PropsWithChildren<{ title: string; onClose: () => void }>;
export default function BaseModal({ title, onClose, children }: Readonly<Props>) {
  const theme = useTheme();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <Screen bottom>
          <View style={styles.fill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.content}
            >
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                {title}
              </Text>
              {children}
            </ScrollView>
          </View>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: typography.heading, fontWeight: '600' },
});
