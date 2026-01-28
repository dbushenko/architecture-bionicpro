import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ReportPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in by validating session
    validateSession();

    // Check for OAuth callback - after successful authentication,
    // user will be redirected back to frontend with session cookie already set
    // This should only happen if the redirect happened directly to frontend
    // In our case, Keycloak redirects to bionicpro-auth, which then redirects to frontend
    // So this code might not be triggered, but keeping for completeness
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code) {
      // Remove code and state from URL without reloading
      window.history.replaceState({}, document.title, window.location.pathname);

      // User should already have a session cookie set by bionicpro-auth,
      // so we just validate the session
      validateSession();
    }
  }, []);

  const validateSession = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/validate-session`, {
        credentials: 'include', // Important: include cookies in the request
      });

      if (response.ok) {
        setIsLoggedIn(true);
      }
    } catch (err) {
      console.error('Session validation failed:', err);
    }
  };

  const handleOAuthCallback = async (code: string, state: string | null) => {
    try {
      setLoading(true);
      setError(null);

      // Retrieve the code_verifier from sessionStorage
      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');

      if (!codeVerifier) {
        throw new Error('Missing code verifier');
      }

      const response = await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          redirectUri: window.location.origin + window.location.pathname,
          codeVerifier: codeVerifier
        }),
        credentials: 'include', // Important: include cookies in the request
      });

      // Clean up stored values
      sessionStorage.removeItem('oauth_state');
      sessionStorage.removeItem('oauth_code_verifier');

      if (response.ok) {
        setIsLoggedIn(true);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'OAuth callback failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during OAuth callback');
    } finally {
      setLoading(false);
    }
  };

  const initiateOAuth = async () => {
    // Generate a random state parameter for security
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Сначала сохраняем code_verifier на bionicpro-auth и получаем токен
    const response = await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/store-code-verifier`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ codeVerifier })
    });

    if (!response.ok) {
      throw new Error('Failed to store code verifier');
    }

    const tokenResponse = await response.json();
    const token = tokenResponse.token;

    // Store the original redirect_uri in sessionStorage
    sessionStorage.setItem('original_redirect_uri', window.location.origin + window.location.pathname);

    // Redirect to bionicpro-auth to initiate OAuth flow with the token
    const authUrl = `${process.env.REACT_APP_AUTH_URL}/auth/initiate-oauth-with-token?` +
      `clientId=${process.env.REACT_APP_KEYCLOAK_CLIENT_ID}&` +
      `originalRedirectUri=${encodeURIComponent(window.location.origin + window.location.pathname)}&` +
      `responseType=code&` +
      `scope=openid&` +
      `state=${state}&` +
      `codeChallenge=${codeChallenge}&` +
      `codeChallengeMethod=S256&` +
      `token=${encodeURIComponent(token)}`;

    window.location.href = authUrl;
  };

  // Helper functions for PKCE
  const generateCodeVerifier = (): string => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const generateCodeChallenge = async (verifier: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
    return hashBase64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      setError(null);

      await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Important: include cookies in the request
      });

      setIsLoggedIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during logout');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      // Получаем информацию о пользователе для получения ID
      const userInfoResponse = await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/user-info`, {
        credentials: 'include', // Important: include cookies in the request
      });

      if (!userInfoResponse.ok) {
        if (userInfoResponse.status === 401) {
          setError('Not authenticated');
          setIsLoggedIn(false);
        }
        throw new Error(`HTTP error when getting user info! status: ${userInfoResponse.status}`);
      }

      const userInfo = await userInfoResponse.json();
      const userId = userInfo.userId;

      // Генерируем имя файла отчета с ID пользователя
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      const fileName = `sensor_report_${userId}_${today}.csv`;
      const cdnUrl = `${process.env.REACT_APP_CDN_URL}/reports/${fileName}`;
      const generateApiUrl = `${process.env.REACT_APP_API_URL}/reports/generate-today`;

      console.log(`Attempting to download report: ${fileName}`);
      console.log(`CDN URL: ${cdnUrl}`);

      // Проверяем, существует ли отчет в MinIO через CDN
      let response = await fetch(cdnUrl);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Report not found in CDN, generating via API: ${generateApiUrl}`);

          // Отчет не найден, вызываем API для генерации и загрузки в MinIO
          response = await fetch(generateApiUrl, {
            method: 'POST',
            credentials: 'include', // Important: include cookies in the request
          });

          if (!response.ok) {
            if (response.status === 401) {
              setError('Not authenticated');
              setIsLoggedIn(false);
            } else {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return;
          }

          console.log(`Report generation initiated, waiting before checking CDN again`);

          // После генерации и загрузки ждем немного и снова проверяем через CDN
          // Это позволяет избежать проблем с кэшированием и обеспечивает,
          // что объект успеет записаться в MinIO
          await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды

          // Повторный запрос с добавлением параметра времени для избежания кэширования
          const cacheBusterUrl = `${cdnUrl}?t=${new Date().getTime()}`;
          console.log(`Checking CDN again with cache buster: ${cacheBusterUrl}`);
          response = await fetch(cacheBusterUrl);

          // Если и после этого не удается получить файл, пробуем еще раз с другим параметром
          if (!response.ok && response.status === 404) {
            console.log(`Still not found, waiting more and trying again`);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Ждем еще 3 секунды
            const cacheBusterUrl2 = `${cdnUrl}?t=${new Date().getTime()}`;
            console.log(`Final attempt with cache buster: ${cacheBusterUrl2}`);
            response = await fetch(cacheBusterUrl2);
          }
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        console.log(`Report found in CDN, downloading directly`);
      }

      if (!response.ok) {
        throw new Error(`Failed to download report from CDN after generation. HTTP error! status: ${response.status}`);
      }

      // Handle the response - expecting CSV file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      console.log(`Report downloaded successfully: ${fileName}`);
    } catch (err) {
      console.error('Error in downloadReport:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>

          <div className="flex items-center justify-center">
            <button
              onClick={initiateOAuth}
              disabled={loading}
              className={`w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Logging in...' : 'Login with Keycloak'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Generating Report...' : 'Download Report'}
        </button>

        <button
          onClick={() => navigate('/sensor-data')}
          className="ml-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Sensor Data Generator
        </button>

        <button
          onClick={handleLogout}
          disabled={loading}
          className={`ml-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Logout
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;