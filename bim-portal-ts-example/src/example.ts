
import 'dotenv/config';
import { BIMPortalClient } from './client.js';

/**
 * Example: mirrors the reference sample's core features
 * - Lists organisations
 * - Gets organisation filter
 * - Searches property groups & properties
 * - Fetches details for first hit in each list (if available)
 */
async function main() {
  const client = new BIMPortalClient();

  console.log('Base URL:', process.env.BIM_PORTAL_BASE ?? 'https://www.bimdeutschland.de');
  console.log('Token set:', Boolean(process.env.BIM_PORTAL_TOKEN));

  // 1) Organisations
  const organisations = await client.listOrganisations();
  console.log(`\nOrganisations: ${Array.isArray(organisations) ? organisations.length : 'n/a'}`);
  console.log((organisations ?? []).slice(0, 5));

  // 2) Organisation filter used by the Merkmale UI
  const orgFilter = await client.getOrganisationFilter();
  console.log(`\nOrganisation filter entries: ${Array.isArray(orgFilter) ? orgFilter.length : 'n/a'}`);
  const firstOrgId = Array.isArray(orgFilter) && orgFilter.length ? (orgFilter[0]?.id ?? orgFilter[0]?.value ?? orgFilter[0]) : undefined;

  // Common params (adjust as needed based on your data)
  const params = {
    page: 0,
    size: 10,
    search: 'Tür', // try a German term commonly found in properties
    ...(firstOrgId ? { organisationIds: [firstOrgId] } : {})
  };

  // 3) Property groups
  const pg = await client.searchPropertyGroups(params);
  console.log('\nProperty groups (first page):');
  console.log(pg);

  // If the payload includes an array of items, try to pick a guid/id
  const firstPgGuid = pg?.content?.[0]?.guid ?? pg?.items?.[0]?.guid ?? pg?.[0]?.guid ?? undefined;
  if (firstPgGuid) {
    const detail = await client.getPropertyGroupByGuid(firstPgGuid);
    console.log(`\nProperty group detail (${firstPgGuid}):`);
    console.dir(detail, { depth: 3 });
  }

  // 4) Properties
  const props = await client.searchProperties(params);
  console.log('\nProperties (first page):');
  console.log(props);

  const firstPropGuid = props?.content?.[0]?.guid ?? props?.items?.[0]?.guid ?? props?.[0]?.guid ?? undefined;
  if (firstPropGuid) {
    const propDetail = await client.getPropertyByGuid(firstPropGuid);
    console.log(`\nProperty detail (${firstPropGuid}):`);
    console.dir(propDetail, { depth: 3 });
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
