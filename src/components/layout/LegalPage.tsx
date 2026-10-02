import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageMeta } from '@/components/common/PageMeta';
import { AppIcon } from '@/components/ui/AppIcon';
import { Card } from '@/components/ui/cards/Card';
import { DefaultTheme } from '@/constants/defaultTheme';

export type LegalSection = {
  heading: string;
  body: string[];
};

type LegalPageProps = {
  title: string;
  updated: string;
  sections: LegalSection[];
};

export function LegalPage({ title, updated, sections }: LegalPageProps) {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.tablet;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  return (
    <View style={styles.page}>
      <PageMeta title={title} />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, compact && styles.contentCompact, { paddingTop: top + 20 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={goBack}>
            <AppIcon name="chevronLeft" size={15} tintColor={DefaultTheme.colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
          <Text style={styles.updated}>Last updated {updated}</Text>

          <Card style={styles.card} revealDelay={120}>
            {sections.map((section, index) => (
              <View key={section.heading} style={[styles.section, index > 0 && styles.sectionDivider]}>
                <Text style={styles.heading}>
                  {index + 1}. {section.heading}
                </Text>
                {section.body.map((paragraph) => (
                  <Text key={paragraph} style={styles.paragraph}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: DefaultTheme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingBottom: 90,
  },
  contentCompact: {
    paddingHorizontal: 16,
  },
  inner: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 22,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  backText: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12.5,
  },
  title: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  updated: {
    marginTop: 8,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  card: {
    width: '100%',
    marginTop: 24,
  },
  section: {
    paddingVertical: 16,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  heading: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 15,
  },
  paragraph: {
    marginTop: 8,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
});
