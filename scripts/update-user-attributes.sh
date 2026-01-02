#!/bin/bash

# Script to update Cognito user custom attributes (familyId and role)
# Usage: ./scripts/update-user-attributes.sh <email> <familyId> <role>
# Example: ./scripts/update-user-attributes.sh user@example.com fam_123abc admin

set -e

# Check arguments
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <email> <familyId> <role>"
    echo "Example: $0 user@example.com fam_123abc admin"
    exit 1
fi

EMAIL=$1
FAMILY_ID=$2
ROLE=$3

# Get User Pool ID from CloudFormation
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name inventory-management-prod \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text)

echo "User Pool ID: $USER_POOL_ID"
echo "Updating user: $EMAIL"
echo "Setting familyId: $FAMILY_ID"
echo "Setting role: $ROLE"

# Update user attributes
aws cognito-idp admin-update-user-attributes \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes \
        Name=custom:familyId,Value="$FAMILY_ID" \
        Name=custom:role,Value="$ROLE"

echo "✅ User attributes updated successfully!"
echo ""
echo "The user needs to:"
echo "1. Log out of the application"
echo "2. Log back in to get a new JWT token with the updated attributes"
