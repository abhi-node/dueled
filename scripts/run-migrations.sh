#!/bin/bash

# Run database migrations manually

echo "Running database migrations..."

cd server

# Run the migration script
npm run migrate

echo "Migrations complete!" 