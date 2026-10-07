/**
 * Obtiene la URL base para compartir (accesible desde otros dispositivos)
 * Si estamos en localhost, intenta usar una IP de red
 * Si ya estamos en una IP de red, la usa directamente
 */
export const getShareableUrl = () => {
  const hostname = window.location.hostname;
  const port = window.location.port;

  // Si ya estamos en una IP de red (no localhost), usar esa
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${hostname}${port ? ':' + port : ''}`;
  }

  // Si estamos en localhost, necesitamos la IP de red
  // Como no podemos obtener la IP desde el navegador, usamos una IP hardcodeada o la del .env
  // En producción, esto debería venir del servidor o ser configurable
  const networkIp = import.meta.env.VITE_NETWORK_IP || '192.168.1.39';
  return `${window.location.protocol}//${networkIp}${port ? ':' + port : ''}`;
};

/**
 * Obtiene la URL base para uso local (puede ser localhost)
 */
export const getLocalUrl = () => {
  return window.location.origin;
};
