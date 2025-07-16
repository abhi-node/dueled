#!/bin/bash

# Docker Development Environment Manager
# This script manages the PostgreSQL and Redis Docker containers for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[DOCKER]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[DOCKER]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[DOCKER]${NC} $1"
}

print_error() {
    echo -e "${RED}[DOCKER]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Check for port conflicts
check_ports() {
    local postgres_port=5433
    local redis_port=6380
    
    if lsof -Pi :$postgres_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $postgres_port is already in use. This may cause conflicts."
    fi
    
    if lsof -Pi :$redis_port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $redis_port is already in use. This may cause conflicts."
    fi
}

# Start Docker services
start_services() {
    print_status "Starting PostgreSQL and Redis containers..."
    
    # Check for port conflicts
    check_ports
    
    # Check if containers are already running
    if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
        print_warning "Some containers are already running. Stopping them first..."
        docker-compose -f docker-compose.dev.yml down
    fi
    
    # Start services
    print_status "Starting containers (PostgreSQL on port 5433, Redis on port 6380)..."
    if ! docker-compose -f docker-compose.dev.yml up -d; then
        print_error "Failed to start containers. Check for port conflicts or Docker issues."
        exit 1
    fi
    
    # Wait for services to be healthy
    print_status "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.dev.yml ps | grep -q "healthy"; then
            print_success "All services are healthy and ready!"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Services failed to start within timeout. Check logs with: npm run docker:logs"
            exit 1
        fi
        
        print_status "Waiting for services... ($attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
}

# Stop Docker services
stop_services() {
    print_status "Stopping Docker services..."
    docker-compose -f docker-compose.dev.yml down
    print_success "Services stopped successfully!"
}

# Show service status
show_status() {
    print_status "Service Status:"
    docker-compose -f docker-compose.dev.yml ps
}

# Show logs
show_logs() {
    if [ -n "$1" ]; then
        docker-compose -f docker-compose.dev.yml logs -f "$1"
    else
        docker-compose -f docker-compose.dev.yml logs -f
    fi
}

# Reset all data (careful!)
reset_data() {
    print_warning "This will delete ALL data in the development database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Stopping services and removing volumes..."
        docker-compose -f docker-compose.dev.yml down -v
        print_success "Data reset complete!"
    else
        print_status "Reset cancelled."
    fi
}

# Database connection test
test_connection() {
    print_status "Testing database connection..."
    
    if docker exec dueled-postgres-dev pg_isready -U dueled_user -d dueled > /dev/null 2>&1; then
        print_success "PostgreSQL connection: OK"
    else
        print_error "PostgreSQL connection: FAILED"
        return 1
    fi
    
    if docker exec dueled-redis-dev redis-cli ping > /dev/null 2>&1; then
        print_success "Redis connection: OK"
    else
        print_error "Redis connection: FAILED"
        return 1
    fi
}

# Main command handling
case "$1" in
    "start")
        check_docker
        start_services
        test_connection
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        check_docker
        stop_services
        start_services
        test_connection
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs "$2"
        ;;
    "reset")
        reset_data
        ;;
    "test")
        test_connection
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|reset|test}"
        echo ""
        echo "Commands:"
        echo "  start    - Start PostgreSQL and Redis containers"
        echo "  stop     - Stop all containers"
        echo "  restart  - Restart all containers"
        echo "  status   - Show container status"
        echo "  logs     - Show container logs (optionally specify service: postgres|redis)"
        echo "  reset    - Reset all data (WARNING: destroys all data)"
        echo "  test     - Test database connections"
        exit 1
        ;;
esac