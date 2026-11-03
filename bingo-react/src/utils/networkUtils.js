/**
 * Obtiene la URL base para compartir (accesible desde otros dispositivos)
 * Si estamos en localhost, intenta usar una IP de red
 * Si ya estamos en una IP de red, la usa directamente
 */
export const getShareableUrl = () => {
  const configuredOrigin = import.meta.env.VITE_SHAREABLE_ORIGIN;
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '');

  const hostname = window.location.hostname;
  const port = window.location.port;

  // Si ya estamos en una IP de red (no localhost), usar esa
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${hostname}${port ? ':' + port : ''}`;
  }

  // Si estamos en localhost, necesitamos la IP de red
  // A LAN host must be configured explicitly because a browser cannot discover
  // the server's private IP without exposing network information.
  const networkIp = import.meta.env.VITE_NETWORK_IP;
  if (networkIp) return `${window.location.protocol}//${networkIp}${port ? ':' + port : ''}`;
  return window.location.origin;
};

/**
 * Obtiene la URL base para uso local (puede ser localhost)
 */
export const getLocalUrl = () => {
  return window.location.origin;
};
