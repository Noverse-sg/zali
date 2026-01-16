export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	__InternalSupabase: {
		PostgrestVersion: '14.1';
	};
	public: {
		Tables: {
			questions: {
				Row: {
					created_at: string | null;
					description: string | null;
					id: string;
					max_points: number;
					model_answer: string;
					teacher_id: string;
					time_limit_seconds: number;
					title: string;
					updated_at: string | null;
				};
				Insert: {
					created_at?: string | null;
					description?: string | null;
					id?: string;
					max_points?: number;
					model_answer: string;
					teacher_id: string;
					time_limit_seconds?: number;
					title: string;
					updated_at?: string | null;
				};
				Update: {
					created_at?: string | null;
					description?: string | null;
					id?: string;
					max_points?: number;
					model_answer?: string;
					teacher_id?: string;
					time_limit_seconds?: number;
					title?: string;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'questions_teacher_id_fkey';
						columns: ['teacher_id'];
						isOneToOne: false;
						referencedRelation: 'teachers';
						referencedColumns: ['id'];
					}
				];
			};
			sessions: {
				Row: {
					closed_at: string | null;
					code: string;
					created_at: string | null;
					id: string;
					question_id: string;
					started_at: string | null;
					status: string;
					teacher_id: string;
				};
				Insert: {
					closed_at?: string | null;
					code: string;
					created_at?: string | null;
					id?: string;
					question_id: string;
					started_at?: string | null;
					status?: string;
					teacher_id: string;
				};
				Update: {
					closed_at?: string | null;
					code?: string;
					created_at?: string | null;
					id?: string;
					question_id?: string;
					started_at?: string | null;
					status?: string;
					teacher_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'sessions_question_id_fkey';
						columns: ['question_id'];
						isOneToOne: false;
						referencedRelation: 'questions';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'sessions_teacher_id_fkey';
						columns: ['teacher_id'];
						isOneToOne: false;
						referencedRelation: 'teachers';
						referencedColumns: ['id'];
					}
				];
			};
			submissions: {
				Row: {
					feedback: string | null;
					id: string;
					marked_at: string | null;
					marked_image_url: string | null;
					max_score: number;
					mistakes: string[] | null;
					original_image_url: string;
					score: number | null;
					session_id: string;
					status: string;
					student_name: string;
					submitted_at: string | null;
				};
				Insert: {
					feedback?: string | null;
					id?: string;
					marked_at?: string | null;
					marked_image_url?: string | null;
					max_score: number;
					mistakes?: string[] | null;
					original_image_url: string;
					score?: number | null;
					session_id: string;
					status?: string;
					student_name: string;
					submitted_at?: string | null;
				};
				Update: {
					feedback?: string | null;
					id?: string;
					marked_at?: string | null;
					marked_image_url?: string | null;
					max_score?: number;
					mistakes?: string[] | null;
					original_image_url?: string;
					score?: number | null;
					session_id?: string;
					status?: string;
					student_name?: string;
					submitted_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'submissions_session_id_fkey';
						columns: ['session_id'];
						isOneToOne: false;
						referencedRelation: 'sessions';
						referencedColumns: ['id'];
					}
				];
			};
			teachers: {
				Row: {
					created_at: string | null;
					email: string;
					id: string;
					name: string;
				};
				Insert: {
					created_at?: string | null;
					email: string;
					id: string;
					name: string;
				};
				Update: {
					created_at?: string | null;
					email?: string;
					id?: string;
					name?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] &
				DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

// Convenience type exports
export type Teacher = Database['public']['Tables']['teachers']['Row'];
export type Question = Database['public']['Tables']['questions']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type Submission = Database['public']['Tables']['submissions']['Row'];
