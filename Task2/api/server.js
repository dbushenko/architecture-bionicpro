const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// PostgreSQL connection pool
const pool = new Pool({
  host: 'api_db',
  port: 5432,
  database: 'api_db',
  user: 'api_user',
  password: 'api_password',
});

// Endpoint to exchange session ID for user info (sub)
async function getUserInfoFromSession(sessionId) {
  try {
    // Request user info from bionicpro-auth
    const response = await axios.get(`${process.env.AUTH_SERVICE_URL}/auth/user-info`, {
      headers: {
        'Cookie': `SESSION_ID=${sessionId}`
      }
    });

    if (response.status !== 200) {
      throw new Error('Could not get user info from bionicpro-auth');
    }

    return {
      userId: response.data.userId,
    };
  } catch (error) {
    console.error('Error getting user info from session:', error);
    throw error;
  }
}

// Endpoint to generate random sensor data
app.post('/generate-sensor-data', async (req, res) => {
  const sessionId = req.cookies.SESSION_ID;

  if (!sessionId) {
    return res.status(401).json({ error: 'No session found' });
  }

  const { sensorId } = req.body;

  if (!sensorId) {
    return res.status(400).json({ error: 'Sensor ID is required' });
  }

  try {
    // Get user info from session
    const userInfo = await getUserInfoFromSession(sessionId);
    const userId = userInfo.userId;

    // Generate random sensor value
    const randomValue = Math.random() * 100; // Random value between 0 and 100
    
    // Insert the sensor reading into the database
    const query = `
      INSERT INTO sensor_readings (user_id, sensor_type, sensor_value)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const result = await pool.query(query, [userId, sensorId, randomValue]);
    
    res.json({ 
      success: true, 
      message: `Random data generated for sensor ${sensorId}`, 
      sensorId: sensorId,
      value: randomValue,
      userId: userId,
      recordId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error inserting sensor data:', error);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    res.status(500).json({ error: 'Failed to insert sensor data' });
  }
});

// Endpoint to get user's sensor data
app.get('/sensor-data', async (req, res) => {
  const sessionId = req.cookies.SESSION_ID;

  if (!sessionId) {
    return res.status(401).json({ error: 'No session found' });
  }

  try {
    // Get user info from session
    const userInfo = await getUserInfoFromSession(sessionId);
    const userId = userInfo.userId;
    
    const query = `
      SELECT * FROM sensor_readings 
      WHERE user_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 50
    `;
    
    const result = await pool.query(query, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sensor data:', error);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// Endpoint to get today's sensor data report as CSV
app.get('/reports/today', async (req, res) => {
  const sessionId = req.cookies.SESSION_ID;

  if (!sessionId) {
    return res.status(401).json({ error: 'No session found' });
  }

  try {
    // Get user info from session
    const userInfo = await getUserInfoFromSession(sessionId);
    const userId = userInfo.userId;

    // Get today's date range
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Query sensor readings for today
    const query = `
      SELECT * FROM sensor_readings
      WHERE user_id = $1
      AND timestamp >= $2
      AND timestamp < $3
      ORDER BY timestamp ASC
    `;

    const result = await pool.query(query, [userId, startDate, endDate]);

    // Convert to CSV format
    if (result.rows.length === 0) {
      // Return empty CSV with headers
      const csvHeaders = 'id,sensor_type,sensor_value,timestamp\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sensor_report_${today.toISOString().split('T')[0]}.csv`);
      res.send(csvHeaders);
      return;
    }

    // Create CSV content
    const csvRows = [];
    // Add headers
    csvRows.push(['id', 'sensor_type', 'sensor_value', 'timestamp'].join(','));

    // Add data rows
    for (const row of result.rows) {
      const csvRow = [
        row.id,
        `"${row.sensor_type}"`, // Wrap in quotes in case of commas
        row.sensor_value,
        `"${row.timestamp}"`
      ].join(',');
      csvRows.push(csvRow);
    }

    const csvContent = csvRows.join('\n');

    // Send CSV file as attachment
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sensor_report_${today.toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error fetching today\'s sensor data:', error);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Sensor API Server is running on port ${PORT}`);
});