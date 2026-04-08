#!/bin/bash
# Build and package all Lambda functions for deployment
# Usage: ./scripts/build-lambdas.sh <S3_BUCKET>
# Example: ./scripts/build-lambdas.sh meeting-minutes-lambda-123456789012

set -e

LAMBDA_BUCKET=$1

if [ -z "$LAMBDA_BUCKET" ]; then
  echo "Usage: ./scripts/build-lambdas.sh <S3_LAMBDA_BUCKET>"
  exit 1
fi

echo "=== Building Lambda functions ==="

for SERVICE in auth meeting ai email; do
  echo ""
  echo "--- Building $SERVICE service ---"
  
  # Compile TypeScript
  npx tsc -p services/$SERVICE/tsconfig.json
  
  # Create zip from the service directory (includes compiled JS + shared code)
  pushd services/$SERVICE > /dev/null
  rm -f handler.zip
  zip -r handler.zip services/ shared/ node_modules/ package.json 2>/dev/null || \
  zip -r handler.zip services/ shared/ package.json
  
  # Upload to S3
  echo "Uploading $SERVICE/handler.zip to s3://$LAMBDA_BUCKET/$SERVICE/"
  aws s3 cp handler.zip s3://$LAMBDA_BUCKET/$SERVICE/handler.zip
  
  # Cleanup
  rm -f handler.zip
  rm -rf services/ shared/
  popd > /dev/null
  
  echo "--- $SERVICE done ---"
done

echo ""
echo "=== All Lambda functions built and uploaded ==="
