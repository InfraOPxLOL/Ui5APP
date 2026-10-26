import { RELEASES, type Release, type UpdateArea, type UpdateItem, type UpdateType } from "./ReleaseNotes";

/** The newest release this browser has seen. */
const SEEN_KEY = "integrationPortal.updates.lastSeen";

/** Reads and writes the "last seen" marker; injectable for tests. */
export interface SeenStore {
  get(): string | null;
  set(value: string): void;
}

/** Filters of the Updates page. Empty strings match everything. */
export interface UpdatesFilter {
  readonly type: "" | UpdateType;
  readonly area: "" | UpdateArea;
  readonly query: string;
}

/** An update flattened with its release, for the bell's short list. */
export interface RecentUpdate extends UpdateItem {
  readonly releaseId: string;
  readonly date: string;
  readonly unseen: boolean;
}

/** A release as the Updates page shows it: only the items the filter keeps. */
export interface ReleaseView extends Release {
  readonly unseen: boolean;
}

const browserStore: SeenStore = {
  get: () => {
    try {
      return window.localStorage.getItem(SEEN_KEY);
    } catch {
      return null;
    }
  },
  set: (value) => {
    try {
      window.localStorage.setItem(SEEN_KEY, value);
    } catch {
      // Storage unavailable: the updates show as new again next visit, which is harmless.
    }
  },
};

/**
 * What changed in the portal, and which of it this user has not seen yet. "Seen" is per browser:
 * the newest release id viewed is remembered; anything newer is new. A first visit shows only the
 * latest release as new, not the whole history.
 */
export default class UpdatesService {
  public constructor(
    private readonly releases: readonly Release[] = RELEASES,
    private readonly store: SeenStore = browserStore,
  ) {}

  public all(): readonly Release[] {
    return this.releases;
  }

  /** Releases newer than the last one seen (the latest one on a first visit). */
  public unseenReleaseIds(): ReadonlySet<string> {
    const seen = this.store.get();
    const latest = this.releases[0];
    if (latest === undefined) {
      return new Set();
    }
    if (seen === null) {
      return new Set([latest.id]);
    }
    return new Set(
      this.releases.filter((release) => release.id > seen).map((release) => release.id),
    );
  }

  /** How many changes are new to this user (the bell's count). */
  public unseenCount(): number {
    const unseen = this.unseenReleaseIds();
    return this.releases
      .filter((release) => unseen.has(release.id))
      .reduce((count, release) => count + release.items.length, 0);
  }

  /** Remembers that everything up to the newest release has been seen. */
  public markSeen(): void {
    const latest = this.releases[0];
    if (latest !== undefined) {
      this.store.set(latest.id);
    }
  }

  /** The newest changes, flattened, for the bell. */
  public recent(limit: number): RecentUpdate[] {
    const unseen = this.unseenReleaseIds();
    return this.releases
      .flatMap((release) =>
        release.items.map((item) => ({
          ...item,
          releaseId: release.id,
          date: release.date,
          unseen: unseen.has(release.id),
        })),
      )
      .slice(0, limit);
  }

  /** The releases with only the items the filter keeps; releases left empty are dropped. */
  public filtered(filter: UpdatesFilter): ReleaseView[] {
    const unseen = this.unseenReleaseIds();
    return UpdatesService.filter(this.releases, filter).map((release) => ({
      ...release,
      unseen: unseen.has(release.id),
    }));
  }

  /** Pure filtering: type, area, and words in the release or item text (case-insensitive). */
  public static filter(releases: readonly Release[], filter: UpdatesFilter): Release[] {
    const words = filter.query.toLowerCase().split(/\s+/).filter((word) => word !== "");
    return releases
      .map((release) => {
        const releaseText = `${release.title} ${release.summary}`.toLowerCase();
        const items = release.items.filter((item) => {
          if (filter.type !== "" && item.type !== filter.type) {
            return false;
          }
          if (filter.area !== "" && item.area !== filter.area) {
            return false;
          }
          const text = `${releaseText} ${item.title} ${item.description}`.toLowerCase();
          return words.every((word) => text.includes(word));
        });
        return { ...release, items };
      })
      .filter((release) => release.items.length > 0);
  }
}
