import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useViewMode } from '../contexts/useViewMode';
import type { User } from 'firebase/auth';
import { ThemeToggle } from './ThemeToggle';

interface NavigationProps {
  user: User;
}

function getUserLabel(user: User) {
  return user.displayName || user.email || 'Volunteer';
}

export function Navigation({ user }: NavigationProps) {
  const location = useLocation();
  const { isAdmin, isDeactivated } = useViewMode();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const userLabel = getUserLabel(user);
  const profileUser = {
    display_name: userLabel,
    role: isAdmin ? 'ADMIN' : 'VOLUNTEER',
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const isActive = (path: string) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  const isWalksActive =
    location.pathname.startsWith('/walks') &&
    location.pathname !== '/walks/create';
  const isManageUsersActive = location.pathname.startsWith('/admin/users');

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const toggleAccountMenu = () => {
    setIsAccountMenuOpen((open) => !open);
  };

  const closeAccountMenu = () => {
    setIsAccountMenuOpen(false);
  };

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const navContainer = target.closest('.main-nav');
      const navToggle = target.closest('.nav-toggle');
      const accountMenu = target.closest('.account-menu');

      if (isMobileMenuOpen && navContainer && !navToggle) {
        const isNavLink = target.closest('.nav-link');
        if (!isNavLink) {
          closeMobileMenu();
        }
      } else if (isMobileMenuOpen && !navContainer) {
        closeMobileMenu();
      }

      if (isAccountMenuOpen && !accountMenu) {
        closeAccountMenu();
      }
    };

    if (isMobileMenuOpen || isAccountMenuOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isMobileMenuOpen, isAccountMenuOpen]);

  return (
    <nav className="main-nav">
      <div className="nav-container">
        <Link to="/dashboard" className="nav-brand" onClick={closeMobileMenu}>
          <span className="logo-shell">
            <img
              src="/assets/images/icons/icon.png"
              alt="Raffles Go Logo"
              className="logo"
            />
          </span>
          <span className="brand-copy">
            <span className="brand-name">Raffles Go</span>
            <span className="brand-tagline">Field coordination for conservation teams</span>
          </span>
        </Link>

        <button
          className="nav-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <X
              size={22}
              aria-hidden
              style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
            />
          ) : (
            <Menu
              size={22}
              aria-hidden
              style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
            />
          )}
        </button>

        <div className={`nav-menu-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
          <ul className="nav-menu">
            <li>
              <Link
                to="/dashboard"
                className={isActive('/dashboard')}
                onClick={closeMobileMenu}
              >
                Dashboard
              </Link>
            </li>
            {isDeactivated ? null : isAdmin ? (
              <>
                <li>
                  <Link
                    to="/walks"
                    className={isWalksActive ? 'nav-link active' : 'nav-link'}
                    onClick={closeMobileMenu}
                  >
                    Manage walks
                  </Link>
                </li>
                <li>
                  <Link
                    to="/walks/create"
                    className={isActive('/walks/create')}
                    onClick={closeMobileMenu}
                  >
                    Create walk
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin/users"
                    className={isManageUsersActive ? 'nav-link active' : 'nav-link'}
                    onClick={closeMobileMenu}
                  >
                    Manage users
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link
                    to="/walks"
                    className={isWalksActive ? 'nav-link active' : 'nav-link'}
                    onClick={closeMobileMenu}
                  >
                    Browse walks
                  </Link>
                </li>
                <li>
                  <Link
                    to="/my-walks"
                    className={isActive('/my-walks')}
                    onClick={closeMobileMenu}
                  >
                    My walks
                  </Link>
                </li>
              </>
            )}
          </ul>

          <div className="nav-actions">
            <div className="account-menu account-menu--desktop">
              <button
                type="button"
                className={`user-menu user-menu--desktop ${isAccountMenuOpen ? 'open' : ''}`}
                onClick={toggleAccountMenu}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
              >
                <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-transparent hover:bg-muted transition-colors cursor-pointer">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                      {profileUser.display_name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        opacity: 0.7,
                        marginTop: '2px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {profileUser.role}
                    </span>
                  </div>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                </div>
              </button>

              <div className={`account-dropdown ${isAccountMenuOpen ? 'open' : ''}`} role="menu">
                <div className="account-dropdown__section">
                  <span className="account-dropdown__label">Appearance</span>
                  <ThemeToggle className="nav-theme-toggle" />
                </div>
                <button onClick={handleLogout} className="btn-logout account-dropdown__logout">
                  Logout
                </button>
              </div>
            </div>

            <div className="user-menu mobile-user-menu">
              <ThemeToggle className="nav-theme-toggle" />
              <div className="user-info">
                <span className="user-name">{userLabel}</span>
                <span className="user-role-pill">
                  {isDeactivated ? 'Deactivated' : isAdmin ? 'Admin' : 'Volunteer'}
                </span>
              </div>
              <button onClick={handleLogout} className="btn-logout">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
