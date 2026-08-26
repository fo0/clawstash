import { useRef, useState } from 'react';

interface Props {
  onLogin: (password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Caps Lock is the classic cause of a failed password entry, and a masked
  // field gives no clue. Detected from the real modifier state of key events
  // in the field — there is no way to read it without one, so the warning can
  // only appear from the first keystroke onwards (and never before the user
  // has touched the field, which is exactly when it would be noise).
  const [capsLockOn, setCapsLockOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const syncCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // getModifierState is unimplemented on some synthetic/legacy events —
    // treat "unknown" as off rather than throwing inside a key handler.
    if (typeof e.getModifierState !== 'function') return;
    setCapsLockOn(e.getModifierState('CapsLock'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The input is readOnly (not disabled) during submit, so Enter still
    // reaches the form — the loading guard blocks a double login.
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      // The rate limiter answers 429 — without a JSON body the raw message is
      // just "HTTP 429", which tells the user nothing actionable.
      setError(
        /\b429\b|too many/i.test(message)
          ? 'Too many attempts — please wait a moment and try again.'
          : message,
      );
      // Put the user straight back into the field to retype (select the wrong
      // password so typing replaces it).
      inputRef.current?.focus();
      inputRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <span className="logo-icon">CS</span>
          <span className="login-logo-text">ClawStash</span>
        </div>
        <p className="login-hint">Enter your password to continue.</p>
        {error && (
          <div id="login-error-msg" className="login-error" role="alert">
            {error}
          </div>
        )}
        <label htmlFor="login-password" className="sr-only">
          Password
        </label>
        <div className="login-input-wrapper">
          <input
            ref={inputRef}
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="form-input login-input"
            // readOnly, not disabled: disabled drops keyboard focus during
            // submit and never gives it back after a failed attempt.
            readOnly={loading}
            // The login screen renders nothing but this form, so focusing the
            // password field is where the user was going anyway — there is no
            // context to be yanked out of.
            // eslint-disable-next-line jsx-a11y/no-autofocus -- sole control on a dedicated screen
            autoFocus
            onKeyDown={syncCapsLock}
            onKeyUp={syncCapsLock}
            // Leaving the field ends our only source of truth for the
            // modifier — drop the warning rather than let it go stale.
            onBlur={() => setCapsLockOn(false)}
            aria-describedby={
              [error ? 'login-error-msg' : null, capsLockOn ? 'login-capslock-msg' : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          <button
            type="button"
            className="login-password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            disabled={loading}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14 10a.75.75 0 1 1-.88 1.214l-2.248-1.606A8.09 8.09 0 0 1 8 13.5C3.822 13.5.755 10.505.09 8.31a.75.75 0 0 1 0-.62A9.06 9.06 0 0 1 2.9 4.16L.31 2.357A.75.75 0 0 1 .143 2.31Zm4.107 2.936A5.25 5.25 0 0 0 8 11.25c.616 0 1.21-.106 1.762-.301L8.28 9.88a2 2 0 0 1-2.16-1.542L4.25 5.246ZM8 4.75c.24 0 .476.016.707.047a2 2 0 0 1 1.784 2.418l3.02 2.157A7.56 7.56 0 0 0 15.91 8.31a.75.75 0 0 0 0-.62C15.245 5.495 12.178 2.5 8 2.5c-.657 0-1.29.074-1.892.21l1.67 1.192A5.3 5.3 0 0 1 8 4.75Z" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 2.5c4.178 0 7.245 2.995 7.91 5.19a.75.75 0 0 1 0 .62C15.245 10.505 12.178 13.5 8 13.5S.755 10.505.09 8.31a.75.75 0 0 1 0-.62C.755 5.495 3.822 2.5 8 2.5Zm0 1.5C4.9 4 2.6 6.164 1.61 8 2.6 9.836 4.9 12 8 12s5.4-2.164 6.39-4C13.4 6.164 11.1 4 8 4Zm0 1.75a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z" />
              </svg>
            )}
          </button>
        </div>
        {capsLockOn && (
          <div id="login-capslock-msg" className="login-capslock" role="status" aria-live="polite">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M7.03 1.53a.75.75 0 0 1 1.06 0l5 5A.75.75 0 0 1 12.56 7.8H10.5v2.45a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75V7.8H3.44a.75.75 0 0 1-.53-1.28ZM6 12.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
            </svg>
            Caps Lock is on
          </div>
        )}
        <button type="submit" className="btn btn-primary login-btn" disabled={loading || !password}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
