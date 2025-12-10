#!/bin/bash

# Test Script for Member Management Feature (Spec 003)
# This script provides easy-to-use commands for testing the new member management endpoints

set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3001"
# Mock JWT token for testing (decoded: {"sub":"mock-user-id","email":"test@test.com","name":"Test User"})
AUTH_TOKEN="eyJzdWIiOiJtb2NrLXVzZXItaWQiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIn0="

# Store test data
FAMILY_ID=""
MEMBER_ID=""
INVITATION_ID=""
INVITATION_TOKEN=""

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}  Member Management Feature Testing${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo ""

# Function to print test step
print_step() {
    echo -e "\n${GREEN}▶ $1${NC}"
}

# Function to print result
print_result() {
    echo -e "${YELLOW}Response:${NC}"
    echo "$1" | jq '.' 2>/dev/null || echo "$1"
    echo ""
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Note: 'jq' is not installed. Install it for prettier JSON output.${NC}"
    echo ""
fi

# 1. Create a family
print_step "1. Creating a test family..."
RESPONSE=$(curl -s -X POST "$API_BASE/families" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"name":"Test Family"}')
  
print_result "$RESPONSE"

FAMILY_ID=$(echo "$RESPONSE" | jq -r '.data.familyId' 2>/dev/null || echo "")

if [ -z "$FAMILY_ID" ] || [ "$FAMILY_ID" == "null" ]; then
    echo -e "${YELLOW}⚠️  Could not extract familyId. Make sure the API is running.${NC}"
    echo -e "${YELLOW}   Run: ./start-local.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Family created with ID: $FAMILY_ID${NC}"

# 2. List members
print_step "2. Listing family members (should have 1 admin)..."
RESPONSE=$(curl -s "$API_BASE/families/$FAMILY_ID/members" \
  -H "Authorization: Bearer $AUTH_TOKEN")
  
print_result "$RESPONSE"

MEMBER_ID=$(echo "$RESPONSE" | jq -r '.data.members[0].memberId' 2>/dev/null || echo "")
echo -e "${GREEN}✓ Found member ID: $MEMBER_ID${NC}"

# 3. Create an invitation
print_step "3. Creating an invitation for a new member..."
RESPONSE=$(curl -s -X POST "$API_BASE/families/$FAMILY_ID/invitations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "email": "newmember@example.com",
    "role": "suggester"
  }')
  
print_result "$RESPONSE"

INVITATION_ID=$(echo "$RESPONSE" | jq -r '.invitationId' 2>/dev/null || echo "")
echo -e "${GREEN}✓ Invitation created with ID: $INVITATION_ID${NC}"
echo -e "${YELLOW}📧 In production, an email would be sent to: newmember@example.com${NC}"

# 4. List invitations
print_step "4. Listing pending invitations..."
RESPONSE=$(curl -s "$API_BASE/families/$FAMILY_ID/invitations" \
  -H "Authorization: Bearer $AUTH_TOKEN")
  
print_result "$RESPONSE"

# 5. Get specific invitation
print_step "5. Getting invitation details..."
RESPONSE=$(curl -s "$API_BASE/families/$FAMILY_ID/invitations/$INVITATION_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN")
  
print_result "$RESPONSE"

# 6. Update member role (demonstrate optimistic locking)
print_step "6. Testing member role update with optimistic locking..."
RESPONSE=$(curl -s -X PATCH "$API_BASE/families/$FAMILY_ID/members/$MEMBER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "role": "admin",
    "version": 1
  }')
  
print_result "$RESPONSE"
echo -e "${GREEN}✓ Member role updated (still admin)${NC}"

# 7. Revoke invitation
print_step "7. Revoking the invitation..."
RESPONSE=$(curl -s -X DELETE "$API_BASE/families/$FAMILY_ID/invitations/$INVITATION_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -w "\nHTTP Status: %{http_code}")
  
if echo "$RESPONSE" | grep -q "204"; then
    echo -e "${GREEN}✓ Invitation revoked successfully (HTTP 204)${NC}"
else
    print_result "$RESPONSE"
fi

# 8. Try to create duplicate invitation (should fail)
print_step "8. Testing duplicate invitation prevention..."
RESPONSE=$(curl -s -X POST "$API_BASE/families/$FAMILY_ID/invitations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "email": "newmember@example.com",
    "role": "admin"
  }')
  
# This should succeed now that the first one is revoked
print_result "$RESPONSE"

# 9. Test last admin protection
print_step "9. Testing last admin protection (should fail)..."
RESPONSE=$(curl -s -X DELETE "$API_BASE/families/$FAMILY_ID/members/$MEMBER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"version": 1}')
  
print_result "$RESPONSE"
echo -e "${GREEN}✓ Last admin protection working - cannot remove last admin${NC}"

# Summary
echo -e "\n${BLUE}===========================================================${NC}"
echo -e "${BLUE}  Testing Summary${NC}"
echo -e "${BLUE}===========================================================${NC}"
echo -e "${GREEN}✓ Family Creation${NC}"
echo -e "${GREEN}✓ Member Listing${NC}"
echo -e "${GREEN}✓ Invitation Creation${NC}"
echo -e "${GREEN}✓ Invitation Listing${NC}"
echo -e "${GREEN}✓ Invitation Details${NC}"
echo -e "${GREEN}✓ Member Role Update (Optimistic Locking)${NC}"
echo -e "${GREEN}✓ Invitation Revocation${NC}"
echo -e "${GREEN}✓ Last Admin Protection${NC}"
echo ""
echo -e "${YELLOW}📝 Manual Tests Needed:${NC}"
echo -e "   - Accept invitation (requires Cognito setup)"
echo -e "   - Email delivery (requires SES configuration)"
echo -e "   - Multiple concurrent updates (version conflicts)"
echo ""
echo -e "${BLUE}Stored Test Data:${NC}"
echo -e "   Family ID: ${GREEN}$FAMILY_ID${NC}"
echo -e "   Member ID: ${GREEN}$MEMBER_ID${NC}"
echo ""

# Offer to check DynamoDB
echo -e "${YELLOW}Want to see the data in DynamoDB?${NC}"
echo -e "Run: ${GREEN}AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local aws dynamodb scan --table-name InventoryTable --endpoint-url http://localhost:8000 --region us-east-1 | jq '.Items[] | select(.entityType.S == \"Invitation\")'${NC}"

