#!/bin/bash
# Build and package all Lambda functions for deployment
# Usage: ./scripts/build-lambdas.sh <S3_BUCKET>
# Example: ./scripts/build-lambdas.sh meeting-minutes-lambda-123456789012
#
# Must be run from the project root directory (Meeting-note/)

set -e

LAMBDA_BUCKET=$1

if [ -z "$LAMBDA_BUCKET" ]; then
  echo "Usage: ./scripts/build-lambdas.sh <S3_LAMBDA_BUCKET>"
  exit 1
fi

PROJECT_ROOT=$(pwd)
BUILD_DIR="$PROJECT_ROOT/.build"

echo "=== Installing dependencies ==="
npm install

echo ""
echo "=== Building Lambda functions ==="

for SERVICE in auth meeting ai email; do
  echo ""
  echo "--- Building $SERVICE service ---"
  
  # Clean build directory
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  
  # Compile TypeScript from project root
  echo "  Compiling TypeScript..."
  ./node_modules/.bin/tsc -p services/$SERVICE/tsconfig.json --outDir "$BUILD_DIR"
  
  # Copy node_modules (AWS SDK etc.) from root
  echo "  Copying node_modules..."
  cp -r node_modules "$BUILD_DIR/node_modules"
  
  # Create zip
  echo "  Creating zip..."
  pushd "$BUILD_DIR" > /dev/null
  rm -f handler.zip
  zip -rq handler.zip .
  popd > /dev/null
  
  # Upload to S3
  echo "  Uploading to s3://$LAMBDA_BUCKET/$SERVICE/handler.zip"
  aws s3 cp "$BUILD_DIR/handler.zip" "s3://$LAMBDA_BUCKET/$SERVICE/handler.zip"
  
  # Show zip size
  ZIP_SIZE=$(du -h "$BUILD_DIR/handler.zip" | cut -f1)
  echo "  Zip size: $ZIP_SIZE"
  
  # Cleanup
  rm -rf "$BUILD_DIR"
  
  echo "--- $SERVICE done ---"
done

echo ""
echo "=== All Lambda functions built and uploaded ==="
echo ""
echo "Handler paths in CloudFormation:"
echo "  auth:    services/auth/src/handler.handler"
echo "  meeting: services/meeting/src/handler.handler"
echo "  ai:      services/ai/src/handler.handler"
echo "  email:   services/email/src/handler.handler"
