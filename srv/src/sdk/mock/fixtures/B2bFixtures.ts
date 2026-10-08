import type {
  B2bInterchange,
  B2bInterchangeDetail,
  B2bPayloadContent,
  B2bPayloadInfo,
  B2bProcessingEvent,
} from "../../../core/providers/types.js";
import { SeededRandom } from "../SeededRandom.js";
import {
  MOCK_OWN_COMPANY,
  TPM_DLQ_SCENARIOS,
  priorRunMplId,
  scenarioFailedAt,
  type TpmDlqScenario,
} from "./TpmScenarioFixtures.js";

const PARTNERS = [
  "AMAZONJP (Hills)",
  "WALMART_US",
  "TARGET_CORP",
  "COSTCO",
  "KROGER",
  "HOME_DEPOT",
  "BOSCH_DE",
  "METRO_AG",
];

const X12_TYPES = ["850", "855", "856", "810", "997"];
const EDIFACT_TYPES = ["ORDERS", "ORDRSP", "DESADV", "INVOIC"];
const STATUSES = [
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "COMPLETED",
  "PROCESSING",
  "RETRYING",
  "FAILED",
];
const ADAPTERS = ["AS2", "SFTP", "AS2", "HTTPS"];

/** Statuses that mean "finished", so `EndedAt` is set. */
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

function hex(rng: SeededRandom, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += rng.int(0, 15).toString(16);
  }
  return out;
}

function partySide(
  partner: string,
  standard: string,
  messageType: string,
  controlNumber: string,
  adapter: string,
  group: string,
): B2bInterchange["sender"] {
  return {
    tradingPartnerName: partner,
    communicationPartnerName: partner,
    systemId: partner.split(" ")[0]?.toUpperCase(),
    adapterType: adapter,
    documentStandard: standard,
    messageType,
    interchangeControlNumber: controlNumber,
    groupControlNumber: group,
    messageNumber: "0001",
  };
}

function fromScenario(scenario: TpmDlqScenario, now: number): B2bInterchange {
  const startedAt = scenarioFailedAt(scenario, now).toISOString();
  const inbound = scenario.receiverPartner === MOCK_OWN_COMPANY;
  return {
    id: scenario.interchangeId,
    overallStatus: "FAILED",
    processingStatus: "FAILED",
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 4_200).toISOString(),
    documentCreationTime: startedAt,
    interchangeName: `${scenario.documentStandard} ${scenario.messageType} ${scenario.controlNumber}`,
    direction: inbound ? "INBOUND" : "OUTBOUND",
    agreementTypeName: `${inbound ? scenario.senderPartner : scenario.receiverPartner} ${scenario.messageType}`,
    transactionTypeName: inbound ? "Inbound" : "Outbound",
    transactionDocumentType: scenario.messageType,
    receiverTechnicalAckStatus: undefined,
    receiverFunctionalAckStatus: undefined,
    archivingStatus: undefined,
    retryAllowed: true,
    resendAllowed: false,
    sender: partySide(
      scenario.senderPartner,
      scenario.documentStandard,
      scenario.messageType,
      scenario.controlNumber,
      "AS2",
      "1",
    ),
    receiver: partySide(
      scenario.receiverPartner,
      scenario.documentStandard,
      scenario.messageType,
      scenario.controlNumber,
      "SFTP",
      "1",
    ),
  };
}

/**
 * Deterministic B2B interchanges, newest first: `count` seeded rows plus one FAILED interchange per
 * TPM DLQ scenario (so the Failed Transactions → interchange join resolves in mock mode).
 */
