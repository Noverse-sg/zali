// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database, Teacher } from '$lib/types/database';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
			teacher: Teacher | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
			teacher: Teacher | null;
			supabase?: SupabaseClient<Database>;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
