import ConfigService from "../../core/services/config/ConfigService";
import TenantContext from "../context/TenantContext";

/** A fully-resolved branding descriptor for binding into the shell chrome and landing page (§17). */
export interface BrandingInfo {
  /** Product name (e.g. "Integration Portal"). */
  readonly applicationName: string;
  /** Display title shown in the header. */
  readonly applicationTitle: string;
  /** Semantic application version. */
  readonly version: string;
  /** Vendor / owning organisation. */
  readonly vendor: string;
  /** Company name for footer/branding. */
  readonly companyName: string;
  /** Application logo source (URI or data-URI); empty when unset. */
  readonly applicationLogo: string;
  /**
   * Company logo source. There is no separate company-logo key in `theme.json` today, so this
   * mirrors {@link applicationLogo}; a dedicated key can be added to configuration later without
   * changing consumers.
   */
  readonly companyLogo: string;
  /** Accent colour driving the shell's custom-styled surfaces. */
  readonly accentColor: string;
  /** Support contact (email/URL). */
  readonly supportContact: string;
  /** Documentation URL. */
  readonly documentationUrl: string;
}

/** Environment banner state (§17). Shown for non-production environments to prevent "wrong system" mistakes. */
export interface EnvironmentBanner {
  readonly label: string;
  readonly kind: string;
  /** Whether the banner should be displayed (hidden for production). */
  readonly show: boolean;
}

/** Tenant banner state (§17) — the identity chip for the currently-selected tenant. */
export interface TenantBanner {
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly show: boolean;
}

/**
 * The branding service (§17): the one place branding is resolved, entirely from configuration —
 * no logo, name, version, accent colour or banner text is hardcoded in a view or controller.
 * Application/company identity comes from `application.json` + `theme.json`; the environment and
 * tenant banners come from `environment.json` and the selected tenant.
 */
export default class BrandingService {
  private static instance: BrandingService | undefined;

  private constructor(
    private readonly config: ConfigService = ConfigService.getInstance(),
    private readonly tenants: TenantContext = TenantContext.getInstance(),
  ) {}

  /**
   * @returns the process-wide singleton branding service.
   */
  public static getInstance(): BrandingService {
    BrandingService.instance ??= new BrandingService();
    return BrandingService.instance;
  }

  /**
   * @returns a zeroed branding descriptor for pre-bootstrap/empty state binding.
   */
  public emptyBranding(): BrandingInfo {
    return {
      applicationName: "",
      applicationTitle: "",
      version: "",
      vendor: "",
      companyName: "",
      applicationLogo: "",
      companyLogo: "",
      accentColor: "",
      supportContact: "",
      documentationUrl: "",
    };
  }

  /**
   * @returns the resolved branding descriptor from configuration.
   */
  public getBranding(): BrandingInfo {
    const application = this.config.getApplication();
    const theme = this.config.getTheme();
    return {
      applicationName: application.name,
      applicationTitle: theme.applicationTitle,
      version: application.version,
      vendor: application.vendor,
      companyName: theme.companyName,
      applicationLogo: theme.logo,
      companyLogo: theme.logo,
      accentColor: theme.accentColor,
      supportContact: application.supportContact,
      documentationUrl: application.documentationUrl,
    };
  }

  /**
   * @returns the environment banner; shown unless the environment kind is `production`.
   */
  public getEnvironmentBanner(): EnvironmentBanner {
    const environment = this.config.getEnvironment();
    return {
      label: environment.label,
      kind: environment.kind,
      show: environment.kind.toLowerCase() !== "production",
    };
  }

  /**
   * @returns the tenant identity banner for the currently-selected tenant.
   */
  public getTenantBanner(): TenantBanner {
    const tenant = this.tenants.getCurrentTenant();
    if (tenant === null) {
      return { name: "", color: "", icon: "", show: false };
    }
    return {
      name: tenant.name,
      color: tenant.displayColor,
      icon: tenant.displayIcon,
      show: true,
    };
  }
}
