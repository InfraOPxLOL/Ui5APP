/**
 * What changed in the Integration Portal, release by release, newest first — shown in the bell's
 * "What's new" tab and on the Updates page. Written for the people who use the portal, not for
 * developers: what they can now do and where. Add a release at the top when shipping; the newest
 * release's id is what "seen" is measured against.
 *
 * Content is data (like the frameworks configuration), not UI chrome, so it lives here in English
 * rather than in the i18n bundles.
 */

/** New capability, improvement to an existing one, or a fix. */
export type UpdateType = "new" | "improved" | "fixed";

/** The part of the portal a change belongs to (labels: `updates.area.<key>` in the root bundle). */
export type UpdateArea = "operations" | "monitoring" | "recovery" | "coe" | "platform";

export interface UpdateItem {
  readonly type: UpdateType;
  readonly area: UpdateArea;
  readonly title: string;
  readonly description: string;
  /** A route to try the change, when it has a screen of its own. */
  readonly route?: string;
}

export interface Release {
  /** Unique and ordered: a later release always has a later id. */
  readonly id: string;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  readonly title: string;
  readonly summary: string;
  readonly items: readonly UpdateItem[];
}

export const RELEASES: readonly Release[] = [
  {
    id: "2026-10-27",
    date: "2026-10-27",
    title: "Sign out",
    summary: "End your session from the portal itself — useful to pick up newly assigned roles.",
    items: [
      {
        type: "new",
        area: "platform",
        title: "Sign out",
        description:
          "Sign out from the account menu (top right) or the Home page. It ends both the portal and the SAP BTP sign-in, so signing in again picks up role collections assigned in the meantime — no private window needed.",
        route: "home",
      },
    ],
  },
  {
    id: "2026-10-26.2",
    date: "2026-10-26",
    title: "Transaction journey and What's new",
    summary:
      "See how a transaction travelled through the frameworks, where it is stuck and what to do next — and find every portal change in one place.",
    items: [
      {
        type: "new",
        area: "operations",
        title: "Transaction journey",
        description:
          "A new Journey tab in the Report Server and Failed Transactions draws the path a transaction took — sender, Common IDoc Router, JMS framework or TPM, business flow, receiver — marks the stage it is at now, and shows the dead-letter queue it is parked on with where a retry would send it.",
        route: "reportServer",
      },
      {
        type: "new",
        area: "operations",
        title: "Next best action",
        description:
          "Every journey reads the error and suggests what to do: retry, fix the Partner Directory routing, correct the data or mapping, check the receiving system, choose a queue, or simply wait — with a link straight to the screen where you can act.",
      },
      {
        type: "new",
        area: "operations",
        title: "Track Transaction",
        description:
          "Paste any correlation ID, processing log (MPL) ID or B2B interchange ID and see its journey. The link can be shared, and recently tracked IDs are one click away.",
        route: "trackTransaction",
      },
      {
        type: "new",
        area: "platform",
        title: "What's new and Updates page",
        description:
          "The bell now has a What's new tab, and the Updates page lists every change to the portal since its first version, filterable by area and kind of change.",
        route: "updates",
      },
      {
        type: "improved",
        area: "operations",
        title: "Retry results in your notifications",
        description:
          "The outcome of each retry from Failed Transactions is also posted to the bell, so you can check it later.",
      },
    ],
  },
  {
    id: "2026-10-26.1",
    date: "2026-10-26",
    title: "Non-B2B transactions",
    summary:
      "The Report Server and Failed Transactions now cover every transaction, not only B2B: the JMS framework and the Common IDoc Router included.",
    items: [
      {
        type: "new",
        area: "operations",
        title: "Non-B2B Report Server",
        description:
          "Switch the Report Server to Non-B2B to see all other transactions, read from the processing logs and folded into one row per correlation ID, with sender and receiver, the router and JMS queue used, every step, its errors and its payload.",
        route: "reportServer",
      },
      {
        type: "new",
        area: "operations",
        title: "JMS and router dead-letter queues in Failed Transactions",
        description:
          "Messages on Common_JMS_ID_DLQ and Common_JMS_ID_Router_DLQ can be retried from Failed Transactions. A router retry returns the message to Common_JMS_ID_Common_Router.",
        route: "failedTransactions",
      },
      {
        type: "new",
        area: "operations",
        title: "Retry target found automatically",
        description:
          "A JMS retry goes to the queue named in the ingress dispatcher's queue header; without it, to the queue of the consumer flow that picked the message up; and when neither says, you choose the queue from a list.",
      },
      {
        type: "improved",
        area: "platform",
        title: "Framework names in configuration",
        description:
          "Integration flow names, queues and the consumer-to-queue table live in the frameworks configuration, so a renamed flow or queue needs no new release.",
      },
    ],
  },
  {
    id: "2026-10-09",
    date: "2026-10-09",
    title: "Search, saved views and connected screens",
    summary:
      "Find interchanges faster, keep your searches, and move between screens without losing the transaction you were looking at.",
    items: [
      {
        type: "new",
        area: "operations",
        title: "Time presets and advanced search",
        description:
          "Pick a window from 1 minute to 3 months, and open More filters for 13 additional fields — including an MPL ID that finds its interchange.",
        route: "reportServer",
      },
      {
        type: "new",
        area: "operations",
        title: "Saved views and share links",
        description:
          "Save a search as a view and load it next time, or copy a link that opens the Report Server with the same search for a colleague.",
        route: "reportServer",
      },
      {
        type: "new",
        area: "operations",
        title: "MPL ID and linked interchange in Failed Transactions",
        description:
          "Each failed message shows its processing log ID, the B2B interchange it belongs to, and its payload read straight from the JMS queue.",
        route: "failedTransactions",
      },
      {
        type: "fixed",
        area: "monitoring",
        title: "Payload Studio opens payloads",
        description:
          "Payloads opened from Message Monitoring, Failed Transactions or an interchange now load in Payload Studio.",
      },
      {
        type: "fixed",
        area: "operations",
        title: "Retry moves messages out of the dead-letter queue",
        description:
          "Retrying a failed transaction now moves it from the dead-letter queue to its processing queue before retrying it.",
      },
      {
        type: "fixed",
        area: "platform",
        title: "No more “Session expired” on Retry",
        description: "Retry and other actions no longer fail with a session error on BTP.",
      },
    ],
  },
  {
    id: "2026-10-08.2",
    date: "2026-10-08",
    title: "Report Server and Failed Transactions",
    summary:
      "The Operations workspace is rebuilt around two business jobs: following B2B transactions and recovering the ones that failed.",
    items: [
      {
        type: "new",
        area: "operations",
        title: "Report Server",
        description:
          "Every B2B interchange from the Trading Partner Management B2B Monitor: trading partners, document standard and message type, control numbers, status, events, errors and payloads.",
        route: "reportServer",
      },
      {
        type: "new",
        area: "operations",
        title: "Failed Transactions",
        description:
          "Messages on the TPM dead-letter queues with a Retry that moves each one to its processing queue, checks it arrived and retries it — plus how many times it has failed before.",
        route: "failedTransactions",
      },
      {
        type: "improved",
        area: "operations",
        title: "A simpler Operations workspace",
        description:
          "Operations is now Dashboard, Report Server, Failed Transactions and Alerts. Message Monitoring stays available from the screens that link to a processing log.",
        route: "dashboard",
      },
    ],
  },
  {
    id: "2026-10-08.1",
    date: "2026-10-08",
    title: "Portal back online on BTP",
    summary: "The portal loads reliably again on SAP BTP, and Message Monitoring gains B2B search fields.",
    items: [
      {
        type: "fixed",
        area: "platform",
        title: "Portal loads on BTP",
        description:
          "Fixed the error page (503) some users saw when opening the portal after a deployment.",
      },
      {
        type: "improved",
        area: "monitoring",
        title: "B2B fields in Message Monitoring",
        description:
          "Search and show messages by sender or receiver interchange control number and by business role (sender, receiver or both).",
        route: "messageMonitoring",
      },
    ],
  },
  {
    id: "2026-09-03",
    date: "2026-09-03",
    title: "Runs on SAP BTP Cloud Foundry",
    summary: "The portal can be deployed to SAP BTP with single sign-on and role-based access.",
    items: [
      {
        type: "new",
        area: "platform",
        title: "One-step deployment to Cloud Foundry",
        description:
          "The portal deploys as one package with its own approuter, user authentication (XSUAA) and the HTML5 Application Repository.",
      },
    ],
  },
  {
    id: "2026-08-19",
    date: "2026-08-19",
    title: "Framework-aware recovery",
    summary:
      "Message Monitoring recognises which framework processed a message and recovers it the way that framework needs.",
    items: [
      {
        type: "new",
        area: "monitoring",
        title: "Processing framework on every message",
        description:
          "Each message shows whether TPM, the JMS framework, the Common IDoc Router or IDoc status sync handled it, with a filter by framework and by recovery state.",
        route: "messageMonitoring",
      },
      {
        type: "new",
        area: "recovery",
        title: "Recover Now",
        description:
          "A Recovery tab shows where the message is, where it should go and the steps a recovery takes; Recover Now runs them and reports each step's real outcome.",
      },
      {
        type: "new",
        area: "recovery",
        title: "Bulk recovery plan",
        description:
          "Select several messages to see which can be recovered and why others cannot, then run the plan and get a result per message. A message is never recovered twice at the same time.",
      },
    ],
  },
  {
    id: "2026-08-09",
    date: "2026-08-09",
    title: "Partners & Routes",
    summary: "The CoE Framework workspace is simpler: start from a partner and work on its routes.",
    items: [
      {
        type: "improved",
        area: "coe",
        title: "Partners & Routes",
        description:
          "Route Creation, Partner Dashboard, Parameter Registry and Rule Builder are now tabs of one Partners & Routes screen: pick a partner, see its routes, and add a new one in place.",
        route: "coePartnersRoutes",
      },
      {
        type: "improved",
        area: "monitoring",
        title: "Delete saved searches",
        description: "Saved searches in Message Monitoring can now be deleted.",
      },
    ],
  },
  {
    id: "2026-07-27",
    date: "2026-07-27",
    title: "Routing rules in the route wizards",
    summary: "When a sender and receiver route to more than one target, the wizards help you add the rule that decides.",
    items: [
      {
        type: "new",
        area: "coe",
        title: "Disambiguation rule step",
        description:
          "The route wizards detect when a sender/receiver pair already routes elsewhere and let you author the rule that tells the targets apart, without leaving the wizard.",
      },
      {
        type: "improved",
        area: "coe",
        title: "Rule Builder: visual and raw JSON",
        description:
          "Build agreement rulesets (identifying queries and target routing) or X-Cast if / else-if / else rules visually, or edit the JSON directly.",
      },
    ],
  },
  {
    id: "2026-07-15",
    date: "2026-07-15",
    title: "Integration Operations Platform",
    summary:
      "The first full release: one portal to monitor, recover and configure SAP Integration Suite.",
    items: [
      {
        type: "new",
        area: "monitoring",
        title: "Monitoring",
        description:
          "Dashboard, Message Monitoring with processing logs and payloads, Payload Studio and Alerts.",
        route: "dashboard",
      },
      {
        type: "new",
        area: "recovery",
        title: "Retry and Recovery Centers",
        description:
          "Message Replay, JMS queue management, and a Recovery Center for messages parked on dead-letter and retry queues.",
        route: "recoveryCenter",
      },
      {
        type: "new",
        area: "monitoring",
        title: "Runtime and Certificate & Security Centers",
        description:
          "Deployed integration flows with their health and history, and certificate expiry and security posture.",
        route: "runtimeCenter",
      },
      {
        type: "new",
        area: "coe",
        title: "CoE Framework",
        description:
          "Create JMS entries and Common Router routes in guided wizards, look up agreements in the Parameter Registry, browse partners and their routes, handle the CoE dead-letter queue and set global defaults.",
      },
      {
        type: "new",
        area: "platform",
        title: "Built for teams",
        description:
          "Workspaces per job, global search, tenant switching, favourites, quick actions and role-based access to every screen.",
      },
    ],
  },
  {
    id: "2026-07-06",
    date: "2026-07-06",
    title: "First version",
    summary: "The portal's foundation: an SAPUI5 application connected to the Integration Suite APIs.",
    items: [
      {
        type: "new",
        area: "platform",
        title: "Connected to SAP Integration Suite",
        description: "The application reads monitoring data straight from the Integration Suite OData APIs.",
      },
    ],
  },
];
