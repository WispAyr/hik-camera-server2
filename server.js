const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

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

const uploadHandler = multer({
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

// Initialize express app
const app = express();

// Parse JSON bodies
app.use(express.json());

// Create HTTP server
const server = require('http').createServer(app);

// Configure the endpoint for handling vehicle detection events
app.post('/', uploadHandler.fields([
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
    console.error('Error processing event:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Graceful shutdown handler
const shutdownServers = async () => {
  try {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    console.log('Server and database connections closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGTERM', shutdownServers);
process.on('SIGINT', shutdownServers);

// Start server on specified port
server.listen(9001, () => {
  console.log('Server running on port 9001');
});

