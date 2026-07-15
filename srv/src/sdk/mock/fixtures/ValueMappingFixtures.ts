import type { ValueMappingScheme } from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";

const SCHEME_NAMES = ["CountryCodes", "CurrencyCodes", "UnitOfMeasure", "PaymentTerms"];

/**
 * Generates a deterministic list of realistic {@link ValueMappingScheme} entries for the mock
 * engine's `ValueMappingProvider` implementation.
 * @param count number of schemes to generate.
 * @param seed PRNG seed for reproducibility (default 42).
 * @returns the generated schemes.
 */
export function generateValueMappingSchemes(count: number, seed = 42): ValueMappingScheme[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const name = SCHEME_NAMES[index % SCHEME_NAMES.length] ?? `Scheme_${index}`;
    return {
      name,
      description: `Maps ${name} between sender and receiver systems.`,
      agencies: [
        {
          agency: "SAP",
          identifier: `${name}_SRC`,
          entries: Array.from({ length: rng.int(2, 5) }, (_, entryIndex) => ({
            sourceValue: `SRC_${entryIndex}`,
            targetValue: `TGT_${entryIndex}`,
          })),
        },
      ],
    };
  });
}
