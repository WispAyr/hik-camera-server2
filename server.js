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
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Sites - Vehicle Detection System</title>
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
            --overlay: rgba(0, 0, 0, 0.8);
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
          .button {
            background-color: var(--accent);
            color: var(--text-primary);
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.3s ease;
          }
          .button:hover {
            background-color: var(--accent-hover);
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
            transition: transform 0.3s ease;
          }
          .site-card:hover {
            transform: translateY(-5px);
          }
          .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: var(--overlay);
            z-index: 1000;
          }
          .modal-content {
            background-color: var(--bg-secondary);
            margin: 15% auto;
            padding: 20px;
            border-radius: 12px;
            width: 80%;
            max-width: 500px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          .form-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--text-secondary);
          }
          .form-group input,
          .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background-color: var(--bg-primary);
            color: var(--text-primary);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Manage Sites</h1>
          <div class="header-buttons">
            <button class="button" onclick="window.location.href='/'">Back to Dashboard</button>
            <button class="button" onclick="showAddSiteModal()">Add New Site</button>
          </div>
        </div>

        <div class="sites-grid">
          ${sites.map(site => `
            <div class="site-card">
              <h3>${site.name}</h3>
              <p>${site.description || 'No description'}</p>
              <p>Events: ${site.eventCount || 0}</p>
              <p>Last Detection: ${site.lastDetection || 'N/A'}</p>
              <button class="button" onclick="editSite(${site.id})">Edit</button>
              <button class="button" onclick="deleteSite(${site.id})">Delete</button>
            </div>
          `).join('')}
        </div>

        <div id="addSiteModal" class="modal">
          <div class="modal-content">
            <h2>Add New Site</h2>
            <form id="addSiteForm" onsubmit="submitSite(event)">
              <div class="form-group">
                <label for="siteName">Site Name</label>
                <input type="text" id="siteName" required>
              </div>
              <div class="form-group">
                <label for="siteDescription">Description</label>
                <textarea id="siteDescription" rows="3"></textarea>
              </div>
              <button type="submit" class="button">Add Site</button>
              <button type="button" class="button" onclick="hideAddSiteModal()">Cancel</button>
            </form>
          </div>
        </div>

        <div id="editSiteModal" class="modal">
          <div class="modal-content">
            <h2>Edit Site</h2>
            <form id="editSiteForm" onsubmit="submitEditSite(event)">
              <input type="hidden" id="editSiteId">
              <div class="form-group">
                <label for="editSiteName">Site Name</label>
                <input type="text" id="editSiteName" required>
              </div>
              <div class="form-group">
                <label for="editSiteDescription">Description</label>
                <textarea id="editSiteDescription" rows="3"></textarea>
              </div>
              <button type="submit" class="button">Save Changes</button>
              <button type="button" class="button" onclick="hideEditSiteModal()">Cancel</button>
            </form>
          </div>
        </div>

        <script>
          function showAddSiteModal() {
            document.getElementById('addSiteModal').style.display = 'block';
          }

          function hideAddSiteModal() {
            document.getElementById('addSiteModal').style.display = 'none';
          }

          function showEditSiteModal() {
            document.getElementById('editSiteModal').style.display = 'block';
          }

          function hideEditSiteModal() {
            document.getElementById('editSiteModal').style.display = 'none';
          }

          async function editSite(id) {
            try {
              const response = await fetch('/api/sites/' + id, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              if (response.ok) {
                const site = await response.json();
                document.getElementById('editSiteId').value = id;
                document.getElementById('editSiteName').value = site.name;
                document.getElementById('editSiteDescription').value = site.description || '';
                showEditSiteModal();
              } else {
                alert('Error loading site details');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error loading site details');
            }
          }

          async function submitEditSite(event) {
            event.preventDefault();
            const id = document.getElementById('editSiteId').value;
            const name = document.getElementById('editSiteName').value;
            const description = document.getElementById('editSiteDescription').value;

            try {
              const response = await fetch('/api/sites/' + id, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description })
              });

              if (response.ok) {
                window.location.reload();
              } else {
                alert('Error updating site');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error updating site');
            }
          }

          async function submitSite(event) {
            event.preventDefault();
            const name = document.getElementById('siteName').value;
            const description = document.getElementById('siteDescription').value;

            try {
              const response = await fetch('/api/sites', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description })
              });

              if (response.ok) {
                window.location.reload();
              } else {
                alert('Error adding site');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error adding site');
            }
          }

          async function deleteSite(id) {
            if (confirm('Are you sure you want to delete this site?')) {
              try {
                const response = await fetch('/api/sites/' + id, {
                  method: 'DELETE'
                });

                if (response.ok) {
                  window.location.reload();
                } else {
                  alert('Error deleting site');
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error deleting site');
              }
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering sites management page:', error);
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

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Cameras - Vehicle Detection System</title>
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
            --overlay: rgba(0, 0, 0, 0.8);
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
          .button {
            background-color: var(--accent);
            color: var(--text-primary);
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.3s ease;
          }
          .button:hover {
            background-color: var(--accent-hover);
          }
          .cameras-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
          }
          .camera-card {
            background-color: var(--bg-secondary);
            padding: 20px;
            border-radius: 12px;
            transition: transform 0.3s ease;
          }
          .camera-card:hover {
            transform: translateY(-5px);
          }
          .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: var(--overlay);
            z-index: 1000;
          }
          .modal-content {
            background-color: var(--bg-secondary);
            margin: 15% auto;
            padding: 20px;
            border-radius: 12px;
            width: 80%;
            max-width: 500px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          .form-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--text-secondary);
          }
          .form-group input,
          .form-group select,
          .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background-color: var(--bg-primary);
            color: var(--text-primary);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Manage Cameras</h1>
          <div class="header-buttons">
            <button class="button" onclick="window.location.href='/'">Back to Dashboard</button>
            <button class="button" onclick="showAddCameraModal()">Add New Camera</button>
          </div>
        </div>

        <div class="cameras-grid">
          ${cameras.map(camera => `
            <div class="camera-card">
              <h3>${camera.name || camera.channelID}</h3>
              <p>Channel ID: ${camera.channelID}</p>
              <p>MAC Address: ${camera.macAddress || 'N/A'}</p>
              <p>Description: ${camera.description || 'No description'}</p>
              <p>Site: ${sites.find(site => site.id === camera.site_id)?.name || 'Unassigned'}</p>
              <button class="button" onclick="editCamera(${camera.id})">Edit</button>
              <button class="button" onclick="deleteCamera(${camera.id})">Delete</button>
            </div>
          `).join('')}
        </div>

        <div id="addCameraModal" class="modal">
          <div class="modal-content">
            <h2>Add New Camera</h2>
            <form id="addCameraForm" onsubmit="submitCamera(event)">
              <div class="form-group">
                <label for="channelID">Channel ID*</label>
                <input type="text" id="channelID" required>
              </div>
              <div class="form-group">
                <label for="macAddress">MAC Address</label>
                <input type="text" id="macAddress">
              </div>
              <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name">
              </div>
              <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" rows="3"></textarea>
              </div>
              <div class="form-group">
                <label for="site_id">Site*</label>
                <select id="site_id" required>
                  <option value="">Select a site</option>
                  ${sites.map(site => `
                    <option value="${site.id}">${site.name}</option>
                  `).join('')}
                </select>
              </div>
              <button type="submit" class="button">Add Camera</button>
              <button type="button" class="button" onclick="hideAddCameraModal()">Cancel</button>
            </form>
          </div>
        </div>

        <div id="editCameraModal" class="modal">
          <div class="modal-content">
            <h2>Edit Camera</h2>
            <form id="editCameraForm" onsubmit="submitEditCamera(event)">
              <input type="hidden" id="editCameraId">
              <div class="form-group">
                <label for="editName">Name</label>
                <input type="text" id="editName">
              </div>
              <div class="form-group">
                <label for="editDescription">Description</label>
                <textarea id="editDescription" rows="3"></textarea>
              </div>
              <div class="form-group">
                <label for="editSiteId">Site</label>
                <select id="editSiteId" required>
                  ${sites.map(site => `
                    <option value="${site.id}">${site.name}</option>
                  `).join('')}
                </select>
              </div>
              <button type="submit" class="button">Save Changes</button>
              <button type="button" class="button" onclick="hideEditCameraModal()">Cancel</button>
            </form>
          </div>
        </div>

        <script>
          function showAddCameraModal() {
            document.getElementById('addCameraModal').style.display = 'block';
          }

          function hideAddCameraModal() {
            document.getElementById('addCameraModal').style.display = 'none';
          }

          function showEditCameraModal() {
            document.getElementById('editCameraModal').style.display = 'block';
          }

          function hideEditCameraModal() {
            document.getElementById('editCameraModal').style.display = 'none';
          }

          async function editCamera(id) {
            try {
              const response = await fetch('/api/cameras/' + id);
              if (response.ok) {
                const camera = await response.json();
                document.getElementById('editCameraId').value = camera.id;
                document.getElementById('editName').value = camera.name || '';
                document.getElementById('editDescription').value = camera.description || '';
                document.getElementById('editSiteId').value = camera.site_id || '';
                showEditCameraModal();
              } else {
                alert('Error loading camera details');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error loading camera details');
            }
          }

          async function submitEditCamera(event) {
            event.preventDefault();
            const id = document.getElementById('editCameraId').value;
            const name = document.getElementById('editName').value;
            const description = document.getElementById('editDescription').value;
            const site_id = document.getElementById('editSiteId').value;

            try {
              const response = await fetch('/api/cameras/' + id, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, description, site_id })
              });

              if (response.ok) {
                window.location.reload();
              } else {
                alert('Error updating camera');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error updating camera');
            }
          }

          async function submitCamera(event) {
            event.preventDefault();
            const channelID = document.getElementById('channelID').value;
            const macAddress = document.getElementById('macAddress').value;
            const name = document.getElementById('name').value;
            const description = document.getElementById('description').value;
            const site_id = document.getElementById('site_id').value;

            try {
              const response = await fetch('/api/cameras', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ channelID, macAddress, name, description, site_id })
              });

              if (response.ok) {
                window.location.reload();
              } else {
                alert('Error adding camera');
              }
            } catch (error) {
              console.error('Error:', error);
              alert('Error adding camera');
            }
          }

          async function deleteCamera(id) {
            if (confirm('Are you sure you want to delete this camera?')) {
              try {
                const response = await fetch('/api/cameras/' + id, {
                  method: 'DELETE'
                });

                if (response.ok) {
                  window.location.reload();
                } else {
                  alert('Error deleting camera');
                }
              } catch (error) {
                console.error('Error:', error);
                alert('Error deleting camera');
              }
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering cameras management page:', error);
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

  // Generate HTML content
  const sitePageHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Vehicle Detection Events & Site Management - NOC Dashboard</title>
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
          --success: #00c853;
          --danger: #ff3d00;
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
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
          background-color: var(--bg-secondary);
          border-radius: 12px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .site-management, .camera-management {
          background-color: var(--bg-secondary);
          padding: 30px;
          border-radius: 12px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .site-card, .camera-card {
          background-color: var(--bg-primary);
          padding: 20px;
          border-radius: 12px;
          border: 1px solid var(--border);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .site-card:hover, .camera-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
        }
        .site-card h3, .camera-card h4 {
          margin: 0 0 15px 0;
          color: var(--accent);
          font-size: 1.4em;
          letter-spacing: 0.5px;
        }
        .site-list, .camera-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        button.edit {
          background-color: var(--accent);
          color: white;
        }
        button.edit:hover {
          background-color: var(--accent-hover);
        }
        button.delete {
          background-color: var(--danger);
          color: white;
        }
        button.delete:hover {
          opacity: 0.9;
        }
        input, select {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        input:focus, select:focus {
          outline: none;
          border-color: var(--accent);
        }
        .clock {
          font-size: 1.8em;
          font-weight: 600;
          color: var(--accent);
          text-shadow: 0 0 10px rgba(0, 82, 136, 0.3);
        }
        .event {
          background-color: var(--bg-primary);
          border: 1px solid var(--border);
          margin: 15px 0;
          padding: 20px;
          border-radius: 12px;
          transition: transform 0.3s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .event:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
        }
        .event img {
          max-width: 300px;
          height: auto;
          margin: 10px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
      </style>
      <script>
        function updateClock() {
          const now = new Date();
          const clock = document.getElementById('clock');
          clock.textContent = now.toLocaleString();
        }

        async function loadSites() {
          try {
            const response = await fetch('/api/sites');
            const sites = await response.json();
            const siteList = document.getElementById('siteList');
            const cameraSiteId = document.getElementById('cameraSiteId');
            
            // Update site list
            siteList.innerHTML = sites.map(site => 
              '<div class="site-card" data-id="' + site.id + '">' +
                '<h3>' + site.name + '</h3>' +
                '<p>' + (site.description || 'No description') + '</p>' +
                '<p>Events: ' + (site.eventCount || 0) + '</p>' +
                '<p>Last Detection: ' + (site.lastDetection || 'N/A') + '</p>' +
                '<div class="actions">' +
                  '<button class="edit" onclick="editSite(' + site.id + ')">Edit</button>' +
                  '<button class="delete" onclick="deleteSite(' + site.id + ')">Delete</button>' +
                '</div>' +
              '</div>'
            ).join('');
            
            // Update site select in camera form
            cameraSiteId.innerHTML = '<option value="">Select Site</option>' + 
              sites.map(site => 
                '<option value="' + site.id + '">' + site.name + '</option>'
              ).join('');
            
            // Load cameras for all sites
            loadCameras();
          } catch (error) {
            console.error('Error loading sites:', error);
          }
        }
        
        async function loadCameras() {
          try {
            const response = await fetch('/api/cameras');
            const cameras = await response.json();
            const cameraList = document.getElementById('cameraList');
            
            cameraList.innerHTML = cameras.map(camera => 
              '<div class="camera-card" data-id="' + camera.id + '">' +
                '<h4>' + (camera.name || camera.channelID) + '</h4>' +
                '<p>Channel ID: ' + camera.channelID + '</p>' +
                '<p>MAC Address: ' + (camera.macAddress || 'N/A') + '</p>' +
                '<p>' + (camera.description || 'No description') + '</p>' +
                '<div class="actions">' +
                  '<button class="edit" onclick="editCamera(' + camera.id + ')">Edit</button>' +
                  '<button class="delete" onclick="deleteCamera(' + camera.id + ')">Delete</button>' +
                '</div>' +
              '</div>'
            ).join('');
          } catch (error) {
            console.error('Error loading cameras:', error);
          }
        }
        
        async function addCamera() {
          const channelID = document.getElementById('cameraChannelID').value.trim();
          const macAddress = document.getElementById('cameraMacAddress').value.trim();
          const name = document.getElementById('cameraName').value.trim();
          const description = document.getElementById('cameraDescription').value.trim();
          const site_id = document.getElementById('cameraSiteId').value;
          
          if (!channelID || !site_id) {
            return alert('Channel ID and Site are required');
          }
          
          try {
            await fetch('/api/cameras', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelID, macAddress, name, description, site_id })
            });
            
            // Clear form
            document.getElementById('cameraChannelID').value = '';
            document.getElementById('cameraMacAddress').value = '';
            document.getElementById('cameraName').value = '';
            document.getElementById('cameraDescription').value = '';
            document.getElementById('cameraSiteId').value = '';
            
            // Reload cameras
            loadCameras();
          } catch (error) {
            console.error('Error adding camera:', error);
            alert('Error adding camera');
          }
        }
        
        async function editCamera(id) {
          const name = prompt('Enter new camera name:');
          if (!name) return;
          const description = prompt('Enter new camera description:');
          const site_id = prompt('Enter new site ID:');
          
          try {
            await fetch('/api/cameras/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description, site_id })
            });
            loadCameras();
          } catch (error) {
            console.error('Error updating camera:', error);
            alert('Failed to update camera');
          }
        }
        
        async function deleteCamera(id) {
          if (!confirm('Are you sure you want to delete this camera?')) {
            return;
          }
          
          try {
            await fetch('/api/cameras/' + id, {
              method: 'DELETE'
            });
            
            // Reload cameras
            loadCameras();
          } catch (error) {
            console.error('Error deleting camera:', error);
            alert('Failed to delete camera');
          }
        }
        
        // Initialize clock and data
        setInterval(updateClock, 1000);
        updateClock();
        loadSites();
      </script>
    </head>
    <body>
      <div class="header">
        <div>
          <a href="/" style="color: var(--text-primary); text-decoration: none;">
            <h1>← Back to Sites</h1>
          </a>
          <h2>${site.name} - Events</h2>
        </div>
        <div id="clock" class="clock"></div>
      </div>

      <div class="filters">
        <form action="" method="GET">
          <input type="text" name="licensePlate" placeholder="License Plate" value="${req.query.licensePlate || ''}">
          <input type="datetime-local" name="dateFrom" value="${req.query.dateFrom || ''}">
          <input type="datetime-local" name="dateTo" value="${req.query.dateTo || ''}">
          <button type="submit">Apply Filters</button>
        </form>
      </div>

      <div class="events">
        ${events.map(event => `
          <div class="event">
            <h3>License Plate: ${event.licensePlate}</h3>
            <p>Date: ${new Date(event.dateTime).toLocaleString()}</p>
            <p>Event Type: ${event.eventType}</p>
            <p>Direction: ${event.direction || 'N/A'}</p>
            <p>Confidence: ${event.confidenceLevel || 'N/A'}</p>
            ${event.licensePlateImage ? `<img src="/uploads/${event.licensePlateImage}" alt="License Plate">` : ''}
            ${event.vehicleImage ? `<img src="/uploads/${event.vehicleImage}" alt="Vehicle">` : ''}
            ${event.detectionImage ? `<img src="/uploads/${event.detectionImage}" alt="Detection">` : ''}
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;

  res.send(html);

  // Generate HTML content
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Vehicle Detection Events & Site Management - NOC Dashboard</title>
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
          --success: #00c853;
          --danger: #ff3d00;
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
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
          background-color: var(--bg-secondary);
          border-radius: 12px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .site-management, .camera-management {
          background-color: var(--bg-secondary);
          padding: 30px;
          border-radius: 12px;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .site-card, .camera-card {
          background-color: var(--bg-primary);
          padding: 20px;
          border-radius: 12px;
          border: 1px solid var(--border);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .site-card:hover, .camera-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
        }
        .site-card h3, .camera-card h4 {
          margin: 0 0 15px 0;
          color: var(--accent);
          font-size: 1.4em;
          letter-spacing: 0.5px;
        }
        .site-list, .camera-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        button.edit {
          background-color: var(--accent);
          color: white;
        }
        button.edit:hover {
          background-color: var(--accent-hover);
        }
        button.delete {
          background-color: var(--danger);
          color: white;
        }
        button.delete:hover {
          opacity: 0.9;
        }
        input, select {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background-color: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        input:focus, select:focus {
          outline: none;
          border-color: var(--accent);
        }
        .clock {
          font-size: 1.8em;
          font-weight: 600;
          color: var(--accent);
          text-shadow: 0 0 10px rgba(0, 82, 136, 0.3);
        }
        .event {
          background-color: var(--bg-primary);
          border: 1px solid var(--border);
          margin: 15px 0;
          padding: 20px;
          border-radius: 12px;
          transition: transform 0.3s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .event:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
        }
        .event img {
          max-width: 300px;
          height: auto;
          margin: 10px;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
      </style>
      <script>
        function updateClock() {
          const now = new Date();
          const clock = document.getElementById('clock');
          clock.textContent = now.toLocaleString();
        }

        async function loadSites() {
          try {
            const response = await fetch('/api/sites');
            const sites = await response.json();
            const siteList = document.getElementById('siteList');
            const cameraSiteId = document.getElementById('cameraSiteId');
            
            // Update site list
            siteList.innerHTML = sites.map(site => 
              '<div class="site-card" data-id="' + site.id + '">' +
                '<h3>' + site.name + '</h3>' +
                '<p>' + (site.description || 'No description') + '</p>' +
                '<p>Events: ' + (site.eventCount || 0) + '</p>' +
                '<p>Last Detection: ' + (site.lastDetection || 'N/A') + '</p>' +
                '<div class="actions">' +
                  '<button class="edit" onclick="editSite(' + site.id + ')">Edit</button>' +
                  '<button class="delete" onclick="deleteSite(' + site.id + ')">Delete</button>' +
                '</div>' +
              '</div>'
            ).join('');
            
            // Update site select in camera form
            cameraSiteId.innerHTML = '<option value="">Select Site</option>' + 
              sites.map(site => 
                '<option value="' + site.id + '">' + site.name + '</option>'
              ).join('');
            
            // Load cameras for all sites
            loadCameras();
          } catch (error) {
            console.error('Error loading sites:', error);
          }
        }
        
        async function loadCameras() {
          try {
            const response = await fetch('/api/cameras');
            const cameras = await response.json();
            const cameraList = document.getElementById('cameraList');
            
            cameraList.innerHTML = cameras.map(camera => 
              '<div class="camera-card" data-id="' + camera.id + '">' +
                '<h4>' + (camera.name || camera.channelID) + '</h4>' +
                '<p>Channel ID: ' + camera.channelID + '</p>' +
                '<p>MAC Address: ' + (camera.macAddress || 'N/A') + '</p>' +
                '<p>' + (camera.description || 'No description') + '</p>' +
                '<div class="actions">' +
                  '<button class="edit" onclick="editCamera(' + camera.id + ')">Edit</button>' +
                  '<button class="delete" onclick="deleteCamera(' + camera.id + ')">Delete</button>' +
                '</div>' +
              '</div>'
            ).join('');
          } catch (error) {
            console.error('Error loading cameras:', error);
          }
        }
        
        async function addCamera() {
          const channelID = document.getElementById('cameraChannelID').value.trim();
          const macAddress = document.getElementById('cameraMacAddress').value.trim();
          const name = document.getElementById('cameraName').value.trim();
          const description = document.getElementById('cameraDescription').value.trim();
          const site_id = document.getElementById('cameraSiteId').value;
          
          if (!channelID || !site_id) {
            return alert('Channel ID and Site are required');
          }
          
          try {
            await fetch('/api/cameras', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelID, macAddress, name, description, site_id })
            });
            
            // Clear form
            document.getElementById('cameraChannelID').value = '';
            document.getElementById('cameraMacAddress').value = '';
            document.getElementById('cameraName').value = '';
            document.getElementById('cameraDescription').value = '';
            document.getElementById('cameraSiteId').value = '';
            
            // Reload cameras
            loadCameras();
          } catch (error) {
            console.error('Error creating camera:', error);
            alert('Failed to create camera');
          }
        }
        
        async function editCamera(id) {
          const name = prompt('Enter new camera name:');
          if (!name) return;
          const description = prompt('Enter new camera description:');
          const site_id = prompt('Enter new site ID:');
          
          try {
            await fetch('/api/cameras/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description, site_id })
            });
            loadCameras();
          } catch (error) {
            console.error('Error updating camera:', error);
            alert('Failed to update camera');
          }
        }
        
        async function deleteCamera(id) {
          if (!confirm('Are you sure you want to delete this camera?')) return;
          
          try {
            await fetch('/api/cameras/' + id, {
              method: 'DELETE'
            });
            
            // Reload cameras
            loadCameras();
          } catch (error) {
            console.error('Error deleting camera:', error);
            alert('Failed to delete camera');
          }
        }

        async function createSite() {
          const nameInput = document.getElementById('siteName');
          const descInput = document.getElementById('siteDescription');
          const name = nameInput.value.trim();
          const description = descInput.value.trim();

          if (!name) return alert('Site name is required');

          try {
            await fetch('/api/sites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description })
            });
            nameInput.value = '';
            descInput.value = '';
            loadSites();
          } catch (error) {
            console.error('Error creating site:', error);
            alert('Failed to create site');
          }
        }

        async function editSite(id) {
          const name = prompt('Enter new site name:');
          if (!name) return;
          const description = prompt('Enter new site description:');

          try {
            await fetch('/api/sites/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description })
            });
            loadSites();
          } catch (error) {
            console.error('Error updating site:', error);
            alert('Failed to update site');
          }
        }

        async function deleteSite(id) {
          if (!confirm('Are you sure you want to delete this site?')) return;

          try {
            await fetch('/api/sites/' + id, { method: 'DELETE' });
            loadSites();
          } catch (error) {
            console.error('Error deleting site:', error);
            alert('Failed to delete site');
          }
        }

        // Add site loading to initialization
        function initializeRealtime() {
          // Update clock every second
          setInterval(updateClock, 1000);
          
          // Load sites immediately and refresh every 30 seconds
          loadSites();
          setInterval(loadSites, 30000);

          // Fetch new events every 5 seconds
          setInterval(() => {
            fetch(window.location.href)
              .then(response => response.text())
              .then(html => {
                const parser = new DOMParser();
                const newDoc = parser.parseFromString(html, 'text/html');
                const currentGrid = document.querySelector('.camera-grid');
                const newGrid = newDoc.querySelector('.camera-grid');
                if (newGrid) {
                  currentGrid.innerHTML = newGrid.innerHTML;
                }
              });
          }, 5000);
        }
      </script>
    </head>
    <body onload="initializeRealtime()">
      <div class="header">
        <h1>Vehicle Detection Events & Site Management</h1>
        <div id="clock" class="clock"></div>
        <div class="site-management">
          <h2>Site Management</h2>
          <div class="site-form">
            <input type="text" id="siteName" placeholder="Site Name" required>
            <input type="text" id="siteDescription" placeholder="Site Description">
            <button onclick="createSite()">Add Site</button>
          </div>
          <div id="siteList" class="site-list"></div>
          <div class="camera-management">
            <h3>Camera Management</h3>
            <div class="camera-form">
              <input type="text" id="cameraChannelID" placeholder="Channel ID" required>
              <input type="text" id="cameraMacAddress" placeholder="MAC Address">
              <input type="text" id="cameraName" placeholder="Camera Name">
              <input type="text" id="cameraDescription" placeholder="Camera Description">
              <select id="cameraSiteId" required>
                <option value="">Select Site</option>
              </select>
              <button onclick="addCamera()">Add Camera</button>
            </div>
            <div id="cameraList" class="camera-list"></div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
  } catch (error) {
    console.error('Error rendering dashboard:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Get license plate from query params for filename
    const licensePlate = req.query.licensePlate || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExt = path.extname(file.originalname);
    // Create filename with license plate and timestamp
    const filename = `${licensePlate}_${timestamp}${fileExt}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept only jpeg images
    if (file.mimetype !== 'image/jpeg') {
      return cb(new Error('Only JPEG images are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// Handle vehicle detection events for both root and /hik paths
app.post(['/', '/hik'], upload.fields([
  { name: 'licensePlatePicture.jpg', maxCount: 1 },
  { name: 'vehiclePicture.jpg', maxCount: 1 },
  { name: 'detectionPicture.jpg', maxCount: 1 }
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