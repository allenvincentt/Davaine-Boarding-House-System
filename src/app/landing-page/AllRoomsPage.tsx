import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageMeta } from '@/components/common/PageMeta';
import { Skeleton, SkeletonCardGrid } from '@/components/common/SkeletonLoader';
import { RoomDetailsModal } from '@/app/landing-page/RoomDetailsModal';
import { AppIcon } from '@/components/ui/AppIcon';
import { RoomCard } from '@/components/ui/cards/RoomCard';
import { DefaultTheme } from '@/constants/defaultTheme';
import { communityContact } from '@/constants/landing';
import { buildingToneOf } from '@/constants/roomTheme';
import type { PublicRoomModel } from '@/models/contentModel';
import { buildingLabel, roomBuildings, type RoomBuilding } from '@/models/roomModel';
import { listPublicRooms } from '@/services/contentService';

type AvailabilityFilter = 'All' | 'Available' | 'Occupied';

const availabilityFilters: AvailabilityFilter[] = ['All', 'Available', 'Occupied'];

export default function AllRoomsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const [rooms, setRooms] = useState<PublicRoomModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AvailabilityFilter>('All');
  const [selected, setSelected] = useState<PublicRoomModel | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activeRef = useRef(true);

  const cardWidth: DimensionValue =
    width >= DefaultTheme.layout.wide ? '31.9%' : width >= DefaultTheme.layout.tablet ? '48.6%' : '100%';

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listPublicRooms();
      if (activeRef.current) {
        setRooms(rows);
      }
    } catch (error) {
      if (activeRef.current) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load the rooms.');
      }
    } finally {
      if (activeRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rooms.filter((room) =>
        filter === 'All' ? true : filter === 'Available' ? room.available : !room.available,
      ),
    [rooms, filter],
  );

  const availableCount = rooms.filter((room) => room.available).length;

  const openDetails = (room: PublicRoomModel) => {
    setSelected(room);
    setDetailsOpen(true);
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  const goToAboutSection = () => {
    router.push({ pathname: '/', params: { section: 'about' } });
  };

  return (
    <View style={styles.page}>
      <PageMeta title="All Rooms" description="Browse every room at Davaine Boarding House with rates and availability." />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: top + 20 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            style={styles.backButton}
            onPress={goBack}>
            <AppIcon name="chevronLeft" size={15} tintColor={DefaultTheme.colors.primary} />
            <Text style={styles.backText}>Back to Home</Text>
          </Pressable>

          <Text style={styles.title}>All Rooms</Text>

          <View style={styles.summaryRow}>
            <SummaryChip icon="rooms" label={`${rooms.length} total rooms`} />
            <SummaryChip icon="doorOpen" label={`${availableCount} available now`} />
            <SummaryChip icon="mapPin" label={communityContact.addressShort} />
          </View>

          <View style={styles.filterRow}>
            {availabilityFilters.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === option }}
                style={[styles.filterChip, filter === option && styles.filterChipActive]}
                onPress={() => setFilter(option)}>
                <Text
                  style={[styles.filterChipText, filter === option && styles.filterChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          {loading && rooms.length === 0 ? (
            roomBuildings.map((building) => (
              <View key={building} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Skeleton width={44} height={44} radius={DefaultTheme.radius.md} />
                  <View style={styles.groupHeaderText}>
                    <Skeleton width="46%" height={14} />
                    <Skeleton width="30%" height={10} style={styles.skeletonCaption} />
                  </View>
                </View>
                <SkeletonCardGrid
                  count={cardWidth === '100%' ? 2 : 3}
                  cardWidth={cardWidth}
                  height={280}
                  label={`Loading rooms in ${buildingLabel(building)}`}
                  style={styles.skeletonGrid}
                />
              </View>
            ))
          ) : loadError ? (
            <View style={styles.emptyBlock}>
              <AppIcon name="warning" size={20} tintColor="#C4453B" />
              <Text style={styles.emptyText}>{loadError}</Text>
              <Pressable accessibilityRole="button" onPress={load} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            roomBuildings.map((building) => (
              <BuildingGroup
                key={building}
                building={building}
                rooms={filtered.filter((room) => room.building === building)}
                cardWidth={cardWidth}
                onPressDetails={openDetails}
              />
            ))
          )}
        </View>
      </ScrollView>

      <RoomDetailsModal
        visible={detailsOpen}
        room={selected}
        onClose={() => setDetailsOpen(false)}
        onInquire={goToAboutSection}
      />
    </View>
  );
}

function BuildingGroup({
  building,
  rooms,
  cardWidth,
  onPressDetails,
}: {
  building: RoomBuilding;
  rooms: PublicRoomModel[];
  cardWidth: DimensionValue;
  onPressDetails: (room: PublicRoomModel) => void;
}) {
  const tone = buildingToneOf(building);

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View
          style={[
            styles.groupBadge,
            { backgroundColor: tone.background, borderColor: tone.border },
          ]}>
          <Text style={[styles.groupBadgeText, { color: tone.color }]}>{building}</Text>
        </View>
        <View style={styles.groupHeaderText}>
          <Text style={styles.groupTitle}>Building {building}</Text>
          <Text style={styles.groupCaption}>
            {rooms.length} room{rooms.length === 1 ? '' : 's'} ·{' '}
            {rooms.filter((room) => room.available).length} available
          </Text>
        </View>
      </View>

      {rooms.length === 0 ? (
        <View style={styles.emptyBlock}>
          <AppIcon name="inbox" size={20} tintColor={DefaultTheme.colors.muted} />
          <Text style={styles.emptyText}>No rooms match this filter in {buildingLabel(building)}.</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {rooms.map((room) => (
            <View key={room.roomId} style={{ width: cardWidth }}>
              <RoomCard room={room} onPressDetails={onPressDetails} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function SummaryChip({
  icon,
  label,
}: {
  icon: 'rooms' | 'doorOpen' | 'mapPin';
  label: string;
}) {
  return (
    <View style={styles.summaryChip}>
      <AppIcon name={icon} size={13} tintColor={DefaultTheme.colors.primary} />
      <Text style={styles.summaryChipText} numberOfLines={1}>
        {label}
      </Text>
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
  inner: {
    width: '100%',
    maxWidth: DefaultTheme.layout.contentWidth,
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
  summaryRow: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.white,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  summaryChipText: {
    flexShrink: 1,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 11.5,
  },
  filterRow: {
    marginTop: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.white,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  filterChipActive: {
    backgroundColor: DefaultTheme.colors.primary,
    borderColor: DefaultTheme.colors.primary,
  },
  filterChipText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12.5,
  },
  filterChipTextActive: {
    color: DefaultTheme.colors.white,
  },
  group: {
    marginTop: 46,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupBadge: {
    width: 44,
    height: 44,
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 17,
  },
  groupHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  groupTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 17,
  },
  groupCaption: {
    marginTop: 3,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  grid: {
    marginTop: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 22,
  },
  skeletonGrid: {
    marginTop: 22,
  },
  skeletonCaption: {
    marginTop: 8,
  },
  emptyBlock: {
    marginTop: 22,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 30,
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  emptyText: {
    paddingHorizontal: 20,
    textAlign: 'center',
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  retryText: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12.5,
  },
});
