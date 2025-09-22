
import 'dotenv/config';

type Query = Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;

export interface BIMPortalClientOptions {
  baseUrl?: string;
  accessToken?: string;
  userAgent?: string;
}

/**
 * Minimal TypeScript client for BIM-Portal REST API (Merkmale & Merkmalsgruppen).
 * Uses Node 20+ native fetch.
 */
export class BIMPortalClient {
  private baseUrl: string;
  private accessToken?: string;
  private userAgent: string;

  constructor(opts: BIMPortalClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.BIM_PORTAL_BASE ?? 'https://www.bimdeutschland.de').replace(/\/$/, '');
    this.accessToken = opts.accessToken ?? process.env.BIM_PORTAL_TOKEN ?? undefined;
    this.userAgent = opts.userAgent ?? 'bim-portal-ts-example/1.0 (+https://github.com/pb40development/bim-portal)';
  }

  /** Core request helper with basic retries */
  private async request<T>(path: string, query?: Query, init?: RequestInit, retries = 2): Promise<T> {
    const url = new URL(this.baseUrl + path);

    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const el of v) url.searchParams.append(k, String(el));
        } else {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: HeadersInit = {
      'accept': 'application/json',
      'user-agent': this.userAgent
    };
    if (this.accessToken) headers['authorization'] = `Bearer ${this.accessToken}`;
    if (init?.body && !(init.body instanceof FormData)) {
      headers['content-type'] = 'application/json';
    }

    const doFetch = async (): Promise<Response> => {
      return await fetch(url, { ...init, headers });
    };

    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await doFetch();
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        }
        // Try JSON first; some endpoints may return text
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          return await res.json() as T;
        }
        return await res.json() as T; // fallback assume JSON
      } catch (err) {
        lastErr = err;
        // simple retry on network / 5xx
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 300 * Math.pow(2, attempt)));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  }

  // --- Endpoints (based on official Swagger + community notes) ---

  /** Organisations available via REST API */
  listOrganisations() {
    // GET /infrastruktur/api/v1/public/organisation
    return this.request<any[]>('/infrastruktur/api/v1/public/organisation');
  }

  /** Search public property groups */
  searchPropertyGroups(params: Query) {
    // GET /merkmale/api/v1/propertygroup/public
    return this.request<any>('/merkmale/api/v1/propertygroup/public', params);
  }

  /** Fetch a single property group by GUID */
  getPropertyGroupByGuid(guid: string) {
    // GET /merkmale/api/v1/propertygroup/{guid}
    return this.request<any>(`/merkmale/api/v1/propertygroup/${encodeURIComponent(guid)}`);
  }

  /** Search public properties */
  searchProperties(params: string) {
    return this.request<any>('/merkmale/api/v1/public/property', {}, {
      method: 'POST',
      body: params
    });
  }

  /** Fetch a single property by GUID */
  getPropertyByGuid(guid: string) {
    // GET /merkmale/api/v1/property/{guid}
    return this.request<any>(`/merkmale/api/v1/property/${encodeURIComponent(guid)}`);
  }

  async searchProjects(params: Query) {
    return this.request<any>('/aia/api/v1/public/aiaProject', params, {
      method: 'POST',
    });
  }

  getProjectByGuid(guid: string) {
    // GET /aia/api/v1/public/aiaProject/{guid}
    return this.request<any>(`/aia/api/v1/public/aiaProject/${encodeURIComponent(guid)}`);
  }
}
