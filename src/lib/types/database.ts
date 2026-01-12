export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export interface Database {
	public: {
		Tables: {
			teachers: {
				Row: {
					id: string;
					email: string;
					name: string;
					created_at: string;
				};
				Insert: {
					id: string;
					email: string;
					name: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					email?: string;
					name?: string;
					created_at?: string;
				};
			};
			questions: {
				Row: {
					id: string;
					teacher_id: string;
					title: string;
					description: string | null;
					model_answer: string;
					max_points: number;
					time_limit_seconds: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					teacher_id: string;
					title: string;
					description?: string | null;
					model_answer: string;
					max_points: number;
					time_limit_seconds: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					teacher_id?: string;
					title?: string;
					description?: string | null;
					model_answer?: string;
					max_points?: number;
					time_limit_seconds?: number;
					created_at?: string;
					updated_at?: string;
				};
			};
			sessions: {
				Row: {
					id: string;
					teacher_id: string;
					question_id: string;
					code: string;
					status: 'waiting' | 'active' | 'closed';
					started_at: string | null;
					closed_at: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					teacher_id: string;
					question_id: string;
					code: string;
					status?: 'waiting' | 'active' | 'closed';
					started_at?: string | null;
					closed_at?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					teacher_id?: string;
					question_id?: string;
					code?: string;
					status?: 'waiting' | 'active' | 'closed';
					started_at?: string | null;
					closed_at?: string | null;
					created_at?: string;
				};
			};
			submissions: {
				Row: {
					id: string;
					session_id: string;
					student_name: string;
					original_image_url: string;
					marked_image_url: string | null;
					score: number | null;
					max_score: number;
					feedback: string | null;
					mistakes: string[] | null;
					status: 'pending' | 'marking' | 'completed' | 'error';
					submitted_at: string;
					marked_at: string | null;
				};
				Insert: {
					id?: string;
					session_id: string;
					student_name: string;
					original_image_url: string;
					marked_image_url?: string | null;
					score?: number | null;
					max_score: number;
					feedback?: string | null;
					mistakes?: string[] | null;
					status?: 'pending' | 'marking' | 'completed' | 'error';
					submitted_at?: string;
					marked_at?: string | null;
				};
				Update: {
					id?: string;
					session_id?: string;
					student_name?: string;
					original_image_url?: string;
					marked_image_url?: string | null;
					score?: number | null;
					max_score?: number;
					feedback?: string | null;
					mistakes?: string[] | null;
					status?: 'pending' | 'marking' | 'completed' | 'error';
					submitted_at?: string;
					marked_at?: string | null;
				};
			};
		};
		Views: {};
		Functions: {};
		Enums: {};
	};
}

export type Teacher = Database['public']['Tables']['teachers']['Row'];
export type Question = Database['public']['Tables']['questions']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type Submission = Database['public']['Tables']['submissions']['Row'];
