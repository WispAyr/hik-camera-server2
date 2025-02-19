const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const WebSocket = require('ws');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Custom filename using query parameters
    const timestamp = req.query.dateTime ? req.query.dateTime.replace(/:/g, '-') : 'default-time';
    const licensePlate = req.query.licensePlate ? req.query.licensePlate.replace(/[^a-zA-Z0-9]/g, '') : 'default-plate';
    const cameraHexID = req.query.channelID || 'default-camera';
    const uniqueSuffix = `${timestamp}-${licensePlate}-${cameraHexID}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const hikUploadHandler = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize express apps
const webApp = express();
const hikApp = express();

// Add logging middleware
const morganMiddleware = morgan('combined', {
  skip: function (req, res) { return req.method === 'GET' || res.statusCode < 400; }
});
webApp.use(morganMiddleware);
hikApp.use(morganMiddleware);

// Parse JSON bodies
webApp.use(express.json());
hikApp.use(express.json());

// Create HTTP servers
const webServer = require('http').createServer(webApp);
const hikServer = require('http').createServer(hikApp);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server: hikServer });

// WebSocket connection handling
wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('something');
});

// Subscribe to database events
db.on('siteUpdate', () => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'site_update' }));
    }
  });
});

// Configure HIK camera event endpoints
hikApp.post('/', hikUploadHandler.fields([
  { name: 'licensePlate', maxCount: 1 },
  { name: 'vehicle', maxCount: 1 },
  { name: 'detection', maxCount: 1 }
]), async (req, res) => {
  try {
    const eventData = {
      channelID: req.query.channelID,
      dateTime: req.query.dateTime,
      eventType: req.query.eventType,
      country: req.query.country,
      licensePlate: req.query.licensePlate,
      lane: req.query.lane,
      direction: req.query.direction,
      confidenceLevel: req.query.confidenceLevel,
      macAddress: req.query.macAddress,
      licensePlateImage: req.files.licensePlate ? req.files.licensePlate[0].filename : null,
      vehicleImage: req.files.vehicle ? req.files.vehicle[0].filename : null,
      detectionImage: req.files.detection ? req.files.detection[0].filename : null
    };

    const eventId = await db.insertEvent(eventData);
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    console.error('Error handling vehicle detection:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Error handling middleware for all apps
const errorHandler = (err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
};

webApp.use(errorHandler);
hikApp.use(errorHandler);

// Start servers on different ports
const startServers = async () => {
  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        webServer.listen(3000, () => {
          console.log('Web server running on port 3000');
          resolve();
        }).on('error', reject);
      }),
      new Promise((resolve, reject) => {
        hikServer.listen(9001, () => {
          console.log('HIK server running on port 9001');
          resolve();
        }).on('error', reject);
      })
    ]);
  } catch (error) {
    console.error('Error starting servers:', error);
  }
};

startServers();
