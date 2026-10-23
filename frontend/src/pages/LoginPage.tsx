import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useToast } from '../contexts/useToast';

type Props = {
  user: User | null;
};

export default function LoginPage({ user }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logoSrc = '/assets/images/icons/icon.png';

  useEffect(() => {
    if (!error) return;
    showToast({ message: error, variant: 'error' });
    setError(null);
  }, [error, showToast]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container auth-container--wide">
        <section className="auth-showcase">
          <span className="hero-kicker auth-kicker">Langur conservation platform</span>
          <h1>Coordinate survey walks with a clearer volunteer experience.</h1>
          <p>
            Raffles Go helps teams plan routes, manage field participation, and keep sightings organised without changing the workflows your project already uses.
          </p>
          <div className="auth-showcase__grid">
            <article className="auth-showcase__card">
              <h2>For volunteers</h2>
              <p>Browse upcoming walks, confirm your registrations, and return to the right detail page quickly.</p>
            </article>
            <article className="auth-showcase__card">
              <h2>For admins</h2>
              <p>Create and manage routes, oversee participants, and move between planning and field records with less friction.</p>
            </article>
          </div>
        </section>

        <div className="auth-card auth-card--elevated">
          <div className="auth-header">
            <img src={logoSrc} alt="Raffles Go Logo" className="auth-logo" />
            <h1>Raffles Go</h1>
            <p className="auth-subtitle">Conservation volunteer platform</p>
          </div>

          <div className="auth-form">
            <button
              type="button"
              className="btn-primary btn-full auth-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              {loading ? (
                'Signing in...'
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <g fill="none" fillRule="evenodd">
                      <path d="M17.64 9.2045c0-.6371-.0573-1.2516-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7955 2.7164v2.2581h2.9087c1.7023-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
                      <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.482 18 9 18z" fill="#34A853" />
                      <path d="M3.9636 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418l3.0063-2.3318z" fill="#FBBC05" />
                      <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5814-2.5814C13.4632.8918 11.426 0 9 0 5.482 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z" fill="#EA4335" />
                    </g>
                  </svg>
                  Sign in with Google
                </>
              )}
            </button>
            <p className="auth-footnote">
              By signing in, you agree to our Terms of Service and Privacy Policy. We collect and process your data to provide volunteer coordination services.
            </p>
          </div>
        </div>

        <footer className="auth-footer">
          <p>
            &copy; 2026 Raffles Go. Protecting endangered primates through community collaboration.
          </p>
        </footer>
      </div>
    </div>
  );
}
