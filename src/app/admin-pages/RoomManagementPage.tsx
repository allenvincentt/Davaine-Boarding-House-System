import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PageMeta } from '@/components/common/PageMeta';
import { SkeletonKPIRow, SkeletonTable } from '@/components/common/SkeletonLoader';
import { useSnackbar } from '@/components/common/Snackbar';
import {
  AddNewRenterModal,
  type AddRenterSubmit,
} from '@/app/admin-pages/AddNewRenterModal';
import { EditRoomModal, type EditRoomSubmit } from '@/app/admin-pages/EditRoomModal';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { AppIcon } from '@/components/ui/AppIcon';
import { GradientButton } from '@/components/ui/buttons/GradientButton';
import { MatchaButton } from '@/components/ui/buttons/MatchaButton';
import { PageFabStack, usePageScrollNavigator } from '@/components/ui/buttons/PageFabStack';
import { Card } from '@/components/ui/cards/Card';
import { KPICard, KPICardsRow } from '@/components/ui/cards/KPICards';
import { ConfirmDialog } from '@/components/ui/modals/ConfirmDialog';
import { Modal } from '@/components/ui/modals/Modal';
import { SearchField } from '@/components/ui/SearchField';
import { Select, type SelectAnchor, type SelectOption } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { DefaultTheme } from '@/constants/defaultTheme';
import type { AppIconName } from '@/constants/icons';
import { buildingToneOf } from '@/constants/roomTheme';
import {
  buildingLabel,
  dueSummaryOf,
  formatPeso,
  formatShortDate,
  nextDueDate,
  roomBuildings,
  roomLabel,
  roomShortLabel,
  roomStatusOf,
  sortRooms,
  tenantCountLabel,
  type RoomBuilding,
  type RoomModel,
  type RoomStatus,
  type RoomTenantModel,
} from '@/models/roomModel';
import { useAuth } from '@/providers/AuthProvider';
import { can } from '@/services/accessControl';
import { addRenters, listRooms, releaseRoom, updateRoom } from '@/services/roomManagementService';

type StatusFilter = 'All' | RoomStatus;
type BuildingFilter = 'All' | RoomBuilding;

const statusTone: Record<RoomStatus, { color: string; background: string }> = {
  Occupied: { color: '#4EA4E5', background: DefaultTheme.colors.softBlue },
  Available: { color: '#2E8A57', background: '#E4F5EA' },
};

const OCCUPIED_COLOR = '#4EA4E5';
const AVAILABLE_COLOR = '#4C8A2E';
const TENANT_COLOR = '#7C5CD6';

const TOTAL_TENANT_COLUMN_WIDTH = 700;
const DUE_COLUMN_WIDTH = 880;
const MOBILE_TENANT_PREVIEW = 3;

type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  badgeBackground: string;
  dotColor: string;
  time: string;
};

const recentActivity: ActivityItem[] = [
  {
    id: 'a1',
    title: 'Room 5-A rate updated to ₱ 1,800',
    subtitle: 'Paolo Mendoza',
    badge: 'Room Rate',
    badgeColor: '#2E8A57',
    badgeBackground: '#E4F5EA',
    dotColor: '#2E8A57',
    time: '9:12 AM',
  },
  {
    id: 'a2',
    title: 'New renter moved into Room 1-B',
    subtitle: 'Mika Tolentino',
    badge: 'Move-in',
    badgeColor: '#4EA4E5',
    badgeBackground: DefaultTheme.colors.softBlue,
    dotColor: '#4EA4E5',
    time: '8:45 AM',
  },
  {
    id: 'a3',
    title: 'Room 2-B marked as available',
    subtitle: 'Bldg. B · Ready for new renters',
    badge: 'Released',
    badgeColor: '#C98A1E',
    badgeBackground: DefaultTheme.colors.softGold,
    dotColor: '#C98A1E',
    time: 'Yesterday',
  },
];

function initialsOf(name: string) {
  const parts = name.split(' ').filter(Boolean);
  const source = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return source.toUpperCase();
}

