/**
 * Central registry of routing route names. Controllers navigate via these constants rather than
 * string literals, so a route rename is a single-point change and typos are caught at compile time.
 * Keys mirror the routes declared in the root `manifest.json`.
 */
export const RouteNames = {
  Root: "root",
  Home: "home",
  Dashboard: "dashboard",
  MessageMonitoring: "messageMonitoring",
  PayloadStudio: "payloadStudio",
  RecoveryCenter: "recoveryCenter",
  RuntimeCenter: "runtimeCenter",
  CertificateSecurityCenter: "certificateSecurityCenter",
  JmsQueue: "jmsQueue",
  MessageReplay: "messageReplay",
  AlertNotification: "alertNotification",
  AuditView: "auditView",
  RoleView: "roleView",
  Administration: "administration",
  ApiMonitoring: "apiMonitoring",
  IntegrationAdvisor: "integrationAdvisor",
  Analytics: "analytics",
} as const;

/** Union of all valid route names. */
export type RouteName = (typeof RouteNames)[keyof typeof RouteNames];
