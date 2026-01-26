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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Sensor API Server is running on port ${PORT}`);
});