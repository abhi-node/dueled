// Export all models
export * from './Player.js';
export * from './Match.js';

// Common database types
export interface DatabaseRow {
  [key: string]: any;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  page?: number;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Query builder helpers
export interface QueryBuilder {
  select: string[];
  from: string;
  joins: string[];
  where: string[];
  orderBy: string[];
  limit?: number;
  offset?: number;
  params: any[];
}

// Common constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Database connection status
export interface DatabaseStatus {
  connected: boolean;
  pool_size: number;
  active_connections: number;
  idle_connections: number;
}

// Transaction context
export interface TransactionContext {
  query: (text: string, params?: any[]) => Promise<any>;
  rollback: () => Promise<void>;
  commit: () => Promise<void>;
}