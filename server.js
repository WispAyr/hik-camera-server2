const express = require('express');
const multer = require('multer');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const WebSocket = require('ws');

// Initialize express apps
const webApp = express();
const eventApp = express();
const hikApp = express(); // New app for HIK camera events

// Parse JSON bodies
webApp.use(express.json());
eventApp.use(express.json());
hikApp.use(express.json());

// Add logging middleware only for POST requests
const morganMiddleware = morgan('combined', {
  skip: function (req, res) { 
    return req.method === 'GET' || res.statusCode < 400;
  }
});

webApp.use(morganMiddleware);
eventApp.use(morganMiddleware);
hikApp.use(morganMiddleware);

// Create HTTP servers
const webServer = require('http').createServer(webApp);
const eventServer = require('http').createServer(eventApp);
const hikServer = require('http').createServer(hikApp);

// Initialize WebSocket server on the event server
const wss = new WebSocket.Server({ server: eventServer });

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

// Serve static files from uploads directory
webApp.use('/uploads', express.static('uploads'));

// Start servers on different ports
const startServers = async () => {
  try {
    await new Promise((resolve) => webServer.listen(3000, () => {
      console.log('Web UI server running on port 3000');
      resolve();
    }));

    await new Promise((resolve) => eventServer.listen(8080, () => {
      console.log('Event/WebSocket server running on port 8080');
      resolve();
    }));

    await new Promise((resolve) => hikServer.listen(9001, () => {
      console.log('HIK camera event server running on port 9001');
      resolve();
    }));
  } catch (error) {
    console.error('Error starting servers:', error);
    shutdownServers();
  }
};

startServers();

