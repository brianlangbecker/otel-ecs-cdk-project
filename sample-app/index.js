const express = require('express');
const { trace, metrics } = require('@opentelemetry/api');

const app = express();
const port = process.env.PORT || 3000;

// Get tracer and meter
const tracer = trace.getTracer('otel-sample-app', '1.0.0');
const meter = metrics.getMeter('otel-sample-app', '1.0.0');

// Create custom metrics
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

const requestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
});

// Enhanced middleware with tracing and metrics
app.use((req, res, next) => {
  const startTime = Date.now();
  
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  
  // Count the request
  requestCounter.add(1, {
    method: req.method,
    route: req.path,
  });
  
  // Measure duration when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    requestDuration.record(duration, {
      method: req.method,
      route: req.path,
      status_code: res.statusCode.toString(),
    });
  });
  
  next();
});

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Hello from OpenTelemetry ECS Sample App!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    note: 'This app sends telemetry to the OTEL collector sidecar'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/users', (req, res) => {
  // Create a custom span for this operation
  const span = tracer.startSpan('get_users');
  
  // Add some attributes to the span
  span.setAttributes({
    'http.method': req.method,
    'http.route': '/api/users',
    'user.operation': 'fetch_all_users'
  });
  
  // Simulate some work
  const delay = Math.random() * 200 + 50; // Random delay 50-250ms
  span.addEvent('starting_user_fetch', { delay_ms: delay });
  
  setTimeout(() => {
    const users = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Charlie', email: 'charlie@example.com' }
    ];
    
    span.addEvent('users_fetched', { user_count: users.length });
    span.setAttributes({
      'users.count': users.length,
      'response.size_bytes': JSON.stringify(users).length
    });
    
    res.json({ 
      users, 
      count: users.length,
      timestamp: new Date().toISOString()
    });
    
    span.setStatus({ code: 1 }); // OK status
    span.end();
  }, delay);
});

app.get('/api/error', (req, res) => {
  // Create a span for the error case
  const span = tracer.startSpan('simulate_error');
  
  span.setAttributes({
    'http.method': req.method,
    'http.route': '/api/error',
    'error.type': 'simulated_error'
  });
  
  console.error('Simulated error endpoint called');
  span.addEvent('error_simulated', { 
    message: 'This is a simulated error for testing' 
  });
  
  // Mark span as error
  span.recordException(new Error('Simulated error for testing'));
  span.setStatus({ 
    code: 2, // ERROR status
    message: 'Simulated error for testing'
  });
  
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: 'This is a simulated error for testing',
    timestamp: new Date().toISOString()
  });
  
  span.end();
});

// Generate some background activity
setInterval(() => {
  console.log(`Background activity - ${new Date().toISOString()}`);
}, 30000); // Every 30 seconds

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Sample app listening on port ${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
  console.log(`Users API available at http://localhost:${port}/api/users`);
  console.log(`Error simulation available at http://localhost:${port}/api/error`);
  console.log('Ready to send logs to OTEL collector sidecar');
});