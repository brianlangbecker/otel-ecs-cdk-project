#!/bin/bash

# AWS OpenTelemetry ECS Deployment Script
set -e

echo "🚀 Starting AWS OpenTelemetry ECS deployment..."

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building TypeScript..."
npm run build

# Bootstrap CDK if needed
echo "🏗️  Checking CDK bootstrap..."
if ! npx cdk bootstrap --require-approval never 2>/dev/null; then
    echo "⚠️  CDK bootstrap may have failed, but continuing..."
fi

# Synthesize to check for errors
echo "🔍 Synthesizing CDK stack..."
npx cdk synth --quiet

# Deploy the stack
echo "🚀 Deploying CDK stack..."
npx cdk deploy --require-approval never

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Test the application endpoints:"
echo "   - GET / (home page)"
echo "   - GET /health (health check)" 
echo "   - GET /api/users (sample API with tracing)"
echo "   - GET /api/error (error simulation)"
echo "2. View traces in Honeycomb (check your configured dataset)"
echo "3. View logs in CloudWatch console"
echo ""
echo "🍯 Honeycomb Integration:"
echo "- Traces are automatically sent to Honeycomb"
echo "- Check your Honeycomb dataset for 'otel-ecs-sample-app' service"
echo "- API key is configured in lib/otel-ecs-cdk-project-stack.ts"
echo ""
