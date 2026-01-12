import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Teacher } from '$lib/types/database';

interface AuthState {
	user: User | null;
	teacher: Teacher | null;
	loading: boolean;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		user: null,
		teacher: null,
		loading: true
	});

	return {
		subscribe,
		init: async () => {
			const { data: { session } } = await supabase.auth.getSession();

			if (session?.user) {
				const { data: teacher } = await supabase
					.from('teachers')
					.select('*')
					.eq('id', session.user.id)
					.single();

				set({ user: session.user, teacher, loading: false });
			} else {
				set({ user: null, teacher: null, loading: false });
			}

			supabase.auth.onAuthStateChange(async (event, session) => {
				if (session?.user) {
					const { data: teacher } = await supabase
						.from('teachers')
						.select('*')
						.eq('id', session.user.id)
						.single();

					set({ user: session.user, teacher, loading: false });
				} else {
					set({ user: null, teacher: null, loading: false });
				}
			});
		},
		signOut: async () => {
			await supabase.auth.signOut();
			set({ user: null, teacher: null, loading: false });
		}
	};
}

export const auth = createAuthStore();
