import JSONModel from "sap/ui/model/json/JSONModel";
import type { SessionUser } from "../services/auth/SessionService";

/** Shape of the user model. */
export interface UserState {
  id: string;
  name: string;
  email: string;
  scopes: readonly string[];
  authenticated: boolean;
}

/**
 * Global user model: the authenticated user's identity and effective scopes for binding (header
 * chip, scope-gated affordances). Scope checks that gate *behaviour* go through the
 * SessionService; the backend re-validates every request regardless. Owned by the root component
 * (model name `user`).
 *
 * @namespace com.middlewareops.integrationportal.core.models
 */
export default class UserModel extends JSONModel {
  public constructor() {
    const initial: UserState = {
      id: "",
      name: "",
      email: "",
      scopes: [],
      authenticated: false,
    };
    super(initial);
    this.setDefaultBindingMode("OneWay");
  }

  /**
   * Populates the model from the loaded session.
   * @param user the authenticated session user.
   */
  public applyUser(user: SessionUser): void {
    this.setData({
      id: user.id,
      name: user.name,
      email: user.email,
      scopes: user.scopes,
      authenticated: true,
    } satisfies UserState);
  }
}
