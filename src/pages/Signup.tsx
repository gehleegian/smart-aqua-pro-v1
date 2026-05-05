import { useState } from 'react';
import { Waves, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { registerUser } from '../services/authService';

export default function Signup({
  onSignup,
  onGoToLogin,
}: {
  onSignup: () => void;
  onGoToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await registerUser(name, email, password);

      setSuccess('Account created successfully. Please sign in now.');

      setTimeout(() => {
        onSignup();
      }, 1500);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Email is already in use.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak.');
      } else {
        setError('Signup failed.');
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
        onClick={onGoToLogin}
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
              Create your account to continue
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
              Sign Up
            </h2>
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

          {success && (
            <div
              style={{
                marginBottom: '18px',
                padding: '13px 14px',
                backgroundColor: 'rgba(34,197,94,0.14)',
                border: '1px solid rgba(34,197,94,0.28)',
                borderRadius: '12px',
                fontSize: '14px',
                color: '#86efac',
              }}
            >
              {success}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              style={inputStyle}
            />
          </div>

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

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
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

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleSignup}
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
            {loading ? 'Creating Account...' : 'Create Account'}
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
            Already have an account?{' '}
            <button
              onClick={onGoToLogin}
              style={{
                color: '#38bdf8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}