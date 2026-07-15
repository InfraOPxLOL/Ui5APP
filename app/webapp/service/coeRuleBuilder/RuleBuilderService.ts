import BaseService from "../../core/base/BaseService";
import type { Rule, RuleListDto, RuleSaveRequest } from "./RuleBuilderTypes";

/**
 * Data service for the CoE Visual Rule Builder workspace. Consumes **only**
 * `/api/v1/coe-rule-builder`, composed from the Operations Engine's Partner Directory engine — the
 * workspace never sees the base64/binary-parameter storage detail, only plain `Rule` JSON.
 */
export default class RuleBuilderService extends BaseService {
  public constructor() {
    super("/api/v1/coe-rule-builder");
  }

  /**
   * Lists the rules under a registry PID.
   * @param pid the owning Partner ID.
   * @param signal optional abort signal.
   * @returns the rule summaries.
   */
  public async list(pid: string, signal?: AbortSignal): Promise<RuleListDto> {
    return this.client.get<RuleListDto>(this.path("list"), { query: { pid }, signal });
  }

  /**
   * Reads and decodes one rule.
   * @param pid the owning Partner ID.
   * @param id the rule name.
   * @param signal optional abort signal.
   * @returns the decoded rule.
   */
  public async get(pid: string, id: string, signal?: AbortSignal): Promise<Rule> {
    return this.client.get<Rule>(this.path(), { query: { pid, id }, signal });
  }

  /**
   * Creates or updates one rule.
   * @param request the rule to persist.
   * @returns the persisted rule.
   */
  public async save(request: RuleSaveRequest): Promise<Rule> {
    return this.client.put<Rule, RuleSaveRequest>(this.path(), request);
  }

  /**
   * Deletes one rule.
   * @param pid the owning Partner ID.
   * @param id the rule name.
   */
  public async remove(pid: string, id: string): Promise<void> {
    await this.client.delete<void>(this.path(), { query: { pid, id } });
  }
}
