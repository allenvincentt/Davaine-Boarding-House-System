import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { PageMeta } from '@/components/common/PageMeta';
import { MainContentArea } from '@/components/layout/MainContentArea';
import { Card } from '@/components/ui/cards/Card';
import { KPICard, KPICardsRow } from '@/components/ui/cards/KPICards';
import { DonutChart } from '@/components/ui/charts/DonutChart';
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart';
import { Table, type TableColumn } from '@/components/ui/Table';
import { DefaultTheme } from '@/constants/defaultTheme';
import { useCountUp } from '@/hooks/useEntranceAnimation';

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
    title: 'Payment received for Room 204',
    subtitle: 'Maria Santos',
    badge: 'Payment',
    badgeColor: '#2E8A57',
    badgeBackground: '#E4F5EA',
    dotColor: '#2E8A57',
    time: '9:12 AM',
  },
  {
    id: 'a2',
    title: 'New tenant moved into Room 107',
    subtitle: 'James Reyes',
    badge: 'Move-in',
    badgeColor: '#4EA4E5',
    badgeBackground: DefaultTheme.colors.softBlue,
    dotColor: '#4EA4E5',
    time: '8:45 AM',
  },
  {
    id: 'a3',
    title: 'Maintenance request submitted',
    subtitle: 'Room 112 · Leaky faucet',
    badge: 'Maintenance',
    badgeColor: '#C98A1E',
    badgeBackground: DefaultTheme.colors.softGold,
    dotColor: '#C98A1E',
    time: 'Yesterday',
  },
];

type DuePaymentToday = {
  id: string;
  tenant: string;
  room: string;
  amount: number;
};

const duePaymentsToday: DuePaymentToday[] = [
  { id: 'd1', tenant: 'Maria Santos', room: 'Room 204', amount: 2200 },
  { id: 'd2', tenant: 'James Reyes', room: 'Room 107', amount: 1800 },
  { id: 'd3', tenant: 'Liza Cordero', room: 'Room 305', amount: 2200 },
  { id: 'd4', tenant: 'Noel Ferrer', room: 'Room 112', amount: 1800 },
];

type DuePaymentRow = {
  id: string;
  tenant: string;
  room: string;
  amount: number;
  due: string;
  status: 'Due Today' | 'Due This Week' | 'Overdue';
};

const duePayments: DuePaymentRow[] = [
  { id: 'p1', tenant: 'Maria Santos', room: '204', amount: 2200, due: 'Jul 24', status: 'Due Today' },
  { id: 'p2', tenant: 'James Reyes', room: '107', amount: 1800, due: 'Jul 24', status: 'Due Today' },
  { id: 'p3', tenant: 'Liza Cordero', room: '305', amount: 2200, due: 'Jul 27', status: 'Due This Week' },
  { id: 'p4', tenant: 'Noel Ferrer', room: '112', amount: 1800, due: 'Jul 29', status: 'Due This Week' },
  { id: 'p5', tenant: 'Anna Bautista', room: '208', amount: 2000, due: 'Jul 18', status: 'Overdue' },
];

const AMOUNT_COUNT_DURATION = 950;
const AMOUNT_STAGGER = 70;
const DUE_TODAY_AMOUNT_DELAY = 820;
const DUE_TABLE_AMOUNT_DELAY = 900;

const duePaymentStatusColors: Record<DuePaymentRow['status'], { color: string; background: string }> = {
  'Due Today': { color: '#C98A1E', background: DefaultTheme.colors.softGold },
  'Due This Week': { color: '#4EA4E5', background: DefaultTheme.colors.softBlue },
  Overdue: { color: '#C4453B', background: '#FBE7E5' },
};

