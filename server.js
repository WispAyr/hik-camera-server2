const express = require('express');
const multer = require('multer');
const morgan = require('morgan');
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const hikUploadHandler = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
  fs.mkdirSync(uploadDir);
}

// Initialize express apps
const webApp = express();
const hikApp = express();

// Serve static files from public directory
webApp.use(express.static(path.join(__dirname, 'public')));


// Serve static files from uploads directory for both apps
webApp.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Parse JSON bodies
webApp.use(express.json());
hikApp.use(express.json());

// Add logging middleware only for POST requests
const morganMiddleware = morgan('combined', {
  skip: function (req, res) { 
    return req.method === 'GET' || res.statusCode < 400;
  }
});

webApp.use(morganMiddleware);
hikApp.use(morganMiddleware);

// Create HTTP servers
const webServer = require('http').createServer(webApp);
const hikServer = require('http').createServer(hikApp);

// Initialize WebSocket server on the event server

// Broadcast to all connected WebSocket clients
function broadcastUpdate(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// WebSocket connection handling


// Subscribe to database events
db.on('siteUpdate', () => {
    broadcastUpdate({ type: 'site_update' });
});

db.on('cameraUpdate', () => {
    broadcastUpdate({ type: 'camera_update' });
});

db.on('eventUpdate', () => {
    broadcastUpdate({ type: 'event_update' });
});

// Function to send dashboard data to WebSocket clients
async function sendDashboardData(ws) {
    try {
        const stats = await db.getEventStats();
        const sites = await db.getSiteStats();
        ws.send(JSON.stringify({ type: 'dashboard_update', stats, sites }));
    } catch (error) {
        console.error('Error sending dashboard data:', error);
    }
}

// Graceful shutdown handler
const shutdownServers = async () => {
  try {
    await Promise.all([
      new Promise(resolve => webServer.close(resolve)),
      new Promise(resolve => hikServer.close(resolve)),
      db.close()
    ]);
    console.log('All servers and database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGTERM', shutdownServers);
process.on('SIGINT', shutdownServers);

// Start servers on different ports
const startServers = async () => {
  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        webServer.listen(3000, () => {
          console.log('Web UI server running on port 3000');
          resolve();
        }).on('error', reject);
      }),
      
      new Promise((resolve, reject) => {
        hikServer.listen(9001, () => {
          console.log('HIK camera event server running on port 9001');
          resolve();
        }).on('error', reject);
      })
    ]);
  } catch (error) {
    console.error('Error starting servers:', error);
    await shutdownServers();
    process.exit(1);
  }
};

startServers();

// Add API endpoints


// Configure HIK camera event endpoints
const handleVehicleDetection = async (req, res, next) => {
  try {
    if (!req.query.channelID || !req.query.dateTime || !req.query.licensePlate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Received vehicle detection event:', req.query);
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
      licensePlateImage: null,
      vehicleImage: null,
      detectionImage: null
    };

    if (req.files) {
      if (req.files.licensePlate) {
        eventData.licensePlateImage = req.files.licensePlate[0].filename;
      }
      if (req.files.vehicle) {
        eventData.vehicleImage = req.files.vehicle[0].filename;
      }
      if (req.files.detection) {
        eventData.detectionImage = req.files.detection[0].filename;
      }
    }
    
    console.log('Processed event data:', eventData);

    const eventId = await db.insertEvent(eventData);

    broadcastUpdate({ type: 'event_update' });

    res.status(200).json({ success: true, eventId });
  } catch (error) {
    next(error);
  }
};

// Handle events on both root path and /hik endpoint
const uploadFields = [
  { name: 'licensePlate', maxCount: 1 },
  { name: 'licensePlatePicture.jpg', maxCount: 1 },
  { name: 'vehicle', maxCount: 1 },
  { name: 'vehiclePicture.jpg', maxCount: 1 },
  { name: 'detection', maxCount: 1 }
];

hikApp.post('/', hikUploadHandler.fields(uploadFields), handleVehicleDetection);

// Add error handling middleware for all apps
const errorHandler = (err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

webApp.use(errorHandler);

hikApp.use(errorHandler);
