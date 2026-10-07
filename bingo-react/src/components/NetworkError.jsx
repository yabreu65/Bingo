import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * Componente para mostrar errores de red con retry automático
 */
export default function NetworkError({ error, onRetry, autoRetry = true, maxRetries = 3 }) {
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // Auto-retry con exponential backoff
  useEffect(() => {
    if (!autoRetry || retryCount >= maxRetries) return;

    const timer = setTimeout(() => {
      handleRetry();
    }, Math.min(1000 * Math.pow(2, retryCount), 10000)); // Max 10 seconds

    return () => clearTimeout(timer);
  }, [retryCount, autoRetry, maxRetries]);

  // Countdown para mostrar al usuario
  useEffect(() => {
    if (!autoRetry || retryCount >= maxRetries || countdown === 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 5; // Reset
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, autoRetry, retryCount, maxRetries]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      setRetryCount(0); // Reset on success
    } catch {
      setRetryCount(prev => prev + 1);
    } finally {
      setIsRetrying(false);
    }
  };

  const isNetworkError = error?.message?.includes('network') ||
                        error?.message?.includes('fetch') ||
                        error?.code === 'NETWORK_ERROR';

  if (!isNetworkError) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Icono de red */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
            <WifiOff className="w-10 h-10 text-blue-600" />
          </div>
        </div>

        {/* Mensaje principal */}
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Sin conexión
        </h1>
        <p className="text-gray-600 text-center mb-6">
          No pudimos conectarnos al servidor. Verifica tu conexión a internet.
        </p>

        {/* Estado de retry */}
        {autoRetry && retryCount < maxRetries ? (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800 text-center">
              {isRetrying ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Reintentando...
                </span>
              ) : (
                <>
                  Reintentando automáticamente en {countdown}s
                  <br />
                  <span className="text-xs text-blue-600">
                    Intento {retryCount + 1} de {maxRetries}
                  </span>
                </>
              )}
            </p>
          </div>
        ) : retryCount >= maxRetries ? (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 text-center">
              No se pudo establecer conexión después de {maxRetries} intentos.
            </p>
          </div>
        ) : null}

        {/* Botón manual de retry */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-5 h-5 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Reintentando...' : 'Reintentar ahora'}
        </button>

        {/* Consejos */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-600 mb-2">Consejos:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• Verifica tu conexión WiFi o datos móviles</li>
            <li>• Asegúrate de que el servidor esté funcionando</li>
            <li>• Intenta refrescar la página completamente</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