const duePaymentColumns: TableColumn<DuePaymentRow>[] = [
  { key: 'tenant', header: 'Tenant', accessor: (row) => row.tenant },
  { key: 'room', header: 'Room', width: 64, accessor: (row) => row.room },
  {
    key: 'amount',
    header: 'Amount',
    width: 90,
    render: (row) => (
      <AnimatedAmount
        value={row.amount}
        delay={DUE_TABLE_AMOUNT_DELAY + duePayments.indexOf(row) * AMOUNT_STAGGER}
        style={styles.tableAmount}
      />
    ),
  },
  { key: 'due', header: 'Due', width: 64, accessor: (row) => row.due },
  {
    key: 'status',
    header: 'Status',
    width: 108,
    render: (row) => {
      const tone = duePaymentStatusColors[row.status];
      return (
        <View style={[styles.statusChip, { backgroundColor: tone.background }]}>
          <Text style={[styles.statusChipText, { color: tone.color }]} numberOfLines={1}>
            {row.status}
          </Text>
        </View>
      );
    },
  },
];

export default function DashboardPage() {
  return (
    <MainContentArea>
      <PageMeta title="Dashboard" description="Occupancy, collections, and activity across Davaine." />
      <Text style={styles.title}>Dashboard</Text>

      <KPICardsRow>
        <KPICard
          label="Total Rooms"
          value={25}
          icon="rooms"
          iconColor={DefaultTheme.colors.primary}
          iconBackground={DefaultTheme.colors.softOlive}
          accentColor={DefaultTheme.colors.primary}
          caption="All units managed"
          progress={1}
        />
        <KPICard
          label="Occupied Rooms"
          value={23}
          icon="rooms"
          iconColor={DefaultTheme.colors.blue}
          iconBackground={DefaultTheme.colors.softBlue}
          accentColor={DefaultTheme.colors.blue}
          trend={{ direction: 'up', value: '5%' }}
          caption="92% occupancy rate"
          progress={0.92}
        />
        <KPICard
          label="Available Rooms"
          value={2}
          icon="rooms"
          iconColor="#4C8A2E"
          iconBackground="#E4F5EA"
          accentColor="#4C8A2E"
          trend={{ direction: 'down', value: '3%' }}
          caption="Ready for new tenants"
          progress={0.08}
        />
        <KPICard
          label="Total Tenants"
          value={31}
          icon="users"
          iconColor="#7C5CD6"
          iconBackground="#EDE7F6"
          accentColor="#7C5CD6"
          trend={{ direction: 'up', value: '8%' }}
          caption="Active residents"
          progress={1}
        />
        <KPICard
          label="Due Payments Today"
          value={4}
          icon="payment"
          iconColor="#C98A1E"
          iconBackground={DefaultTheme.colors.softGold}
          accentColor="#C98A1E"
          caption="Requires immediate action"
          progress={0.4}
        />
        <KPICard
          label="Due This Week"
          value={11}
          icon="payment"
          iconColor="#C4453B"
          iconBackground="#FBE7E5"
          accentColor="#C4453B"
          caption="Upcoming collections"
          progress={0.6}
        />
      </KPICardsRow>

      <View style={styles.chartsRow}>
        <Card
          title="Occupancy Trend"
          style={styles.trendCard}
          revealDelay={540}
          action={
            <View style={styles.legendRow}>
              <LegendDot color={DefaultTheme.colors.primary} label="Occupied" />
              <LegendDot color="#D8D48C" label="Available" />
            </View>
          }>
          <LineAreaChart
            labels={['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
            series={[
              { key: 'occupied', color: DefaultTheme.colors.primary, values: [18, 19, 20, 21, 22, 23], fill: true },
              { key: 'available', color: '#D8D48C', values: [6, 5, 4, 3, 2, 2] },
            ]}
            maxValue={24}
          />
        </Card>

        <Card
          title="Room Occupancy"
          style={styles.occupancyCard}
          revealDelay={620}>
          <View style={styles.donutWrap}>
            <DonutChart
              segments={[
                { value: 23, color: DefaultTheme.colors.primary },
                { value: 2, color: DefaultTheme.colors.line },
              ]}
              centerValue={92}
              centerSuffix="%"
              centerCaption="Occupied"
            />
          </View>
          <View style={styles.occupancyStats}>
            <OccupancyStat color={DefaultTheme.colors.primary} label="Occupied" value={23} delay={700} />
            <OccupancyStat color={DefaultTheme.colors.line} label="Available" value={2} delay={780} />
          </View>
        </Card>
      </View>

      <View style={styles.bottomRow}>
        <Card
          title="Recent Activity"
          style={styles.activityCard}
          revealDelay={700}
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
                  <Text style={[styles.activityBadgeText, { color: item.badgeColor }]}>{item.badge}</Text>
                </View>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card
          title="Due Payments Today"
          style={styles.duePaymentsTodayCard}
          revealDelay={780}>
          {duePaymentsToday.map((entry, index) => (
            <View
              key={entry.id}
              style={[styles.dueTodayRow, index === duePaymentsToday.length - 1 && styles.rowLast]}>
              <View style={styles.dueTodayBody}>
                <Text style={styles.dueTodayTenant} numberOfLines={1}>
                  {entry.tenant}
                </Text>
                <Text style={styles.dueTodayRoom} numberOfLines={1}>
                  {entry.room}
                </Text>
              </View>
              <AnimatedAmount
                value={entry.amount}
                delay={DUE_TODAY_AMOUNT_DELAY + index * AMOUNT_STAGGER}
                style={styles.dueTodayAmount}
              />
            </View>
          ))}
        </Card>

        <Card
          title="Due Payments"
          style={styles.duePaymentsCard}
          revealDelay={860}>
          <Table
            columns={duePaymentColumns}
            data={duePayments}
            keyExtractor={(row) => row.id}
            emptyLabel="No due payments"
          />
        </Card>
      </View>
    </MainContentArea>
  );
}

function formatPeso(value: number) {
  return `₱ ${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function AnimatedAmount({
  value,
  delay = 0,
  style,
}: {
  value: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const counted = useCountUp(value, AMOUNT_COUNT_DURATION, delay);

  return (
    <Text style={style} numberOfLines={1}>
      {formatPeso(counted)}
    </Text>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendDotRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function OccupancyStat({
  color,
  label,
  value,
  delay = 0,
}: {
  color: string;
  label: string;
  value: number;
  delay?: number;
}) {
  const counted = useCountUp(value, 1000, delay);

  return (
    <View style={styles.occupancyStat}>
      <View style={styles.occupancyStatLabelRow}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.occupancyStatLabel}>{label}</Text>
      </View>
      <Text style={styles.occupancyStatValue}>{counted}</Text>
      <Text style={styles.occupancyStatCaption}>rooms</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 22,
  },
  chartsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  trendCard: {
    flexGrow: 2,
    flexBasis: 420,
    minWidth: 300,
  },
  occupancyCard: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 240,
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
  },
  legendDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  occupancyStats: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  occupancyStat: {
    flex: 1,
    padding: 12,
    borderRadius: DefaultTheme.radius.sm,
    backgroundColor: DefaultTheme.colors.cool,
  },
  occupancyStatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  occupancyStatLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  occupancyStatValue: {
    marginTop: 6,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 20,
  },
  occupancyStatCaption: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 10.5,
  },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  activityCard: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 260,
  },
  duePaymentsTodayCard: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
  },
  duePaymentsCard: {
    flexGrow: 2,
    flexBasis: 360,
    minWidth: 320,
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
  dueTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DefaultTheme.colors.line,
  },
  dueTodayBody: {
    flex: 1,
    minWidth: 0,
  },
  dueTodayTenant: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  dueTodayRoom: {
    marginTop: 2,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
  },
  dueTodayAmount: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 13,
  },
  tableAmount: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: DefaultTheme.radius.pill,
    alignSelf: 'flex-start',
  },
  statusChipText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
});
