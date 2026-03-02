import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';
import type { Database } from '$lib/types/database';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	// Set up dependency tracking for auth invalidation
	depends('supabase:auth');

	// Create the appropriate Supabase client
	const supabase = isBrowser()
		? createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: {
					fetch
				}
			})
		: createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: {
					fetch
				},
				cookies: {
					getAll() {
						return data.cookies ?? [];
					},
					setAll() {
						// Server-side cookies are handled in hooks.server.ts
					}
				}
			});

	// Session and user are already validated in hooks.server.ts via getUser()
	// No need to call getSession() again - use the validated data from server
	return {
		supabase,
		session: data.session,
		user: data.user,
		teacher: data.teacher
	};
};
