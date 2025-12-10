#!/bin/bash

# Setup script for Member Management Infrastructure (Spec 003)
# This script configures AWS resources required for the member management feature

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="inventory-mgmt-backend-${ENVIRONMENT}"

echo "=================================================="
echo "Member Management Infrastructure Setup"
echo "=================================================="
echo "Environment: ${ENVIRONMENT}"
echo "AWS Region: ${AWS_REGION}"
echo "Stack Name: ${STACK_NAME}"
echo ""

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Function to get CloudFormation output
get_cf_output() {
    local output_key=$1
    aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --region "${AWS_REGION}" \
        --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# ==================== T001: Verify DynamoDB TTL ====================
echo "Task T001: Verifying DynamoDB TTL configuration..."

TABLE_NAME=$(get_cf_output "InventoryTableName")

if [ -z "$TABLE_NAME" ]; then
    print_error "Could not find DynamoDB table. Please ensure the stack is deployed."
    exit 1
fi

print_info "Table name: ${TABLE_NAME}"

TTL_STATUS=$(aws dynamodb describe-time-to-live \
    --table-name "${TABLE_NAME}" \
    --region "${AWS_REGION}" \
    --query 'TimeToLiveDescription.TimeToLiveStatus' \
    --output text 2>/dev/null || echo "")

if [ "$TTL_STATUS" == "ENABLED" ]; then
    print_success "TTL is already enabled on attribute 'ttl'"
else
    print_info "Enabling TTL on attribute 'ttl'..."
    aws dynamodb update-time-to-live \
        --table-name "${TABLE_NAME}" \
        --region "${AWS_REGION}" \
        --time-to-live-specification "Enabled=true, AttributeName=ttl"
    print_success "TTL enabled successfully"
fi

echo ""

# ==================== T002: Create HMAC Secret ====================
echo "Task T002: Creating Secrets Manager secret for HMAC signing key..."

SECRET_NAME="/inventory-mgmt/${ENVIRONMENT}/invitation-hmac-secret"

# Check if secret already exists
SECRET_EXISTS=$(aws secretsmanager describe-secret \
    --secret-id "${SECRET_NAME}" \
    --region "${AWS_REGION}" \
    2>/dev/null || echo "")

if [ -n "$SECRET_EXISTS" ]; then
    print_success "HMAC secret already exists: ${SECRET_NAME}"
else
    print_info "Creating new HMAC secret..."
    # Generate a random 64-character hex string
    HMAC_SECRET=$(openssl rand -hex 32)
    
    aws secretsmanager create-secret \
        --name "${SECRET_NAME}" \
        --description "HMAC signing key for member invitation tokens" \
        --secret-string "${HMAC_SECRET}" \
        --region "${AWS_REGION}" \
        --tags Key=Environment,Value="${ENVIRONMENT}" Key=Application,Value=FamilyInventoryManagement
    
    print_success "HMAC secret created: ${SECRET_NAME}"
fi

echo ""

# ==================== T003: Create Parameter Store - Invitation Expiration ====================
echo "Task T003: Creating Parameter Store value for invitation expiration..."

PARAM_EXPIRATION="/inventory-mgmt/${ENVIRONMENT}/invitation-expiration-seconds"

# Check if parameter exists
PARAM_EXISTS=$(aws ssm get-parameter \
    --name "${PARAM_EXPIRATION}" \
    --region "${AWS_REGION}" \
    2>/dev/null || echo "")

if [ -n "$PARAM_EXISTS" ]; then
    print_success "Invitation expiration parameter already exists: ${PARAM_EXPIRATION}"
else
    print_info "Creating invitation expiration parameter (7 days = 604800 seconds)..."
    aws ssm put-parameter \
        --name "${PARAM_EXPIRATION}" \
        --value "604800" \
        --type String \
        --description "Invitation expiration time in seconds (7 days)" \
        --region "${AWS_REGION}" \
        --tags Key=Environment,Value="${ENVIRONMENT}" Key=Application,Value=FamilyInventoryManagement
    
    print_success "Invitation expiration parameter created: ${PARAM_EXPIRATION}"
fi

echo ""

# ==================== T004: Create Parameter Store - TTL Grace Period ====================
echo "Task T004: Creating Parameter Store value for TTL grace period..."

PARAM_TTL_GRACE="/inventory-mgmt/${ENVIRONMENT}/invitation-ttl-grace-seconds"

PARAM_EXISTS=$(aws ssm get-parameter \
    --name "${PARAM_TTL_GRACE}" \
    --region "${AWS_REGION}" \
    2>/dev/null || echo "")

if [ -n "$PARAM_EXISTS" ]; then
    print_success "TTL grace period parameter already exists: ${PARAM_TTL_GRACE}"
else
    print_info "Creating TTL grace period parameter (7 days = 604800 seconds)..."
    aws ssm put-parameter \
        --name "${PARAM_TTL_GRACE}" \
        --value "604800" \
        --type String \
        --description "TTL grace period for invitations in seconds (7 days)" \
        --region "${AWS_REGION}" \
        --tags Key=Environment,Value="${ENVIRONMENT}" Key=Application,Value=FamilyInventoryManagement
    
    print_success "TTL grace period parameter created: ${PARAM_TTL_GRACE}"
fi

echo ""

# ==================== T005: Create Parameter Store - Email Template ====================
echo "Task T005: Creating Parameter Store value for email template..."

PARAM_EMAIL_TEMPLATE="/inventory-mgmt/${ENVIRONMENT}/email-templates/invitation"

PARAM_EXISTS=$(aws ssm get-parameter \
    --name "${PARAM_EMAIL_TEMPLATE}" \
    --region "${AWS_REGION}" \
    2>/dev/null || echo "")

if [ -n "$PARAM_EXISTS" ]; then
    print_success "Email template parameter already exists: ${PARAM_EMAIL_TEMPLATE}"
else
    print_info "Creating email template parameter..."
    
    # Read the email template from the templates directory
    TEMPLATE_FILE="$(dirname "$0")/../src/templates/invitation-email.html"
    
    if [ ! -f "$TEMPLATE_FILE" ]; then
        print_error "Email template file not found: ${TEMPLATE_FILE}"
        print_info "Skipping email template creation. Please create the template file and run this script again."
    else
        TEMPLATE_CONTENT=$(cat "${TEMPLATE_FILE}")
        
        aws ssm put-parameter \
            --name "${PARAM_EMAIL_TEMPLATE}" \
            --value "${TEMPLATE_CONTENT}" \
            --type String \
            --description "HTML email template for member invitations" \
            --region "${AWS_REGION}" \
            --tags Key=Environment,Value="${ENVIRONMENT}" Key=Application,Value=FamilyInventoryManagement
        
        print_success "Email template parameter created: ${PARAM_EMAIL_TEMPLATE}"
    fi
fi

echo ""

# ==================== T006: Verify SES Configuration ====================
echo "Task T006: Verifying SES domain and sender email configuration..."

SES_FROM_EMAIL="${SES_FROM_EMAIL:-}"

if [ -z "$SES_FROM_EMAIL" ]; then
    print_info "SES_FROM_EMAIL environment variable not set"
    print_info "Please set SES_FROM_EMAIL and verify the email/domain in SES console"
    print_info "Example: export SES_FROM_EMAIL=noreply@yourdomain.com"
else
    print_info "Checking verification status for: ${SES_FROM_EMAIL}"
    
    VERIFICATION_STATUS=$(aws ses get-identity-verification-attributes \
        --identities "${SES_FROM_EMAIL}" \
        --region "${AWS_REGION}" \
        --query "VerificationAttributes.\"${SES_FROM_EMAIL}\".VerificationStatus" \
        --output text 2>/dev/null || echo "")
    
    if [ "$VERIFICATION_STATUS" == "Success" ]; then
        print_success "SES email/domain is verified: ${SES_FROM_EMAIL}"
    elif [ "$VERIFICATION_STATUS" == "Pending" ]; then
        print_info "SES verification is pending for: ${SES_FROM_EMAIL}"
        print_info "Please check your email or DNS records to complete verification"
    else
        print_info "SES email/domain is not verified: ${SES_FROM_EMAIL}"
        print_info "To verify, run: aws ses verify-email-identity --email-address ${SES_FROM_EMAIL}"
    fi
fi

echo ""

# ==================== T007: Verify GSI1 Index ====================
echo "Task T007: Verifying GSI1 index for token lookup..."

GSI_STATUS=$(aws dynamodb describe-table \
    --table-name "${TABLE_NAME}" \
    --region "${AWS_REGION}" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='GSI1'].IndexStatus" \
    --output text 2>/dev/null || echo "")

if [ "$GSI_STATUS" == "ACTIVE" ]; then
    print_success "GSI1 index exists and is ACTIVE"
else
    print_error "GSI1 index not found or not ACTIVE"
    print_info "GSI1 should have been created in the parent feature (001-family-inventory-mvp)"
    print_info "Please ensure the SAM template includes GSI1 configuration"
fi

echo ""

# ==================== Summary ====================
echo "=================================================="
echo "Infrastructure Setup Summary"
echo "=================================================="
echo ""
echo "Resources created/verified:"
echo "  ✓ DynamoDB TTL on 'ttl' attribute"
echo "  ✓ Secrets Manager: ${SECRET_NAME}"
echo "  ✓ Parameter Store: ${PARAM_EXPIRATION}"
echo "  ✓ Parameter Store: ${PARAM_TTL_GRACE}"
if [ -f "$(dirname "$0")/../src/templates/invitation-email.html" ]; then
    echo "  ✓ Parameter Store: ${PARAM_EMAIL_TEMPLATE}"
else
    echo "  ⚠ Parameter Store: ${PARAM_EMAIL_TEMPLATE} (skipped - template file missing)"
fi
echo "  ✓ SES verification check"
echo "  ✓ GSI1 index verification"
echo ""
echo "Next steps:"
echo "  1. Update template.yaml with new Lambda functions"
echo "  2. Implement backend services and handlers"
echo "  3. Deploy with: sam build && sam deploy --config-env ${ENVIRONMENT}"
echo ""
print_success "Infrastructure setup complete!"

