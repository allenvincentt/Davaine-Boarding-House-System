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
import { MainContentArea } from '@/components/layout/MainContentArea';
import { AppIcon } from '@/components/ui/AppIcon';
import { GradientButton } from '@/components/ui/buttons/GradientButton';
import { MatchaButton } from '@/components/ui/buttons/MatchaButton';
import { PageFabStack, usePageScrollNavigator } from '@/components/ui/buttons/PageFabStack';
import { Card } from '@/components/ui/cards/Card';
import { KPICard, KPICardsRow } from '@/components/ui/cards/KPICards';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/modals/ConfirmDialog';
import { Modal } from '@/components/ui/modals/Modal';
import { SearchField } from '@/components/ui/SearchField';
import { Select, type SelectAnchor, type SelectOption } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { DefaultTheme } from '@/constants/defaultTheme';
import { AdminUserRole } from '@/enums/adminUserRoleEnum';
import { PublicUserRole } from '@/enums/publicUserRoleEnum';
import { accountStatusOf, type AccountStatus, type AdminUserModel } from '@/models/adminUserModel';
import { useAuth } from '@/providers/AuthProvider';
import { appUserRoles, can, roleLabel, type AppUserRole } from '@/services/accessControl';
import {
  createUser,
  deactivateUser,
  deleteUser,
  listUsers,
  updateUserRole,
} from '@/services/userManagementService';

type RoleFilter = 'All' | AppUserRole;

const roleTone: Record<AppUserRole, { color: string; background: string }> = {
  [AdminUserRole.SuperAdmin]: { color: '#7C5CD6', background: '#EDE7F6' },
  [AdminUserRole.Admin]: { color: DefaultTheme.colors.blue, background: DefaultTheme.colors.softBlue },
  [PublicUserRole.Guest]: { color: '#9B7941', background: DefaultTheme.colors.softGold },
};

const statusTone: Record<AccountStatus, { color: string; background: string; caption: string }> = {
  Active: { color: '#2E8A57', background: '#E4F5EA', caption: 'Email confirmed' },
  Pending: { color: '#C98A1E', background: DefaultTheme.colors.softGold, caption: 'Awaiting confirmation' },
};

const avatarPalette = [
  DefaultTheme.colors.primary,
  '#4EA4E5',
  '#7C5CD6',
  '#C98A1E',
  '#2E8A57',
  '#C4453B',
];

const ACTIVE_COLOR = '#2E8A57';
const PENDING_COLOR = '#C98A1E';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_TEMPORARY_PASSWORD_LENGTH = 8;

const EMAIL_COLUMN_WIDTH = 620;
const CONTACT_COLUMN_WIDTH = 820;

function initialsOf(name: string) {
  const parts = name.split(' ').filter(Boolean);
  const source = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return source.toUpperCase();
}

function avatarColorOf(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index)) % avatarPalette.length;
  }
  return avatarPalette[hash];
}

