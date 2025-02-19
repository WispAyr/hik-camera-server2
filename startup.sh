#!/bin/bash

# Kill any existing processes on ports 9001 and 3000
echo "Cleaning up ports..."
sudo fuser -k 9001/tcp || true
sudo fuser -k 3000/tcp || true

# Wait a moment to ensure ports are cleared
sleep 2

# Start the application
echo "Starting the application..."
npm start