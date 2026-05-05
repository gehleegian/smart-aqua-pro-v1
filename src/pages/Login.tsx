import { useState } from 'react';
import { Waves, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { loginUser } from '../services/authService';
import type { UserData } from '../types/user';

export default function Login({
  onLogin,
  onGoToSignup,
  onGoBack,
}: {
  onLogin: (user: UserData) => void;
  onGoToSignup: () => void;
  onGoBack: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    border: '1px solid rgba(59, 130, 246, 0.18)',
    borderRadius: '12px',
    fontSize: '14px',
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#bfdbfe',
    marginBottom: '8px',
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const userProfile = await loginUser(email, password);

      if (!userProfile) {
        setError('User profile not found.');
        return;
      }

      onLogin(userProfile);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/user-not-found') {
        setError('User not found.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Wrong password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError('Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(59,130,246,0.18), transparent 25%), linear-gradient(135deg, #020617 0%, #0f172a 45%, #082f49 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        position: 'relative',
      }}
    >
      <button
        onClick={onGoBack}
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(15,23,42,0.7)',
          border: '1px solid rgba(96,165,250,0.2)',
          color: '#e0f2fe',
          borderRadius: '12px',
          padding: '10px 14px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div
          style={{
            background: 'rgba(2, 6, 23, 0.72)',
            border: '1px solid rgba(96, 165, 250, 0.16)',
            borderRadius: '24px',
            padding: '36px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                boxShadow: '0 10px 30px rgba(37,99,235,0.28)',
              }}
            >
              <Waves style={{ width: '34px', height: '34px', color: 'white' }} />
            </div>

            <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              SmartAqua Pro
            </h1>
            <p style={{ fontSize: '14px', color: '#93c5fd', marginTop: '8px', marginBottom: 0 }}>
              IoT-Based Aquarium Management System
            </p>
          </div>

          <div style={{ marginBottom: '22px' }}>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: '#ffffff',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Welcome Back
            </h2>
            <p
              style={{
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '14px',
                marginTop: '8px',
                marginBottom: 0,
              }}
            >
              Sign in to access your aquarium management dashboard
            </p>
          </div>

          {error && (
            <div
              style={{
                marginBottom: '18px',
                padding: '13px 14px',
                backgroundColor: 'rgba(239,68,68,0.14)',
                border: '1px solid rgba(239,68,68,0.28)',
                borderRadius: '12px',
                fontSize: '14px',
                color: '#fca5a5',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={{ ...inputStyle, paddingRight: '46px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#93c5fd',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 30px rgba(37,99,235,0.28)',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          <p
            style={{
              textAlign: 'center',
              fontSize: '14px',
              color: '#94a3b8',
              marginTop: '22px',
              marginBottom: 0,
            }}
          >
            Don&apos;t have an account?{' '}
            <button
              onClick={onGoToSignup}
              style={{
                color: '#38bdf8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}