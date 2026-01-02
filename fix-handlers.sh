#!/bin/bash
# Quick script to fix remaining handler errors

cd /Users/connortyrrell/Repos/inventory-management/inventory-management-backend

# Add Context import to handler files that need it
sed -i '' 's/import { APIGatewayProxyEvent, APIGatewayProxyResult } from/import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from/g' src/handlers/dashboardAccessHandler.ts
sed -i '' 's/import { APIGatewayProxyEvent, APIGatewayProxyResult } from/import { APIGatewayProxyResult, APIGatewayProxyEvent, Context } from/g' src/handlers/dashboardAdjustmentHandler.ts

# Add context parameter to all function signatures
sed -i '' 's/export async function \(.*\)(\n  event: APIGatewayProxyEvent\n): Promise<APIGatewayProxyResult>/export async function \1(\n  event: APIGatewayProxyEvent,\n  context: Context\n): Promise<APIGatewayProxyResult>/g' src/handlers/dashboardHandler.ts
sed -i '' 's/export async function \(.*\)(\n  event: APIGatewayProxyEvent\n): Promise<APIGatewayProxyResult>/export async function \1(\n  event: APIGatewayProxyEvent,\n  context: Context\n): Promise<APIGatewayProxyResult>/g' src/handlers/dashboardAccessHandler.ts
sed -i '' 's/export async function \(.*\)(\n  event: APIGatewayProxyEvent\n): Promise<APIGatewayProxyResult>/export async function \1(\n  event: APIGatewayProxyEvent,\n  context: Context\n): Promise<APIGatewayProxyResult>/g' src/handlers/dashboardAdjustmentHandler.ts

echo "Handler fixes applied"
