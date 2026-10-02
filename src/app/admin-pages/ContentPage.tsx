import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { PageMeta } from '@/components/common/PageMeta';
import { Skeleton, SkeletonGallery, SkeletonText } from '@/components/common/SkeletonLoader';
import { useSnackbar } from '@/components/common/Snackbar';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { AppIcon } from '@/components/ui/AppIcon';
import { MatchaButton } from '@/components/ui/buttons/MatchaButton';
import { PageFabStack, usePageScrollNavigator } from '@/components/ui/buttons/PageFabStack';
import { Card } from '@/components/ui/cards/Card';
import { ConfirmDialog } from '@/components/ui/modals/ConfirmDialog';
import { SearchField } from '@/components/ui/SearchField';
import { DefaultTheme } from '@/constants/defaultTheme';
import { buildingToneOf } from '@/constants/roomTheme';
import {
  MAX_CAROUSEL_SLIDES,
  MAX_ROOM_CAPACITY,
  MAX_ROOM_PHOTOS,
  defaultRoomContent,
  type CarouselSlideModel,
  type RoomContentModel,
} from '@/models/contentModel';
import {
  buildingLabel,
  roomLabel,
  roomShortLabel,
  sortRooms,
  type RoomModel,
} from '@/models/roomModel';
import { useAuth } from '@/providers/AuthProvider';
import { can } from '@/services/accessControl';
import {
  listCarouselSlides,
  listRoomContent,
  saveCarousel,
  saveRoomContent,
} from '@/services/contentService';
import { pickPhotoFromLibrary, type PickedPhoto } from '@/services/photoPickerService';
import { listRooms } from '@/services/roomManagementService';

type DraftItem = {
  key: string;
  uri: string;
  existingId: string | null;
  photo: PickedPhoto | null;
};

type PendingRemoval = { kind: 'slide' | 'photo'; key: string };

function toDraft(item: { id: string; uri: string }): DraftItem {
  return { key: item.id, uri: item.uri, existingId: item.id, photo: null };
}

function sameOrder(draft: DraftItem[], saved: { id: string }[]) {
  return (
    draft.length === saved.length &&
    draft.every((item, index) => item.existingId === saved[index]?.id)
  );
}

