





 //export default api;
// export const setToken = (token) => localStorage.setItem('token', token);
// export const saveToken = (token) => localStorage.setItem('token', token); // alias pour LoginPage
// export const getToken = () => localStorage.getItem('token');
// export const removeToken = () => localStorage.removeItem('token');
// export const isLoggedIn = () => !!getToken();

// export const getUserRole = () => {
//   const token = getToken();
//   if (!token) return null;
//   try {
//     const payload = JSON.parse(atob(token.split('.')[1]));
//     return payload.role;
//   } catch {
//     return null;
//   }
// };


// import axios from 'axios';
// import { getToken } from './auth';

// const api = axios.create({
//   baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
// });

// api.interceptors.request.use((config) => {
//   const token = getToken();
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

// export default api;
import axios from 'axios';
import { getToken } from './auth';

const api = axios.create({
  baseURL: '/api',  // ← utilise le proxy Vite au lieu de localhost:8000
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;