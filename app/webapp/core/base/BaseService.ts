import ApiClient from "../services/http/ApiClient";

/**
 * Abstract base class for **every** frontend module service.
 *
 * Services are the only layer permitted to call the {@link ApiClient}; controllers call services.
 * This base injects a shared {@link ApiClient} and pins each service to a base path
 * (`/api/v1/<module>`), so concrete services express endpoints as short, relative resource paths
 * and never repeat the URL prefix or construct absolute URLs.
 */
export default abstract class BaseService {
  protected readonly client: ApiClient;

  /** Base path for this service's module, e.g. `/api/v1/message-monitoring`. */
  protected readonly basePath: string;

  /**
   * @param basePath the module's API base path.
   * @param client optional {@link ApiClient} override (primarily for testing); defaults to the
   *   shared singleton.
   */
  protected constructor(basePath: string, client: ApiClient = ApiClient.getInstance()) {
    this.basePath = basePath;
    this.client = client;
  }

  /**
   * Joins the service base path with a relative resource path.
   * @param resource resource path relative to the module base (leading slash optional).
   * @returns the fully-qualified API path.
   */
  protected path(resource = ""): string {
    if (resource === "") {
      return this.basePath;
    }
    return `${this.basePath}/${resource.replace(/^\/+/, "")}`;
  }
}
