import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { BillReceiptModal, billStatusTone } from '@/app/admin-pages/BillReceiptModal';
import { GenerateBillsModal } from '@/app/admin-pages/GenerateBillsModal';
import { RecordPaymentModal } from '@/app/admin-pages/RecordPaymentModal';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { AppIcon } from '@/components/ui/AppIcon';
import { GradientButton } from '@/components/ui/buttons/GradientButton';
import { PageFabStack, usePageScrollNavigator } from '@/components/ui/buttons/PageFabStack';
import { Card } from '@/components/ui/cards/Card';
import { KPICard, KPICardsRow } from '@/components/ui/cards/KPICards';
import { ConfirmDialog } from '@/components/ui/modals/ConfirmDialog';
import { SearchField } from '@/components/ui/SearchField';
import { Select, type SelectAnchor, type SelectOption } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { DefaultTheme } from '@/constants/defaultTheme';
import type { AppIconName } from '@/constants/icons';
import { buildingToneOf } from '@/constants/roomTheme';
import {
  computeBreakdown,
  formatKwh,
  formatPaidAt,
  formatPesoDecimal,
  formatReading,
  periodLabelOf,
  periodShortLabelOf,
  waterMeterKeys,
  waterMeterLabel,
  type BillingBreakdownModel,
  type BillingPeriodModel,
  type BillStatus,
  type RoomBillModel,
} from '@/models/billModel';
import {
  buildingLabel,
  formatPeso,
  roomBuildings,
  type RoomBuilding,
  type RoomModel,
} from '@/models/roomModel';
import { useAuth } from '@/providers/AuthProvider';
import { can } from '@/services/accessControl';
import {
  deleteBillingPeriod,
  generateBills,
  listBillingPeriods,
  recordPayment,
  suggestNextPeriod,
  type GenerateBillsInput,
  type PaymentDraft,
} from '@/services/billingService';
import { listRooms } from '@/services/roomManagementService';

type StatusFilter = 'All' | BillStatus;
type BuildingFilter = 'All' | RoomBuilding;

const ELECTRIC_COLOR = '#C98A1E';
const WATER_COLOR = '#2F73B8';
const COLLECTED_COLOR = '#4C8A2E';
const BALANCE_COLOR = '#C4453B';

const HEADS_COLUMN_WIDTH = 760;
const CONSUMPTION_COLUMN_WIDTH = 880;
const CR_COLUMN_WIDTH = 1010;
const TOTAL_COLUMN_WIDTH = 1120;
const FEES_COLUMN_WIDTH = 1290;

const statusFilters: StatusFilter[] = ['All', 'Unpaid', 'Partial', 'Paid', 'No Charge'];