// Configure HIK camera event endpoints
const handleVehicleDetection = async (req, res) => {
  try {
    // Extract event data from query parameters
    const eventData = {
      channelID: req.query.channelID,
      dateTime: req.query.dateTime,
      eventType: req.query.eventType,
      country: req.query.country,
      licensePlate: req.query.licensePlate,
      lane: req.query.lane,
      direction: req.query.direction,
      confidenceLevel: req.query.confidenceLevel,
      macAddress: req.query.macAddress
    };

    // Store event in database
    const eventId = await db.insertEvent(eventData);

    // Broadcast event to connected WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        sendDashboardData(client);
      }
    });

    res.status(200).json({ success: true, eventId });
  } catch (error) {
    console.error('Error processing HIK event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Handle events on both root path and /hik endpoint
hikApp.post('/', handleVehicleDetection);
hikApp.post('/hik', handleVehicleDetection);

// Site management endpoints on web server
webApp.get('/api/sites/:id', async (req, res) => {
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
webApp.get('/api/cameras', async (req, res) => {
  try {
    const siteId = req.query.siteId;
    const cameras = await db.getCameras(siteId);
    res.json(cameras);
  } catch (error) {
    console.error('Error fetching cameras:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

webApp.post('/api/cameras', async (req, res) => {
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

webApp.put('/api/cameras/:id', async (req, res) => {
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

webApp.delete('/api/cameras/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteCamera(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting camera:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

webApp.post('/api/sites', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Site name is required' });
    }
    const siteId = await db.createOrGetSite(name, description);
    
    // Broadcast dashboard update to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        sendDashboardData(client);
      }
    });
    
    res.status(201).json({ id: siteId, name, description });
  } catch (error) {
    console.error('Error creating site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

webApp.put('/api/sites/:id', async (req, res) => {
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

webApp.delete('/api/sites/:id', async (req, res) => {
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
webApp.get('/manage-sites', async (req, res) => {
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
            '--success: #4CAF50;' +
            '--error: #f44336;' +
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
          '.sites-grid {' +
            'display: grid;' +
            'grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));' +
            'gap: 20px;' +
            'margin-top: 20px;' +
          '}' +
          '.site-card {' +
            'background-color: var(--bg-secondary);' +
            'padding: 20px;' +
            'border-radius: 12px;' +
            'position: relative;' +
          '}' +
          '.site-form {' +
            'background-color: var(--bg-secondary);' +
            'padding: 20px;' +
            'border-radius: 12px;' +
            'margin-bottom: 20px;' +
          '}' +
          '.form-group {' +
            'margin-bottom: 15px;' +
          '}' +
          '.form-group label {' +
            'display: block;' +
            'margin-bottom: 5px;' +
          '}' +
          '.form-group input, .form-group textarea {' +
            'width: 100%;' +
            'padding: 8px;' +
            'border-radius: 4px;' +
            'border: 1px solid var(--border);' +
            'background-color: var(--bg-primary);' +
            'color: var(--text-primary);' +
          '}' +
          '.delete-button {' +
            'background-color: var(--error);' +
            'color: var(--text-primary);' +
            'border: none;' +
            'padding: 5px 10px;' +
            'border-radius: 4px;' +
            'cursor: pointer;' +
            'position: absolute;' +
            'top: 10px;' +
            'right: 10px;' +
          '}' +
          '.notification {' +
            'position: fixed;' +
            'bottom: 20px;' +
            'right: 20px;' +
            'padding: 15px;' +
            'border-radius: 8px;' +
            'color: var(--text-primary);' +
            'display: none;' +
          '}' +
          '.notification.success {' +
            'background-color: var(--success);' +
          '}' +
          '.notification.error {' +
            'background-color: var(--error);' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<h1>Manage Sites</h1>' +
          '<div class="header-buttons">' +
            '<button class="button" onclick="window.location.href=\'/\'">' +
              'Back to Dashboard' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="site-form">' +
          '<h2>Add New Site</h2>' +
          '<form id="addSiteForm">' +
            '<div class="form-group">' +
              '<label for="siteName">Site Name</label>' +
              '<input type="text" id="siteName" required>' +
            '</div>' +
            '<div class="form-group">' +
              '<label for="siteDescription">Description</label>' +
              '<textarea id="siteDescription" rows="3"></textarea>' +
            '</div>' +
            '<button type="submit" class="button">Add Site</button>' +
          '</form>' +
        '</div>' +

        '<div class="sites-grid">' +
          sites.map(site => (
            '<div class="site-card">' +
              '<button class="delete-button" onclick="deleteSite(' + site.id + ')">Delete</button>' +
              '<h3>' + site.name + '</h3>' +
              '<p>' + (site.description || 'No description') + '</p>' +
              '<div>Events: ' + (site.eventCount || 0) + '</div>' +
              '<div>Last Detection: ' + (site.lastDetection || 'N/A') + '</div>' +
            '</div>'
          )).join('') +
        '</div>' +

        '<div id="notification" class="notification"></div>' +

        '<script>' +
          'document.getElementById("addSiteForm").addEventListener("submit", async (e) => {' +
            'e.preventDefault();' +
            'const name = document.getElementById("siteName").value;' +
            'const description = document.getElementById("siteDescription").value;' +
            'try {' +
              'const response = await fetch("/api/sites", {' +
                'method: "POST",' +
                'headers: { "Content-Type": "application/json" },' +
                'body: JSON.stringify({ name, description })' +
              '});' +
              'if (response.ok) {' +
                'showNotification("Site added successfully", "success");' +
                'setTimeout(() => window.location.reload(), 1000);' +
              '} else {' +
                'throw new Error("Failed to add site");' +
              '}' +
            '} catch (error) {' +
              'showNotification("Error adding site", "error");' +
            '}' +
          '});' +

          'async function deleteSite(id) {' +
            'if (!confirm("Are you sure you want to delete this site?")) return;' +
            'try {' +
              'const response = await fetch(`/api/sites/${id}`, {' +
                'method: "DELETE"' +
              '});' +
              'if (response.ok) {' +
                'showNotification("Site deleted successfully", "success");' +
                'setTimeout(() => window.location.reload(), 1000);' +
              '} else {' +
                'throw new Error("Failed to delete site");' +
              '}' +
            '} catch (error) {' +
              'showNotification("Error deleting site", "error");' +
            '}' +
          '}' +

          'function showNotification(message, type) {' +
            'const notification = document.getElementById("notification");' +
            'notification.textContent = message;' +
            'notification.className = `notification ${type}`;' +
            'notification.style.display = "block";' +
            'setTimeout(() => {' +
              'notification.style.display = "none";' +
            '}, 3000);' +
          '}' +
        '</script>' +
      '</body>' +
      '</html>');
  } catch (error) {
    console.error('Error rendering sites page:', error);
    res.status(500).send('Internal server error');
  }
});

// Serve HTML content
// Main dashboard showing sites overview
webApp.get('/', async (req, res) => {
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
webApp.get('/manage-cameras', async (req, res) => {
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
            '--success: #4CAF50;' +
            '--error: #f44336;' +
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
          '.cameras-grid {' +
            'display: grid;' +
            'grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));' +
            'gap: 20px;' +
          '}' +
          '.camera-card {' +
            'background-color: var(--bg-secondary);' +
            'padding: 20px;' +
            'border-radius: 12px;' +
            'position: relative;' +
          '}' +
          '.camera-details {' +
            'margin-bottom: 15px;' +
          '}' +
          '.edit-form {' +
            'display: none;' +
            'margin-top: 15px;' +
          '}' +
          '.edit-form.active {' +
            'display: block;' +
          '}' +
          '.form-group {' +
            'margin-bottom: 15px;' +
          '}' +
          '.form-group label {' +
            'display: block;' +
            'margin-bottom: 5px;' +
          '}' +
          '.form-group input, .form-group select {' +
            'width: 100%;' +
            'padding: 8px;' +
            'border-radius: 4px;' +
            'border: 1px solid var(--border);' +
            'background-color: var(--bg-primary);' +
            'color: var(--text-primary);' +
          '}' +
          '.notification {' +
            'position: fixed;' +
            'bottom: 20px;' +
            'right: 20px;' +
            'padding: 15px;' +
            'border-radius: 8px;' +
            'color: var(--text-primary);' +
            'display: none;' +
          '}' +
          '.notification.success {' +
            'background-color: var(--success);' +
          '}' +
          '.notification.error {' +
            'background-color: var(--error);' +
          '}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="header">' +
          '<h1>Manage Cameras</h1>' +
          '<div class="header-buttons">' +
            '<button class="button" onclick="window.location.href=\'/\'">' +
              'Back to Dashboard' +
            '</button>' +
          '</div>' +
        '</div>' +

        '<div class="cameras-grid">' +
          cameras.map(camera => (
            '<div class="camera-card">' +
              '<div class="camera-details">' +
                '<h3>' + (camera.name || camera.channelID) + '</h3>' +
                '<div>Channel ID: ' + camera.channelID + '</div>' +
                '<div>MAC Address: ' + (camera.macAddress || 'N/A') + '</div>' +
                '<div>Status: ' + camera.status + '</div>' +
                '<div>Last Seen: ' + (camera.last_seen || 'N/A') + '</div>' +
                '<button class="button" onclick="toggleEditForm(' + camera.id + ')">Edit</button>' +
              '</div>' +
              '<form id="editForm' + camera.id + '" class="edit-form" onsubmit="updateCamera(event, ' + camera.id + ')">' +
                '<div class="form-group">' +
                  '<label>Name</label>' +
                  '<input type="text" name="name" value="' + (camera.name || '') + '" required>' +
                '</div>' +
                '<div class="form-group">' +
                  '<label>Description</label>' +
                  '<input type="text" name="description" value="' + (camera.description || '') + '">' +
                '</div>' +
                '<div class="form-group">' +
                  '<label>Assign to Site</label>' +
                  '<select name="site_id" required>' +
                    '<option value="">Select a site</option>' +
                    sites.map(site => (
                      '<option value="' + site.id + '"' + (site.id === camera.site_id ? ' selected' : '') + '>' +
                        site.name +
                      '</option>'
                    )).join('') +
                  '</select>' +
                '</div>' +
                '<button type="submit" class="button">Save Changes</button>' +
              '</form>' +
            '</div>'
          )).join('') +
        '</div>' +

        '<div id="notification" class="notification"></div>' +

        '<script>' +
          'function toggleEditForm(cameraId) {' +
            'const form = document.getElementById(`editForm${cameraId}`);' +
            'form.classList.toggle("active");' +
          '}' +

          'async function updateCamera(event, cameraId) {' +
            'event.preventDefault();' +
            'const form = event.target;' +
            'const formData = {' +
              'name: form.name.value,' +
              'description: form.description.value,' +
              'site_id: form.site_id.value' +
            '};' +

            'try {' +
              'const response = await fetch(`/api/cameras/${cameraId}`, {' +
                'method: "PUT",' +
                'headers: { "Content-Type": "application/json" },' +
                'body: JSON.stringify(formData)' +
              '});' +

              'if (response.ok) {' +
                'showNotification("Camera updated successfully", "success");' +
                'setTimeout(() => window.location.reload(), 1000);' +
              '} else {' +
                'throw new Error("Failed to update camera");' +
              '}' +
            '} catch (error) {' +
              'showNotification("Error updating camera", "error");' +
            '}' +
          '}' +

          'function showNotification(message, type) {' +
            'const notification = document.getElementById("notification");' +
            'notification.textContent = message;' +
            'notification.className = `notification ${type}`;' +
            'notification.style.display = "block";' +
            'setTimeout(() => {' +
              'notification.style.display = "none";' +
            '}, 3000);' +
          '}' +
        '</script>' +
      '</body>' +
      '</html>');
  } catch (error) {
    console.error('Error rendering cameras page:', error);
    res.status(500).send('Internal server error');
  }
});

webApp.get('/site/:id', async (req, res) => {
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

eventApp.post(['/', '/hik'], upload.fields([
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
// Error handling middleware for both applications
webApp.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

eventApp.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});