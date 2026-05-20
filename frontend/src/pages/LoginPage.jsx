import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveToken, getUserRole } from '../utils/auth';


import api from '../utils/api';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Appel unique à l'API
      const res = await api.post('/auth/login', { email, password });
      
      // 2. Sauvegarde centralisée et propre du token
      const token = res.data.access_token;
      saveToken(token); 

      // 3. Décodage dynamique du rôle utilisateur depuis le token enregistré
      const role = getUserRole();
      
      // 4. Redirection conditionnelle stricte basée sur le rôle réel
      if (role === 'ADMIN') {
        navigate('/admin');
      } else if (role === 'INSTRUCTOR') {
        navigate('/instructor');
      } else {
        // Sécurité si le rôle ne correspond à rien de connu
        setError('Unauthorized access: Unknown user role.');
      }

    } catch (err) {
      console.error("Login Error:", err.response?.data || err.message);
      setError(err.response?.data?.detail || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f2444 50%, #0a1628 100%)' }}
    >
      <div className="flex flex-col items-center mb-10">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(96,165,250,0.35)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: '-0.5px' }}>UniSchedule</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>University Scheduling System</p>
      </div>

      <div className="w-full max-w-md p-8 rounded-3xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
        <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
        <p className="text-sm mb-7" style={{ color: 'rgba(255,255,255,0.38)' }}>Sign in to access your dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium mb-2"
              style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Email address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </span>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu" required
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', caretColor: '#60a5fa' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(96,165,250,0.55)'; e.target.style.background = 'rgba(96,165,250,0.06)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2"
              style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', caretColor: '#60a5fa' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(96,165,250,0.55)'; e.target.style.background = 'rgba(96,165,250,0.06)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
            style={{
              background: loading ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
              border: '1px solid rgba(96,165,250,0.25)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Signing in...
              </span>
            ) : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="mt-8 text-xs text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
        ©️ 2026 UniSchedule · University Scheduling System
      </p>
    </div>
  );
}