export default function UserManagementPage() {
  const { width } = useWindowDimensions();
  const compact = width < DefaultTheme.layout.compactNavigation;
  const { profile } = useAuth();
  const scrollNavigator = usePageScrollNavigator();

  const role = profile?.userRole ?? null;
  const canCreate = can(role, 'create');
  const canUpdate = can(role, 'update');
  const canDelete = can(role, 'delete');
  const readOnly = !canCreate && !canUpdate && !canDelete;

  const [users, setUsers] = useState<AdminUserModel[]>([]);
  const [loading, setLoading] = useState(true);
  const snackbar = useSnackbar();

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [tableWidth, setTableWidth] = useState(0);

  const [actionsUser, setActionsUser] = useState<AdminUserModel | null>(null);
  const [actionsAnchor, setActionsAnchor] = useState<SelectAnchor | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formUser, setFormUser] = useState<AdminUserModel | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const [pendingDeactivate, setPendingDeactivate] = useState<AdminUserModel | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUserModel | null>(null);

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
      const rows = await listUsers();
      if (activeRef.current) {
        setUsers(rows);
      }
    } catch (error) {
      if (activeRef.current) {
        snackbar.error(error instanceof Error ? error.message : 'Unable to load users.', {
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

  const activeCount = users.filter((user) => accountStatusOf(user) === 'Active').length;
  const pendingCount = users.length - activeCount;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'All' && user.userRole !== roleFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        user.fullName.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.contactNumber ?? '').toLowerCase().includes(term)
      );
    });
  }, [users, query, roleFilter]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setTableWidth((current) => (current === measured ? current : measured));
  }, []);

  const openActions = useCallback((user: AdminUserModel, anchor: SelectAnchor) => {
    setActionsUser(user);
    setActionsAnchor(anchor);
    setActionsOpen(true);
  }, []);

  const openForm = useCallback((mode: FormMode, user: AdminUserModel | null) => {
    setFormMode(mode);
    setFormUser(user);
    setFormSession((current) => current + 1);
    setFormOpen(true);
  }, []);

  const applyUser = useCallback((next: AdminUserModel) => {
    setUsers((current) => {
      const exists = current.some((user) => user.uuid === next.uuid);
      return exists ? current.map((user) => (user.uuid === next.uuid ? next : user)) : [...current, next];
    });
  }, []);

  const handleCreate = useCallback(
    async (draft: CreateDraft) => {
      const result = await createUser({
        fullName: draft.fullName,
        email: draft.email,
        contactNumber: draft.contactNumber,
        userRole: draft.userRole,
        temporaryPassword: draft.temporaryPassword,
      });

      if (result.profile) {
        applyUser(result.profile);
      } else {
        await load();
      }

      snackbar.success(
        result.confirmationEmailSent
          ? `Confirmation email sent to ${draft.email}. ${draft.fullName} can sign in with the temporary password once the email is confirmed.`
          : `${draft.fullName} was created. Email confirmation is disabled for this project, so they can sign in right away.`,
      );
    },
    [applyUser, load, snackbar],
  );

  const handleUpdateRole = useCallback(
    async (uuid: string, nextRole: AppUserRole) => {
      const updated = await updateUserRole(uuid, nextRole);
      applyUser(updated);
      snackbar.success(`${updated.fullName} is now ${roleLabel(nextRole)}.`);
    },
    [applyUser, snackbar],
  );

  const handleDeactivate = useCallback(
    async (user: AdminUserModel) => {
      const pending = snackbar.loading(`Deactivating ${user.fullName}…`);
      try {
        const updated = await deactivateUser(user.uuid);
        applyUser(updated);
        snackbar.update(pending, {
          tone: 'success',
          message: `${updated.fullName} was deactivated and moved to the Guest role.`,
        });
      } catch (error) {
        snackbar.update(pending, {
          tone: 'error',
          message: error instanceof Error ? error.message : 'The user could not be deactivated.',
        });
      }
    },
    [applyUser, snackbar],
  );

  const handleDelete = useCallback(
    async (user: AdminUserModel) => {
      const pending = snackbar.loading(`Deleting ${user.fullName}…`);
      try {
        await deleteUser(user.uuid);
        setUsers((current) => current.filter((item) => item.uuid !== user.uuid));
        snackbar.update(pending, {
          tone: 'success',
          message: `${user.fullName} was permanently deleted.`,
        });
      } catch (error) {
        snackbar.update(pending, {
          tone: 'error',
          message: error instanceof Error ? error.message : 'The user could not be deleted.',
        });
      }
    },
    [snackbar],
  );

  const actionOptions = useMemo<SelectOption[]>(() => {
    if (!actionsUser) {
      return [];
    }

    const options: SelectOption[] = [];
    const isSelf = actionsUser.uuid === profile?.uuid;

    if (canUpdate) {
      options.push({
        key: 'edit',
        label: 'Edit User',
        icon: 'edit',
        onSelect: () => openForm('edit', actionsUser),
      });
    }

    if (canUpdate && !isSelf && actionsUser.userRole !== PublicUserRole.Guest) {
      options.push({
        key: 'deactivate',
        label: 'Deactivate User',
        icon: 'userMinus',
        onSelect: () => setPendingDeactivate(actionsUser),
      });
    }

    if (canDelete && !isSelf) {
      options.push({
        key: 'delete',
        label: 'Delete User',
        icon: 'trash',
        destructive: true,
        onSelect: () => setPendingDelete(actionsUser),
      });
    }

    return options;
  }, [actionsUser, canUpdate, canDelete, profile?.uuid, openForm]);

  const columns = useMemo<TableColumn<AdminUserModel>[]>(() => {
    const list: TableColumn<AdminUserModel>[] = [
      {
        key: 'fullName',
        header: 'Full Name',
        render: (row) => (
          <View style={styles.nameCell}>
            <Avatar name={row.fullName} />
            <Text style={styles.nameText} numberOfLines={1}>
              {row.fullName}
            </Text>
          </View>
        ),
      },
    ];

    if (tableWidth >= EMAIL_COLUMN_WIDTH) {
      list.push({
        key: 'email',
        header: 'Email',
        render: (row) => (
          <Text style={styles.emailText} numberOfLines={1}>
            {row.email}
          </Text>
        ),
      });
    }

    if (tableWidth >= CONTACT_COLUMN_WIDTH) {
      list.push({
        key: 'contactNumber',
        header: 'Contact Number',
        width: 160,
        accessor: (row) => row.contactNumber ?? '—',
      });
    }

    list.push(
      {
        key: 'role',
        header: 'Role',
        width: 128,
        render: (row) => <RoleBadge role={row.userRole} />,
      },
      {
        key: 'status',
        header: 'Status',
        width: 116,
        render: (row) => <StatusLabel status={accountStatusOf(row)} />,
      },
    );

    if (!readOnly) {
      list.push({
        key: 'actions',
        header: 'Actions',
        width: 62,
        align: 'right',
        render: (row) => (
          <RowActionsButton user={row} onOpen={(anchor) => openActions(row, anchor)} />
        ),
      });
    }

    return list;
  }, [tableWidth, openActions, readOnly]);

  return (
    <View style={styles.page}>
      <PageMeta title="User Management" description="Manage administrator and tenant accounts." />
      <MainContentArea {...scrollNavigator.scrollProps}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>User Management</Text>
          </View>
          {!compact && canCreate && (
            <GradientButton
              accessibilityLabel="Add user"
              style={styles.addButton}
              onPress={() => openForm('create', null)}>
              <AppIcon name="plus" size={15} tintColor={DefaultTheme.colors.white} />
              <Text style={styles.addButtonLabel}>Add User</Text>
            </GradientButton>
          )}
        </View>

        {loading && users.length === 0 ? (
          <SkeletonKPIRow count={3} label="Loading account figures" />
        ) : (
          <KPICardsRow>
            <KPICard
              label="Total Users"
              value={users.length}
              icon="users"
              iconColor={DefaultTheme.colors.primary}
              iconBackground={DefaultTheme.colors.softOlive}
              accentColor={DefaultTheme.colors.primary}
              caption="All system accounts"
              progress={1}
            />
            <KPICard
              label="Active"
              value={activeCount}
              icon="check"
              iconColor={ACTIVE_COLOR}
              iconBackground="#E4F5EA"
              accentColor={ACTIVE_COLOR}
              caption="Email confirmed"
              progress={users.length === 0 ? 0 : activeCount / users.length}
            />
            <KPICard
              label="Pending"
              value={pendingCount}
              icon="email"
              iconColor={PENDING_COLOR}
              iconBackground={DefaultTheme.colors.softGold}
              accentColor={PENDING_COLOR}
              caption="Awaiting email confirmation"
              progress={users.length === 0 ? 0 : pendingCount / users.length}
            />
          </KPICardsRow>
        )}

        <Card style={styles.tableCard} revealDelay={320} {...scrollNavigator.targetProps}>
          <View style={styles.toolbar}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, email, or contact…"
              style={styles.search}
            />
            <RoleFilterSelect
              value={roleFilter}
              onChange={setRoleFilter}
              style={compact && styles.roleFilterCompact}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh users"
              style={styles.refreshButton}
              onPress={load}>
              <AppIcon name="refresh" size={15} tintColor={DefaultTheme.colors.muted} />
            </Pressable>
          </View>

          <View onLayout={handleTableLayout}>
            {loading && users.length === 0 ? (
              <SkeletonTable rows={6} columns={columns.length} label="Loading users" />
            ) : compact ? (
              <View style={styles.mobileList}>
                {filtered.length === 0 ? (
                  <Text style={styles.emptyText}>No users match your filters.</Text>
                ) : (
                  filtered.map((user, index) => (
                    <UserListItem
                      key={user.uuid}
                      user={user}
                      isLast={index === filtered.length - 1}
                      showActions={!readOnly}
                      onOpenActions={(anchor) => openActions(user, anchor)}
                    />
                  ))
                )}
              </View>
            ) : (
              <Table
                columns={columns}
                data={filtered}
                keyExtractor={(row) => row.uuid}
                emptyLabel="No users match your filters."
              />
            )}
          </View>
        </Card>
      </MainContentArea>

      {compact && (
        <PageFabStack
          navigator={scrollNavigator}
          primaryIcon={canCreate ? 'plus' : undefined}
          primaryLabel="Add user"
          onPrimaryPress={canCreate ? () => openForm('create', null) : undefined}
        />
      )}

      <Select
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        options={actionOptions}
        anchor={actionsAnchor}
        align="right"
        minWidth={186}
      />

      <UserFormModal
        key={formSession}
        visible={formOpen}
        mode={formMode}
        user={formUser}
        onClose={() => setFormOpen(false)}
        onCreate={handleCreate}
        onUpdateRole={handleUpdateRole}
      />

      <ConfirmDialog
        visible={pendingDeactivate !== null}
        icon="userMinus"
        title="Deactivate user?"
        message={`${pendingDeactivate?.fullName ?? 'This account'} will be moved to the Guest role and will lose access to every admin page until a role is assigned again.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (pendingDeactivate) {
            handleDeactivate(pendingDeactivate);
          }
        }}
        onClose={() => setPendingDeactivate(null)}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="trash"
        tone="destructive"
        title="Delete user?"
        message={`${pendingDelete?.fullName ?? 'This account'} will be removed from Davaine and from the authentication system. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            handleDelete(pendingDelete);
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </View>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, backgroundColor: avatarColorOf(name) },
      ]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

