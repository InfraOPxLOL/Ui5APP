import type { ModuleDefinition, ResolvedModule } from "../../core/types/Module";
import ConfigService from "../../core/services/config/ConfigService";
import { Icons } from "../../core/constants/Icons";

/**
 * The single declarative registry of all application modules.
 *
 * The shell builds its side navigation purely from this list cross-referenced with
 * `config/features.json` enablement — adding a module means adding one entry here (plus the matching
 * route + `type: View` target in the root manifest and the layer folders), and **nothing in the
 * shell needs to change** (architecture §11, §12).
 */
export default class ModuleRegistry {
  private static readonly definitions: readonly ModuleDefinition[] = [
    {
      id: "dashboard",
      titleKey: "module.dashboard",
      icon: Icons.module.dashboard,
      route: "dashboard",
      group: "monitoring",
      phase: 1,
    },
    {
      id: "messageMonitoring",
      titleKey: "module.messageMonitoring",
      icon: Icons.module.messageMonitoring,
      route: "messageMonitoring",
      group: "monitoring",
      phase: 1,
    },
    {
      id: "payloadStudio",
      titleKey: "module.payloadStudio",
      icon: Icons.module.payloadStudio,
      route: "payloadStudio",
      group: "monitoring",
      phase: 10,
    },
    {
      id: "recoveryCenter",
      titleKey: "module.recoveryCenter",
      icon: Icons.module.recoveryCenter,
      route: "recoveryCenter",
      group: "operations",
      phase: 11,
    },
    {
      id: "runtimeCenter",
      titleKey: "module.runtimeCenter",
      icon: Icons.module.runtimeCenter,
      route: "runtimeCenter",
      group: "monitoring",
      phase: 12,
    },
    {
      id: "certificateSecurityCenter",
      titleKey: "module.certificateSecurityCenter",
      icon: Icons.module.certificateSecurityCenter,
      route: "certificateSecurityCenter",
      group: "governance",
      phase: 13,
    },
    {
      id: "jmsQueue",
      titleKey: "module.jmsQueue",
      icon: Icons.module.jmsQueue,
      route: "jmsQueue",
      group: "operations",
      phase: 1,
    },
    {
      id: "messageReplay",
      titleKey: "module.messageReplay",
      icon: Icons.module.messageReplay,
      route: "messageReplay",
      group: "operations",
      phase: 1,
      requiredScope: "MessageReplay.Execute",
    },
    {
      id: "alertNotification",
      titleKey: "module.alertNotification",
      icon: Icons.module.alertNotification,
      route: "alertNotification",
      group: "monitoring",
      phase: 1,
    },
    {
      id: "auditView",
      titleKey: "module.auditView",
      icon: Icons.module.auditView,
      route: "auditView",
      group: "governance",
      phase: 1,
    },
    {
      id: "roleView",
      titleKey: "module.roleView",
      icon: Icons.module.roleView,
      route: "roleView",
      group: "governance",
      phase: 1,
    },
    {
      id: "administration",
      titleKey: "module.administration",
      icon: Icons.module.administration,
      route: "administration",
      group: "administration",
      phase: 1,
      requiredScope: "Administration.Manage",
    },
    {
      id: "apiMonitoring",
      titleKey: "module.apiMonitoring",
      icon: Icons.module.apiMonitoring,
      route: "apiMonitoring",
      group: "monitoring",
      phase: 2,
    },
    {
      id: "integrationAdvisor",
      titleKey: "module.integrationAdvisor",
      icon: Icons.module.integrationAdvisor,
      route: "integrationAdvisor",
      group: "governance",
      phase: 3,
    },
    {
      id: "analytics",
      titleKey: "module.analytics",
      icon: Icons.module.analytics,
      route: "analytics",
      group: "monitoring",
      phase: 3,
    },
    {
      id: "coeAdmin",
      titleKey: "module.coeAdmin",
      icon: Icons.module.coeAdmin,
      route: "coeAdmin",
      group: "administration",
      phase: 20,
      requiredScope: "Administration.Manage",
    },
    {
      id: "coeRouter",
      titleKey: "module.coeRouter",
      icon: Icons.module.coeRouter,
      route: "coeRouter",
      group: "administration",
      phase: 20,
    },
    {
      id: "coeRegistry",
      titleKey: "module.coeRegistry",
      icon: Icons.module.coeRegistry,
      route: "coeRegistry",
      group: "administration",
      phase: 20,
    },
    {
      id: "coeDlq",
      titleKey: "module.coeDlq",
      icon: Icons.module.coeDlq,
      route: "coeDlq",
      group: "operations",
      phase: 20,
    },
    {
      id: "coeRuleBuilder",
      titleKey: "module.coeRuleBuilder",
      icon: Icons.module.coeRuleBuilder,
      route: "coeRuleBuilder",
      group: "administration",
      phase: 20,
    },
    {
      id: "coePartnerDashboard",
      titleKey: "module.coePartnerDashboard",
      icon: Icons.module.coePartnerDashboard,
      route: "coePartnerDashboard",
      group: "administration",
      phase: 20,
    },
  ];

  /**
   * @returns the immutable list of all declared module definitions, regardless of enablement.
   */
  public static getAll(): readonly ModuleDefinition[] {
    return ModuleRegistry.definitions;
  }

  /**
   * Resolves each module's enablement against the loaded runtime configuration.
   * @returns the modules enriched with their `enabled` flag.
   */
  public static getResolved(): readonly ResolvedModule[] {
    const config = ConfigService.getInstance();
    return ModuleRegistry.definitions.map((definition) => ({
      ...definition,
      enabled: config.isModuleEnabled(definition.id),
    }));
  }

  /**
   * @returns only the modules enabled for this deployment.
   */
  public static getEnabled(): readonly ResolvedModule[] {
    return ModuleRegistry.getResolved().filter((module) => module.enabled);
  }
}
