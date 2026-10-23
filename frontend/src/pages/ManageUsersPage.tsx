import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User as AuthUser } from 'firebase/auth';
import { Navigation } from '../components/Navigation';
import { RafflesGoService } from '../api';
import { ApiError } from '../api/core/ApiError';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../contexts/useToast';

type ManagedUser = {
  uid: string;
  email?: string;
  displayName?: string;
  disabled: boolean;
  role: 'user' | 'admin';
  walks_registered: number;
  upcoming_walks: number;
  completed_walks: number;
  sightings_submitted: number;
};

type StatsSummary = {
  total_users: number;
  total_volunteers: number;
  total_admins: number;
  total_disabled: number;
  total_existing_walks: number;
  total_upcoming_walks: number;
  total_completed_walks: number;
  total_abandoned_walks: number;
};

export default function ManageUsersPage({ user }: { user: AuthUser }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ManagedUser | null>(null);

  const loading = users === null && error === null;

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const response = await RafflesGoService.listUsersWithStats();
      setUsers(response.users as ManagedUser[]);
      setSummary(response.summary as StatsSummary);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load users.';
      setError(message);
      showToast({ message, variant: 'error' });
    }
  }, [showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter((managedUser) => {
      const name = managedUser.displayName?.toLowerCase() ?? '';
      const email = managedUser.email?.toLowerCase() ?? '';
      return name.includes(trimmed) || email.includes(trimmed);
    });
  }, [users, query]);

  const handleToggleDisabled = useCallback(async () => {
    if (!confirmTarget) return;
    setPendingUid(confirmTarget.uid);
    try {
      await RafflesGoService.setUserDisabled(confirmTarget.uid, {
        disabled: !confirmTarget.disabled,
      });
      const nextDisabled = !confirmTarget.disabled;
      setUsers((prev) =>
        prev?.map((u) => (u.uid === confirmTarget.uid ? { ...u, disabled: nextDisabled } : u)) ?? prev,
      );
      setSummary((prev) => {
        if (!prev) return prev;
        const delta = nextDisabled ? 1 : -1;
        return { ...prev, total_disabled: Math.max(0, prev.total_disabled + delta) };
      });
      showToast({
        message:
          nextDisabled
          ? 'User account deactivated successfully.'
          : 'User account reactivated successfully.',
        variant: 'success',
      });
    } catch (e) {
      let message: string;
      if (e instanceof ApiError) {
        const body = e.body as { error?: string; message?: string } | undefined;
        message = body?.error ?? body?.message ?? `Request failed (${e.status}).`;
      } else {
        message = e instanceof Error ? e.message : 'Action failed.';
      }
      showToast({ message, variant: 'error' });
    } finally {
      setPendingUid(null);
      setConfirmTarget(null);
    }
  }, [confirmTarget, showToast]);

  return (
    <>
      <Navigation user={user} />
      <main className="main-content page-shell">
        <div className="container">
          <header className="page-header hero-panel page-hero">
            <div className="hero-copy">
              <h1>Manage users</h1>
              <p className="page-subtitle hero-subtitle">
                Review user accounts, activities, search users quickly, and deactivate/reactivate accounts.
              </p>
            </div>
          </header>

          {!loading && error && (
            <section className="section-panel">
              <p className="text-muted">Unable to load users right now.</p>
            </section>
          )}

          <section className="section-panel manage-users-summary" aria-label="User statistics summary">
            {loading || !summary ? (
              <div className="manage-users-skeleton-row">
                <div className="manage-users-skeleton-card" />
                <div className="manage-users-skeleton-card manage-users-skeleton-card--tall" />
              </div>
            ) : (
              <div className="manage-users-summary-grid">
                <div className="manage-users-summary-card">
                  <span className="manage-users-summary-card__kicker">Users</span>
                  <div className="manage-users-summary-card__main">
                    <span className="manage-users-summary-card__label">Total users</span>
                    <strong className="manage-users-summary-card__value">{summary.total_users}</strong>
                  </div>
                  <div className="manage-users-summary-breakdown">
                    <div className="manage-users-summary-breakdown__item">
                      <span>Volunteers</span>
                      <strong>{summary.total_volunteers}</strong>
                    </div>
                    <div className="manage-users-summary-breakdown__item">
                      <span>Admins</span>
                      <strong>{summary.total_admins}</strong>
                    </div>
                  </div>
                </div>

                <div className="manage-users-summary-card">
                  <span className="manage-users-summary-card__kicker">Walks</span>
                  <div className="manage-users-summary-card__main">
                    <span className="manage-users-summary-card__label">Total walks</span>
                    <strong className="manage-users-summary-card__value">{summary.total_existing_walks}</strong>
                  </div>
                  <div className="manage-users-summary-breakdown">
                    <div className="manage-users-summary-breakdown__item">
                      <span>Upcoming</span>
                      <strong>{summary.total_upcoming_walks}</strong>
                    </div>
                    <div className="manage-users-summary-breakdown__item">
                      <span>Completed</span>
                      <strong>{summary.total_completed_walks}</strong>
                    </div>
                    <div className="manage-users-summary-breakdown__item">
                      <span>Abandoned</span>
                      <strong>{summary.total_abandoned_walks}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="section-panel" aria-label="Users table">
            <div className="section-heading section-heading--compact">
              <div>
                <h2>Search and manage user accounts</h2>
              </div>
            </div>
            <div className="manage-users-search">
              <input
                id="manage-users-query"
                type="search"
                className="form-control"
                placeholder="Search by name or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {loading ? (
              <div className="manage-users-skeleton-table" aria-hidden>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="manage-users-skeleton-line" />
                ))}
              </div>
            ) : (
              <div className="reports-table-section manage-users-table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name and email</th>
                      <th>Role</th>
                      <th>Walks registered</th>
                      <th>Upcoming walks</th>
                      <th>Completed walks</th>
                      <th>Sightings submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((managedUser) => {
                      const isSelf = managedUser.uid === user.uid;
                      const isPending = pendingUid === managedUser.uid;
                      const isProtectedAdminAccount =
                        !managedUser.disabled && (isSelf || managedUser.role === 'admin');
                      const actionTitle = isSelf
                        ? 'You cannot deactivate your own account'
                        : managedUser.role === 'admin' && !managedUser.disabled
                          ? 'Admin accounts cannot be deactivated'
                          : undefined;
                      return (
                        <tr
                          key={managedUser.uid}
                          className={managedUser.disabled ? 'manage-users-row-disabled' : ''}
                        >
                          <td>
                            <div className="manage-users-name">
                              <strong>{managedUser.displayName?.trim() || 'No name set'}</strong>
                              <span>{managedUser.email || 'No email'}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`manage-users-role-pill ${
                                managedUser.role === 'admin'
                                  ? 'manage-users-role-pill--admin'
                                  : 'manage-users-role-pill--volunteer'
                              }`}
                            >
                              {managedUser.role === 'admin' ? 'Admin' : 'Volunteer'}
                            </span>
                          </td>
                          <td>{managedUser.walks_registered}</td>
                          <td>{managedUser.upcoming_walks}</td>
                          <td>{managedUser.completed_walks}</td>
                          <td>{managedUser.sightings_submitted}</td>
                          <td>
                            <button
                              type="button"
                              className={
                                isProtectedAdminAccount
                                  ? 'btn-secondary manage-users-action-btn--locked'
                                  : managedUser.disabled
                                    ? 'btn-secondary'
                                    : 'btn-danger'
                              }
                              onClick={() => setConfirmTarget(managedUser)}
                              disabled={isPending || isProtectedAdminAccount}
                              title={actionTitle}
                            >
                              {isPending
                                ? 'Updating...'
                                : managedUser.disabled
                                  ? 'Reactivate'
                                  : 'Deactivate'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center text-sm text-muted-foreground">
                          No users match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      <ConfirmDialog
        open={confirmTarget !== null}
        message={
          confirmTarget?.disabled
            ? 'Reactivate this user account? They will be able to participate in walks again.'
            : 'Deactivate this user? They will lose designated submitter on any upcoming or in-progress walks they currently lead. They will stay registered as participants and can be reactivated later.'
        }
        confirmLabel={confirmTarget?.disabled ? 'Reactivate' : 'Deactivate'}
        onConfirm={handleToggleDisabled}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  );
}