function RoleBadge({ role }: { role: AppUserRole }) {
  const tone = roleTone[role];

  return (
    <View style={[styles.roleBadge, { backgroundColor: tone.background }]}>
      <Text style={[styles.roleBadgeText, { color: tone.color }]} numberOfLines={1}>
        {roleLabel(role)}
      </Text>
    </View>
  );
}

function StatusLabel({ status }: { status: AccountStatus }) {
  const tone = statusTone[status];

  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.statusText, { color: tone.color }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

function RowActionsButton({
  user,
  onOpen,
}: {
  user: AdminUserModel;
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
      accessibilityLabel={`Actions for ${user.fullName}`}
      style={[styles.rowAction, hovered && styles.rowActionHovered]}
      onPress={handlePress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}>
      <AppIcon name="more" size={16} tintColor={DefaultTheme.colors.muted} />
    </Pressable>
  );
}

function RoleFilterSelect({
  value,
  onChange,
  style,
}: {
  value: RoleFilter;
  onChange: (role: RoleFilter) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<SelectAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const options = useMemo<SelectOption[]>(
    () =>
      (['All', ...appUserRoles] as RoleFilter[]).map((role) => ({
        key: role,
        label: role === 'All' ? 'All Roles' : roleLabel(role),
        icon: role === value ? 'check' : undefined,
        onSelect: () => onChange(role),
      })),
    [value, onChange],
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
        accessibilityLabel="Filter by role"
        accessibilityState={{ expanded: open }}
        style={[styles.roleTrigger, (hovered || open) && styles.roleTriggerActive]}
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}>
        <Text style={styles.roleTriggerLabel} numberOfLines={1}>
          {value === 'All' ? 'All Roles' : roleLabel(value)}
        </Text>
        <AppIcon
          name="chevronDown"
          size={13}
          tintColor={DefaultTheme.colors.muted}
          style={open && styles.chevronOpen}
        />
      </Pressable>
      <Select
        visible={open}
        onClose={() => setOpen(false)}
        options={options}
        anchor={anchor}
        align="right"
        minWidth={186}
      />
    </View>
  );
}

function UserListItem({
  user,
  isLast,
  showActions,
  onOpenActions,
}: {
  user: AdminUserModel;
  isLast: boolean;
  showActions: boolean;
  onOpenActions: (anchor: SelectAnchor) => void;
}) {
  return (
    <View style={[styles.mobileRow, isLast && styles.mobileRowLast]}>
      <Avatar name={user.fullName} size={38} />
      <View style={styles.mobileBody}>
        <Text style={styles.nameText} numberOfLines={1}>
          {user.fullName}
        </Text>
        <Text style={styles.emailText} numberOfLines={1}>
          {user.email}
        </Text>
        <Text style={styles.mobileContact} numberOfLines={1}>
          {user.contactNumber ?? '—'}
        </Text>
        <View style={styles.mobileMeta}>
          <RoleBadge role={user.userRole} />
          <StatusLabel status={accountStatusOf(user)} />
        </View>
      </View>
      {showActions && <RowActionsButton user={user} onOpen={onOpenActions} />}
    </View>
  );
}

type FormMode = 'create' | 'edit';

type CreateDraft = {
  fullName: string;
  email: string;
  contactNumber: string;
  userRole: AppUserRole;
  temporaryPassword: string;
};

type FormErrors = Partial<
  Record<'fullName' | 'email' | 'contactNumber' | 'temporaryPassword' | 'general', string>
>;

function UserFormModal({
  visible,
  mode,
  user,
  onClose,
  onCreate,
  onUpdateRole,
}: {
  visible: boolean;
  mode: FormMode;
  user: AdminUserModel | null;
  onClose: () => void;
  onCreate: (draft: CreateDraft) => Promise<void>;
  onUpdateRole: (uuid: string, role: AppUserRole) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [contactNumber, setContactNumber] = useState(user?.contactNumber ?? '');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [userRole, setUserRole] = useState<AppUserRole>(user?.userRole ?? PublicUserRole.Guest);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const creating = mode === 'create';
  const title = creating ? 'Add User' : 'Edit User';

  const handleSave = async () => {
    if (submitting) {
      return;
    }

    if (!creating) {
      if (!user) {
        return;
      }
      if (user.userRole === userRole) {
        onClose();
        return;
      }

      setSubmitting(true);
      setErrors({});
      try {
        await onUpdateRole(user.uuid, userRole);
        onClose();
      } catch (error) {
        setErrors({
          general: error instanceof Error ? error.message : 'The role could not be updated.',
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const nextErrors: FormErrors = {};
    if (!fullName.trim()) {
      nextErrors.fullName = 'Full name is required.';
    }
    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!contactNumber.trim()) {
      nextErrors.contactNumber = 'Contact number is required.';
    }
    if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
      nextErrors.temporaryPassword = `Use at least ${MIN_TEMPORARY_PASSWORD_LENGTH} characters.`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        fullName: fullName.trim(),
        email: email.trim(),
        contactNumber: contactNumber.trim(),
        userRole,
        temporaryPassword,
      });
      onClose();
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'The account could not be created.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={submitting ? () => undefined : onClose}
      dismissOnBackdropPress={!submitting}
      contentStyle={styles.modalShell}>
      <View style={styles.modalBody}>
        <View style={styles.modalHeader}>
          {user ? (
            <Avatar name={user.fullName} size={44} />
          ) : (
            <View style={styles.modalIconBadge}>
              <AppIcon name="userPlus" size={20} tintColor={DefaultTheme.colors.primary} />
            </View>
          )}
          <View style={styles.modalHeaderText}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
        </View>

        <View style={styles.formFields}>
          {creating ? (
            <>
              <Input
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                error={errors.fullName}
                icon="user"
                autoCapitalize="words"
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                icon="at"
                keyboardType="email-address"
              />
              <Input
                label="Contact Number"
                value={contactNumber}
                onChangeText={setContactNumber}
                error={errors.contactNumber}
                icon="phone"
                keyboardType="phone-pad"
              />
              <Input
                label="Temporary Password"
                value={temporaryPassword}
                onChangeText={setTemporaryPassword}
                error={errors.temporaryPassword}
                icon="key"
                secureTextEntry
              />
              <Text style={styles.helperText}>
                Share this temporary password with the user. They must confirm their email address
                before their first sign-in.
              </Text>
            </>
          ) : (
            <View style={styles.lockedList}>
              <LockedDetail label="Full Name" value={user?.fullName ?? '—'} />
              <LockedDetail label="Email" value={user?.email ?? '—'} />
              <LockedDetail label="Contact Number" value={user?.contactNumber ?? '—'} />
            </View>
          )}

          <View style={styles.rolePicker}>
            <Text style={styles.rolePickerLabel}>User Role</Text>
            <View style={styles.rolePickerOptions}>
              {appUserRoles.map((option) => {
                const active = option === userRole;
                const tone = roleTone[option];
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.roleOption,
                      active && { backgroundColor: tone.background, borderColor: tone.color },
                    ]}
                    onPress={() => setUserRole(option)}>
                    <Text
                      style={[styles.roleOptionText, active && { color: tone.color }]}
                      numberOfLines={1}>
                      {roleLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {!!errors.general && <Text style={styles.formError}>{errors.general}</Text>}
        </View>

        <View style={styles.modalActions}>
          <MatchaButton
            label="Cancel"
            variant="outline"
            disabled={submitting}
            style={styles.modalAction}
            onPress={onClose}
          />
          <MatchaButton
            label={submitting ? 'Saving…' : creating ? 'Add User' : 'Save Changes'}
            disabled={submitting}
            style={styles.modalAction}
            onPress={handleSave}
          />
        </View>
      </View>
    </Modal>
  );
}

function LockedDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
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
  roleFilterCompact: {
    flexGrow: 1,
    flexBasis: 152,
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
  roleTrigger: {
    height: 42,
    minWidth: 152,
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
  roleTriggerActive: {
    borderColor: DefaultTheme.colors.primary,
    backgroundColor: DefaultTheme.colors.white,
  },
  roleTriggerLabel: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13.5,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  nameText: {
    flexShrink: 1,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  emailText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  avatar: {
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: DefaultTheme.colors.white,
    fontFamily: DefaultTheme.fonts.bodyBold,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: DefaultTheme.radius.pill,
  },
  roleBadgeText: {
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 10.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12,
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
  },
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DefaultTheme.colors.line,
  },
  mobileRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  mobileBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mobileContact: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  mobileMeta: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  modalShell: {
    maxWidth: 440,
  },
  modalBody: {
    padding: DefaultTheme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconBadge: {
    width: 44,
    height: 44,
    borderRadius: DefaultTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DefaultTheme.colors.softOlive,
  },
  modalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodyBold,
    fontSize: 17,
  },
  formFields: {
    marginTop: 22,
    gap: 18,
  },
  helperText: {
    marginTop: -6,
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 11.5,
    lineHeight: 17,
  },
  lockedList: {
    borderRadius: DefaultTheme.radius.sm,
    backgroundColor: DefaultTheme.colors.cool,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    paddingHorizontal: 12,
  },
  rolePicker: {
    gap: 8,
  },
  rolePickerLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  rolePickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: DefaultTheme.radius.pill,
    borderWidth: 1,
    borderColor: DefaultTheme.colors.line,
    backgroundColor: DefaultTheme.colors.white,
  },
  roleOptionText: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 12,
  },
  formError: {
    color: '#D64545',
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
  },
  detailLabel: {
    color: DefaultTheme.colors.muted,
    fontFamily: DefaultTheme.fonts.bodyMedium,
    fontSize: 12.5,
  },
  detailValue: {
    flexShrink: 1,
    color: DefaultTheme.colors.ink,
    fontFamily: DefaultTheme.fonts.bodySemiBold,
    fontSize: 13,
  },
  modalActions: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 10,
  },
  modalAction: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
  },
});
