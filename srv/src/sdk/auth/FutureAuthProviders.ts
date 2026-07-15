import { ServiceError } from "../../core/errors/ServiceError.js";
import type { IAuthProvider } from "./IAuthProvider.js";
import type { AuthContext, AuthType } from "./AuthTypes.js";

/**
 * Documented future extension points for authentication mechanisms not yet implemented
 * (architecture: Authentication Framework, §2 — "Future Principal Propagation", "Future X509",
 * "Future SAML"). Each satisfies {@link IAuthProvider} so {@link AuthProviderFactory} and the type
 * system already account for them; each fails loudly and immediately with a clear
 * {@link ServiceError} rather than silently returning no headers, so selecting one of these types
 * today is an explicit, visible configuration error — not a silent authentication bypass.
 *
 * `getAuthHeaders` returns a rejected `Promise` (via `Promise.reject`, not a synchronous `throw`)
 * so it honours the `IAuthProvider` contract exactly like every other implementation: callers using
 * `.catch(...)` chaining, not just `await` inside `try`/`catch`, observe the failure correctly.
 */

/** Principal propagation (forwarding the end-user's identity to Integration Suite). Not yet implemented. */
export class PrincipalPropagationAuthProvider implements IAuthProvider {
  public readonly type: AuthType = "principal-propagation";

  public getAuthHeaders(_context: AuthContext): Promise<Readonly<Record<string, string>>> {
    return Promise.reject(
      new ServiceError(
        "Principal propagation authentication is not yet implemented. This provider is a " +
          "documented extension point reserved for a future phase.",
      ),
    );
  }
}

/** Mutual TLS / X.509 client-certificate authentication. Not yet implemented. */
export class X509AuthProvider implements IAuthProvider {
  public readonly type: AuthType = "x509";

  public getAuthHeaders(_context: AuthContext): Promise<Readonly<Record<string, string>>> {
    return Promise.reject(
      new ServiceError(
        "X.509 client-certificate authentication is not yet implemented. This provider is a " +
          "documented extension point reserved for a future phase.",
      ),
    );
  }
}

/** SAML bearer-assertion authentication. Not yet implemented. */
export class SamlAuthProvider implements IAuthProvider {
  public readonly type: AuthType = "saml";

  public getAuthHeaders(_context: AuthContext): Promise<Readonly<Record<string, string>>> {
    return Promise.reject(
      new ServiceError(
        "SAML authentication is not yet implemented. This provider is a documented extension " +
          "point reserved for a future phase.",
      ),
    );
  }
}
