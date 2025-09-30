const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

// Create SDK with auto-instrumentations and default OTLP exporters
const sdk = new NodeSDK({
  serviceName: 'otel-ecs-sample-app',
  serviceVersion: '1.0.0',
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable some instrumentations that might be noisy
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
  ],
});

// Initialize the SDK
sdk.start();

console.log('OpenTelemetry initialized successfully');
console.log('Service: otel-ecs-sample-app v1.0.0');
console.log('OTLP endpoint will be auto-detected from environment variables');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry terminated'))
    .catch((error) => console.log('Error terminating OpenTelemetry', error))
    .finally(() => process.exit(0));
});