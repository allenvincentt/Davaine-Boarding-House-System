import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { DefaultTheme } from '@/constants/defaultTheme';
import type { AppIconName } from '@/constants/icons';

type ComingSoonPlaceholderProps = {
  icon: AppIconName;
  title: string;
  description?: string;
};

export function ComingSoonPlaceholder({ icon, title, description }: ComingSoonPlaceholderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBadge}>
        <AppIcon name={icon} size={28} tintColor={DefaultTheme.colors.primary} />
      </View>
      <Text style={styles.badge}>COMING SOON</Text>
      <Text style={styles.title}>{title}</Text>
      {!!description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  badge: {
    marginTop: 20,
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  title: {
    marginTop: 8,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 24,
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    maxWidth: 360,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