export default function BillsPage() {
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.compactNavigation;
  const { profile } = useAuth();
  const scrollNavigator = usePageScrollNavigator();

  const role = profile?.userRole ?? null;
  const canCreate = can(role, 'create', 'bills');
  const canUpdate = can(role, 'update', 'bills');
  const canDelete = can(role, 'delete', 'bills');
  const readOnly = !canCreate && !canUpdate && !canDelete;

  const [rooms, setRooms] = useState<RoomModel[]>([]);
  const [periods, setPeriods] = useState<BillingPeriodModel[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const snackbar = useSnackbar();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [buildingFilter, setBuildingFilter] = useState<BuildingFilter>('All');
  const [tableWidth, setTableWidth] = useState(0);

  const [actionsBill, setActionsBill] = useState<RoomBillModel | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<SelectAnchor | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateSession, setGenerateSession] = useState(0);
  const [generateSeed, setGenerateSeed] = useState({ year: 0, month: 0 });

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSession, setPaymentSession] = useState(0);
  const [paymentBill, setPaymentBill] = useState<RoomBillModel | null>(null);

  const [receiptBill, setReceiptBill] = useState<RoomBillModel | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BillingPeriodModel | null>(null);

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
      const [roomRows, periodRows] = await Promise.all([listRooms(), listBillingPeriods()]);
      if (!activeRef.current) {
        return;
      }
      setRooms(roomRows);
      setPeriods(periodRows);
      setActivePeriodId((current) =>
        current && periodRows.some((period) => period.id === current)
          ? current
          : (periodRows[0]?.id ?? null),
      );
    } catch (error) {
      if (activeRef.current) {
        snackbar.error(error instanceof Error ? error.message : 'Unable to load bills.', {
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

  const activePeriod = useMemo(
    () => periods.find((period) => period.id === activePeriodId) ?? null,
    [periods, activePeriodId],
  );

  const breakdown = useMemo<BillingBreakdownModel | null>(
    () => (activePeriod ? computeBreakdown(activePeriod) : null),
    [activePeriod],
  );

  const bills = useMemo(() => breakdown?.bills ?? [], [breakdown]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return bills.filter((bill) => {
      if (statusFilter !== 'All' && bill.status !== statusFilter) {
        return false;
      }
      if (buildingFilter !== 'All' && bill.building !== buildingFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        bill.label.toLowerCase().includes(term) || bill.shortLabel.toLowerCase().includes(term)
      );
    });
  }, [bills, query, statusFilter, buildingFilter]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setTableWidth((current) => (current === measured ? current : measured));
  }, []);

  const applyPeriod = useCallback((next: BillingPeriodModel) => {
    setPeriods((current) => {
      const exists = current.some((period) => period.id === next.id);
      const merged = exists
        ? current.map((period) => (period.id === next.id ? next : period))
        : [...current, next];
      return merged.sort((left, right) =>
        left.year === right.year ? right.month - left.month : right.year - left.year,
      );
    });
    setActivePeriodId(next.id);
  }, []);

  const openGenerate = useCallback(
    (seed?: { year: number; month: number }) => {
      setGenerateSeed(seed ?? suggestNextPeriod(periods));
      setGenerateSession((current) => current + 1);
      setGenerateOpen(true);
    },
    [periods],
  );

  const openPayment = useCallback((bill: RoomBillModel | null) => {
    setPaymentBill(bill);
    setPaymentSession((current) => current + 1);
    setPaymentOpen(true);
  }, []);

  const openReceipt = useCallback((bill: RoomBillModel) => {
    setReceiptBill(bill);
    setReceiptOpen(true);
  }, []);

  const openActions = useCallback((bill: RoomBillModel, anchor: SelectAnchor) => {
    setActionsBill(bill);
    setActionsAnchor(anchor);
    setActionsOpen(true);
  }, []);

  const handleGenerate = useCallback(
    async (input: GenerateBillsInput) => {
      const period = await generateBills(input);
      applyPeriod(period);
      const summary = computeBreakdown(period);
      snackbar.success(
        `${periodLabelOf(period)} bills were generated. ${summary.billedRooms} room(s) billed for a total of ${formatPeso(
          summary.totalMonthlyBills,
        )}.`,
      );
    },
    [applyPeriod, snackbar],
  );

  const handleRecordPayment = useCallback(
    async (draft: PaymentDraft) => {
      if (!activePeriod) {
        throw new Error('Select a billing period first.');
      }
      const period = await recordPayment(activePeriod.id, draft);
      applyPeriod(period);
      const updated = computeBreakdown(period).bills.find((bill) => bill.roomId === draft.roomId);
      setReceiptBill((current) =>
        current && updated && current.roomId === updated.roomId ? updated : current,
      );
      snackbar.success(
        `${formatPeso(draft.amount)} was recorded for ${updated?.label ?? 'the room'}. Remaining balance: ${formatPeso(
          updated?.balance ?? 0,
        )}.`,
      );
    },
    [activePeriod, applyPeriod, snackbar],
  );

  const handleDeletePeriod = useCallback(
    async (period: BillingPeriodModel) => {
      const pending = snackbar.loading(`Deleting ${periodLabelOf(period)} bills…`);
      try {
        await deleteBillingPeriod(period.id);
        setPeriods((current) => {
          const next = current.filter((item) => item.id !== period.id);
          setActivePeriodId(next[0]?.id ?? null);
          return next;
        });
        snackbar.update(pending, {
          tone: 'success',
          message: `${periodLabelOf(period)} bills were deleted.`,
        });
      } catch (error) {
        snackbar.update(pending, {
          tone: 'error',
          message:
            error instanceof Error ? error.message : 'The billing period could not be deleted.',
        });
      }
    },
    [snackbar],
  );

  const periodOptions = useMemo<SelectOption[]>(
    () =>
      periods.map((period) => ({
        key: period.id,
        label: periodLabelOf(period),
        icon: period.id === activePeriodId ? 'check' : undefined,
        onSelect: () => setActivePeriodId(period.id),
      })),
    [periods, activePeriodId],
  );

  const periodMenuOptions = useMemo<SelectOption[]>(() => {
    if (!activePeriod) {
      return [];
    }

    const options: SelectOption[] = [];

    if (canUpdate) {
      options.push({
        key: 'edit',
        label: 'Edit Readings',
        icon: 'edit',
        onSelect: () => openGenerate({ year: activePeriod.year, month: activePeriod.month }),
      });
    }

    if (canUpdate) {
      options.push({
        key: 'payment',
        label: 'Record Payment',
        icon: 'payment',
        onSelect: () => openPayment(null),
      });
    }

    if (canDelete) {
      options.push({
        key: 'delete',
        label: 'Delete Period',
        icon: 'trash',
        destructive: true,
        onSelect: () => setPendingDelete(activePeriod),
      });
    }

    return options;
  }, [activePeriod, canUpdate, canDelete, openGenerate, openPayment]);

  const rowActionOptions = useMemo<SelectOption[]>(() => {
    if (!actionsBill) {
      return [];
    }

    const options: SelectOption[] = [
      {
        key: 'receipt',
        label: 'View Receipt',
        icon: 'document',
        onSelect: () => openReceipt(actionsBill),
      },
    ];

    if (canUpdate && actionsBill.balance > 0) {
      options.push({
        key: 'payment',
        label: 'Record Payment',
        icon: 'payment',
        onSelect: () => openPayment(actionsBill),
      });
    }

    return options;
  }, [actionsBill, canUpdate, openReceipt, openPayment]);

  const columns = useMemo<TableColumn<RoomBillModel>[]>(() => {
    const list: TableColumn<RoomBillModel>[] = [
      {
        key: 'room',
        header: 'Room',
        width: 150,
        render: (row) => (
          <View style={styles.roomCell}>
            <View
              style={[
                styles.roomBadge,
                { backgroundColor: buildingToneOf(row.building).background },
              ]}>
              <Text style={[styles.roomBadgeText, { color: buildingToneOf(row.building).color }]}>
                {row.shortLabel}
              </Text>
            </View>
            <View style={styles.roomCellText}>
              <Text style={styles.roomLabel} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={styles.roomCaption} numberOfLines={1}>
                {buildingLabel(row.building)}
              </Text>
            </View>
          </View>
        ),
      },
    ];

    if (tableWidth >= HEADS_COLUMN_WIDTH) {
      list.push({
        key: 'heads',
        header: 'Heads',
        width: 66,
        render: (row) => <Text style={styles.numberCell}>{row.numOfHeads}</Text>,
      });
    }

    if (tableWidth >= CONSUMPTION_COLUMN_WIDTH) {
      list.push({
        key: 'consumption',
        header: 'Consumption',
        width: 108,
        render: (row) => (
          <View>
            <Text style={styles.numberCell}>{formatKwh(row.consumption)}</Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              {formatReading(row.previousReading)} → {formatReading(row.currentReading)}
            </Text>
          </View>
        ),
      });
    }

    list.push(
      {
        key: 'electric',
        header: 'Electric',
        width: 96,
        render: (row) => <Text style={styles.moneyCell}>{formatPeso(row.electricBill)}</Text>,
      },
      {
        key: 'water',
        header: 'Water',
        width: 92,
        render: (row) => <Text style={styles.moneyCell}>{formatPeso(row.waterBill)}</Text>,
      },
    );

    if (tableWidth >= CR_COLUMN_WIDTH) {
      list.push({
        key: 'cr',
        header: 'CR Maint.',
        width: 92,
        render: (row) => <Text style={styles.moneyCell}>{formatPeso(row.crMaintenance)}</Text>,
      });
    }

    if (tableWidth >= FEES_COLUMN_WIDTH) {
      list.push(
        {
          key: 'garbage',
          header: 'Garbage',
          width: 84,
          render: (row) => <Text style={styles.moneyCell}>{formatPeso(row.garbageFee)}</Text>,
        },
        {
          key: 'plastic',
          header: 'Plastic',
          width: 84,
          render: (row) => <Text style={styles.moneyCell}>{formatPeso(row.plasticFee)}</Text>,
        },
      );
    }

    list.push({
      key: 'monthly',
      header: 'Monthly Bill',
      width: 112,
      render: (row) => (
        <View>
          <Text style={styles.totalCell}>{formatPeso(row.monthlyBill)}</Text>
          <Text style={styles.roomCaption} numberOfLines={1}>
            + {formatPeso(row.roomRate)} rent
          </Text>
        </View>
      ),
    });

    if (tableWidth >= TOTAL_COLUMN_WIDTH) {
      list.push({
        key: 'due',
        header: 'Total Due',
        width: 112,
        render: (row) => (
          <View>
            <Text style={styles.totalCell}>{formatPeso(row.totalDue)}</Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              {row.balance > 0 ? `${formatPeso(row.balance)} left` : 'Settled'}
            </Text>
          </View>
        ),
      });
    }

    list.push(
      {
        key: 'status',
        header: 'Status',
        width: 106,
        render: (row) => <StatusChip status={row.status} />,
      },
      {
        key: 'actions',
        header: 'Actions',
        width: 62,
        align: 'right',
        render: (row) => (
          <RowActionsButton bill={row} onOpen={(anchor) => openActions(row, anchor)} />
        ),
      },
    );

    return list;
  }, [tableWidth, openActions]);

  const receiptRoom = useMemo(
    () => rooms.find((room) => room.id === receiptBill?.roomId) ?? null,
    [rooms, receiptBill?.roomId],
  );

  return (
    <View style={styles.page}>
      <PageMeta title="Bills" description="Generate, track, and settle monthly boarding house bills." />
      <MainContentArea {...scrollNavigator.scrollProps}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Bills</Text>
          </View>
          {!compact && canCreate && (
            <GradientButton
              accessibilityLabel="Generate monthly bills"
              style={styles.addButton}
              onPress={() => openGenerate()}>
              <AppIcon name="plus" size={15} tintColor={DefaultTheme.colors.white} />
              <Text style={styles.addButtonLabel}>Generate Bills</Text>
            </GradientButton>
          )}
        </View>

        {loading && periods.length === 0 ? (
          <SkeletonKPIRow count={6} label="Loading billing figures" />
        ) : (
          <KPICardsRow>
            <KPICard
              label="Total Consumption"
              value={Math.round(breakdown?.totalConsumption ?? 0)}
              icon="electricity"
              iconColor={ELECTRIC_COLOR}
              iconBackground={DefaultTheme.colors.softGold}
              accentColor={ELECTRIC_COLOR}
              caption="kWh for the whole BH"
              progress={1}
            />
            <KPICard
              label="Total Electric Bills"
              value={breakdown?.totalElectric ?? 0}
              icon="money"
              iconColor={DefaultTheme.colors.primary}
              iconBackground={DefaultTheme.colors.softOlive}
              accentColor={DefaultTheme.colors.primary}
              caption={`at ${formatPesoDecimal(activePeriod?.electricRate ?? 0)} per kWh`}
              progress={1}
            />
            <KPICard
              label="Total Water Bills"
              value={breakdown?.totalWater ?? 0}
              icon="water"
              iconColor={WATER_COLOR}
              iconBackground={DefaultTheme.colors.softBlue}
              accentColor={WATER_COLOR}
              caption={`${breakdown?.rates.totalHeads ?? 0} head(s) in the BH`}
              progress={1}
            />
            <KPICard
              label="Total Monthly Bills"
              value={breakdown?.totalMonthlyBills ?? 0}
              icon="payment"
              iconColor="#7C5CD6"
              iconBackground="#EDE7F6"
              accentColor="#7C5CD6"
              caption={`Across ${breakdown?.billedRooms ?? 0} billed room(s)`}
              progress={1}
            />
            <KPICard
              label="Collected"
              value={breakdown?.totalCollected ?? 0}
              icon="check"
              iconColor={COLLECTED_COLOR}
              iconBackground="#E4F5EA"
              accentColor={COLLECTED_COLOR}
              caption={`${breakdown?.paidRooms ?? 0} room(s) fully paid`}
              progress={
                breakdown && breakdown.totalDue > 0
                  ? breakdown.totalCollected / breakdown.totalDue
                  : 0
              }
            />
            <KPICard
              label="Outstanding"
              value={breakdown?.totalBalance ?? 0}
              icon="warning"
              iconColor={BALANCE_COLOR}
              iconBackground="#FBE7E5"
              accentColor={BALANCE_COLOR}
              caption={`${breakdown?.unpaidRooms ?? 0} room(s) still due`}
              progress={
                breakdown && breakdown.totalDue > 0 ? breakdown.totalBalance / breakdown.totalDue : 0
              }
            />
          </KPICardsRow>
        )}

        <Card style={styles.card} revealDelay={280}>
          <View style={styles.periodBar}>
            <View style={styles.periodBarText}>
              <Text style={styles.periodLabel}>
                {activePeriod ? periodLabelOf(activePeriod) : 'No billing period yet'}
              </Text>
              <Text style={styles.periodCaption}>
                {activePeriod
                  ? `Generated ${formatPaidAt(activePeriod.generatedAt)} · ${
                      activePeriod.readings.length
                    } room(s) tallied`
                  : 'Generate the first monthly bills to get started.'}
              </Text>
            </View>
            {periods.length > 0 && (
              <MenuTrigger
                label={activePeriod ? periodShortLabelOf(activePeriod) : 'Period'}
                accessibilityLabel="Select billing period"
                options={periodOptions}
                minWidth={190}
              />
            )}
            {periodMenuOptions.length > 0 && (
              <MenuTrigger
                icon="more"
                accessibilityLabel="Billing period actions"
                options={periodMenuOptions}
                minWidth={190}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh bills"
              style={styles.iconButton}
              onPress={load}>
              <AppIcon name="refresh" size={15} tintColor={DefaultTheme.colors.muted} />
            </Pressable>
          </View>

          {activePeriod && breakdown && (
            <View style={styles.utilityGrid}>
              <UtilityBlock
                icon="electricity"
                tone={ELECTRIC_COLOR}
                background={DefaultTheme.colors.softGold}
                title="Davao Light"
                value={formatPeso(activePeriod.davaoLightBill)}
                rows={[
                  ['Billed to rooms', formatPeso(breakdown.totalElectric)],
                  ['Rate per kWh', formatPesoDecimal(activePeriod.electricRate)],
                  [
                    'Variance',
                    `${breakdown.electricVariance >= 0 ? '+' : '−'}${formatPeso(
                      Math.abs(breakdown.electricVariance),
                    )}`,
                  ],
                ]}
              />
              {waterMeterKeys.map((key) => (
                <UtilityBlock
                  key={key}
                  icon="water"
                  tone={key === 'CR' ? WATER_COLOR : buildingToneOf(key).color}
                  background={key === 'CR' ? DefaultTheme.colors.softBlue : buildingToneOf(key).background}
                  title={`DCWD · ${waterMeterLabel(key)}`}
                  value={formatPeso(activePeriod.waterBills[key])}
                  rows={
                    key === 'CR'
                      ? [
                          ['Total heads (BH)', String(breakdown.rates.totalHeads)],
                          ['Per head', formatPesoDecimal(breakdown.rates.perHeadCrWater)],
                          ['Shared by', 'Bldg. A and Bldg. B'],
                        ]
                      : [
                          ['Heads', String(breakdown.rates.headsByBuilding[key])],
                          ['Per head', formatPesoDecimal(breakdown.rates.perHeadRoomWater[key])],
                          [
                            'Room water billed',
                            formatPeso(
                              breakdown.bills
                                .filter((bill) => bill.building === key)
                                .reduce((sum, bill) => sum + bill.waterBill, 0),
                            ),
                          ],
                        ]
                  }
                />
              ))}
            </View>
          )}
        </Card>

        <Card style={styles.card} revealDelay={360} {...scrollNavigator.targetProps}>
          <View style={styles.toolbar}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search by room…"
              style={styles.search}
            />
            <FilterSelect
              label={statusFilter === 'All' ? 'All Status' : statusFilter}
              accessibilityLabel="Filter by payment status"
              options={statusFilters}
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
          </View>

          <View onLayout={handleTableLayout}>
            {loading && periods.length === 0 ? (
              <SkeletonTable rows={6} columns={columns.length} label="Loading bills" />
            ) : !activePeriod ? (
              <View style={styles.emptyBlock}>
                <AppIcon name="inbox" size={22} tintColor={DefaultTheme.colors.muted} />
                <Text style={styles.emptyTitle}>No bills generated yet</Text>
                <Text style={styles.emptyText}>
                  Tally the Davao Light and DCWD bills for the month, then encode each room&apos;s
                  meter readings and heads.
                </Text>
              </View>
            ) : compact ? (
              <View style={styles.mobileList}>
                {filtered.length === 0 ? (
                  <Text style={styles.emptyText}>No rooms match your filters.</Text>
                ) : (
                  filtered.map((bill) => (
                    <BillListCard
                      key={bill.roomId}
                      bill={bill}
                      onPress={() => openReceipt(bill)}
                      onOpenActions={(anchor) => openActions(bill, anchor)}
                    />
                  ))
                )}
              </View>
            ) : (
              <Table
                columns={columns}
                data={filtered}
                keyExtractor={(row) => row.roomId}
                emptyLabel="No rooms match your filters."
              />
            )}
          </View>

          {!!breakdown && filtered.length > 0 && (
            <View style={styles.footerRow}>
              <Text style={styles.footerSummary}>
                Showing {filtered.length} of {bills.length} rooms · Monthly bills{' '}
                {formatPeso(breakdown.totalMonthlyBills)} · Total due{' '}
                {formatPeso(breakdown.totalDue)}
              </Text>
              <Text style={styles.footerSummary}>
                Collected {formatPeso(breakdown.totalCollected)} · Outstanding{' '}
                {formatPeso(breakdown.totalBalance)}
              </Text>
            </View>
          )}
        </Card>

        {!!activePeriod && activePeriod.payments.length > 0 && (
          <Card
            style={styles.card}
            revealDelay={420}
            title="Rental Payments">
            <View style={styles.paymentList}>
              {[...activePeriod.payments]
                .sort((left, right) => right.paidAt.localeCompare(left.paidAt))
                .map((payment, index, list) => {
                  const bill = bills.find((item) => item.roomId === payment.roomId);
                  return (
                    <View
                      key={payment.id}
                      style={[styles.paymentRow, index === list.length - 1 && styles.paymentRowLast]}>
                      <View style={styles.paymentIcon}>
                        <AppIcon name="payment" size={14} tintColor={DefaultTheme.colors.primary} />
                      </View>
                      <View style={styles.paymentBody}>
                        <Text style={styles.paymentTitle} numberOfLines={1}>
                          {bill?.label ?? 'Room'} · {payment.method}
                        </Text>
                        <Text style={styles.paymentCaption} numberOfLines={1}>
                          {formatPaidAt(payment.paidAt)}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                          {payment.receivedBy ? ` · ${payment.receivedBy}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.paymentAmount}>{formatPeso(payment.amount)}</Text>
                    </View>
                  );
                })}
            </View>
          </Card>
        )}
      </MainContentArea>

      {compact && (
        <PageFabStack
          navigator={scrollNavigator}
          primaryIcon={canCreate ? 'plus' : undefined}
          primaryLabel="Generate monthly bills"
          onPrimaryPress={canCreate ? () => openGenerate() : undefined}
          downLabel="To Bills"
        />
      )}

      <Select
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        options={rowActionOptions}
        anchor={actionsAnchor}
        align="right"
        minWidth={198}
      />

      <GenerateBillsModal
        key={`generate-${generateSession}`}
        visible={generateOpen}
        rooms={rooms}
        periods={periods}
        initialPeriod={generateSeed}
        onClose={() => setGenerateOpen(false)}
        onSubmit={handleGenerate}
      />

      <RecordPaymentModal
        key={`payment-${paymentSession}`}
        visible={paymentOpen}
        period={activePeriod}
        bills={bills}
        initialBill={paymentBill}
        receivedBy={profile?.fullName ?? null}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handleRecordPayment}
      />

      <BillReceiptModal
        visible={receiptOpen}
        period={activePeriod}
        bill={receiptBill}
        room={receiptRoom}
        canRecordPayment={canUpdate}
        onRecordPayment={(bill) => {
          setReceiptOpen(false);
          openPayment(bill);
        }}
        onClose={() => setReceiptOpen(false)}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="trash"
        tone="destructive"
        title="Delete this billing period?"
        message={`${
          pendingDelete ? periodLabelOf(pendingDelete) : 'This period'
        } and its ${pendingDelete?.readings.length ?? 0} room reading(s) will be removed. This cannot be undone.`}
        confirmLabel="Delete Period"
        onConfirm={() => {
          if (pendingDelete) {
            handleDeletePeriod(pendingDelete);
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </View>
  );
}

function UtilityBlock({
  icon,
  tone,
  background,
  title,
  value,
  rows,
}: {
  icon: AppIconName;
  tone: string;
  background: string;
  title: string;
  value: string;
  rows: [string, string][];
}) {
  return (
    <View style={styles.utilityBlock}>
      <View style={styles.utilityHeader}>
        <View style={[styles.utilityIcon, { backgroundColor: background }]}>
          <AppIcon name={icon} size={14} tintColor={tone} />
        </View>
        <Text style={styles.utilityTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={[styles.utilityValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
      {rows.map(([label, detail]) => (
        <View key={label} style={styles.utilityRow}>
          <Text style={styles.utilityRowLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.utilityRowValue} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatusChip({ status }: { status: BillStatus }) {
  const tone = billStatusTone[status];

  return (
    <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
      <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.statusChipText, { color: tone.color }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

function RowActionsButton({
  bill,
  onOpen,
}: {
  bill: RoomBillModel;
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
      accessibilityLabel={`Actions for ${bill.label}`}
      style={[styles.rowAction, hovered && styles.rowActionHovered]}
      onPress={handlePress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}>
      <AppIcon name="more" size={16} tintColor={DefaultTheme.colors.muted} />
    </Pressable>
  );
}

function MenuTrigger({
  label,
  icon,
  accessibilityLabel,
  options,
  minWidth = 180,
}: {
  label?: string;
  icon?: AppIconName;
  accessibilityLabel: string;
  options: SelectOption[];
  minWidth?: number;
}) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<SelectAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

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
    <View>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={[
          label ? styles.menuTrigger : styles.iconButton,
          (hovered || open) && styles.menuTriggerActive,
        ]}
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}>
        {!!label && (
          <Text style={styles.menuTriggerLabel} numberOfLines={1}>
            {label}
          </Text>
        )}
        <AppIcon
          name={icon ?? 'chevronDown'}
          size={icon ? 16 : 13}
          tintColor={DefaultTheme.colors.muted}
          style={!icon && open ? styles.chevronOpen : undefined}
        />
      </Pressable>
      <Select
        visible={open}
        onClose={() => setOpen(false)}
        options={options}
        anchor={anchor}
        align="right"
        minWidth={minWidth}
      />
    </View>
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

function BillListCard({
  bill,
  onPress,
  onOpenActions,
}: {
  bill: RoomBillModel;
  onPress: () => void;
  onOpenActions: (anchor: SelectAnchor) => void;
}) {
  const tone = buildingToneOf(bill.building);

  return (
    <View style={[styles.mobileCard, { borderColor: tone.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View receipt for ${bill.label}`}
        style={styles.mobileCardPressable}
        onPress={onPress}>
        <View style={styles.mobileCardHeader}>
          <View style={[styles.roomBadge, { backgroundColor: tone.background }]}>
            <Text style={[styles.roomBadgeText, { color: tone.color }]}>{bill.shortLabel}</Text>
          </View>
          <View style={styles.mobileCardHeaderText}>
            <Text style={styles.roomLabel} numberOfLines={1}>
              {bill.label}
            </Text>
            <Text style={styles.roomCaption} numberOfLines={1}>
              {bill.numOfHeads} head(s) · {formatKwh(bill.consumption)}
            </Text>
          </View>
        </View>

        <View style={styles.mobileMetaRow}>
          <StatusChip status={bill.status} />
          <MobileMeta icon="electricity" label={formatPeso(bill.electricBill)} />
          <MobileMeta icon="water" label={formatPeso(bill.waterBill)} />
          <MobileMeta icon="security" label={formatPeso(bill.crMaintenance)} />
          <MobileMeta icon="inbox" label={formatPeso(bill.garbageFee + bill.plasticFee)} />
        </View>

        <View style={styles.mobileTotals}>
          <View style={styles.mobileTotalBlock}>
            <Text style={styles.mobileTotalLabel}>Monthly Bill</Text>
            <Text style={styles.mobileTotalValue}>{formatPeso(bill.monthlyBill)}</Text>
          </View>
          <View style={styles.mobileTotalBlock}>
            <Text style={styles.mobileTotalLabel}>Total Due</Text>
            <Text style={styles.mobileTotalValue}>{formatPeso(bill.totalDue)}</Text>
          </View>
          <View style={styles.mobileTotalBlock}>
            <Text style={styles.mobileTotalLabel}>Balance</Text>
            <Text style={[styles.mobileTotalValue, bill.balance > 0 && styles.mobileBalanceDue]}>
              {formatPeso(bill.balance)}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.mobileCardActions}>
        <RowActionsButton bill={bill} onOpen={onOpenActions} />
      </View>
    </View>
  );
}

function MobileMeta({ icon, label }: { icon: AppIconName; label: string }) {
  return (
    <View style={styles.mobileMetaItem}>
      <AppIcon name={icon} size={12} tintColor={DefaultTheme.colors.muted} />
      <Text style={styles.mobileMetaText}>{label}</Text>
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
  card: {
    width: '100%',
  },
  periodBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  periodBarText: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 0,
  },
  periodLabel: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 16,
  },
  periodCaption: {
    marginTop: 3,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  menuTrigger: {
    height: 42,
    minWidth: 118,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: DefaultTheme.colors.cool,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  menuTriggerActive: {
    borderColor: DefaultTheme.colors.primary,
    backgroundColor: DefaultTheme.colors.white,
  },
  menuTriggerLabel: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13.5,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: DefaultTheme.colors.cool,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  utilityGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  utilityBlock: {
    flexGrow: 1,
    flexBasis: 190,
    minWidth: 160,
    gap: 6,
    padding: 14,
    borderRadius: DefaultTheme.radius.md,
    backgroundColor: DefaultTheme.colors.white,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
  },
  utilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  utilityIcon: {
    width: 26,
    height: 26,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityTitle: {
    flex: 1,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 11.5,
  },
  utilityValue: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 19,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  utilityRowLabel: {
    flexShrink: 1,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  utilityRowValue: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 11.5,
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
  emptyBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 34,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 14.5,
  },
  emptyText: {
    maxWidth: 420,
    textAlign: 'center',
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 18,
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
  roomBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 12.5,
  },
  roomCellText: {
    flexShrink: 1,
    minWidth: 0,
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
    fontSize: 11,
  },
  numberCell: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  moneyCell: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  totalCell: {
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
  mobileTotals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: DefaultTheme.colors.line,
  },
  mobileTotalBlock: {
    flexGrow: 1,
    flexBasis: 88,
    minWidth: 0,
  },
  mobileTotalLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  mobileTotalValue: {
    marginTop: 3,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 14,
  },
  mobileBalanceDue: {
    color: BALANCE_COLOR,
  },
  footerRow: {
    marginTop: 14,
    gap: 3,
  },
  footerSummary: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  paymentList: {
    width: '100%',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: DefaultTheme.colors.line,
  },
  paymentRowLast: {
    borderBottomWidth: 0,
  },
  paymentIcon: {
    width: 28,
    height: 28,
    borderRadius: DefaultTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  paymentBody: {
    flex: 1,
    minWidth: 0,
  },
  paymentTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12.5,
  },
  paymentCaption: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  paymentAmount: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 13.5,
  },
});
