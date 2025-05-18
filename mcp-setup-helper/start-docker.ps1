#!/usr/bin/env pwsh
# Script to build and run the Docker container for the MCP Setup Helper

Write-Host "Building and starting MCP Setup Helper Docker container..."
docker-compose up --build
