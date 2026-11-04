create table if not exists subjects (
  id text primary key,
  user_id text not null,
  title text not null,
  description text not null default '',
  target_date text,
  created_at text not null
);
create index if not exists subjects_user_idx on subjects (user_id);

create table if not exists study_sessions (
  id text primary key,
  user_id text not null,
  subject_id text,
  duration_minutes integer not null,
  type text not null,
  created_at text not null
);
create index if not exists sessions_user_idx on study_sessions (user_id, created_at);

create table if not exists flashcards (
  id text primary key,
  user_id text not null,
  subject_id text not null,
  front_text text not null,
  back_text text not null,
  easiness_factor double precision not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  next_review_date text not null,
  created_at text not null
);
create index if not exists cards_user_idx on flashcards (user_id, next_review_date);

create table if not exists chat_messages (
  id text primary key,
  user_id text not null,
  subject_id text not null,
  role text not null,
  content text not null,
  created_at text not null
);
create index if not exists chat_user_idx on chat_messages (user_id, subject_id, created_at);

create table if not exists plan_tasks (
  id text primary key,
  user_id text not null,
  subject_id text not null,
  title text not null,
  due_date text not null,
  is_completed boolean not null default false
);
create index if not exists tasks_user_idx on plan_tasks (user_id, due_date);

create table if not exists notes (
  id text primary key,
  user_id text not null,
  subject_id text not null,
  name text not null,
  created_at text not null
);
create index if not exists notes_user_idx on notes (user_id, subject_id);

create table if not exists note_chunks (
  id text primary key,
  user_id text not null,
  note_id text not null,
  subject_id text not null,
  source text not null,
  content text not null,
  position integer not null
);
create index if not exists chunks_user_subject_idx on note_chunks (user_id, subject_id);
