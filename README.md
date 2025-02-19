# Vehicle Detection System

A robust HTTP server application designed to handle vehicle detection events from HIK cameras, featuring site management, real-time monitoring, and comprehensive event tracking.

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
   ```bash
   npm start
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
POST /api/sites
GET /api/sites/:id
PUT /api/sites/:id
DELETE /api/sites/:id
```

### Camera Management

```
GET /api/cameras
POST /api/cameras
PUT /api/cameras/:id
DELETE /api/cameras/:id
```

## Web Interface

The system provides a modern web interface for:

- Dashboard (`/`): Overview of all sites and system statistics
- Site Management (`/manage-sites`): CRUD operations for sites

## Real-time Updates

The system uses WebSocket connections to provide real-time updates:

- Dashboard statistics updates every 5 seconds
- Live event notifications
- Site status changes

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

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.