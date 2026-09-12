export interface FieldIssue {
  rowIndex?: number;
  path: string;
  code: string;
  message: string;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppErrorData };

export interface AppErrorData {
  code: string;
  message: string;
  fieldIssues?: FieldIssue[];
  retryable: boolean;
}

export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fieldIssues?: FieldIssue[];

  constructor(message: string, code = "INTERNAL_ERROR", retryable = false, fieldIssues?: FieldIssue[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
    this.fieldIssues = fieldIssues;
  }

  toData(): AppErrorData {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.fieldIssues ? { fieldIssues: this.fieldIssues } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldIssues?: FieldIssue[]) {
    super(message, "VALIDATION_ERROR", false, fieldIssues);
    this.name = "ValidationError";
  }
}

export class StorageUnavailableError extends AppError {
  constructor(message = "فضای ذخیره‌سازی محلی در دسترس نیست.") {
    super(message, "STORAGE_UNAVAILABLE", true);
    this.name = "StorageUnavailableError";
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = "فضای مجاز ذخیره‌سازی پر شده است.") {
    super(message, "QUOTA_EXCEEDED", false);
    this.name = "QuotaExceededError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "تعارض در نسخهٔ داده شناسایی شد.") {
    super(message, "CONFLICT_ERROR", true);
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "دسترسی غیرمجاز است.") {
    super(message, "UNAUTHORIZED", false);
    this.name = "UnauthorizedError";
  }
}

export class MissingMediaError extends AppError {
  constructor(message = "فایل رسانه موردنظر در این دستگاه موجود نیست.") {
    super(message, "MISSING_MEDIA", false);
    this.name = "MissingMediaError";
  }
}

export class UnsupportedSchemaError extends AppError {
  constructor(message = "نسخهٔ ساختار داده پشتیبانی نمی‌شود.") {
    super(message, "UNSUPPORTED_SCHEMA", false);
    this.name = "UnsupportedSchemaError";
  }
}

export class OperationOutcomeUnknownError extends AppError {
  constructor(message = "نتیجهٔ ذخیره‌سازی مشخص نیست؛ پیش از تکرار وضعیت را بررسی کنید.") {
    super(message, "OPERATION_OUTCOME_UNKNOWN", true);
    this.name = "OperationOutcomeUnknownError";
  }
}
