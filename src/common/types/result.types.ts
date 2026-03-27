export { Result, ok, err, Ok, Err } from 'neverthrow';

export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class DatabaseError extends DomainError {
  readonly code = 'DATABASE_ERROR';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

export class ExtractionError extends DomainError {
  readonly code = 'EXTRACTION_ERROR';
}

export class FileSystemError extends DomainError {
  readonly code = 'FILESYSTEM_ERROR';
  constructor(message: string, public readonly path: string) {
    super(`${message}: ${path}`);
  }
}
