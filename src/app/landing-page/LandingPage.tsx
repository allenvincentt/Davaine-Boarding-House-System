import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type DimensionValue,
  type LayoutChangeEvent,
} from "react-native";

import { RoomDetailsModal } from "@/app/landing-page/RoomDetailsModal";
import { PageMeta } from "@/components/common/PageMeta";
import { SkeletonCardGrid } from "@/components/common/SkeletonLoader";
import { useSnackbar } from "@/components/common/Snackbar";
import { NavBar } from "@/components/layout/NavBar";
import { ScrollReveal } from "@/components/layout/ScrollReveal";
import { AppIcon } from "@/components/ui/AppIcon";
import {
  CurvedCarousel,
  type CarouselItem,
} from "@/components/ui/CurvedCarousel";
import { MapEmbed } from "@/components/ui/MapEmbed";
import { GlowingButton } from "@/components/ui/buttons/GlowingButton";
import { MatchaButton } from "@/components/ui/buttons/MatchaButton";
import { InteractiveCard } from "@/components/ui/cards/InteractiveCard";
import { RoomCard } from "@/components/ui/cards/RoomCard";
import { WaterPolicyCard } from "@/components/ui/cards/WaterPolicyCard";
import { DefaultTheme } from "@/constants/defaultTheme";
import type { AppIconName } from "@/constants/icons";
import {
  amenities,
  billingSteps,
  communityContact,
  landingNavigation,
  waterPolicies,
  type LandingSection,
} from "@/constants/landing";
import type { PublicRoomModel } from "@/models/contentModel";
import { listCarouselSlides, listPublicRooms } from "@/services/contentService";

function isLandingSection(value: string): value is LandingSection {
  return landingNavigation.some((item) => item.section === value);
}

const MODAL_DISMISS_SETTLE = 360;
const DEEP_LINK_SETTLE_WINDOW = 4000;

