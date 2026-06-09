export const saveToken = (token) => localStorage.setItem('token', token);
export const getToken = () => localStorage.getItem('token');
export const removeToken = () => localStorage.removeItem('token');

// Decode the JWT payload safely. Returns null if missing or malformed.
const decodePayload = () => {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

// True only if there is a token AND it has not expired.
export const isLoggedIn = () => {
  const payload = decodePayload();
  if (!payload) return false;
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    return false;
  }
  return true;
};

export const getUserRole = () => {
  const payload = decodePayload();
  return payload?.role ?? null;
};
