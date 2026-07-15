/**
 * Barrel for the SDK's transport-level error types and the HTTP→application error translator.
 * Domain-agnostic application errors (`AuthenticationError`, `ServiceError`, `IntegrationSuiteError`,
 * …) remain in `core/errors/` and are re-exported here for a single SDK error import site.
 */
export { NetworkError } from "./NetworkError.js";
export { TimeoutError } from "./TimeoutError.js";
export { RateLimitError } from "./RateLimitError.js";
export { ODataError } from "./ODataError.js";
export { HttpErrorTranslator } from "./HttpErrorTranslator.js";

export { AppError } from "../../core/errors/AppError.js";
export { HttpError } from "../../core/errors/HttpError.js";
export { AuthenticationError, AuthorizationError } from "../../core/errors/AuthErrors.js";
export { ConfigurationError } from "../../core/errors/ConfigurationError.js";
export { ServiceError } from "../../core/errors/ServiceError.js";
export { UpstreamError } from "../../core/errors/UpstreamError.js";
export { IntegrationSuiteError } from "../../core/errors/IntegrationSuiteError.js";
