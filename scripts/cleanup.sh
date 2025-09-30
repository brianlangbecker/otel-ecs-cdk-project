#!/bin/bash

# AWS OpenTelemetry ECS Cleanup Script
set -e

echo "🧹 Starting cleanup of AWS OpenTelemetry ECS resources..."

# Check if AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"

# Destroy the CDK stack
echo "🗑️  Destroying CDK stack..."
npx cdk destroy --force

echo ""
echo "✅ Cleanup completed successfully!"
echo ""
echo "📋 Manual cleanup (if needed):"
echo "1. Check CloudWatch Log Groups for any remaining logs"
echo "2. Verify X-Ray traces are no longer being generated"
echo "3. Check SSM Parameter Store for any remaining parameters"
echo "4. Review IAM roles if they were created outside of CDK"
echo ""