export function generateInterchanges(count: number, seed = 42, now = Date.now()): B2bInterchange[] {
  const rng = new SeededRandom(seed);
  const rows: B2bInterchange[] = Array.from({ length: count }, (_, index) => {
    const edifact = rng.chance(0.3);
    const standard = edifact ? "UN-EDIFACT" : "ASC-X12";
    const messageType = rng.pick(edifact ? EDIFACT_TYPES : X12_TYPES);
    const partner = rng.pick(PARTNERS);
    const inbound = rng.chance(0.6);
    const status = rng.pick(STATUSES);
    const start = now - index * 47 * 60_000 - rng.int(0, 40 * 60_000);
    const control = edifact
      ? String(rng.int(1000, 9999))
      : String(rng.int(10000, 99999)).padStart(9, "0");
    const adapter = rng.pick(ADAPTERS);
    return {
      id: hex(rng, 32),
      overallStatus: status,
      processingStatus: status,
      startedAt: new Date(start).toISOString(),
      endedAt: TERMINAL.has(status)
        ? new Date(start + rng.int(900, 9_000)).toISOString()
        : undefined,
      documentCreationTime: new Date(start - 30_000).toISOString(),
      interchangeName: `${standard} ${messageType} ${control}`,
      direction: inbound ? "INBOUND" : "OUTBOUND",
      agreementTypeName: `${partner} ${messageType}`,
      transactionTypeName: inbound ? "Inbound" : "Outbound",
      transactionDocumentType: messageType,
      receiverTechnicalAckStatus: status === "COMPLETED" ? "ACCEPTED" : undefined,
      receiverFunctionalAckStatus: status === "COMPLETED" && !edifact ? "ACCEPTED" : undefined,
      archivingStatus: undefined,
      retryAllowed: status === "FAILED",
      resendAllowed: status === "COMPLETED",
      sender: partySide(
        inbound ? partner : MOCK_OWN_COMPANY,
        standard,
        messageType,
        control,
        adapter,
        String(rng.int(1, 99)),
      ),
      receiver: partySide(
        inbound ? MOCK_OWN_COMPANY : partner,
        standard,
        messageType,
        control,
        adapter,
        String(rng.int(1, 99)),
      ),
    };
  });
  for (const scenario of TPM_DLQ_SCENARIOS) {
    rows.push(fromScenario(scenario, now));
  }
  return rows.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

/** Processing events for one interchange; DLQ scenarios get one failed run event per attempt. */
function eventsFor(
  interchange: B2bInterchange,
  scenario: TpmDlqScenario | undefined,
): B2bProcessingEvent[] {
  const started = new Date(interchange.startedAt ?? Date.now()).getTime();
  if (scenario !== undefined) {
    const events: B2bProcessingEvent[] = [];
    for (let attempt = scenario.priorRuns; attempt >= 0; attempt -= 1) {
      const at = started - attempt * 20 * 60_000;
      const mplId =
        attempt === 0 ? scenario.mplId : priorRunMplId(scenario, scenario.priorRuns - attempt + 1);
      events.push(
        {
          id: `${mplId}-recv`,
          eventType: "RECEIVED",
          date: new Date(at).toISOString(),
          monitoringType: "MPL",
          monitoringId: mplId,
        },
        {
          id: `${mplId}-fail`,
          eventType: "FAILED",
          date: new Date(at + 4_200).toISOString(),
          monitoringType: "MPL",
          monitoringId: mplId,
        },
      );
    }
    return events;
  }
  const mplId = `mpl-${interchange.id.slice(0, 12)}`;
  const events: B2bProcessingEvent[] = [
    {
      id: `${interchange.id}-1`,
      eventType: "RECEIVED",
      date: new Date(started).toISOString(),
      monitoringType: "MPL",
      monitoringId: mplId,
    },
    {
      id: `${interchange.id}-2`,
      eventType: "MAPPED",
      date: new Date(started + 600).toISOString(),
      monitoringType: "MPL",
      monitoringId: mplId,
    },
  ];
  if (interchange.overallStatus === "COMPLETED") {
    events.push({
      id: `${interchange.id}-3`,
      eventType: "DELIVERED",
      date: interchange.endedAt,
      monitoringType: "MPL",
      monitoringId: mplId,
    });
  } else if (interchange.overallStatus === "FAILED") {
    events.push({
      id: `${interchange.id}-3`,
      eventType: "FAILED",
      date: interchange.endedAt,
      monitoringType: "MPL",
      monitoringId: mplId,
    });
  }
  return events;
}

function payloadsFor(interchange: B2bInterchange): B2bPayloadInfo[] {
  const edi =
    interchange.sender.documentStandard === "UN-EDIFACT"
      ? "application/edifact"
      : "application/edi-x12";
  return [
    {
      id: `${interchange.id}-in`,
      payloadId: `${interchange.id}-in`,
      direction: "INBOUND",
      processingState: "RECEIVED",
      contentType: edi,
      containerContentType: edi,
    },
    {
      id: `${interchange.id}-out`,
      payloadId: `${interchange.id}-out`,
      direction: "OUTBOUND",
      processingState: interchange.overallStatus === "FAILED" ? "NOT_SENT" : "SENT",
      contentType: "application/xml",
      containerContentType: "application/xml",
    },
  ];
}

/** Builds the detail view for one interchange from the generated set. */
export function generateInterchangeDetail(
  interchanges: readonly B2bInterchange[],
  id: string,
): B2bInterchangeDetail | undefined {
  const interchange = interchanges.find((row) => row.id === id);
  if (interchange === undefined) {
    return undefined;
  }
  const scenario = TPM_DLQ_SCENARIOS.find((s) => s.interchangeId === id);
  const errors =
    interchange.overallStatus === "FAILED"
      ? [
          {
            id: `${id}-err`,
            errorInformation:
              scenario?.errorText ?? "Receiver system rejected the document (HTTP 500).",
            errorCategory: scenario === undefined ? "Receiver" : "Processing",
            transientError: scenario?.queueName.includes("RECEIVER") ?? true,
          },
        ]
      : [];
  return {
    interchange,
    events: eventsFor(interchange, scenario),
    payloads: payloadsFor(interchange),
    errors,
  };
}

/** Every processing event of the generated set — used to resolve an MPL id to its interchange. */
export function findInterchangeIdByMplId(
  interchanges: readonly B2bInterchange[],
  mplId: string,
): string | undefined {
  const scenario = TPM_DLQ_SCENARIOS.find(
    (s) =>
      s.mplId === mplId ||
      Array.from({ length: s.priorRuns }, (_, i) => priorRunMplId(s, i + 1)).includes(mplId),
  );
  if (scenario !== undefined) {
    return scenario.interchangeId;
  }
  return interchanges.find((row) => `mpl-${row.id.slice(0, 12)}` === mplId)?.id;
}

function x12Document(interchange: B2bInterchange): string {
  const control = interchange.sender.interchangeControlNumber ?? "000000001";
  const type = interchange.sender.messageType ?? "850";
  const date = (interchange.startedAt ?? "").slice(2, 10).replace(/-/g, "");
  return [
    `ISA*00*          *00*          *ZZ*${(interchange.sender.systemId ?? "SENDER").padEnd(15)}*ZZ*${(interchange.receiver.systemId ?? "RECEIVER").padEnd(15)}*${date}*1200*U*00401*${control}*0*P*>~`,
    `GS*PO*${interchange.sender.systemId ?? "SENDER"}*${interchange.receiver.systemId ?? "RECEIVER"}*20${date}*1200*1*X*004010~`,
    `ST*${type}*0001~`,
    type === "850"
      ? "BEG*00*SA*PO-4500012345**20" + date + "~"
      : `BSN*00*${control}*20${date}*1200~`,
    "N1*ST*Distribution Center 042*92*0042~",
    "PO1*1*120*CS*24.50**VP*SKU-88231*UP*012345678905~",
    "PO1*2*48*CS*11.20**VP*SKU-88232*UP*012345678912~",
    "CTT*2~",
    "SE*8*0001~",
    "GE*1*1~",
    `IEA*1*${control}~`,
  ].join("\n");
}

function edifactDocument(interchange: B2bInterchange): string {
  const control = interchange.sender.interchangeControlNumber ?? "1";
  const type = interchange.sender.messageType ?? "ORDERS";
  return [
    "UNA:+.? '",
    `UNB+UNOC:3+${interchange.sender.systemId ?? "SENDER"}:14+${interchange.receiver.systemId ?? "RECEIVER"}:14+${(interchange.startedAt ?? "").slice(2, 10).replace(/-/g, "")}:1200+${control}'`,
    `UNH+1+${type}:D:96A:UN'`,
    "BGM+220+PO-4500012345+9'",
    "NAD+BY+4012345000009::9'",
    "LIN+1++4012345678901:EN'",
    "QTY+21:120'",
    "UNS+S'",
    "UNT+8+1'",
    `UNZ+1+${control}'`,
  ].join("\n");
}

function xmlDocument(interchange: B2bInterchange): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ORDERS05>",
    '  <IDOC BEGIN="1">',
    `    <EDI_DC40 SEGMENT="1"><SNDPRN>${interchange.sender.systemId ?? ""}</SNDPRN><RCVPRN>${interchange.receiver.systemId ?? ""}</RCVPRN><MESTYP>ORDERS</MESTYP></EDI_DC40>`,
    `    <E1EDK01 SEGMENT="1"><BELNR>${interchange.sender.interchangeControlNumber ?? ""}</BELNR><CURCY>USD</CURCY></E1EDK01>`,
    '    <E1EDP01 SEGMENT="1"><POSEX>000010</POSEX><MENGE>120</MENGE><MENEE>CS</MENEE></E1EDP01>',
    "  </IDOC>",
    "</ORDERS05>",
  ].join("\n");
}

/** Payload content for one payload of the generated set. */
export function generatePayloadContent(
  interchanges: readonly B2bInterchange[],
  payloadEntityId: string,
): B2bPayloadContent | undefined {
  const interchangeId = payloadEntityId.replace(/-(in|out)$/, "");
  const interchange = interchanges.find((row) => row.id === interchangeId);
  if (interchange === undefined) {
    return undefined;
  }
  const info = payloadsFor(interchange).find((payload) => payload.id === payloadEntityId);
  if (info === undefined) {
    return undefined;
  }
  const content =
    info.direction === "OUTBOUND"
      ? xmlDocument(interchange)
      : interchange.sender.documentStandard === "UN-EDIFACT"
        ? edifactDocument(interchange)
        : x12Document(interchange);
  return { ...info, content, encoding: "text" };
}
