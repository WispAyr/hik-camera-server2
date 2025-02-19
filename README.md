# Vehicle Detection System

A robust HTTP server application designed to handle vehicle detection events from HIK cameras, featuring site management, real-time monitoring, and comprehensive event tracking.

## System Architecture

The system operates on a three-port architecture:
- Port 80: Main HTTP server for web interface and API endpoints
- Port 9000: WebSocket server for real-time updates
- Port 9001: Camera event listener for HIK camera integration

## Features

- **Site Management**
  - Create and manage multiple monitoring sites
  - Assign cameras to specific sites
  - Track site-specific detection statistics

- **Camera Integration**
  - Seamless integration with HIK cameras
  - Automatic camera registration and tracking
  - Real-time status monitoring
  - Support for multiple cameras per site

- **Event Tracking**
  - Capture and store vehicle detection events
  - License plate recognition
  - Vehicle images and detection snapshots
  - Confidence level tracking
  - Direction and lane information

- **Real-time Dashboard**
  - Live event updates via WebSocket
  - Site-specific statistics
  - Overall system metrics
  - Event history visualization

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd hik-camera-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   Option 1 - Using npm:
   ```bash
   npm start
   ```
   Option 2 - Using startup script:
   ```bash
   chmod +x startup.sh
   ./startup.sh
   ```

## Database Structure

The system uses SQLite with three main tables:

### Sites Table
- `id`: Unique identifier
- `name`: Site name
- `description`: Site description
- `created_at`: Creation timestamp

### Cameras Table
- `id`: Unique identifier
- `channelID`: Camera channel identifier
- `macAddress`: Camera MAC address
- `name`: Camera name
- `description`: Camera description
- `site_id`: Associated site
- `status`: Camera status
- `last_seen`: Last activity timestamp
- `created_at`: Creation timestamp

### Events Table
- `id`: Unique identifier
- `channelID`: Source camera channel
- `dateTime`: Event timestamp
- `eventType`: Type of detection event
- `country`: Vehicle registration country
- `licensePlate`: Detected license plate
- `lane`: Detection lane
- `direction`: Vehicle direction
- `confidenceLevel`: Detection confidence
- `macAddress`: Camera MAC address
- Various image fields for vehicle and plate snapshots

## API Endpoints

### Sites Management

```
GET /api/sites
- Returns list of all sites
- Query parameters:
  - limit: Number of sites per page
  - offset: Page offset

POST /api/sites
- Creates a new site
- Required fields: name
- Optional fields: description

GET /api/sites/:id
- Returns specific site details
- Includes associated cameras

PUT /api/sites/:id
- Updates site information
- Updateable fields: name, description

DELETE /api/sites/:id
- Removes site and disassociates cameras
```

### Camera Management

```
GET /api/cameras
- Returns list of all cameras
- Query parameters:
  - site_id: Filter by site
  - status: Filter by status

POST /api/cameras
- Registers a new camera
- Required fields: channelID, macAddress
- Optional fields: name, description, site_id

PUT /api/cameras/:id
- Updates camera information
- Updateable fields: name, description, site_id, status

DELETE /api/cameras/:id
- Removes camera registration
```

### Events API

```
GET /api/events
- Returns list of detection events
- Query parameters:
  - start_date: Filter by start date
  - end_date: Filter by end date
  - site_id: Filter by site
  - camera_id: Filter by camera

GET /api/events/:id
- Returns specific event details
- Includes image URLs
```

## Web Interface

The system provides a modern web interface for:

- Dashboard (`/`): Overview of all sites and system statistics
- Site Management (`/manage-sites`): CRUD operations for sites
- Camera Management (`/manage-cameras`): Camera configuration
- Event History (`/events`): Searchable event log

## Real-time Updates

The system uses WebSocket connections to provide real-time updates:

- Dashboard statistics updates every 5 seconds
- Live event notifications
- Site status changes
- Camera connection status

## Dependencies

- Express.js: Web server framework
- SQLite3: Database management
- WebSocket: Real-time communication
- Morgan: HTTP request logging
- Multer: File upload handling

## Development

The application is built with Node.js and uses:

- Modern JavaScript (async/await)
- Promise-based database operations
- RESTful API design
- WebSocket for real-time updates
- Environment variables for configuration

## Error Handling

The system implements comprehensive error handling:

- HTTP status codes for API responses
- Detailed error messages
- Request validation
- Database transaction rollbacks
- WebSocket reconnection logic

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request