export default function LandingPage() {
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ section?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState<LandingSection>("home");
  const activeSectionRef = useRef<LandingSection>("home");
  const pendingSectionRef = useRef<LandingSection | null>(null);
  const activeSectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationTargetRef = useRef<LandingSection | null>(null);
  const handledSectionRef = useRef<string | null>(null);
  const deepLinkStartRef = useRef(0);
  const deepLinkPositionRef = useRef<number | null>(null);
  const [sectionPositions, setSectionPositions] = useState<
    Record<LandingSection, number>
  >({
    home: 0,
    rooms: 0,
    billing: 0,
    about: 0,
  });
  const compactNavigation = width < DefaultTheme.layout.compactNavigation;

  const [slides, setSlides] = useState<CarouselItem[]>([]);
  const [availableRooms, setAvailableRooms] = useState<PublicRoomModel[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [detailsRoom, setDetailsRoom] = useState<PublicRoomModel | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const contentActiveRef = useRef(true);
  const inquiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snackbar = useSnackbar();

  useEffect(() => {
    contentActiveRef.current = true;
    return () => {
      contentActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    listCarouselSlides()
      .then((rows) => {
        if (contentActiveRef.current) {
          setSlides(rows.map((slide) => ({ id: slide.id, uri: slide.uri })));
        }
      })
      .catch(() => {
        if (contentActiveRef.current) {
          snackbar.warning("Some photos could not be loaded right now.");
        }
      });
  }, [snackbar]);

  useEffect(() => {
    listPublicRooms()
      .then((rows) => {
        if (contentActiveRef.current) {
          setAvailableRooms(rows.filter((room) => room.available));
        }
      })
      .catch((error: unknown) => {
        if (contentActiveRef.current) {
          snackbar.error(
            error instanceof Error
              ? error.message
              : "Unable to load the available rooms.",
          );
        }
      })
      .finally(() => {
        if (contentActiveRef.current) {
          setRoomsLoading(false);
        }
      });
  }, [snackbar]);

  const openRoomDetails = useCallback((room: PublicRoomModel) => {
    setDetailsRoom(room);
    setDetailsOpen(true);
  }, []);

  const scheduleActiveSection = (section: LandingSection) => {
    if (activeSectionRef.current === section) {
      pendingSectionRef.current = null;
      return;
    }

    pendingSectionRef.current = section;
    if (activeSectionTimer.current !== null) {
      return;
    }

    activeSectionTimer.current = setTimeout(() => {
      const nextSection = pendingSectionRef.current;
      pendingSectionRef.current = null;
      activeSectionTimer.current = null;

      if (nextSection && activeSectionRef.current !== nextSection) {
        activeSectionRef.current = nextSection;
        setActiveSection(nextSection);
      }
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (activeSectionTimer.current !== null) {
        clearTimeout(activeSectionTimer.current);
      }
      if (inquiryTimer.current !== null) {
        clearTimeout(inquiryTimer.current);
      }
    };
  }, []);

  const registerSection =
    (section: LandingSection) => (event: LayoutChangeEvent) => {
      const position = event.nativeEvent.layout.y;
      setSectionPositions((current) =>
        current[section] === position
          ? current
          : { ...current, [section]: position },
      );
    };

  const navigateTo = useCallback(
    (section: LandingSection) => {
      if (activeSectionTimer.current !== null) {
        clearTimeout(activeSectionTimer.current);
        activeSectionTimer.current = null;
      }
      pendingSectionRef.current = null;
      navigationTargetRef.current = section;
      activeSectionRef.current = section;
      setActiveSection(section);
      scrollViewRef.current?.scrollTo({
        y:
          section === "home"
            ? 0
            : Math.max(
                0,
                sectionPositions[section] - (compactNavigation ? 0 : 76),
              ),
        animated: true,
      });
    },
    [sectionPositions, compactNavigation],
  );

  const handleInquire = useCallback(() => {
    setDetailsOpen(false);

    if (inquiryTimer.current !== null) {
      clearTimeout(inquiryTimer.current);
    }

    inquiryTimer.current = setTimeout(() => {
      inquiryTimer.current = null;
      navigateTo("about");
    }, MODAL_DISMISS_SETTLE);
  }, [navigateTo]);

  const requestedSection =
    typeof params.section === "string" ? params.section : null;

  useEffect(() => {
    if (!requestedSection || !isLandingSection(requestedSection)) {
      handledSectionRef.current = null;
      return;
    }

    if (handledSectionRef.current !== requestedSection) {
      handledSectionRef.current = requestedSection;
      deepLinkStartRef.current = Date.now();
      deepLinkPositionRef.current = null;
    }

    if (Date.now() - deepLinkStartRef.current > DEEP_LINK_SETTLE_WINDOW) {
      return;
    }

    const position =
      requestedSection === "home" ? 0 : sectionPositions[requestedSection];

    if (requestedSection !== "home" && position <= 0) {
      return;
    }

    if (deepLinkPositionRef.current === position) {
      return;
    }

    deepLinkPositionRef.current = position;

    const timer = setTimeout(() => {
      navigateTo(requestedSection);
    }, 0);

    return () => clearTimeout(timer);
  }, [requestedSection, sectionPositions, navigateTo]);

  const handleScroll = (offset: number) => {
    setScrollY(offset);
    const marker =
      offset + (compactNavigation ? Math.min(height * 0.28, 220) : 112);

    const navigationTarget = navigationTargetRef.current;
    if (navigationTarget) {
      const targetPosition = sectionPositions[navigationTarget];
      const targetReached =
        navigationTarget === "home"
          ? offset <= 40
          : targetPosition > 0 && marker >= targetPosition;

      if (!targetReached) {
        return;
      }

      navigationTargetRef.current = null;
    }

    let currentSection: LandingSection = "home";

    landingNavigation.forEach(({ section }) => {
      const position = sectionPositions[section];
      if ((section === "home" || position > 0) && marker >= position) {
        currentSection = section;
      }
    });

    scheduleActiveSection(currentSection);
  };

  return (
    <View style={styles.page}>
      <PageMeta
        title="Home"
        description="Davaine Boarding House in Toril, Davao City. Browse rooms, rates, and availability."
      />
      <StatusBar style="dark" />
      <NavBar
        activeSection={activeSection}
        onNavigate={navigateTo}
        scrollY={scrollY}
      />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          compactNavigation && styles.contentMobile,
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => handleScroll(event.nativeEvent.contentOffset.y)}
      >
        <ScrollReveal scrollY={scrollY} onLayout={registerSection("home")}>
          <HomeSection
            slides={slides}
            onGetStarted={() => navigateTo("rooms")}
          />
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          enabled={false}
          onLayout={registerSection("rooms")}
        >
          <RoomsSection
            scrollY={scrollY}
            rooms={availableRooms}
            loading={roomsLoading}
            onPressDetails={openRoomDetails}
          />
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          enabled={false}
          onLayout={registerSection("billing")}
        >
          <BillingSection scrollY={scrollY} />
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          enabled={false}
          onLayout={registerSection("about")}
        >
          <AboutSection scrollY={scrollY} />
          <FooterSection onNavigate={navigateTo} scrollY={scrollY} />
        </ScrollReveal>
      </ScrollView>

      <RoomDetailsModal
        visible={detailsOpen}
        room={detailsRoom}
        onClose={() => setDetailsOpen(false)}
        onInquire={handleInquire}
      />
    </View>
  );
}

function HomeSection({
  slides,
  onGetStarted,
}: {
  slides: CarouselItem[];
  onGetStarted: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.tablet;

  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.heroCopy}>
        <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
          Live in Toril Boarding{`\n`}House{" "}
          <Text style={styles.heroAccent}>with Ease</Text>
        </Text>
        <Text
          style={[
            styles.heroDescription,
            compact && styles.heroDescriptionCompact,
          ]}
        >
          Comfortable, affordable rooms in Toril, Davao City.
        </Text>
      </View>
      <View style={styles.carouselWrap}>
        <CurvedCarousel items={slides} />
      </View>
      <GlowingButton
        label="Get Started"
        onPress={onGetStarted}
        style={styles.getStartedButton}
      />
    </View>
  );
}

