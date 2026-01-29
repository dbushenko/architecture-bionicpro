import React, { useState, useEffect } from 'react';

const SensorDataPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensorId, setSensorId] = useState('');
  const [sensorData, setSensorData] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);

  useEffect(() => {
    loadSensorData();
  }, []);

  const loadSensorData = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/sensor-data`, {
        credentials: 'include', // Important: include cookies in the request
      });

      if (!response.ok) {
        if (response.status === 401) {
          setIsLoggedIn(false);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSensorData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while loading sensor data');
    }
  };

  const handleGenerateData = async () => {
    if (!sensorId.trim()) {
      setError('Please enter a sensor ID');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${process.env.REACT_APP_API_URL}/generate-sensor-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sensorId: sensorId.trim() }),
        credentials: 'include', // Important: include cookies in the request
      });

      if (!response.ok) {
        if (response.status === 401) {
          setIsLoggedIn(false);
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Clear the input field
      setSensorId('');
      
      // Reload the sensor data
      loadSensorData();
      
      alert(`Successfully generated data: ${result.sensorId} = ${result.value}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while generating sensor data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.REACT_APP_AUTH_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Important: include cookies in the request
      });

      setIsLoggedIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during logout');
    }
  };

  if (!isLoggedIn) {
    window.location.href = '/';
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Sensor Data Generator</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="mb-6">
              <label htmlFor="sensorId" className="block text-sm font-medium text-gray-700 mb-2">
                Sensor ID
              </label>
              <input
                type="text"
                id="sensorId"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                placeholder="Enter sensor type (e.g., temperature, pressure)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            <button
              onClick={handleGenerateData}
              disabled={loading}
              className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Generating...' : 'Generate Random Data'}
            </button>

            {error && (
              <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Recent Sensor Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sensor Type
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sensorData.length > 0 ? (
                    sensorData.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          {item.id}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.sensor_type}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          {Number(item.sensor_value).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-center text-sm text-gray-500">
                        No sensor data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SensorDataPage;