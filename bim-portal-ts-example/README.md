
# BIM-Portal TypeScript Example (Node 20+)

Minimal TypeScript client that mirrors the functionality of the sample clients in `pb40development/bim-portal`:
- List organisations
- Get the organisation filter
- Search public **property groups** and **properties**
- Fetch a single property group or property by GUID
- Optional Bearer token support (for non-public data, if you have access)

This uses Node 20+'s built-in **fetch** (no extra HTTP library) and `.env` for configuration.

## Quick start

```bash
# 1) Ensure Node >= 20
node -v

# 2) Install deps
npm i

# 3) Configure environment
cp .env.example .env
# edit .env if you have a token

# 4) Run the example
npm run example
# or build+run
npm run build && npm start
```

## What the example does

`src/example.ts` will:
1. List organisations from `/infrastruktur/api/v1/public/organisation`.
2. Fetch organisation options used by the Merkmale UI from `/merkmale/api/v1/propertygroup/organisation-filter`.
3. Query public **property groups** and **properties** with common parameters (`search`, `organisationIds`, `page`, `size`).
4. Fetch details for a single **property group** and **property** by GUID (if GUIDs are available in the search results).

> Endpoints and query parameters are based on the official Swagger and community notes. Some deployments may differ; adjust parameters as needed.

## Configuration

Create an `.env` file with the following variables (see `.env.example`):
- `BIM_PORTAL_BASE=https://www.bimdeutschland.de`
- `BIM_PORTAL_TOKEN=...` (optional Bearer token)

## Mapping to the referenced examples

- **API docs**: https://bimdeutschland.github.io/BIM-Portal-REST-API-Dokumentation/  
- **Example repo**: https://github.com/pb40development/bim-portal

This TS client mirrors the sample functionality (organisations, filters, public searches, detail fetches) in a modern TypeScript/Node setup with clean separation (`BIMPortalClient`) and an executable script (`example.ts`).

## Files

- `src/client.ts` — Reusable API client
- `src/example.ts` — CLI example demonstrating common calls

## License

MIT
