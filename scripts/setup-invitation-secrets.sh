#!/bin/bash
# Setup script for invitation management secrets and parameters
# This script creates the required AWS Secrets Manager and Systems Manager Parameter Store resources
# for the member invitation feature (003-member-management)

set -e

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-dev}"
AWS_REGION="${2:-us-east-1}"

echo -e "${GREEN}Setting up invitation management infrastructure for environment: ${ENVIRONMENT}${NC}"
echo ""

# T002: Create HMAC secret for invitation token signing
echo -e "${YELLOW}[T002] Creating HMAC signing key secret...${NC}"
SECRET_NAME="/inventory-mgmt/${ENVIRONMENT}/invitation-hmac-secret"

# Generate a cryptographically secure random secret (64 bytes = 512 bits)
HMAC_SECRET=$(openssl rand -base64 64 | tr -d '\n')

# Check if secret already exists
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$AWS_REGION" &>/dev/null; then
    echo "Secret already exists: $SECRET_NAME"
    echo "Updating secret value..."
    aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" \
        --secret-string "$HMAC_SECRET" \
        --region "$AWS_REGION"
    echo -e "${GREEN}✓ Secret updated: $SECRET_NAME${NC}"
else
    echo "Creating new secret: $SECRET_NAME"
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "HMAC-SHA256 signing key for invitation tokens (Feature 003)" \
        --secret-string "$HMAC_SECRET" \
        --region "$AWS_REGION" \
        --tags Key=Environment,Value="$ENVIRONMENT" Key=Feature,Value=003-member-management
    echo -e "${GREEN}✓ Secret created: $SECRET_NAME${NC}"
fi
echo ""

# T003: Create invitation expiration parameter (7 days = 604800 seconds)
echo -e "${YELLOW}[T003] Creating invitation expiration parameter...${NC}"
EXPIRATION_PARAM="/inventory-mgmt/${ENVIRONMENT}/invitation-expiration-seconds"

aws ssm put-parameter \
    --name "$EXPIRATION_PARAM" \
    --description "Invitation expiration duration in seconds (7 days)" \
    --value "604800" \
    --type "String" \
    --region "$AWS_REGION" \
    --overwrite \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=Feature,Value=003-member-management
echo -e "${GREEN}✓ Parameter created: $EXPIRATION_PARAM = 604800 seconds (7 days)${NC}"
echo ""

# T004: Create TTL grace period parameter (7 days = 604800 seconds)
echo -e "${YELLOW}[T004] Creating TTL grace period parameter...${NC}"
TTL_GRACE_PARAM="/inventory-mgmt/${ENVIRONMENT}/invitation-ttl-grace-seconds"

aws ssm put-parameter \
    --name "$TTL_GRACE_PARAM" \
    --description "TTL grace period after invitation expiration (7 days)" \
    --value "604800" \
    --type "String" \
    --region "$AWS_REGION" \
    --overwrite \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=Feature,Value=003-member-management
echo -e "${GREEN}✓ Parameter created: $TTL_GRACE_PARAM = 604800 seconds (7 days)${NC}"
echo ""

# T005: Create email template parameter
echo -e "${YELLOW}[T005] Creating invitation email template parameter...${NC}"
EMAIL_TEMPLATE_PARAM="/inventory-mgmt/${ENVIRONMENT}/email-templates/invitation"

# HTML email template with proper formatting
EMAIL_TEMPLATE=$(cat <<'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Family Invitation - Inventory HQ</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e1e4e8; border-top: none; }
        .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .button:hover { background: #5568d3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        .details { background: #f6f8fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .details p { margin: 8px 0; }
        .warning { color: #d73a49; font-size: 14px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏠 Family Invitation</h1>
    </div>
    <div class="content">
        <p>Hi there!</p>
        
        <p><strong>{{inviterName}}</strong> has invited you to join their family on <strong>Inventory HQ</strong>.</p>
        
        <div class="details">
            <p><strong>Family Name:</strong> {{familyName}}</p>
            <p><strong>Your Role:</strong> {{role}}</p>
            <p><strong>Invited By:</strong> {{inviterName}} ({{inviterEmail}})</p>
        </div>
        
        <p>Click the button below to accept the invitation and create your account:</p>
        
        <div style="text-align: center;">
            <a href="{{acceptUrl}}" class="button">Accept Invitation</a>
        </div>
        
        <p class="warning">⚠️ This invitation will expire in 7 days. If you don't accept it by <strong>{{expiresAt}}</strong>, you'll need to request a new invitation.</p>
        
        <p>If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
    <div class="footer">
        <p>Inventory HQ - Simplifying household management</p>
        <p>This is an automated email. Please do not reply.</p>
    </div>
</body>
</html>
EOF
)

aws ssm put-parameter \
    --name "$EMAIL_TEMPLATE_PARAM" \
    --description "HTML email template for family member invitations" \
    --value "$EMAIL_TEMPLATE" \
    --type "String" \
    --region "$AWS_REGION" \
    --overwrite \
    --tags Key=Environment,Value="$ENVIRONMENT" Key=Feature,Value=003-member-management
echo -e "${GREEN}✓ Parameter created: $EMAIL_TEMPLATE_PARAM${NC}"
echo ""

# Summary
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✓ Invitation infrastructure setup complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Created resources:"
echo "  - Secret: $SECRET_NAME"
echo "  - Parameter: $EXPIRATION_PARAM"
echo "  - Parameter: $TTL_GRACE_PARAM"
echo "  - Parameter: $EMAIL_TEMPLATE_PARAM"
echo ""
echo "Next steps:"
echo "  1. Verify GSI1 index exists (T007)"
echo "  2. Deploy Lambda functions that use these resources"
echo "  3. Test invitation flow end-to-end"
echo ""
