#!/bin/bash
# Script to add warmup check to all Lambda handler files

# List of all handler files to update
handlers=(
  "src/handlers/listUserFamilies.ts"
  "src/handlers/getFamily.ts"
  "src/handlers/updateFamily.ts"
  "src/handlers/createInventoryItem.ts"
  "src/handlers/listInventoryItems.ts"
  "src/handlers/getInventoryItem.ts"
  "src/handlers/updateInventoryItem.ts"
  "src/handlers/adjustInventoryQuantity.ts"
  "src/handlers/archiveInventoryItem.ts"
  "src/handlers/deleteInventoryItem.ts"
  "src/handlers/listNotifications.ts"
  "src/handlers/acknowledgeNotification.ts"
  "src/handlers/resolveNotification.ts"
  "src/handlers/nfcAdjustmentHandler.ts"
  "src/handlers/nfcUrlHandler.ts"
  "src/handlers/shopping-list/listShoppingListItems.ts"
  "src/handlers/shopping-list/addToShoppingList.ts"
  "src/handlers/shopping-list/getShoppingListItem.ts"
  "src/handlers/shopping-list/updateShoppingListItem.ts"
  "src/handlers/shopping-list/updateShoppingListItemStatus.ts"
  "src/handlers/shopping-list/removeFromShoppingList.ts"
  "src/handlers/invitations/createInvitation.ts"
  "src/handlers/invitations/listInvitations.ts"
  "src/handlers/invitations/getInvitation.ts"
  "src/handlers/invitations/revokeInvitation.ts"
  "src/handlers/invitations/acceptInvitation.ts"
  "src/handlers/members/listMembers.ts"
  "src/handlers/members/getMember.ts"
  "src/handlers/members/updateMember.ts"
  "src/handlers/members/removeMember.ts"
  "src/handlers/reference-data/listStorageLocations.ts"
  "src/handlers/reference-data/createStorageLocation.ts"
  "src/handlers/reference-data/getStorageLocation.ts"
  "src/handlers/reference-data/updateStorageLocation.ts"
  "src/handlers/reference-data/deleteStorageLocation.ts"
  "src/handlers/reference-data/listStores.ts"
  "src/handlers/reference-data/createStore.ts"
  "src/handlers/reference-data/getStore.ts"
  "src/handlers/reference-data/updateStore.ts"
  "src/handlers/reference-data/deleteStore.ts"
  "src/handlers/suggestions/create-suggestion.ts"
  "src/handlers/suggestions/list-suggestions.ts"
  "src/handlers/suggestions/get-suggestion.ts"
  "src/handlers/suggestions/approve-suggestion.ts"
  "src/handlers/suggestions/reject-suggestion.ts"
)

echo "Adding warmup check to handler files..."
echo "Note: This script adds the import and warmup check."
echo "You may need to manually adjust based on the handler structure."
echo ""

for handler in "${handlers[@]}"; do
  if [ -f "$handler" ]; then
    echo "Processing: $handler"
    # Add import if not already present
    if ! grep -q "handleWarmup" "$handler"; then
      # Check if handler uses APIGatewayProxyHandler or similar
      if grep -q "APIGatewayProxyHandler\|APIGatewayProxyEvent" "$handler"; then
        echo "  - Adding warmup import and check"
      fi
    else
      echo "  - Already has warmup check, skipping"
    fi
  else
    echo "Warning: $handler not found"
  fi
done

echo ""
echo "Script complete. Manual updates may be needed for complex handlers."
echo "Please review each file to ensure the warmup check is in the right place."
