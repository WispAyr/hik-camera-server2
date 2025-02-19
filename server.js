const express = require('express');
const multer = require('multer');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const WebSocket = require('ws');

// Initialize express app
const app = express();

// Parse JSON bodies
app.use(express.json());

// Add logging middleware only for POST requests
app.use(morgan('combined', {
  skip: function (req, res) { 
    // Skip logging for all GET requests and successful responses
    return req.method === 'GET' || res.statusCode < 400;
  }
}));

// Create HTTP server
const server = require('http').createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Send initial data
    sendDashboardData(ws);

    // Set up interval for periodic updates
    const updateInterval = setInterval(() => {
        sendDashboardData(ws);
    }, 5000); // Update every 5 seconds

    ws.on('close', () => {
        clearInterval(updateInterval);
        console.log('Client disconnected');
    });
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

// Parse JSON bodies
app.use(express.json());

// Add logging middleware only for POST requests
app.use(morgan('combined', {
  skip: function (req, res) { 
    // Skip logging for all GET requests and successful responses
    return req.method === 'GET' || res.statusCode < 400;
  }
}));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Site management endpoints
app.get('/api/sites', async (req, res) => {
  try {
    const sites = await db.getSiteStats();
    res.json(sites);
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/sites/:id', async (req, res) => {
  try {
    const site = await db.getSiteById(req.params.id);
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }
    res.json(site);
  } catch (error) {
    console.error('Error fetching site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Camera management endpoints
app.get('/api/cameras', async (req, res) => {
  try {
    const siteId = req.query.siteId;
    const cameras = await db.getCameras(siteId);
    res.json(cameras);
  } catch (error) {
    console.error('Error fetching cameras:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/cameras', async (req, res) => {
  try {
    const { channelID, macAddress, name, description, site_id } = req.body;
    if (!channelID || !site_id) {
      return res.status(400).json({ error: 'Channel ID and site ID are required' });
    }
    const cameraId = await db.addCamera({ channelID, macAddress, name, description, site_id });
    res.status(201).json({ id: cameraId, channelID, macAddress, name, description, site_id });
  } catch (error) {
    console.error('Error creating camera:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/cameras/:id', async (req, res) => {
  try {
    const { name, description, site_id } = req.body;
    const { id } = req.params;
    await db.updateCamera(id, { name, description, site_id });
    res.json({ id, name, description, site_id });
  } catch (error) {
    console.error('Error updating camera:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteCamera(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting camera:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sites', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Site name is required' });
    }
    const siteId = await db.createOrGetSite(name, description);
    res.status(201).json({ id: siteId, name, description });
  } catch (error) {
    console.error('Error creating site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/sites/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const { id } = req.params;
    if (!name) {
      return res.status(400).json({ error: 'Site name is required' });
    }
    await db.updateSite(id, name, description);
    res.json({ id, name, description });
  } catch (error) {
    console.error('Error updating site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/sites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteSite(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Management pages
app.get('/manage-sites', async (req, res) => {
  try {
    const sites = await db.getSiteStats();
    const stats = await db.getEventStats();
    res.send('<!DOCTYPE html>' +
      '<html>' +
      '<head>' +
        '<title>Manage Sites - Vehicle Detection System</title>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<style>' +
          ':root {' +
            '--bg-primary: #000000;' +
            '--bg-secondary: #111111;' +
            '--text-primary: #ffffff;' +
            '--text-secondary: #808080;' +
            '--accent: #005288;' +
            '--accent-hover: #006bb3;' +
            '--border: #1a1a1a;' +
          '}' +
          'body {' +
            'font-family: \'SF Pro Display\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;' +
            'margin: 0;' +
            'padding: 20px;' +
            'background-color: var(--bg-primary);' +
            'color: var(--text-primary);' +
            'line-height: 1.6;' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<h1>Sites Overview</h1>' +
          '<div class="header-buttons">' +
            '<button class="manage-button" onclick="window.location.href=\'/manage-sites\'">Manage Sites</button>' +
            '<button class="manage-button" onclick="window.location.href=\'/manage-cameras\'">Manage Cameras</button>' +
          '</div>' +
          '<div id="clock"></div>' +
        '</div>' +
        '<div class="stats">' +
          '<div class="stat-card">' +
            '<div class="stat-value">' + (stats.totalEvents || 0) + '</div>' +
            '<div>Total Events</div>' +
          '</div>' +
        '</div>' +
      '</body>' +
      '</html>');
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Serve HTML content
// Main dashboard showing sites overview
app.get('/', async (req, res) => {
  try {
    const sites = await db.getSiteStats();
    const stats = await db.getEventStats();

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sites Overview - Vehicle Detection System</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          :root {
            --bg-primary: #000000;
            --bg-secondary: #111111;
            --text-primary: #ffffff;
            --text-secondary: #808080;
            --accent: #005288;
            --accent-hover: #006bb3;
            --border: #1a1a1a;
          }
          body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background-color: var(--bg-secondary);
            border-radius: 12px;
            margin-bottom: 30px;
          }
          .header-buttons {
            display: flex;
            gap: 10px;
          }
          .manage-button {
            background-color: var(--accent);
            color: var(--text-primary);
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.3s ease;
          }
          .manage-button:hover {
            background-color: var(--accent-hover);
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .stat-card {
            background-color: var(--bg-secondary);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
          }
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--accent);
          }
          .sites-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
          }
          .site-card {
            background-color: var(--bg-secondary);
            padding: 20px;
            border-radius: 12px;
            cursor: pointer;
            transition: transform 0.3s ease;
          }
          .site-card:hover {
            transform: translateY(-5px);
          }
          .site-name {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .site-stats {
            color: var(--text-secondary);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Sites Overview</h1>
          <div class="header-buttons">
            <button class="manage-button" onclick="window.location.href='/manage-sites'">Manage Sites</button>
            <button class="manage-button" onclick="window.location.href='/manage-cameras'">Manage Cameras</button>
          </div>
          <div id="clock"></div>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-value">${stats.totalEvents || 0}</div>
            <div>Total Events</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.uniqueVehicles || 0}</div>
            <div>Unique Vehicles</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.activeChannels || 0}</div>
            <div>Active Cameras</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.totalSites || 0}</div>
            <div>Total Sites</div>
          </div>
        </div>

        <div class="sites-grid">
          ${sites.map(site => `
            <div class="site-card" onclick="window.location.href='/site/${site.id}'">
              <div class="site-name">${site.name}</div>
              <div class="site-stats">
                <div>Events: ${site.eventCount || 0}</div>
                <div>Last Detection: ${site.lastDetection || 'N/A'}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <script>
          function updateClock() {
            const clock = document.getElementById('clock');
            clock.textContent = new Date().toLocaleString();
          }
          setInterval(updateClock, 1000);
          updateClock();
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Site-specific events page
app.get('/manage-cameras', async (req, res) => {
  try {
    const cameras = await db.getCameras();
    const sites = await db.getSiteStats();

    res.send('<!DOCTYPE html>' +
      '<html>' +
      '<head>' +
        '<title>Manage Cameras - Vehicle Detection System</title>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<style>' +
          ':root {' +
            '--bg-primary: #000000;' +
            '--bg-secondary: #111111;' +
            '--text-primary: #ffffff;' +
            '--text-secondary: #808080;' +
            '--accent: #005288;' +
            '--accent-hover: #006bb3;' +
            '--border: #1a1a1a;' +
            '--overlay: rgba(0, 0, 0, 0.8);' +
          '}' +
          'body {' +
            'font-family: \'SF Pro Display\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;' +
            'margin: 0;' +
            'padding: 20px;' +
            'background-color: var(--bg-primary);' +
            'color: var(--text-primary);' +
            'line-height: 1.6;' +
          '}' +
          '.header {' +
            'display: flex;' +
            'justify-content: space-between;' +
            'align-items: center;' +
            'padding: 20px;' +
            'background-color: var(--bg-secondary);' +
            'border-radius: 12px;' +
            'margin-bottom: 30px;' +
          '}' +
          '.header-buttons {' +
            'display: flex;' +
            'gap: 10px;' +
          '}' +
          '.button {' +
            'background-color: var(--accent);' +
            'color: var(--text-primary);' +
            'border: none;' +
            'padding: 10px 20px;' +
            'border-radius: 8px;' +
            'cursor: pointer;' +
            'font-weight: 500;' +
            'transition: background-color 0.3s ease;' +
          '}' +
          '.button:hover {' +
            'background-color: var(--accent-hover);' +
          '}' +
          '.events-grid {' +
            'display: grid;' +
            'grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));' +
            'gap: 20px;' +
          '}' +
          '.event-card {' +
            'background-color: var(--bg-secondary);' +
            'border-radius: 12px;' +
            'padding: 20px;' +
            'transition: transform 0.3s ease;' +
            'cursor: pointer;' +
          '}' +
          '.event-card:hover {' +
            'transform: translateY(-5px);' +
          '}' +
          '.event-details {' +
            'margin-bottom: 15px;' +
          '}' +
          '.event-details div {' +
            'margin-bottom: 8px;' +
            'color: var(--text-secondary);' +
          '}' +
          '.event-details div:first-child {' +
            'color: var(--text-primary);' +
            'font-size: 1.2em;' +
            'font-weight: 500;' +
          '}' +
          '.event-images {' +
            'display: grid;' +
            'grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));' +
            'gap: 10px;' +
            'margin-top: 15px;' +
          '}' +
          '.event-image {' +
            'width: 100%;' +
            'height: 150px;' +
            'object-fit: cover;' +
            'border-radius: 8px;' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<h1>' + site.name + ' - Events</h1>' +
          '<div class="header-buttons">' +
            '<button class="button" onclick="window.location.href=\'/\'">Back to Dashboard</button>' +
          '</div>' +
        '</div>' +
        '<div class="events-grid">' +
          events.map(event => (
            '<div class="event-card">' +
              '<div class="event-details">' +
                '<div>License Plate: ' + event.licensePlate + '</div>' +
                '<div>Date: ' + event.dateTime + '</div>' +
                '<div>Type: ' + event.eventType + '</div>' +
                '<div>Country: ' + (event.country || 'N/A') + '</div>' +
                '<div>Lane: ' + (event.lane || 'N/A') + '</div>' +
                '<div>Direction: ' + (event.direction || 'N/A') + '</div>' +
                '<div>Confidence: ' + (event.confidenceLevel || 'N/A') + '</div>' +
              '</div>' +
              '<div class="event-images">' +
                (event.licensePlateImage ? '<img class="event-image" src="/uploads/' + event.licensePlateImage + '" alt="License Plate">' : '') +
                (event.vehicleImage ? '<img class="event-image" src="/uploads/' + event.vehicleImage + '" alt="Vehicle">' : '') +
                (event.detectionImage ? '<img class="event-image" src="/uploads/' + event.detectionImage + '" alt="Detection">' : '') +
              '</div>' +
            '</div>'
          )).join('') +
        '</div>' +
      '</body>' +
      '</html>');
  } catch (error) {
    console.error('Error rendering cameras page:', error);
    res.status(500).send('Internal server error');
  }
});

app.get('/site/:id', async (req, res) => {
  try {
    const siteId = req.params.id;
    const site = await db.getSiteById(siteId);
    
    if (!site) {
      return res.status(404).send('Site not found');
    }

    const filters = {
      licensePlate: req.query.licensePlate,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      siteId: siteId,
      limit: 100
    };

    const events = await db.getAllEvents(filters);

    res.send('<!DOCTYPE html>' +
      '<html>' +
      '<head>' +
        '<title>Vehicle Detection Events & Site Management - NOC Dashboard</title>' +
        '<meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<style>' +
          ':root {' +
            '--bg-primary: #000000;' +
            '--bg-secondary: #111111;' +
            '--text-primary: #ffffff;' +
            '--text-secondary: #808080;' +
            '--accent: #005288;' +
            '--accent-hover: #006bb3;' +
            '--border: #1a1a1a;' +
            '--success: #00c853;' +
            '--danger: #ff3d00;' +
          '}' +
          'body {' +
            'font-family: \'SF Pro Display\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;' +
            'margin: 0;' +
            'padding: 20px;' +
            'background-color: var(--bg-primary);' +
            'color: var(--text-primary);' +
            'line-height: 1.6;' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<h1>' + site.name + ' - Events</h1>' +
          '<div class="header-buttons">' +
            '<button class="button" onclick="window.location.href=\'/\'">Back to Dashboard</button>' +
          '</div>' +
        '</div>' +
        '<div class="events-grid">' +
          events.map(event => (
            '<div class="event-card">' +
              '<div class="event-details">' +
                '<div>License Plate: ' + event.licensePlate + '</div>' +
                '<div>Date: ' + event.dateTime + '</div>' +
                '<div>Type: ' + event.eventType + '</div>' +
              '</div>' +
            '</div>'
          )).join('') +
        '</div>' +
      '</body>' +
      '</html>');
  } catch (error) {
    console.error('Error rendering site page:', error);
    res.status(500).send('Internal server error');
  }
});

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

app.post(['/', '/hik'], upload.fields([
  { name: 'licensePlateImage', maxCount: 1 },
  { name: 'vehicleImage', maxCount: 1 },
  { name: 'detectionImage', maxCount: 1 }
]), async (req, res) => {
  try {
    // Extract query parameters
    const {
      channelID,
      dateTime,
      eventType,
      country,
      licensePlate,
      lane,
      direction,
      confidenceLevel,
      macAddress
    } = req.query;

    // Validate required parameters
    if (!channelID || !dateTime || !eventType || !licensePlate) {
      return res.status(400).json({
        error: 'Missing required parameters'
      });
    }

    // Get the uploaded files from all possible fields
    const uploadedFiles = {
      licensePlate: req.files?.['licensePlatePicture.jpg']?.[0],
      vehicle: req.files?.['vehiclePicture.jpg']?.[0],
      detection: req.files?.['detectionPicture.jpg']?.[0]
    };

    // Use the first available image file
    const uploadedFile = uploadedFiles.licensePlate || uploadedFiles.vehicle || uploadedFiles.detection;

    // Create event object with all data
    const event = {
      channelID,
      dateTime,
      eventType,
      country,
      licensePlate,
      lane,
      direction,
      confidenceLevel,
      macAddress,
      imageFile: uploadedFile ? uploadedFile.filename : null,
      // Store all image files if available
      images: {
        licensePlate: uploadedFiles.licensePlate?.filename || null,
        vehicle: uploadedFiles.vehicle?.filename || null,
        detection: uploadedFiles.detection?.filename || null
      }
    };

    // Save event to database
    await db.insertEvent(event);

    // Log the event
    console.log('Received vehicle detection event:', event);

    // Send success response
    res.status(200).json({
      status: 'success',
      message: 'Vehicle detection event processed successfully',
      event
    });
  } catch (error) {
    console.error('Error processing vehicle detection event:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});