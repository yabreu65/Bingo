import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

/**
 * Overlay que se muestra cuando Socket.io está reconectando
 */
export default function ReconnectingOverlay({ isConnected, isReconnecting }) {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      // Mostrar overlay después de 1 segundo de desconexión
      const timer = setTimeout(() => {
        setShowOverlay(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  if (!showOverlay || isConnected) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center">
        {/* Icono animado */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {isReconnecting ? (
              <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-yellow-600 animate-spin" />
              </div>
            ) : (
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                <WifiOff className="w-10 h-10 text-red-600" />
              </div>
            )}
          </div>
        </div>

        {/* Mensaje */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isReconnecting ? 'Reconectando...' : 'Conexión perdida'}
        </h2>
        <p className="text-gray-600 mb-4">
          {isReconnecting
            ? 'Reestableciendo conexión con el servidor'
            : 'Se perdió la conexión con el servidor'}
        </p>

        {/* Progreso */}
        {isReconnecting && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-yellow-500 rounded-full animate-pulse"
                style={{ width: '70%' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Intentando restablecer la conexión
            </p>
          </div>
        )}

        {/* Mensaje de espera */}
        <p className="text-sm text-gray-500">
          {isReconnecting
            ? 'Por favor espera mientras restablecemos la conexión...'
            : 'Intentando reconectar...'}
        </p>

        {/* Botón de recarga manual (después de varios intentos) */}
        {!isReconnecting && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            Recargar página
          </button>
        )}
      </div>
    </div>
  );
}
