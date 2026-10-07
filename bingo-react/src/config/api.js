/**
 * Configuración centralizada de la API
 * Detecta automáticamente la URL del backend basándose en el hostname actual
 */

/**
 * Obtiene la URL base del backend
 * Si estamos accediendo desde una IP de red, usa esa IP para el backend
 * Si estamos en localhost, usa localhost
 */
export const getBackendUrl = () => {
  // Si hay una variable de entorno específica, usarla
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  // Detectar automáticamente basándose en el hostname
  const hostname = window.location.hostname;

  // Si estamos accediendo desde una IP de red (no localhost), usar la misma IP para el backend
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:5001`;
  }

  // Por defecto, usar localhost
  return 'http://localhost:5001';
};

// Exportar la URL del backend para uso en toda la aplicación
export const API_URL = getBackendUrl();

// Log para debugging
console.log('🔧 API Configuration:', {
  hostname: window.location.hostname,
  backendUrl: API_URL
});
