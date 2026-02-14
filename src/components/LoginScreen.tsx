import { useState } from 'react';

interface Props {
  onLogin: (password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onLogin(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        {error && <div className="login-error">{error}</div>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="form-input login-input"
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          className="btn btn-primary login-btn"
          disabled={loading || !password}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
