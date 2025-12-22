/**
 * Custom error classes for Reference Data Management
 * Feature: 005-reference-data
 * 
 * Provides structured errors for:
 * - Duplicate name conflicts
 * - Referential integrity violations
 * - Optimistic locking conflicts
 * - Not found errors
 */

/**
 * Error thrown when attempting to create/update an entity with a duplicate name
 */
export class DuplicateNameError extends Error {
  public readonly code = 'DUPLICATE_NAME';
  public readonly statusCode = 409;

  constructor(
    public readonly entityType: 'StorageLocation' | 'Store',
    public override readonly name: string
  ) {
    super(`A ${entityType} with the name "${name}" already exists in this family`);
    this.name = 'DuplicateNameError';
    Object.setPrototypeOf(this, DuplicateNameError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      entityType: this.entityType,
      name: this.name,
    };
  }
}

/**
 * Error thrown when attempting to delete an entity that is referenced by other items
 */
export class ReferenceExistsError extends Error {
  public readonly code = 'REFERENCE_EXISTS';
  public readonly statusCode = 409;

  constructor(
    public readonly entityType: 'StorageLocation' | 'Store',
    public readonly entityId: string,
    public readonly references: {
      inventoryItems?: number;
      shoppingListItems?: number;
    }
  ) {
    const refTypes = Object.keys(references).filter(k => references[k as keyof typeof references]! > 0);
    const refDetails = refTypes.map(type => {
      const count = references[type as keyof typeof references];
      return `${count} ${type}`;
    }).join(', ');

    super(
      `Cannot delete ${entityType} that is referenced by ${refDetails}`
    );
    this.name = 'ReferenceExistsError';
    Object.setPrototypeOf(this, ReferenceExistsError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
      references: this.references,
    };
  }
}

/**
 * Error thrown when optimistic locking fails (version mismatch)
 */
export class VersionConflictError extends Error {
  public readonly code = 'VERSION_CONFLICT';
  public readonly statusCode = 409;

  constructor(
    public readonly entityType: 'StorageLocation' | 'Store',
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
    public readonly currentEntity: unknown
  ) {
    super(
      `Version conflict: expected version ${expectedVersion}, but current version is ${currentVersion}. ` +
      'The entity was modified by another user.'
    );
    this.name = 'VersionConflictError';
    Object.setPrototypeOf(this, VersionConflictError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
      expectedVersion: this.expectedVersion,
      currentVersion: this.currentVersion,
      currentEntity: this.currentEntity,
    };
  }
}

/**
 * Error thrown when an entity is not found
 */
export class NotFoundError extends Error {
  public readonly code = 'NOT_FOUND';
  public readonly statusCode = 404;

  constructor(
    public readonly entityType: 'StorageLocation' | 'Store',
    public readonly entityId: string
  ) {
    super(`${entityType} with ID "${entityId}" not found`);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      entityType: this.entityType,
      entityId: this.entityId,
    };
  }
}
