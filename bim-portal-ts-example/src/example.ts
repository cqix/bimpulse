
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
  // console.log(`\nOrganisations: ${Array.isArray(organisations) ? organisations.length : 'n/a'}`);
  // console.log((organisations ?? []).slice(0, 500));

  // Get AIA-Beispiel Bundesbauten
  const term = 'AIA-Beispiel Bundesbauten'.toLowerCase();

  const matches = (organisations ?? []).filter(org => {
    const name =
        String(org?.name ?? org?.displayName ?? org?.title ?? org?.label ?? '');
    return name.toLowerCase().includes(term);
  });

  let firstOrgId;
  if (matches.length > 0) {
    // Alle passenden Namen
    const names = matches.map(o => o.name ?? o.displayName ?? o.title ?? o.label);
    console.log('Gefundene Namen:', names);

    // Optional: erster Treffer mit ID/Guid
    const first = matches[0];
    console.log('Erster Treffer:', {
      id: first.id ?? first.guid ?? first.uuid ?? first.organisationId ?? '<ID_PLACEHOLDER>',
      name: first.name ?? first.displayName ?? first.title ?? first.label
    });
    firstOrgId = first.id ?? first.guid ?? first.uuid ?? first.organisationId ?? undefined;
  } else {
    console.log('Kein Treffer für "AIA-Beispiel Bundesbauten".');
    return;
  }

  // 4) AIA: Projects
  // console.log('\n[AIA] Listing projects...');
  // const params = { organisationGuids: [firstOrgId] };
  // try {
  //   const projects = await client.searchProjects(params);
  //   console.log(`[AIA] Found ${projects.length} projects (showing up to 5):`);
  //   console.log(projects.slice(0, 5));
  // } catch (e) {
  //   console.error('[AIA] ERROR while listing projects:', e);
  // }


  const formData = new FormData();
  formData.append('searchString', "Ableiter");
  try {
    const properties = await client.searchProperties(formData);
    console.log(`[AIA] Found ${properties.length} properties (showing up to 5):`);
    console.log(properties.slice(0, 5));
  } catch (e) {
    console.error('[AIA] ERROR while listing properties:', e);
  }



  console.log('\nDone.');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