function openExternal(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

export default function RoomManagementPage() {
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.compactNavigation;
  const { profile } = useAuth();
  const scrollNavigator = usePageScrollNavigator();

  const role = profile?.userRole ?? null;
  const canCreate = can(role, 'create', 'rooms');
  const canUpdate = can(role, 'update', 'rooms');
  const canDelete = can(role, 'delete', 'rooms');
  const readOnly = !canCreate && !canUpdate && !canDelete;

  const [rooms, setRooms] = useState<RoomModel[]>([]);
  const [loading, setLoading] = useState(true);
  const snackbar = useSnackbar();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [buildingFilter, setBuildingFilter] = useState<BuildingFilter>('All');
  const [tableWidth, setTableWidth] = useState(0);

  const [actionsRoom, setActionsRoom] = useState<RoomModel | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<SelectAnchor | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addSession, setAddSession] = useState(0);

  const [editRoom, setEditRoom] = useState<RoomModel | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);

  const [detailsRoom, setDetailsRoom] = useState<RoomModel | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pendingRelease, setPendingRelease] = useState<RoomModel | null>(null);

  const activeRef = useRef(true);
  const loadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listRooms();
      if (activeRef.current) {
        setRooms(rows);
      }
    } catch (error) {
      if (activeRef.current) {
        snackbar.error(error instanceof Error ? error.message : 'Unable to load rooms.', {
          actionLabel: 'Retry',
          onAction: () => loadRef.current(),
        });
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

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((room) => roomStatusOf(room) === 'Occupied').length;
  const totalTenants = rooms.reduce((sum, room) => sum + room.tenants.length, 0);
  const occupancyRate = totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100);

  const buildingStats = useMemo(() => {
    const base = {
      A: { total: 0, occupied: 0, available: 0 },
      B: { total: 0, occupied: 0, available: 0 },
    } satisfies Record<RoomBuilding, { total: number; occupied: number; available: number }>;

    rooms.forEach((room) => {
      const stats = base[room.building];
      stats.total += 1;
      if (roomStatusOf(room) === 'Occupied') {
        stats.occupied += 1;
      } else {
        stats.available += 1;
      }
    });

    return base;
  }, [rooms]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (statusFilter !== 'All' && roomStatusOf(room) !== statusFilter) {
        return false;
      }
      if (buildingFilter !== 'All' && room.building !== buildingFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        roomLabel(room).toLowerCase().includes(term) ||
        roomShortLabel(room).toLowerCase().includes(term) ||
        room.tenants.some(
          (tenant) =>
            tenant.fullName.toLowerCase().includes(term) ||
            (tenant.contactNumber ?? '').toLowerCase().includes(term),
        )
      );
    });
  }, [rooms, query, statusFilter, buildingFilter]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setTableWidth((current) => (current === measured ? current : measured));
  }, []);

  const applyRoom = useCallback((next: RoomModel) => {
    setRooms((current) => sortRooms(current.map((room) => (room.id === next.id ? next : room))));
    setDetailsRoom((current) => (current && current.id === next.id ? next : current));
  }, []);

  const openActions = useCallback((room: RoomModel, anchor: SelectAnchor) => {
    setActionsRoom(room);
    setActionsAnchor(anchor);
    setActionsOpen(true);
  }, []);

  const openAdd = useCallback(() => {
    setAddSession((current) => current + 1);
    setAddOpen(true);
  }, []);

  const openEdit = useCallback((room: RoomModel) => {
    setEditRoom(room);
    setEditSession((current) => current + 1);
    setEditOpen(true);
  }, []);

  const openDetails = useCallback((room: RoomModel) => {
    setDetailsRoom(room);
    setDetailsOpen(true);
  }, []);

  const handleCreate = useCallback(
    async (input: AddRenterSubmit) => {
      const updated = await addRenters(input.roomId, input.renters, input.rate);
      applyRoom(updated);
      snackbar.success(
        `${input.renters.length} renter(s) were added to ${roomLabel(updated)} at ${formatPeso(
          updated.rate,
        )} per month. The room is now ${roomStatusOf(updated).toLowerCase()}.`,
      );
    },
    [applyRoom, snackbar],
  );

  const handleUpdate = useCallback(
    async (input: EditRoomSubmit) => {
      const updated = await updateRoom(input.roomId, {
        rate: input.rate,
        renters: input.renters,
      });
      applyRoom(updated);
      snackbar.success(`${roomLabel(updated)} was updated to ${formatPeso(updated.rate)} per month.`);
    },
    [applyRoom, snackbar],
  );

  const handleRelease = useCallback(
    async (room: RoomModel) => {
      const removed = room.tenants.length;
      const pending = snackbar.loading(`Releasing ${roomLabel(room)}…`);
      try {
        const updated = await releaseRoom(room.id);
        applyRoom(updated);
        snackbar.update(pending, {
          tone: 'success',
          message: `${roomLabel(updated)} is now available. ${removed} tenant(s) were removed.`,
        });
      } catch (error) {
        snackbar.update(pending, {
          tone: 'error',
          message: error instanceof Error ? error.message : 'The room could not be updated.',
        });
      }
    },
    [applyRoom, snackbar],
  );

  const actionOptions = useMemo<SelectOption[]>(() => {
    if (!actionsRoom) {
      return [];
    }

    const options: SelectOption[] = [
      {
        key: 'details',
        label: 'View Details',
        icon: 'eye',
        onSelect: () => openDetails(actionsRoom),
      },
    ];

    if (canUpdate) {
      options.push({
        key: 'edit',
        label: 'Edit Room',
        icon: 'edit',
        onSelect: () => openEdit(actionsRoom),
      });
    }

    if (canDelete && roomStatusOf(actionsRoom) === 'Occupied') {
      options.push({
        key: 'release',
        label: 'Update to Available',
        icon: 'userMinus',
        destructive: true,
        onSelect: () => setPendingRelease(actionsRoom),
      });
    }

    return options;
  }, [actionsRoom, canUpdate, canDelete, openDetails, openEdit]);

  const columns = useMemo<TableColumn<RoomModel>[]>(() => {
    const list: TableColumn<RoomModel>[] = [
      {
        key: 'room',
        header: 'Room No.',
        width: 138,
        render: (row) => (
          <View style={styles.roomCell}>
            <RoomBadge room={row} />
            <View style={styles.roomCellText}>
              <Text style={styles.roomLabel} numberOfLines={1}>
                {roomLabel(row)}
              </Text>
              <BuildingChip building={row.building} style={styles.roomCellChip} />
            </View>
          </View>
        ),
      },
    ];

    if (tableWidth >= TOTAL_TENANT_COLUMN_WIDTH) {
      list.push({
        key: 'totalTenant',
        header: 'Total Tenant',
        width: 104,
        render: (row) => (
          <View>
            <Text style={styles.tenantCount}>{row.tenants.length}</Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              {row.tenants.length === 1 ? 'tenant' : 'tenants'}
            </Text>
          </View>
        ),
      });
    }

    list.push({
      key: 'tenants',
      header: 'Tenants',
      render: (row) => <TenantStack room={row} />,
    });

    if (tableWidth >= DUE_COLUMN_WIDTH) {
      list.push({
        key: 'due',
        header: 'Billing',
        width: 130,
        render: (row) => (
          <Text style={styles.dueText} numberOfLines={1}>
            {dueSummaryOf(row)}
          </Text>
        ),
      });
    }

    list.push(
      {
        key: 'status',
        header: 'Room Status',
        width: 124,
        render: (row) => <StatusChip status={roomStatusOf(row)} />,
      },
      {
        key: 'rate',
        header: 'Room Rates',
        width: 118,
        render: (row) => (
          <View>
            <Text style={styles.rateText} numberOfLines={1}>
              {formatPeso(row.rate)}
            </Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              per month
            </Text>
          </View>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        width: 62,
        align: 'right',
        render: (row) => (
          <RowActionsButton room={row} onOpen={(anchor) => openActions(row, anchor)} />
        ),
      },
    );

    return list;
  }, [tableWidth, openActions]);

  return (
    <View style={styles.page}>
      <PageMeta title="Room Management" description="Manage rooms, rates, and tenant assignments." />
      <MainContentArea {...scrollNavigator.scrollProps}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Room Management</Text>
          </View>
          {!compact && canCreate && (
            <GradientButton
              accessibilityLabel="Add new renters"
              style={styles.addButton}
              onPress={openAdd}>
              <AppIcon name="userPlus" size={15} tintColor={DefaultTheme.colors.white} />
              <Text style={styles.addButtonLabel}>Add New Renters</Text>
            </GradientButton>
          )}
        </View>

        {loading && rooms.length === 0 ? (
          <SkeletonKPIRow count={6} label="Loading room figures" />
        ) : (
          <KPICardsRow>
            <KPICard
              label="Total Rooms"
              value={totalRooms}
              icon="rooms"
              iconColor={DefaultTheme.colors.primary}
              iconBackground={DefaultTheme.colors.softOlive}
              accentColor={DefaultTheme.colors.primary}
              caption={`${occupancyRate}% occupancy rate`}
              progress={1}
            />
            <KPICard
              label="Total Tenants"
              value={totalTenants}
              icon="users"
              iconColor={TENANT_COLOR}
              iconBackground="#EDE7F6"
              accentColor={TENANT_COLOR}
              caption={`Across ${occupiedRooms} occupied room(s)`}
              progress={1}
            />
            <KPICard
              label="Bldg. A Occupied Rooms"
              value={buildingStats.A.occupied}
              icon="rooms"
              iconColor={OCCUPIED_COLOR}
              iconBackground={DefaultTheme.colors.softBlue}
              accentColor={OCCUPIED_COLOR}
              caption={`of ${buildingStats.A.total} room(s) in Bldg. A`}
              progress={buildingStats.A.total === 0 ? 0 : buildingStats.A.occupied / buildingStats.A.total}
            />
            <KPICard
              label="Bldg. B Available Rooms"
              value={buildingStats.B.available}
              icon="doorOpen"
              iconColor={AVAILABLE_COLOR}
              iconBackground="#E4F5EA"
              accentColor={AVAILABLE_COLOR}
              caption={`of ${buildingStats.B.total} room(s) in Bldg. B`}
              progress={buildingStats.B.total === 0 ? 0 : buildingStats.B.available / buildingStats.B.total}
            />
            <KPICard
              label="Bldg. B Occupied Rooms"
              value={buildingStats.B.occupied}
              icon="rooms"
              iconColor={OCCUPIED_COLOR}
              iconBackground={DefaultTheme.colors.softBlue}
              accentColor={OCCUPIED_COLOR}
              caption={`of ${buildingStats.B.total} room(s) in Bldg. B`}
              progress={buildingStats.B.total === 0 ? 0 : buildingStats.B.occupied / buildingStats.B.total}
            />
            <KPICard
              label="Bldg. A Available Rooms"
              value={buildingStats.A.available}
              icon="doorOpen"
              iconColor={AVAILABLE_COLOR}
              iconBackground="#E4F5EA"
              accentColor={AVAILABLE_COLOR}
              caption={`of ${buildingStats.A.total} room(s) in Bldg. A`}
              progress={buildingStats.A.total === 0 ? 0 : buildingStats.A.available / buildingStats.A.total}
            />
          </KPICardsRow>
        )}

        <Card style={styles.tableCard} revealDelay={320} {...scrollNavigator.targetProps}>
          <View style={styles.toolbar}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search by room or tenant…"
              style={styles.search}
            />
            <FilterSelect
              label={statusFilter === 'All' ? 'All Status' : statusFilter}
              accessibilityLabel="Filter by room status"
              options={['All', 'Occupied', 'Available'] as StatusFilter[]}
              value={statusFilter}
              labelOf={(option) => (option === 'All' ? 'All Status' : option)}
              onChange={setStatusFilter}
              style={compact ? styles.filterCompact : undefined}
            />
            <FilterSelect
              label={buildingFilter === 'All' ? 'All Buildings' : buildingLabel(buildingFilter)}
              accessibilityLabel="Filter by building"
              options={['All', ...roomBuildings] as BuildingFilter[]}
              value={buildingFilter}
              labelOf={(option) => (option === 'All' ? 'All Buildings' : buildingLabel(option))}
              onChange={setBuildingFilter}
              style={compact ? styles.filterCompact : undefined}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh rooms"
              style={styles.refreshButton}
              onPress={load}>
              <AppIcon name="refresh" size={15} tintColor={DefaultTheme.colors.muted} />
            </Pressable>
          </View>

          <View onLayout={handleTableLayout}>
            {loading && rooms.length === 0 ? (
              <SkeletonTable rows={6} columns={columns.length} label="Loading rooms" />
            ) : compact ? (
              <View style={styles.mobileList}>
                {filtered.length === 0 ? (
                  <Text style={styles.emptyText}>No rooms match your filters.</Text>
                ) : (
                  filtered.map((room) => (
                    <RoomListCard
                      key={room.id}
                      room={room}
                      onPress={() => openDetails(room)}
                      onOpenActions={(anchor) => openActions(room, anchor)}
                    />
                  ))
                )}
              </View>
            ) : (
              <Table
                columns={columns}
                data={filtered}
                keyExtractor={(row) => row.id}
                emptyLabel="No rooms match your filters."
              />
            )}
          </View>

          {!loading && filtered.length > 0 && (
            <Text style={styles.footerSummary}>
              Showing {filtered.length} of {totalRooms} rooms · {totalTenants} tenants ·{' '}
              {occupancyRate}% occupied
            </Text>
          )}
        </Card>

        <Card
          title="Recent Activity"
          style={styles.activityCard}
          revealDelay={400}
          action={<Text style={styles.viewAll}>View all</Text>}>
          {recentActivity.map((item, index) => (
            <View
              key={item.id}
              style={[styles.activityRow, index === recentActivity.length - 1 && styles.rowLast]}>
              <View style={[styles.activityDot, { backgroundColor: item.dotColor }]} />
              <View style={styles.activityBody}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <View style={styles.activityMeta}>
                <View style={[styles.activityBadge, { backgroundColor: item.badgeBackground }]}>
                  <Text style={[styles.activityBadgeText, { color: item.badgeColor }]}>
                    {item.badge}
                  </Text>
                </View>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            </View>
          ))}
        </Card>
      </MainContentArea>

      {compact && (
        <PageFabStack
          navigator={scrollNavigator}
          primaryIcon={canCreate ? 'userPlus' : undefined}
          primaryLabel="Add new renters"
          onPrimaryPress={canCreate ? openAdd : undefined}
        />
      )}

      <Select
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        options={actionOptions}
        anchor={actionsAnchor}
        align="right"
        minWidth={198}
      />

      <AddNewRenterModal
        key={`add-${addSession}`}
        visible={addOpen}
        rooms={rooms}
        onClose={() => setAddOpen(false)}
        onSubmit={handleCreate}
      />

      <EditRoomModal
        key={`edit-${editSession}`}
        visible={editOpen}
        room={editRoom}
        onClose={() => setEditOpen(false)}
        onSubmit={handleUpdate}
      />

      <RoomDetailsModal
        visible={detailsOpen}
        room={detailsRoom}
        canEdit={canUpdate}
        onEdit={(room) => {
          setDetailsOpen(false);
          openEdit(room);
        }}
        onClose={() => setDetailsOpen(false)}
      />

      <ConfirmDialog
        visible={pendingRelease !== null}
        icon="userMinus"
        tone="destructive"
        title="Update room to available?"
        message={`${
          pendingRelease ? roomLabel(pendingRelease) : 'This room'
        } will be marked as available and its ${
          pendingRelease?.tenants.length ?? 0
        } tenant(s) will be removed from the room.`}
        confirmLabel="Update to Available"
        onConfirm={() => {
          if (pendingRelease) {
            handleRelease(pendingRelease);
          }
        }}
        onClose={() => setPendingRelease(null)}
      />
    </View>
  );
}