export default function ContentPage() {
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.compactNavigation;
  const { profile } = useAuth();
  const scrollNavigator = usePageScrollNavigator();

  const role = profile?.userRole ?? null;
  const canEdit = can(role, 'update', 'content') || can(role, 'create', 'content');

  const [rooms, setRooms] = useState<RoomModel[]>([]);
  const [slides, setSlides] = useState<CarouselSlideModel[]>([]);
  const [content, setContent] = useState<Record<string, RoomContentModel>>({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [carouselDraft, setCarouselDraft] = useState<DraftItem[]>([]);
  const [photoDraft, setPhotoDraft] = useState<DraftItem[]>([]);
  const [coverKey, setCoverKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const snackbar = useSnackbar();
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');
  const [amenities, setAmenities] = useState('');
  const [detailsDirty, setDetailsDirty] = useState(false);

  const activeRef = useRef(true);
  const keySequence = useRef(0);
  const loadRef = useRef<() => void>(() => undefined);

  const nextKey = useCallback(() => {
    keySequence.current += 1;
    return `draft-${keySequence.current}`;
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roomRows, slideRows, contentRows] = await Promise.all([
        listRooms(),
        listCarouselSlides(),
        listRoomContent(),
      ]);

      if (!activeRef.current) {
        return;
      }

      const sorted = sortRooms(roomRows);
      const saved = Object.fromEntries(contentRows.map((row) => [row.roomId, row]));

      setRooms(sorted);
      setSlides(slideRows);
      setCarouselDraft(slideRows.map(toDraft));
      setContent(
        Object.fromEntries(
          sorted.map((room) => [room.id, saved[room.id] ?? defaultRoomContent(room)]),
        ),
      );
      setSelectedRoomId((current) => current ?? sorted[0]?.id ?? null);
    } catch (error) {
      if (activeRef.current) {
        snackbar.error(
          error instanceof Error ? error.message : 'Unable to load website content.',
          { actionLabel: 'Retry', onAction: () => loadRef.current() },
        );
      }
    } finally {
      if (activeRef.current) {
        setLoading(false);
      }
    }
  }, [snackbar]);

  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedContent = selectedRoomId ? (content[selectedRoomId] ?? null) : null;

  useEffect(() => {
    if (!selectedContent) {
      return;
    }
    setCapacity(String(selectedContent.capacity));
    setDescription(selectedContent.description);
    setAmenities(selectedContent.amenities.join(', '));
    setPhotoDraft(selectedContent.photos.map(toDraft));
    setCoverKey(
      selectedContent.coverPhotoId ?? selectedContent.photos[0]?.id ?? null,
    );
    setDetailsDirty(false);
  }, [selectedContent]);

  const filteredRooms = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return rooms;
    }
    return rooms.filter(
      (room) =>
        roomLabel(room).toLowerCase().includes(term) ||
        roomShortLabel(room).toLowerCase().includes(term),
    );
  }, [rooms, query]);

  const carouselDirty = !sameOrder(carouselDraft, slides);
  const photosDirty =
    !!selectedContent &&
    (!sameOrder(photoDraft, selectedContent.photos) ||
      coverKey !== (selectedContent.coverPhotoId ?? selectedContent.photos[0]?.id ?? null));
  const roomDirty = detailsDirty || photosDirty;

  const pendingSlideCount = carouselDraft.filter((item) => item.existingId === null).length;
  const cover =
    photoDraft.find((item) => item.key === coverKey) ?? photoDraft[0] ?? null;

  const run = useCallback(
    async (action: () => Promise<string>) => {
      setBusy(true);
      try {
        const message = await action();
        if (activeRef.current) {
          snackbar.success(message);
        }
      } catch (error) {
        if (activeRef.current) {
          snackbar.error(
            error instanceof Error ? error.message : 'That change could not be saved.',
          );
        }
      } finally {
        if (activeRef.current) {
          setBusy(false);
        }
      }
    },
    [snackbar],
  );

  const handleAddSlide = useCallback(() => {
    run(async () => {
      const photo = await pickPhotoFromLibrary();
      if (!photo) {
        return 'No photo was selected.';
      }
      setCarouselDraft((current) => [
        ...current,
        { key: nextKey(), uri: photo.uri, existingId: null, photo },
      ]);
      return 'Photo staged. Press Save Carousel to publish it.';
    });
  }, [run, nextKey]);

  const handleMoveSlide = useCallback((key: string, direction: -1 | 1) => {
    setCarouselDraft((current) => {
      const index = current.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleSaveCarousel = useCallback(() => {
    run(async () => {
      const rows = await saveCarousel(
        carouselDraft.map(({ key, existingId, photo }) => ({ key, existingId, photo })),
      );
      setSlides(rows);
      setCarouselDraft(rows.map(toDraft));
      return 'The landing carousel was updated.';
    });
  }, [run, carouselDraft]);

  const handleDiscardCarousel = useCallback(() => {
    setCarouselDraft(slides.map(toDraft));
    snackbar.info('Unsaved carousel changes were discarded.');
  }, [slides, snackbar]);

  const applyContent = useCallback((next: RoomContentModel) => {
    setContent((current) => ({ ...current, [next.roomId]: next }));
  }, []);

  const handleAddRoomPhoto = useCallback(() => {
    if (!selectedRoom) {
      return;
    }
    run(async () => {
      const photo = await pickPhotoFromLibrary();
      if (!photo) {
        return 'No photo was selected.';
      }
      const key = nextKey();
      setPhotoDraft((current) => [
        ...current,
        { key, uri: photo.uri, existingId: null, photo },
      ]);
      setCoverKey((current) => current ?? key);
      return 'Photo staged. Press Save Room Details to publish it.';
    });
  }, [run, selectedRoom, nextKey]);

  const handleRemoveDraftPhoto = useCallback((key: string) => {
    setPhotoDraft((current) => current.filter((item) => item.key !== key));
    setCoverKey((current) => (current === key ? null : current));
  }, []);

  const handleSaveDetails = useCallback(() => {
    if (!selectedRoom) {
      return;
    }
    run(async () => {
      const next = await saveRoomContent(selectedRoom.id, {
        description,
        capacity: Number(capacity.replace(/[^\d]/g, '')),
        amenities: amenities.split(','),
        photos: photoDraft.map(({ key, existingId, photo }) => ({ key, existingId, photo })),
        coverKey,
      });
      applyContent(next);
      setDetailsDirty(false);
      return `${roomLabel(selectedRoom)} was saved.`;
    });
  }, [
    run,
    selectedRoom,
    description,
    capacity,
    amenities,
    photoDraft,
    coverKey,
    applyContent,
  ]);

  const confirmRemoval = useCallback(() => {
    if (!pendingRemoval) {
      return;
    }
    if (pendingRemoval.kind === 'slide') {
      setCarouselDraft((current) => current.filter((item) => item.key !== pendingRemoval.key));
      return;
    }
    handleRemoveDraftPhoto(pendingRemoval.key);
  }, [pendingRemoval, handleRemoveDraftPhoto]);

  return (
    <View style={styles.page}>
      <PageMeta title="Content" description="Manage the photos and copy shown on the public landing page." />
      <MainContentArea {...scrollNavigator.scrollProps}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Content</Text>
          </View>
        </View>

        <Card
          title="Landing Carousel"
          style={styles.card}
          revealDelay={280}
          action={
            canEdit ? (
              <MatchaButton
                label="Add Photo"
                icon="plus"
                variant="outline"
                disabled={busy || carouselDraft.length >= MAX_CAROUSEL_SLIDES}
                onPress={handleAddSlide}
              />
            ) : undefined
          }>
          {loading && carouselDraft.length === 0 ? (
            <SkeletonGallery
              count={4}
              tileWidth={148}
              tileHeight={108}
              label="Loading carousel photos"
            />
          ) : carouselDraft.length === 0 ? (
            <EmptyBlock text="No carousel photos yet. Upload one to fill the home section." />
          ) : (
            <View style={styles.slideGrid}>
              {carouselDraft.map((item, index) => (
                <View key={item.key} style={styles.slideTile}>
                  <Image source={{ uri: item.uri }} style={styles.slideImage} resizeMode="cover" />
                  <View style={styles.slideOrder}>
                    <Text style={styles.slideOrderText}>{index + 1}</Text>
                  </View>
                  {item.existingId === null && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>NEW</Text>
                    </View>
                  )}
                  {canEdit && (
                    <View style={styles.slideActions}>
                      <TileButton
                        icon="chevronLeft"
                        label="Move earlier"
                        disabled={busy || index === 0}
                        onPress={() => handleMoveSlide(item.key, -1)}
                      />
                      <TileButton
                        icon="chevronRight"
                        label="Move later"
                        disabled={busy || index === carouselDraft.length - 1}
                        onPress={() => handleMoveSlide(item.key, 1)}
                      />
                      <TileButton
                        icon="trash"
                        label="Remove photo"
                        destructive
                        disabled={busy}
                        onPress={() => setPendingRemoval({ kind: 'slide', key: item.key })}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {canEdit && carouselDirty && (
            <View style={styles.confirmBar}>
              <Text style={styles.confirmHint}>
                {pendingSlideCount > 0
                  ? `${pendingSlideCount} new photo${pendingSlideCount === 1 ? '' : 's'} waiting to be published.`
                  : 'Carousel changes are not published yet.'}
              </Text>
              <View style={styles.confirmActions}>
                <MatchaButton
                  label="Discard"
                  variant="outline"
                  disabled={busy}
                  onPress={handleDiscardCarousel}
                />
                <MatchaButton
                  label={busy ? 'Saving…' : 'Save Carousel'}
                  icon="check"
                  disabled={busy}
                  onPress={handleSaveCarousel}
                />
              </View>
            </View>
          )}
        </Card>

        <Card
          title="Room Photos"
          style={styles.card}
          revealDelay={340}
          {...scrollNavigator.targetProps}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search a room…"
            style={styles.search}
          />

          <View style={styles.roomChips}>
            {filteredRooms.length === 0 ? (
              <Text style={styles.emptyText}>No rooms match your search.</Text>
            ) : (
              filteredRooms.map((room) => {
                const tone = buildingToneOf(room.building);
                const active = room.id === selectedRoomId;
                const photoCount =
                  active ? photoDraft.length : (content[room.id]?.photos.length ?? 0);

                return (
                  <Pressable
                    key={room.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Edit photos for ${roomLabel(room)}`}
                    style={[
                      styles.roomChip,
                      { borderColor: tone.border },
                      active && styles.roomChipActive,
                    ]}
                    onPress={() => setSelectedRoomId(room.id)}>
                    <View style={[styles.roomChipBadge, { backgroundColor: tone.background }]}>
                      <Text style={[styles.roomChipBadgeText, { color: tone.color }]}>
                        {roomShortLabel(room)}
                      </Text>
                    </View>
                    <View style={styles.roomChipText}>
                      <Text
                        style={[styles.roomChipLabel, active && styles.roomChipLabelActive]}
                        numberOfLines={1}>
                        {roomLabel(room)}
                      </Text>
                      <Text style={styles.roomChipCaption} numberOfLines={1}>
                        {photoCount} photo{photoCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {loading && !selectedContent ? (
            <View style={styles.roomEditor}>
              <View style={styles.coverRow}>
                <Skeleton width={196} height={132} radius={DefaultTheme.radius.md} />
                <View style={styles.photoSkeletonColumn}>
                  <SkeletonText lines={3} lineHeight={10} gap={9} lastLineWidth="54%" />
                </View>
              </View>
              <SkeletonGallery
                count={4}
                tileWidth={148}
                tileHeight={108}
                label="Loading room photos"
              />
            </View>
          ) : !selectedRoom || !selectedContent ? (
            <EmptyBlock text="Pick a room to manage its photos." />
          ) : (
            <View style={styles.roomEditor}>
              <View style={styles.coverRow}>
                <View style={styles.coverPreview}>
                  {cover ? (
                    <Image source={{ uri: cover.uri }} style={styles.coverImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.coverEmpty}>
                      <AppIcon name="rooms" size={22} tintColor={DefaultTheme.colors.muted} />
                    </View>
                  )}
                  <View style={styles.coverTag}>
                    <Text style={styles.coverTagText}>ROOM CARD PHOTO</Text>
                  </View>
                </View>
                <View style={styles.coverCopy}>
                  <Text style={styles.editorTitle}>{roomLabel(selectedRoom)}</Text>
                  <Text style={styles.editorCaption}>
                    {buildingLabel(selectedRoom.building)} · The cover photo is used on the landing
                    room card, and every photo appears in the details slider. Photo changes are only
                    published once you press Save Room Details.
                  </Text>
                  {canEdit && (
                    <MatchaButton
                      label="Upload Photo"
                      icon="plus"
                      variant="outline"
                      disabled={busy || photoDraft.length >= MAX_ROOM_PHOTOS}
                      style={styles.uploadButton}
                      onPress={handleAddRoomPhoto}
                    />
                  )}
                </View>
              </View>

              {photoDraft.length === 0 ? (
                <EmptyBlock text="This room has no photos yet. Upload one so it can appear on the website." />
              ) : (
                <View style={styles.photoGrid}>
                  {photoDraft.map((item) => {
                    const isCover = cover?.key === item.key;

                    return (
                      <View
                        key={item.key}
                        style={[styles.photoTile, isCover && styles.photoTileCover]}>
                        <Image
                          source={{ uri: item.uri }}
                          style={styles.photoImage}
                          resizeMode="cover"
                        />
                        {isCover && (
                          <View style={styles.coverBadge}>
                            <AppIcon name="check" size={10} tintColor={DefaultTheme.colors.white} />
                            <Text style={styles.coverBadgeText}>Cover</Text>
                          </View>
                        )}
                        {!isCover && item.existingId === null && (
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>NEW</Text>
                          </View>
                        )}
                        {canEdit && (
                          <View style={styles.slideActions}>
                            <TileButton
                              icon="eye"
                              label="Use as room card photo"
                              disabled={busy || isCover}
                              onPress={() => setCoverKey(item.key)}
                            />
                            <TileButton
                              icon="trash"
                              label="Remove photo"
                              destructive
                              disabled={busy}
                              onPress={() => setPendingRemoval({ kind: 'photo', key: item.key })}
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.detailFields}>
                <LabelledField
                  label={`Good for (max ${MAX_ROOM_CAPACITY} pax)`}
                  value={capacity}
                  editable={canEdit}
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setCapacity(value);
                    setDetailsDirty(true);
                  }}
                />
                <LabelledField
                  label="Amenities (comma separated)"
                  value={amenities}
                  editable={canEdit}
                  onChangeText={(value) => {
                    setAmenities(value);
                    setDetailsDirty(true);
                  }}
                />
                <LabelledField
                  label="Description"
                  value={description}
                  editable={canEdit}
                  multiline
                  onChangeText={(value) => {
                    setDescription(value);
                    setDetailsDirty(true);
                  }}
                />
                {canEdit && (
                  <View style={styles.saveRow}>
                    <MatchaButton
                      label={busy ? 'Saving…' : 'Save Room Details'}
                      icon="check"
                      disabled={busy || !roomDirty}
                      onPress={handleSaveDetails}
                    />
                    {roomDirty && (
                      <Text style={styles.confirmHint}>
                        Unsaved changes. Switching rooms discards them.
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
        </Card>
      </MainContentArea>

      {compact && <PageFabStack navigator={scrollNavigator} downLabel="To Room Photos" />}

      <ConfirmDialog
        visible={pendingRemoval !== null}
        icon="trash"
        tone="destructive"
        title="Remove this photo?"
        message={
          pendingRemoval?.kind === 'slide'
            ? 'The photo leaves the carousel once you press Save Carousel.'
            : 'The photo leaves the room card and the details slider once you press Save Room Details.'
        }
        confirmLabel="Remove Photo"
        onConfirm={confirmRemoval}
        onClose={() => setPendingRemoval(null)}
      />
    </View>
  );
}

function LabelledField({
  label,
  value,
  onChangeText,
  editable,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  multiline?: boolean;
  keyboardType?: 'number-pad';
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        cursorColor={DefaultTheme.colors.primary}
        underlineColorAndroid="transparent"
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMultiline,
          focused && styles.fieldInputFocused,
          !editable && styles.fieldInputDisabled,
        ]}
      />
    </View>
  );
}

function TileButton({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: 'chevronLeft' | 'chevronRight' | 'trash' | 'eye';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={[styles.tileButton, disabled && styles.tileButtonDisabled]}
      onPress={onPress}>
      <AppIcon
        name={icon}
        size={13}
        tintColor={destructive ? '#C4453B' : DefaultTheme.colors.ink}
      />
    </Pressable>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <View style={styles.emptyBlock}>
      <AppIcon name="inbox" size={20} tintColor={DefaultTheme.colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 22,
  },
  card: {
    width: '100%',
  },
  search: {
    marginBottom: 14,
  },
  slideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slideTile: {
    width: 148,
    height: 108,
    borderRadius: DefaultTheme.radius.sm,
    overflow: 'hidden',
    backgroundColor: '#E5E4DB',
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  slideOrder: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: 'rgba(32,32,31,0.72)',
  },
  slideOrderText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10,
    textAlign: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: '#C98A1E',
  },
  pendingBadgeText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 8.5,
    letterSpacing: 0.4,
  },
  slideActions: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    gap: 6,
  },
  tileButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DefaultTheme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tileButtonDisabled: {
    opacity: 0.4,
  },
  confirmBar: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  confirmHint: {
    flexShrink: 1,
    minWidth: 180,
    color: '#8A6A1C',
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12.5,
  },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roomChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 168,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    backgroundColor: DefaultTheme.colors.white,
  },
  roomChipActive: {
    borderColor: DefaultTheme.colors.primary,
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  roomChipBadge: {
    width: 32,
    height: 32,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomChipBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 11.5,
  },
  roomChipText: {
    flex: 1,
    minWidth: 0,
  },
  roomChipLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12.5,
  },
  roomChipLabelActive: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
  },
  roomChipCaption: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  roomEditor: {
    marginTop: 18,
    gap: 18,
  },
  photoSkeletonColumn: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    justifyContent: 'center',
  },
  coverRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  coverPreview: {
    width: 196,
    height: 132,
    borderRadius: DefaultTheme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#E5E4DB',
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: 'rgba(32,32,31,0.72)',
  },
  coverTagText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  coverCopy: {
    flex: 1,
    minWidth: 220,
  },
  editorTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
  },
  editorCaption: {
    marginTop: 6,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  uploadButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoTile: {
    width: 132,
    height: 98,
    borderRadius: DefaultTheme.radius.sm,
    overflow: 'hidden',
    backgroundColor: '#E5E4DB',
    borderWidth: 2,
    borderColor: DefaultTheme.colors.line,
  },
  photoTileCover: {
    borderColor: DefaultTheme.colors.primary,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.primary,
  },
  coverBadgeText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 9,
  },
  detailFields: {
    gap: 14,
  },
  fieldLabel: {
    marginBottom: 6,
    marginLeft: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fieldInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: DefaultTheme.radius.sm,
    borderWidth: 1.5,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13.5,
  },
  fieldInputMultiline: {
    minHeight: 104,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  fieldInputFocused: {
    borderColor: DefaultTheme.colors.primary,
  },
  fieldInputDisabled: {
    backgroundColor: DefaultTheme.colors.cool,
    color: DefaultTheme.colors.muted,
  },
  saveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  emptyBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 26,
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  emptyText: {
    paddingHorizontal: 18,
    textAlign: 'center',
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
});
