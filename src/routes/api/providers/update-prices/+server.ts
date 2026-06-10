import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { providersRepository } from '$lib/server/repositories/providers';
import { PREDEFINED_PROVIDERS, PROVIDER_PRICES_AS_OF } from '$lib/utils/constants';

/**
 * Syncs the predefined provider rows with the bundled price list shipped in
 * PREDEFINED_PROVIDERS (no live fetch — the list is verified manually and
 * stamped with PROVIDER_PRICES_AS_OF). Existing predefined models get their
 * prices refreshed (which invalidates cached scenario results via the
 * repository); models missing from the database are added.
 */
export const POST: RequestHandler = async () => {
  try {
    const existing = providersRepository.getAll();
    let updated = 0;
    let added = 0;

    for (const catalogEntry of PREDEFINED_PROVIDERS) {
      const match = existing.find(
        (p) => p.is_predefined && p.name === catalogEntry.name && p.model_name === catalogEntry.model_name
      );

      if (match) {
        if (match.input_price !== catalogEntry.input_price || match.output_price !== catalogEntry.output_price) {
          providersRepository.update(match.id, {
            input_price: catalogEntry.input_price,
            output_price: catalogEntry.output_price
          });
          updated++;
        }
      } else {
        providersRepository.create(catalogEntry);
        added++;
      }
    }

    return json({ success: true, updated, added, pricesAsOf: PROVIDER_PRICES_AS_OF });
  } catch (err: any) {
    console.error('Error syncing provider pricing:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
