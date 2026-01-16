import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$lib/types/database';

export const handle: Handle = async ({ event, resolve }) => {
	// Create Supabase client for this request
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll() {
					return event.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	// Safe session getter that validates with the Supabase Auth server
	event.locals.safeGetSession = async () => {
		// Use getUser() to validate the session with the server
		// This is the secure approach recommended by Supabase
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) {
			return { session: null, user: null };
		}

		// Only get session data after user is validated
		// The session is needed for the access token on client-side
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		return { session, user };
	};

	// Get session and user for this request
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	// Load teacher profile if user is logged in
	if (user) {
		const { data: teacher } = await event.locals.supabase
			.from('teachers')
			.select('*')
			.eq('id', user.id)
			.single();

		event.locals.teacher = teacher;
	} else {
		event.locals.teacher = null;
	}

	// Protect dashboard routes
	if (event.url.pathname.startsWith('/dashboard')) {
		if (!user) {
			throw redirect(303, '/login');
		}
	}

	// Resolve the request
	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			// Allow Supabase auth headers to be serialized
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
