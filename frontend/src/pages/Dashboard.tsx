import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Navigation } from '../components/Navigation';
import { useViewMode } from '../contexts/useViewMode';
import { useCurrentUser } from '../contexts/useCurrentUser';

export default function Dashboard({ user: authUser }: { user: User }) {
  const { isAdmin } = useViewMode();
  const { isDeactivated } = useCurrentUser();
  const user = { display_name: authUser.displayName || 'Volunteer' };

  const highlightCards = isAdmin
    ? [
        {
          title: 'Manage walk schedules',
          body: 'Review active and upcoming walks, then open any walk to update timing, route details, and status.',
          ctaLabel: 'Manage walks',
          ctaTo: '/walks',
        },
        {
          title: 'Create and publish walks',
          body: 'Set up a new survey walk with route points, schedule, and volunteer capacity in one publishing flow.',
          ctaLabel: 'Create walk',
          ctaTo: '/walks/create',
        },
        {
          title: 'Manage user access',
          body: 'Search users, review account activity, and activate or deactivate accounts to keep operations running smoothly.',
          ctaLabel: 'Manage users',
          ctaTo: '/admin/users',
        },
      ]
    : [
        {
          title: 'Browse upcoming walks',
          body: 'View available survey walks, compare routes and timings, and join the sessions that fit your schedule.',
          ctaLabel: 'Browse walks',
          ctaTo: '/walks',
        },
        {
          title: 'Manage my registrations',
          body: 'Track your joined walks, check your role, and quickly return to upcoming or completed commitments.',
          ctaLabel: 'My walks',
          ctaTo: '/my-walks',
        },
      ];

  return (
    <>
      <Navigation user={authUser} />

      <main className="main-content page-shell">
        <div className="container">
          <header className="welcome-header hero-panel dashboard-hero">
            <div className="hero-copy">
              <h1 className="text-4xl font-bold text-green-800 dark:text-green-300 leading-relaxed mb-6">
                Welcome back,
                <span style={{ display: 'block', marginTop: '1rem' }}>{user.display_name}!</span>
              </h1>

            </div>
          </header>

          {isDeactivated ? (
            <section className="section-panel">
              <div className="empty-state empty-state--feature empty-state--deactivated">
                <p>Your account has been deactivated.</p>
                <p>Please contact an administrator for more information.</p>
              </div>
            </section>
          ) : (
            <section className="quick-actions section-panel">
              <div className="section-heading">
                <div>
                  <h2>Start from the view you need</h2>
                </div>
              </div>

              <div className={`action-buttons action-card-grid ${!isAdmin ? 'action-card-grid--two' : ''}`}>
                {highlightCards.map((card) => (
                  <article key={card.title} className="action-card">
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                    {'ctaLabel' in card && 'ctaTo' in card && (
                      <Link to={card.ctaTo} className="btn-secondary">
                        {card.ctaLabel}
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