function RoomsSection({
  scrollY,
  rooms,
  loading,
  onPressDetails,
}: {
  scrollY: number;
  rooms: PublicRoomModel[];
  loading: boolean;
  onPressDetails: (room: PublicRoomModel) => void;
}) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const roomWidth: DimensionValue =
    width >= DefaultTheme.layout.wide
      ? "31.9%"
      : width >= DefaultTheme.layout.tablet
        ? "48.6%"
        : "100%";
  const amenityWidth: DimensionValue =
    width >= DefaultTheme.layout.wide
      ? "23.7%"
      : width >= DefaultTheme.layout.tablet
        ? "48.3%"
        : "100%";

  return (
    <View style={styles.roomsSection}>
      <View style={styles.sectionInner}>
        <ScrollReveal scrollY={scrollY}>
          <SectionHeading
            eyebrow="OUR ACCOMMODATIONS"
            title="Designed for Affordable Living"
            trailing="View All Rooms"
            onPressTrailing={() => router.push("/landing-page/AllRoomsPage")}
          />
        </ScrollReveal>
        {loading ? (
          <SkeletonCardGrid
            count={roomWidth === "100%" ? 2 : 3}
            cardWidth={roomWidth}
            height={280}
            label="Loading available rooms"
            style={styles.roomsSkeleton}
          />
        ) : rooms.length === 0 ? (
          <View style={styles.roomsEmpty}>
            <AppIcon
              name="inbox"
              size={22}
              tintColor={DefaultTheme.colors.muted}
            />
            <Text style={styles.roomsEmptyText}>
              Every room is occupied right now. Check back soon or contact us to
              join the waitlist.
            </Text>
          </View>
        ) : (
          <View style={styles.roomsGrid}>
            {rooms.map((room, index) => (
              <ScrollReveal
                key={room.roomId}
                scrollY={scrollY}
                delay={index * 120}
                style={{ width: roomWidth }}
              >
                <RoomCard room={room} onPressDetails={onPressDetails} />
              </ScrollReveal>
            ))}
          </View>
        )}
        <View style={styles.amenityGrid}>
          {amenities.map((amenity, index) => (
            <ScrollReveal
              key={amenity.label}
              scrollY={scrollY}
              delay={index * 100}
              style={{ width: amenityWidth }}
            >
              <InteractiveCard
                borderEffect="pulse"
                glowColor={DefaultTheme.colors.primary}
                hoverBackgroundColor="#FBFCFF"
                liftDistance={5}
                style={styles.amenityCard}
              >
                <View style={styles.amenityIcon}>
                  <AppIcon
                    name={amenity.icon}
                    size={20}
                    tintColor={DefaultTheme.colors.primary}
                  />
                </View>
                <Text style={styles.amenityText}>{amenity.label}</Text>
              </InteractiveCard>
            </ScrollReveal>
          ))}
        </View>
      </View>
    </View>
  );
}