function RoomDetailsModal({
  visible,
  room,
  canEdit,
  onEdit,
  onClose,
}: {
  visible: boolean;
  room: RoomModel | null;
  canEdit: boolean;
  onEdit: (room: RoomModel) => void;
  onClose: () => void;
}) {
  if (!room) {
    return null;
  }

  const status = roomStatusOf(room);
  const tone = statusTone[status];

  return (
    <Modal visible={visible} onClose={onClose} contentStyle={styles.detailsShell}>
      <View style={styles.detailsBody}>
        <View style={styles.detailsHeader}>
          <RoomBadge room={room} large />
          <View style={styles.detailsHeaderText}>
            <Text style={styles.detailsTitle} numberOfLines={1}>
              {roomLabel(room)}
            </Text>
            <Text style={styles.detailsSubtitle} numberOfLines={1}>
              {dueSummaryOf(room)}
            </Text>
          </View>
          <BuildingChip building={room.building} />
          <View style={[styles.detailsStatusChip, { backgroundColor: tone.background }]}>
            <Text style={[styles.statusChipText, { color: tone.color }]}>{status}</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatBlock icon="money" label="Room Rate" value={formatPeso(room.rate)} />
          <StatBlock icon="users" label="Total Tenant" value={String(room.tenants.length)} />
          <StatBlock
            icon="calendar"
            label="Next Due"
            value={status === 'Occupied' ? formatShortDate(nextDueDate(room)) : '—'}
          />
        </View>

        <View style={styles.tenantsHeader}>
          <Text style={styles.detailsSectionTitle}>Tenants</Text>
          <Text style={styles.detailsSectionCount}>{room.tenants.length}</Text>
        </View>

        {room.tenants.length === 0 ? (
          <View style={styles.detailsEmptyBlock}>
            <AppIcon name="inbox" size={20} tintColor={DefaultTheme.colors.muted} />
            <Text style={styles.detailsEmptyText}>This room is available for new renters.</Text>
          </View>
        ) : (
          <View style={styles.tenantList}>
            {room.tenants.map((tenant, index) => (
              <TenantRow
                key={tenant.id}
                tenant={tenant}
                isLast={index === room.tenants.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.detailsActions}>
          <MatchaButton
            label="Close"
            variant="outline"
            style={styles.detailsAction}
            onPress={onClose}
          />
          {canEdit && (
            <MatchaButton
              label="Edit Room"
              icon="edit"
              style={styles.detailsAction}
              onPress={() => onEdit(room)}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatBlock({ icon, label, value }: { icon: AppIconName; label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <View style={styles.statLabelRow}>
        <AppIcon name={icon} size={13} tintColor={DefaultTheme.colors.muted} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TenantRow({ tenant, isLast }: { tenant: RoomTenantModel; isLast: boolean }) {
  return (
    <View style={[styles.tenantRow, isLast && styles.tenantRowLast]}>
      <View style={styles.tenantAvatar}>
        <Text style={styles.tenantAvatarText}>{initialsOf(tenant.fullName)}</Text>
      </View>
      <View style={styles.tenantRowBody}>
        <Text style={styles.tenantRowName} numberOfLines={1}>
          {tenant.fullName}
        </Text>
        <Text style={styles.tenantRowMeta} numberOfLines={1}>
          {tenant.contactNumber ?? 'No contact number'}
        </Text>
      </View>
      <View style={styles.tenantLinks}>
        {!!tenant.contactNumber && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${tenant.fullName}`}
            hitSlop={6}
            style={styles.tenantLinkButton}
            onPress={() => openExternal(`tel:${tenant.contactNumber?.replace(/\s/g, '')}`)}>
            <AppIcon name="phone" size={14} tintColor={DefaultTheme.colors.primary} />
          </Pressable>
        )}
        {!!tenant.facebookLink && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open Facebook profile of ${tenant.fullName}`}
            hitSlop={6}
            style={styles.tenantLinkButton}
            onPress={() => {
              const link = tenant.facebookLink ?? '';
              openExternal(link.startsWith('@') ? `https://facebook.com/${link.slice(1)}` : link);
            }}>
            <AppIcon name="link" size={14} tintColor={DefaultTheme.colors.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function RoomBadge({ room, large }: { room: RoomModel; large?: boolean }) {
  const tone = buildingToneOf(room.building);

  return (
    <View
      style={[
        styles.roomBadge,
        large && styles.roomBadgeLarge,
        { backgroundColor: tone.background },
      ]}>
      <Text
        style={[styles.roomBadgeText, large && styles.roomBadgeTextLarge, { color: tone.color }]}>
        {roomShortLabel(room)}
      </Text>
    </View>
  );
}

function BuildingChip({
  building,
  style,
}: {
  building: RoomBuilding;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = buildingToneOf(building);

  return (
    <View
      style={[
        styles.buildingChip,
        { backgroundColor: tone.background, borderColor: tone.border },
        style,
      ]}>
      <Text style={[styles.buildingChipText, { color: tone.color }]}>{buildingLabel(building)}</Text>
    </View>
  );
}

function StatusChip({ status }: { status: RoomStatus }) {
  const tone = statusTone[status];

  return (
    <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
      <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.statusChipText, { color: tone.color }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

function TenantStack({ room, limit }: { room: RoomModel; limit?: number }) {
  if (room.tenants.length === 0) {
    return <Text style={styles.noTenants}>No tenants yet</Text>;
  }

  const visible = limit ? room.tenants.slice(0, limit) : room.tenants;
  const hidden = room.tenants.length - visible.length;

  return (
    <View style={styles.tenantStack}>
      {visible.map((tenant) => (
        <Text key={tenant.id} style={styles.tenantName} numberOfLines={1}>
          {tenant.fullName}
        </Text>
      ))}
      {hidden > 0 && <Text style={styles.tenantMore}>+{hidden} more</Text>}
    </View>
  );
}

function RowActionsButton({
  room,
  onOpen,
}: {
  room: RoomModel;
  onOpen: (anchor: SelectAnchor) => void;
}) {
  const triggerRef = useRef<View>(null);
  const [hovered, setHovered] = useState(false);

  const handlePress = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      onOpen({ x, y, width, height });
    });
  };

  return (
    <Pressable
      ref={triggerRef}
      accessibilityRole="button"
      accessibilityLabel={`Actions for ${roomLabel(room)}`}
      style={[styles.rowAction, hovered && styles.rowActionHovered]}
      onPress={handlePress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}>
      <AppIcon name="more" size={16} tintColor={DefaultTheme.colors.muted} />
    </Pressable>
  );
}

function FilterSelect<T extends string>({
  label,
  accessibilityLabel,
  options,
  value,
  labelOf,
  onChange,
  style,
}: {
  label: string;
  accessibilityLabel: string;
  options: T[];
  value: T;
  labelOf: (option: T) => string;
  onChange: (option: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<SelectAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const selectOptions = useMemo<SelectOption[]>(
    () =>
      options.map((option) => ({
        key: option,
        label: labelOf(option),
        icon: option === value ? 'check' : undefined,
        onSelect: () => onChange(option),
      })),
    [options, value, labelOf, onChange],
  );

  const handlePress = () => {
    if (open) {
      setOpen(false);
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <View style={style}>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={[styles.filterTrigger, (hovered || open) && styles.filterTriggerActive]}
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}>
        <Text style={styles.filterTriggerLabel} numberOfLines={1}>
          {label}
        </Text>
        <AppIcon
          name="chevronDown"
          size={13}
          tintColor={DefaultTheme.colors.muted}
          style={open ? styles.chevronOpen : undefined}
        />
      </Pressable>
      <Select
        visible={open}
        onClose={() => setOpen(false)}
        options={selectOptions}
        anchor={anchor}
        align="right"
        minWidth={172}
      />
    </View>
  );
}

function RoomListCard({
  room,
  onPress,
  onOpenActions,
}: {
  room: RoomModel;
  onPress: () => void;
  onOpenActions: (anchor: SelectAnchor) => void;
}) {
  const status = roomStatusOf(room);
  const tone = buildingToneOf(room.building);

  return (
    <View style={[styles.mobileCard, { borderColor: tone.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${roomLabel(room)}`}
        style={styles.mobileCardPressable}
        onPress={onPress}>
        <View style={styles.mobileCardHeader}>
          <RoomBadge room={room} />
          <View style={styles.mobileCardHeaderText}>
            <Text style={styles.roomLabel} numberOfLines={1}>
              {roomLabel(room)}
            </Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              {dueSummaryOf(room)}
            </Text>
          </View>
        </View>

        <View style={styles.mobileMetaRow}>
          <BuildingChip building={room.building} />
          <StatusChip status={status} />
          <View style={styles.mobileMetaItem}>
            <AppIcon name="users" size={12} tintColor={DefaultTheme.colors.muted} />
            <Text style={styles.mobileMetaText}>{tenantCountLabel(room)}</Text>
          </View>
          <View style={styles.mobileMetaItem}>
            <AppIcon name="money" size={12} tintColor={DefaultTheme.colors.muted} />
            <Text style={styles.mobileMetaText}>{formatPeso(room.rate)}</Text>
          </View>
        </View>

        <View style={styles.mobileTenants}>
          <Text style={styles.mobileSectionLabel}>Tenants</Text>
          <TenantStack room={room} limit={MOBILE_TENANT_PREVIEW} />
        </View>
      </Pressable>

      <View style={styles.mobileCardActions}>
        <RowActionsButton room={room} onOpen={onOpenActions} />
      </View>
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
  addButton: {
    minHeight: 44,
    paddingHorizontal: 22,
  },
  addButtonLabel: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 14,
  },
  tableCard: {
    width: '100%',
  },
  activityCard: {
    width: '100%',
  },
  viewAll: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DefaultTheme.colors.line,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  activityDot: {
    marginTop: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  activitySubtitle: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  activityMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: DefaultTheme.radius.pill,
  },
  activityBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10,
  },
  activityTime: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 10.5,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  search: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 160,
  },
  filterCompact: {
    flexGrow: 1,
    flexBasis: 148,
  },
  filterTrigger: {
    height: 42,
    minWidth: 148,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: DefaultTheme.colors.cool,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  filterTriggerActive: {
    borderColor: DefaultTheme.colors.primary,
    backgroundColor: DefaultTheme.colors.white,
  },
  filterTriggerLabel: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13.5,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: DefaultTheme.colors.cool,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  roomCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  roomBadge: {
    width: 38,
    height: 38,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomBadgeLarge: {
    width: 48,
    height: 48,
    borderRadius: DefaultTheme.radius.md,
  },
  roomBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12.5,
  },
  roomBadgeTextLarge: {
    fontSize: 15,
  },
  roomCellText: {
    flexShrink: 1,
    minWidth: 0,
  },
  roomCellChip: {
    marginTop: 4,
  },
  roomLabel: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  roomCaption: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  buildingChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: DefaultTheme.radius.pill,
    borderWidth: 1,
  },
  buildingChipText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10.5,
  },
  tenantCount: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 15,
  },
  tenantStack: {
    gap: 3,
    minWidth: 0,
  },
  tenantName: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  tenantMore: {
    color: DefaultTheme.colors.primary,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 11.5,
  },
  noTenants: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
    fontStyle: 'italic',
  },
  dueText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  rateText: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 13.5,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DefaultTheme.radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10.5,
  },
  rowAction: {
    width: 30,
    height: 30,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActionHovered: {
    backgroundColor: DefaultTheme.colors.cool,
    borderColor: DefaultTheme.colors.line,
  },
  mobileList: {
    width: '100%',
    gap: 12,
  },
  mobileCard: {
    position: 'relative',
    borderRadius: DefaultTheme.radius.md,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  mobileCardPressable: {
    padding: 14,
    gap: 12,
  },
  mobileCardActions: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 40,
  },
  mobileCardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  mobileMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  mobileMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mobileMetaText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 11.5,
  },
  mobileTenants: {
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  mobileSectionLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  footerSummary: {
    marginTop: 14,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  detailsShell: {
    maxWidth: 480,
  },
  detailsBody: {
    padding: DefaultTheme.spacing.lg,
  },
  detailsHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  detailsHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailsTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 17,
  },
  detailsSubtitle: {
    marginTop: 3,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  detailsStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: DefaultTheme.radius.pill,
  },
  statGrid: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBlock: {
    flexGrow: 1,
    flexBasis: 110,
    minWidth: 100,
    padding: 12,
    borderRadius: DefaultTheme.radius.sm,
    backgroundColor: DefaultTheme.colors.white,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    flexShrink: 1,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  statValue: {
    marginTop: 6,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 15,
  },
  tenantsHeader: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsSectionTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 14,
  },
  detailsSectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: DefaultTheme.radius.pill,
    backgroundColor: DefaultTheme.colors.cool,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 11,
  },
  tenantList: {
    marginTop: 6,
  },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DefaultTheme.colors.line,
  },
  tenantRowLast: {
    borderBottomWidth: 0,
  },
  tenantAvatar: {
    width: 36,
    height: 36,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DefaultTheme.colors.primary,
  },
  tenantAvatarText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12.5,
  },
  tenantRowBody: {
    flex: 1,
    minWidth: 0,
  },
  tenantRowName: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13.5,
  },
  tenantRowMeta: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  tenantLinks: {
    flexDirection: 'row',
    gap: 8,
  },
  tenantLinkButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DefaultTheme.radius.sm,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  detailsEmptyBlock: {
    marginTop: 12,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 22,
    borderRadius: DefaultTheme.radius.sm,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  detailsEmptyText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  detailsActions: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 10,
  },
  detailsAction: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
  },
});
