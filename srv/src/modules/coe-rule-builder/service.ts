import { createOperationsEngine } from "../../config/operationsEngineFactory.js";
import type { OperationsEngine } from "../../operations/OperationsEngine.js";
import type { PartnerDirectoryBinaryParameterDto } from "../../operations/dto/index.js";
import { HttpError } from "../../core/errors/HttpError.js";
import type { Rule, RuleListDto, RuleSummary } from "./dto.js";

/** Mock-engine settings used when the Operations Engine runs against the mock providers. */
const MOCK_CONFIG = { enabled: true, defaultScenario: "success" } as const;

/**
 * The content type the Visual Rule Builder always writes. Confirmed live: CPI's `BinaryParameters`
 * rejects standard MIME types (`400 Bad Request`, "invalid content type application/json") — it only
 * accepts the short tags `xml`, `xsd`, `xsl`, `json`, `text`, `crt`, `gz`, `zip`, `zlib`, optionally
 * with `;encoding=…`.
 */
const RULE_CONTENT_TYPE = "json;encoding=UTF-8";

/**
 * Aggregation service for the CoE Visual Rule Builder. Rules are Partner Directory **binary**
 * parameters (spec/`dto.ts`): this layer owns the JSON⇄base64 boundary entirely — every other layer,
 * frontend included, only ever sees plain `Rule` JSON. No SDK/OData/CPI shape leaves this layer.
 */
export class CoeRuleBuilderService {
  public constructor(
    private readonly engineFactory: () => OperationsEngine = () =>
      createOperationsEngine(MOCK_CONFIG),
  ) {}

  /**
   * Reads and decodes one rule.
   * @param pid the owning registry PID (e.g. `_Maintain_JMS_Agreements`).
   * @param id the rule name (matches a `RULESET_.{SNDPRN}.{RCVPRN}` candidate entry).
   * @returns the decoded rule.
   * @throws {HttpError} 404 when the rule does not exist.
   * @throws {SyntaxError} when the stored content is not valid JSON (surfaced, not swallowed — a
   *   corrupted/foreign binary parameter under this PID should fail loudly, not silently disappear).
   */
  public async getRule(pid: string, id: string): Promise<Rule> {
    const engine = this.engineFactory();
    const parameter = await engine.partnerDirectory.getBinaryParameter(pid, id);
    if (parameter === undefined) {
      throw HttpError.notFound(`No rule "${id}" under ${pid}.`);
    }
    return CoeRuleBuilderService.decode(parameter);
  }

  /**
   * Lists every rule under a registry PID, decoding just enough to summarize (`kind`) without
   * failing the whole list when one entry isn't recognized JSON — that entry's `kind` is reported
   * `undefined` instead.
   * @param pid the owning registry PID.
   * @returns the rule summaries (empty when the PID has none).
   */
  public async listRules(pid: string): Promise<RuleListDto> {
    const engine = this.engineFactory();
    const parameters = await engine.partnerDirectory.listBinaryParameters(pid);
    return {
      pid,
      rules: parameters.map((parameter): RuleSummary => {
        let kind: "ruleset" | "xcast" | undefined;
        try {
          const decoded = CoeRuleBuilderService.decode(parameter);
          kind = decoded.kind;
        } catch {
          kind = undefined;
        }
        return {
          pid: parameter.pid,
          id: parameter.id,
          kind,
          lastModifiedBy: parameter.lastModifiedBy,
          lastModifiedAt: parameter.lastModifiedAt,
        };
      }),
    };
  }

  /**
   * Encodes and persists one rule.
   * @param pid the owning registry PID.
   * @param id the rule name.
   * @param rule the rule content.
   * @returns the persisted rule as read back from the tenant.
   */
  public async saveRule(pid: string, id: string, rule: Rule): Promise<Rule> {
    const engine = this.engineFactory();
    const valueBase64 = Buffer.from(JSON.stringify(rule), "utf-8").toString("base64");
    const saved = await engine.partnerDirectory.saveBinaryParameter(
      pid,
      id,
      RULE_CONTENT_TYPE,
      valueBase64,
    );
    return CoeRuleBuilderService.decode(saved);
  }

  /**
   * Deletes one rule.
   * @param pid the owning registry PID.
   * @param id the rule name.
   */
  public async deleteRule(pid: string, id: string): Promise<void> {
    const engine = this.engineFactory();
    await engine.partnerDirectory.deleteBinaryParameter(pid, id);
  }

  private static decode(parameter: PartnerDirectoryBinaryParameterDto): Rule {
    const json = Buffer.from(parameter.valueBase64, "base64").toString("utf-8");
    return JSON.parse(json) as Rule;
  }
}

/** Shared service instance. */
export const coeRuleBuilderService = new CoeRuleBuilderService();