function BillingSection({ scrollY }: { scrollY: number }) {
  const { width } = useWindowDimensions();
  const vertical = width < DefaultTheme.layout.wide;
  const phone = width < 600;
  const waterCardWidth: DimensionValue =
    width >= DefaultTheme.layout.wide
      ? "31.7%"
      : width >= DefaultTheme.layout.tablet
        ? "48.3%"
        : "100%";

  return (
    <View style={[styles.billingSection, phone && styles.billingSectionPhone]}>
      <View style={styles.sectionInner}>
        <ScrollReveal scrollY={scrollY}>
          <SectionHeading
            eyebrow="TRANSPARENT OPERATIONS"
            title="Billing Procedures"
          />
        </ScrollReveal>
        <ScrollReveal scrollY={scrollY} delay={100} style={styles.processLabel}>
          <View style={styles.electricIcon}>
            <AppIcon
              name="electricity"
              size={19}
              tintColor={DefaultTheme.colors.primary}
            />
          </View>
          <Text style={styles.processLabelText}>Electric Billing Process</Text>
        </ScrollReveal>
        <View
          style={[styles.processFlow, vertical && styles.processFlowVertical]}
        >
          {billingSteps.map((step, index) => (
            <ScrollReveal
              key={step.title}
              scrollY={scrollY}
              delay={index * 120}
              style={vertical ? styles.processItemVertical : styles.processItem}
            >
              <View
                style={
                  vertical
                    ? styles.processCardWrapVertical
                    : styles.processCardWrap
                }
              >
                <InteractiveCard style={styles.processCard}>
                  <View style={styles.processIcon}>
                    <AppIcon
                      name={step.icon}
                      size={23}
                      tintColor={DefaultTheme.colors.primary}
                    />
                  </View>
                  <Text style={styles.processTitle}>{step.title}</Text>
                  <Text style={styles.processDetail}>{step.detail}</Text>
                </InteractiveCard>
              </View>
              {index < billingSteps.length - 1 && (
                <FlowArrow vertical={vertical} />
              )}
            </ScrollReveal>
          ))}
        </View>
        <ScrollReveal scrollY={scrollY} style={styles.waterLabel}>
          <View style={styles.waterLabelIcon}>
            <AppIcon
              name="water"
              size={19}
              tintColor={DefaultTheme.colors.blue}
            />
          </View>
          <Text style={styles.processLabelText}>Water Billing Policy</Text>
        </ScrollReveal>
        <View style={[styles.waterPanel, phone && styles.waterPanelPhone]}>
          <ScrollReveal
            scrollY={scrollY}
            style={[
              styles.waterPanelHeader,
              phone && styles.waterPanelHeaderPhone,
            ]}
          >
            <View
              style={[
                styles.waterPanelCopy,
                phone && styles.waterPanelCopyPhone,
              ]}
            >
              <Text style={styles.waterTitle}>
                A simpler way to share water bills
              </Text>
              <Text style={styles.waterDescription}>
                Each household pays a share based on verified occupancy.
              </Text>
            </View>
            <View style={styles.waterCyclePill}>
              <Text style={styles.waterCycleText}>Monthly cycle</Text>
            </View>
          </ScrollReveal>
          <View style={[styles.policyGrid, phone && styles.policyGridPhone]}>
            {waterPolicies.map((policy, index) => (
              <ScrollReveal
                key={policy.label}
                scrollY={scrollY}
                delay={index * 120}
                style={[styles.policyCardSlot, { width: waterCardWidth }]}
              >
                <WaterPolicyCard
                  icon={policy.icon}
                  title={policy.label}
                  description={policy.caption}
                />
              </ScrollReveal>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function AboutSection({ scrollY }: { scrollY: number }) {
  const { width } = useWindowDimensions();
  const wide = width >= DefaultTheme.layout.desktop;
  const compact = width < DefaultTheme.layout.tablet;

  return (
    <View style={styles.aboutSection}>
      <ScrollReveal
        scrollY={scrollY}
        style={[styles.aboutCard, wide && styles.aboutCardWide]}
      >
        <View style={[styles.aboutContent, wide && styles.aboutContentWide]}>
          <Text style={styles.aboutTitle}>About Our Community</Text>
          <Text style={styles.aboutDescription}>
            A safe, convenient, and comfortable place to live.
          </Text>
          <View
            style={[styles.contactGrid, compact && styles.contactGridCompact]}
          >
            <ContactDetail
              compact={compact}
              icon="mapPin"
              title="Location"
              detail={communityContact.addressShort}
            />
            <ContactDetail
              compact={compact}
              icon="phone"
              title="Telephone"
              detail={communityContact.telephone}
            />
            <ContactDetail
              compact={compact}
              icon="email"
              title="Email"
              detail={communityContact.email}
            />
            <ContactDetail
              compact={compact}
              icon="users"
              title="Social Media"
              detail={communityContact.social}
            />
          </View>
          <MatchaButton
            label="Contact Us Now!"
            variant="outline"
            onPress={() => Linking.openURL(`mailto:${communityContact.email}`)}
            style={styles.contactButton}
          />
        </View>
        <View style={[styles.mapWrap, wide && styles.mapWrapWide]}>
          <MapEmbed />
          <View style={styles.mapCallout}>
            <View style={styles.mapCalloutIcon}>
              <AppIcon
                name="mapPin"
                size={19}
                tintColor={DefaultTheme.colors.white}
              />
            </View>
            <View style={styles.mapCalloutCopy}>
              <Text style={styles.mapCalloutTitle}>Davaine Boarding House</Text>
              <Text style={styles.mapCalloutText}>View on Google Map</Text>
            </View>
            <Text style={styles.mapCalloutArrow}>›</Text>
          </View>
        </View>
      </ScrollReveal>
    </View>
  );
}

function FooterSection({
  onNavigate,
  scrollY,
}: {
  onNavigate: (section: LandingSection) => void;
  scrollY: number;
}) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const compact = width < DefaultTheme.layout.tablet;

  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <View style={[styles.footerInner, compact && styles.footerInnerCompact]}>
        <ScrollReveal
          scrollY={scrollY}
          style={[
            styles.footerBrandColumn,
            compact && styles.footerBrandColumnCompact,
          ]}
        >
          <Text
            style={[styles.footerBrand, compact && styles.footerBrandCompact]}
          >
            Davaine
          </Text>
          <Text
            style={[
              styles.footerDescription,
              compact && styles.footerDescriptionCompact,
            ]}
          >
            Boarding house in Toril, Davao City.
          </Text>
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          delay={100}
          style={[styles.footerColumn, compact && styles.footerColumnCompact]}
        >
          <Text
            style={[
              styles.footerHeading,
              compact && styles.footerHeadingCompact,
            ]}
          >
            PLATFORM
          </Text>
          <FooterLink
            compact={compact}
            label="Rooms"
            onPress={() => onNavigate("rooms")}
          />
          <FooterLink
            compact={compact}
            label="Billing"
            onPress={() => onNavigate("billing")}
          />
          <FooterLink
            compact={compact}
            label="About Us"
            onPress={() => onNavigate("about")}
          />
          <FooterLink
            compact={compact}
            label="Contact"
            onPress={() => onNavigate("about")}
          />
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          delay={200}
          style={[styles.footerColumn, compact && styles.footerColumnCompact]}
        >
          <Text
            style={[
              styles.footerHeading,
              compact && styles.footerHeadingCompact,
            ]}
          >
            CONTACT
          </Text>
          <FooterContact
            compact={compact}
            icon="mapPin"
            label={communityContact.addressShort}
          />
          <FooterContact
            compact={compact}
            icon="phone"
            label={communityContact.telephone}
          />
          <FooterContact
            compact={compact}
            icon="email"
            label={communityContact.email}
          />
        </ScrollReveal>
        <ScrollReveal
          scrollY={scrollY}
          delay={300}
          style={[styles.footerColumn, compact && styles.footerColumnCompact]}
        >
          <Text
            style={[
              styles.footerHeading,
              compact && styles.footerHeadingCompact,
            ]}
          >
            FOLLOW US
          </Text>
          <View style={styles.socialRow}>
            <View
              style={[
                styles.socialButton,
                compact && styles.socialButtonCompact,
              ]}
            >
              <Text style={styles.socialText}>f</Text>
            </View>
            <View
              style={[
                styles.socialButton,
                compact && styles.socialButtonCompact,
              ]}
            >
              <Text style={styles.socialText}>◎</Text>
            </View>
          </View>
        </ScrollReveal>
      </View>
      <ScrollReveal
        scrollY={scrollY}
        style={[styles.footerBottom, compact && styles.footerBottomCompact]}
      >
        <Text style={[styles.legalText, compact && styles.legalTextCompact]}>
          © 2026 Davaine Management. All rights reserved.
        </Text>
        <View style={[styles.legalLinks, compact && styles.legalLinksCompact]}>
          <Text
            accessibilityRole="link"
            style={[styles.legalText, compact && styles.legalTextCompact]}
            onPress={() => router.push("/legal/PrivacyPolicyPage")}
          >
            Privacy Policy
          </Text>
          <Text
            accessibilityRole="link"
            style={[styles.legalText, compact && styles.legalTextCompact]}
            onPress={() => router.push("/legal/TermsPage")}
          >
            Terms and Conditions
          </Text>
        </View>
      </ScrollReveal>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  trailing,
  onPressTrailing,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: string;
  onPressTrailing?: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {description && (
          <Text style={styles.sectionDescription}>{description}</Text>
        )}
      </View>
      {trailing &&
        (onPressTrailing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={trailing}
            style={styles.sectionTrailingButton}
            onPress={onPressTrailing}
          >
            <Text style={styles.sectionTrailing}>{trailing}</Text>
            <AppIcon
              name="chevronRight"
              size={13}
              tintColor={DefaultTheme.colors.primary}
            />
          </Pressable>
        ) : (
          <Text style={styles.sectionTrailing}>{trailing}</Text>
        ))}
    </View>
  );
}

function ContactDetail({
  icon,
  title,
  detail,
  compact,
}: {
  icon: AppIconName;
  title: string;
  detail: string;
  compact: boolean;
}) {
  return (
    <View
      style={[styles.contactDetail, compact && styles.contactDetailCompact]}
    >
      <View style={styles.contactIconSlot}>
        <AppIcon
          name={icon}
          size={18}
          tintColor={DefaultTheme.colors.primary}
        />
      </View>
      <View style={styles.contactCopy}>
        <Text style={styles.contactTitle}>{title}</Text>
        <Text style={styles.contactText}>{detail}</Text>
      </View>
    </View>
  );
}

function FooterContact({
  icon,
  label,
  compact,
}: {
  icon: AppIconName;
  label: string;
  compact: boolean;
}) {
  return (
    <View style={styles.footerContactRow}>
      <View style={styles.footerContactIcon}>
        <AppIcon
          name={icon}
          size={compact ? 16 : 13}
          tintColor={DefaultTheme.colors.muted}
        />
      </View>
      <Text
        style={[styles.footerContact, compact && styles.footerContactCompact]}
      >
        {label}
      </Text>
    </View>
  );
}

function FooterLink({
  label,
  onPress,
  compact,
}: {
  label: string;
  onPress: () => void;
  compact: boolean;
}) {
  return (
    <Text
      style={[styles.footerLink, compact && styles.footerLinkCompact]}
      onPress={onPress}
    >
      {label}
    </Text>
  );
}

function FlowArrow({ vertical }: { vertical: boolean }) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shift, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shift]);

  return (
    <View
      style={[styles.flowArrowWrap, vertical && styles.flowArrowWrapVertical]}
    >
      <Animated.View
        style={[
          {
            transform: [
              vertical
                ? {
                    translateY: shift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-3, 5],
                    }),
                  }
                : {
                    translateX: shift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-3, 5],
                    }),
                  },
            ],
          },
        ]}
      >
        <AppIcon
          name={vertical ? "arrowDown" : "arrowRight"}
          size={23}
          tintColor={DefaultTheme.colors.primary}
        />
      </Animated.View>
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
    backgroundColor: DefaultTheme.colors.background,
  },
  contentMobile: {
    paddingTop: 94,
    paddingBottom: 140,
  },
  hero: {
    minHeight: 720,
    paddingTop: 116,
    paddingBottom: 54,
    alignItems: "center",
    overflow: "hidden",
  },
  heroCompact: {
    minHeight: 645,
    paddingTop: 52,
  },
  heroCopy: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  heroTitle: {
    marginTop: 44,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 48,
    lineHeight: 57,
    letterSpacing: -1.35,
    textAlign: "center",
  },
  heroTitleCompact: {
    marginTop: 34,
    fontSize: 39,
    lineHeight: 47,
  },
  heroAccent: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.headingItalic,
  },
  heroDescription: {
    maxWidth: 440,
    marginTop: -2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  heroDescriptionCompact: {
    fontSize: 14,
    lineHeight: 21,
  },
  carouselWrap: {
    width: "100%",
    marginTop: 28,
  },
  getStartedButton: {
    width: 180,
    minHeight: 52,
    marginTop: 38,
  },
  roomsSection: {
    paddingHorizontal: 28,
    paddingVertical: DefaultTheme.spacing.section,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  sectionInner: {
    width: "100%",
    maxWidth: DefaultTheme.layout.contentWidth,
    alignSelf: "center",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 24,
  },
  eyebrow: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.25,
  },
  sectionTitle: {
    marginTop: 13,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.8,
  },
  sectionDescription: {
    marginTop: 9,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTrailing: {
    paddingBottom: 5,
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12,
  },
  sectionTrailingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 4,
  },
  roomsSkeleton: {
    marginTop: 62,
  },
  roomsEmpty: {
    marginTop: 62,
    alignItems: "center",
    gap: 10,
    paddingVertical: 34,
    paddingHorizontal: 24,
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  roomsEmptyText: {
    maxWidth: 420,
    textAlign: "center",
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  roomsGrid: {
    marginTop: 62,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 22,
  },
  amenityGrid: {
    marginTop: 84,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 18,
  },
  amenityCard: {
    minHeight: 112,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: "#FBFCFF",
    borderWidth: 1,
    borderColor: "#E7E8EA",
    shadowColor: "#45464B",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  amenityIcon: {
    width: 37,
    height: 37,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  amenityText: {
    marginTop: 9,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12,
    textAlign: "center",
  },
  billingSection: {
    paddingHorizontal: 28,
    paddingVertical: DefaultTheme.spacing.section,
    backgroundColor: DefaultTheme.colors.cool,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  billingSectionPhone: {
    paddingHorizontal: 18,
    paddingVertical: 64,
  },
  processLabel: {
    marginTop: 33,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  electricIcon: {
    width: 33,
    height: 33,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  processLabelText: {
    color: "#3A3A38",
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 17,
  },
  processFlow: {
    marginTop: 43,
    flexDirection: "row",
    alignItems: "center",
  },
  processFlowVertical: {
    alignItems: "stretch",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
  },
  processItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  processItemVertical: {
    width: "100%",
    minWidth: 0,
    flexDirection: "column",
    alignItems: "stretch",
  },
  processCardWrap: {
    flex: 1,
    minWidth: 0,
  },
  processCardWrapVertical: {
    width: "100%",
    alignSelf: "stretch",
  },
  processCard: {
    width: "100%",
    minHeight: 150,
    paddingHorizontal: 18,
    paddingVertical: 19,
    borderRadius: DefaultTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  processIcon: {
    width: 48,
    height: 48,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DefaultTheme.colors.softOlive,
    borderWidth: 3,
    borderColor: "#FAFBF7",
  },
  processTitle: {
    marginTop: 11,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
    textAlign: "center",
  },
  processDetail: {
    maxWidth: 290,
    marginTop: 7,
    color: "#777875",
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },
  flowArrowWrap: {
    width: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  flowArrowWrapVertical: {
    width: "100%",
    height: 48,
  },
  waterLabel: {
    marginTop: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  waterLabelIcon: {
    width: 33,
    height: 33,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DefaultTheme.colors.softBlue,
  },
  waterPanel: {
    width: "100%",
    marginTop: 28,
    padding: 28,
    overflow: "hidden",
    alignSelf: "stretch",
    flexShrink: 0,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(78,164,229,0.22)",
    backgroundColor: DefaultTheme.colors.white,
    shadowColor: "#7293A8",
    shadowOpacity: 0.13,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  waterPanelPhone: {
    width: "100%",
    padding: 18,
    borderRadius: 22,
  },
  waterPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
  },
  waterPanelHeaderPhone: {
    flexDirection: "column",
    gap: 16,
  },
  waterPanelCopy: {
    flex: 1,
    maxWidth: 670,
  },
  waterPanelCopyPhone: {
    width: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  },
  waterTitle: {
    marginTop: 8,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 27,
    lineHeight: 33,
  },
  waterDescription: {
    maxWidth: 610,
    marginTop: 8,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  waterCyclePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.softBlue,
    borderWidth: 1,
    borderColor: "rgba(78,164,229,0.24)",
  },
  waterCycleText: {
    color: "#377FAF",
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10,
  },
  policyGrid: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  policyGridPhone: {
    width: "100%",
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  policyCardSlot: {
    alignSelf: "stretch",
    minHeight: 184,
    borderRadius: 20,
    backgroundColor: DefaultTheme.colors.white,
  },
  aboutSection: {
    paddingHorizontal: 28,
    paddingTop: DefaultTheme.spacing.section,
    paddingBottom: 68,
    backgroundColor: "#F0F1F2",
  },
  aboutCard: {
    width: "100%",
    maxWidth: 1155,
    alignSelf: "center",
    overflow: "hidden",
    borderRadius: 31,
    backgroundColor: "#FBFCFF",
    shadowColor: "#4A4B4B",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 5,
  },
  aboutCardWide: {
    minHeight: 456,
    flexDirection: "row",
  },
  aboutContent: {
    padding: 32,
  },
  aboutContentWide: {
    width: "50%",
    paddingHorizontal: 48,
    paddingVertical: 47,
  },
  aboutTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.heading,
    fontSize: 31,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  aboutDescription: {
    maxWidth: 430,
    marginTop: 14,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  contactGrid: {
    marginTop: 34,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 25,
  },
  contactGridCompact: {
    flexDirection: "column",
    flexWrap: "nowrap",
    rowGap: 22,
  },
  contactDetail: {
    width: "50%",
    paddingRight: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  contactDetailCompact: {
    width: "100%",
    paddingRight: 0,
  },
  contactIconSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contactCopy: {
    flex: 1,
    minWidth: 0,
  },
  contactTitle: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 15,
  },
  contactText: {
    marginTop: 5,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11,
    lineHeight: 15,
  },
  contactButton: {
    alignSelf: "flex-start",
    marginTop: 34,
  },
  mapWrap: {
    minHeight: 338,
    position: "relative",
    overflow: "hidden",
    backgroundColor: DefaultTheme.colors.softBlue,
  },
  mapWrapWide: {
    width: "50%",
  },
  mapCallout: {
    position: "absolute",
    right: 22,
    bottom: 24,
    left: 22,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#555",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  mapCalloutIcon: {
    width: 36,
    height: 36,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DefaultTheme.colors.primary,
  },
  mapCalloutCopy: {
    flex: 1,
  },
  mapCalloutTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12,
  },
  mapCalloutText: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 9,
  },
  mapCalloutArrow: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 24,
  },
  footer: {
    marginTop: 68,
    backgroundColor: DefaultTheme.colors.background,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  footerCompact: {
    marginTop: 0,
  },
  footerInner: {
    width: "100%",
    maxWidth: DefaultTheme.layout.contentWidth,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingTop: 70,
    paddingBottom: 66,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 32,
  },
  footerInnerCompact: {
    paddingHorizontal: 32,
    paddingTop: 56,
    paddingBottom: 64,
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 48,
  },
  footerBrandColumn: {
    width: 205,
  },
  footerBrandColumnCompact: {
    width: "100%",
    maxWidth: 300,
  },
  footerBrand: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
  },
  footerBrandCompact: {
    fontSize: 18,
  },
  footerDescription: {
    marginTop: 20,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11,
    lineHeight: 18,
  },
  footerDescriptionCompact: {
    maxWidth: 300,
    marginTop: 26,
    fontSize: 14,
    lineHeight: 22,
  },
  footerColumn: {
    minWidth: 135,
    gap: 12,
  },
  footerColumnCompact: {
    width: "100%",
    minWidth: 0,
    gap: 16,
  },
  footerHeading: {
    marginBottom: 3,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  footerHeadingCompact: {
    marginBottom: 6,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  footerLink: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11,
  },
  footerLinkCompact: {
    fontSize: 14,
    lineHeight: 22,
  },
  footerContact: {
    flex: 1,
    minWidth: 0,
    maxWidth: 210,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 11,
  },
  footerContactCompact: {
    maxWidth: 290,
    fontSize: 14,
    lineHeight: 21,
  },
  footerContactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  footerContactIcon: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  socialRow: {
    flexDirection: "row",
    gap: 12,
  },
  socialButton: {
    width: 31,
    height: 31,
    borderRadius: DefaultTheme.radius.pill,
    borderWidth: 1,
    borderColor: "#D8DAD6",
    alignItems: "center",
    justifyContent: "center",
  },
  socialButtonCompact: {
    width: 42,
    height: 42,
  },
  socialText: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
  },
  footerBottom: {
    minHeight: 56,
    paddingHorizontal: 32,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  footerBottomCompact: {
    minHeight: 0,
    paddingHorizontal: 32,
    paddingVertical: 24,
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 20,
  },
  legalLinks: {
    flexDirection: "row",
    gap: 20,
  },
  legalLinksCompact: {
    flexWrap: "wrap",
    gap: 22,
  },
  legalText: {
    color: "#7A7B76",
    fontFamily: DefaultTheme.fonts.body,
    fontSize: 9,
  },
  legalTextCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
});
