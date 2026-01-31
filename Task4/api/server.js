const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const Minio = require('minio');
const { ClickHouseClient, createClient } = require('@clickhouse/client');
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

// ClickHouse client setup
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || 'default_password',
  database: process.env.CLICKHOUSE_DB || 'default',
  request_timeout: 60000, // 60 seconds
});

// MinIO client setup
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
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

    // Get today's date
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const fileName = `sensor_report_${userId}_${todayDate}.csv`;

    console.log(`Checking if report exists in MinIO for /reports/today endpoint: reports/${fileName}`);

    // Check if report already exists in MinIO
    try {
      await minioClient.statObject('reports', fileName);
      // If the file exists in MinIO, redirect to CDN to serve it from there
      // This allows leveraging the CDN caching and reduces load on the API
      console.log(`Report found in MinIO, redirecting to CDN: reports/${fileName}`);
      // Use the same CDN URL format as in the frontend
      const cdnUrl = `${process.env.CDN_URL || process.env.REACT_APP_CDN_URL || 'http://localhost:8080'}/reports/${fileName}`;
      console.log(`Redirecting to CDN URL: ${cdnUrl}`);
      return res.redirect(302, cdnUrl);
    } catch (statError) {
      // File doesn't exist in MinIO, continue with database query and CSV generation
      if (statError.code !== 'NotFound') {
        // Some other error occurred
        console.error(`Error checking report existence in MinIO:`, statError);
        throw statError;
      }
      console.log(`Report not found in MinIO, generating from database: reports/${fileName}`);
    }

    // Query aggregated sensor data for today (daily aggregations)
    const query = `
      SELECT * FROM aggregated_sensor_data
      WHERE user_id = $1
      AND aggregation_period = 'daily'
      AND period_date = $2
      ORDER BY sensor_type ASC
    `;

    const result = await pool.query(query, [userId, todayDate]);

    // Convert to CSV format
    if (result.rows.length === 0) {
      // Return empty CSV with headers
      const csvHeaders = 'id,sensor_type,measurement_count,min_value,max_value,avg_value,trend\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=sensor_report_${userId}_${todayDate}.csv`);
      res.send(csvHeaders);
      return;
    }

    // Create CSV content
    const csvRows = [];
    // Add headers
    csvRows.push(['id', 'sensor_type', 'measurement_count', 'min_value', 'max_value', 'avg_value', 'trend'].join(','));

    // Add data rows
    for (const row of result.rows) {
      const csvRow = [
        row.id,
        `"${row.sensor_type}"`, // Wrap in quotes in case of commas
        row.measurement_count,
        row.min_value,
        row.max_value,
        row.avg_value,
        `"${row.trend}"`
      ].join(',');
      csvRows.push(csvRow);
    }

    const csvContent = csvRows.join('\n');

    // Send CSV file as attachment
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sensor_report_${userId}_${todayDate}.csv`);
    console.log(`Sending CSV from database for: reports/${fileName}`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error fetching today\'s aggregated sensor data:', error);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    res.status(500).json({ error: 'Failed to fetch aggregated sensor data' });
  }
});

// Endpoint to generate and upload today's sensor data report to MinIO
app.post('/reports/generate-today', async (req, res) => {
  const sessionId = req.cookies.SESSION_ID;

  if (!sessionId) {
    return res.status(401).json({ error: 'No session found' });
  }

  try {
    // Get user info from session
    const userInfo = await getUserInfoFromSession(sessionId);
    const userId = userInfo.userId;

    // Get today's date
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const fileName = `sensor_report_${userId}_${todayDate}.csv`;

    console.log(`Checking if report exists in MinIO: reports/${fileName}`);

    // Check if report already exists in MinIO
    try {
      await minioClient.statObject('reports', fileName);
      // If the file already exists, return success without regenerating
      console.log(`Report already exists in MinIO: reports/${fileName}`);
      return res.json({
        success: true,
        message: `Report already exists in MinIO: reports/${fileName}`,
        fileName: fileName
      });
    } catch (statError) {
      // File doesn't exist, continue with generation
      if (statError.code !== 'NotFound') {
        // Some other error occurred
        console.error(`Error checking report existence in MinIO:`, statError);
        throw statError;
      }
      console.log(`Report does not exist in MinIO, proceeding with generation: reports/${fileName}`);
    }

    // Query aggregated sensor data for today (daily aggregations)
    const query = `
      SELECT * FROM aggregated_sensor_data
      WHERE user_id = $1
      AND aggregation_period = 'daily'
      AND period_date = $2
      ORDER BY sensor_type ASC
    `;

    const result = await pool.query(query, [userId, todayDate]);

    // Create CSV content
    const csvRows = [];

    // Add headers
    csvRows.push(['id', 'sensor_type', 'measurement_count', 'min_value', 'max_value', 'avg_value', 'trend'].join(','));

    // Add data rows
    for (const row of result.rows) {
      const csvRow = [
        row.id,
        `"${row.sensor_type}"`, // Wrap in quotes in case of commas
        row.measurement_count,
        row.min_value,
        row.max_value,
        row.avg_value,
        `"${row.trend}"`
      ].join(',');
      csvRows.push(csvRow);
    }

    const csvContent = csvRows.join('\n');

    // Upload to MinIO
    const buffer = Buffer.from(csvContent, 'utf8');

    // Check if bucket exists, if not create it
    const bucketExists = await minioClient.bucketExists('reports');
    if (!bucketExists) {
      await minioClient.makeBucket('reports', 'us-east-1');
      console.log('Created bucket reports');
    }

    console.log(`Uploading report to MinIO: reports/${fileName}, size: ${buffer.length} bytes`);

    await minioClient.putObject('reports', fileName, buffer, buffer.length, {
      'Content-Type': 'text/csv',
    });

    console.log(`Successfully uploaded report to MinIO: reports/${fileName}`);

    res.json({
      success: true,
      message: `Report generated and uploaded to MinIO: reports/${fileName}`,
      fileName: fileName
    });
  } catch (error) {
    console.error('Error generating and uploading report to MinIO:', error);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: 'Unauthorized: Invalid session' });
    }
    res.status(500).json({ error: 'Failed to generate and upload report to MinIO' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ClickHouse health check endpoint
app.get('/clickhouse-health', async (req, res) => {
  try {
    const queryResult = await clickhouse.query({ query: 'SELECT version()' });
    const version = (await queryResult.text()).trim();

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      clickhouse_version: version
    });
  } catch (error) {
    console.error('ClickHouse health check failed:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Function to test ClickHouse connection with retry
async function testClickHouseConnection(maxRetries = 10, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to ClickHouse (${i + 1}/${maxRetries})...`);
      console.log(`ClickHouse URL: ${process.env.CLICKHOUSE_URL || 'http://clickhouse:8123'}`);

      const queryResult = await clickhouse.query({ query: 'SELECT version()' });
      const resultSet = await queryResult.json();
      const version = resultSet.data && resultSet.data[0] && resultSet.data[0]['version()'];
      console.log(`Connected to ClickHouse version: ${version}`);
      return true;
    } catch (error) {
      console.warn(`Attempt ${i + 1} to connect to ClickHouse failed:`, error.message);
      console.warn(`Error code: ${error.code}, Error syscall: ${error.syscall}`);
      if (i === maxRetries - 1) {
        console.error('Failed to connect to ClickHouse after all retries:', error.message);
        return false;
      }
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

app.listen(PORT, async () => {
  console.log(`Sensor API Server is running on port ${PORT}`);

  // Test ClickHouse connection on startup with retry
  await testClickHouseConnection();
});