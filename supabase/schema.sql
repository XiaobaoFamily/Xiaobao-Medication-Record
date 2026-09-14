-- 在 Supabase Dashboard > SQL Editor 中执行整份文件。
create extension if not exists pgcrypto;

create table if not exists public.medication_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type text not null check (type in ('inhaled', 'oral', 'behavior', 'brushing', 'elimination')),
  medicine text,
  dose_amount numeric,
  dose_unit text check (dose_unit in ('mcg', 'mg')),
  frequency text,
  bowel_movement boolean,
  urine_amount integer check (urine_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medication_details_match_type check (
    (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit = 'mcg' and frequency is not null and bowel_movement is null and urine_amount is null)
    or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit = 'mg' and frequency is not null and bowel_movement is null and urine_amount is null)
    or (type in ('behavior', 'brushing') and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is null and urine_amount is null)
    or (type = 'elimination' and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is not null and urine_amount is not null)
  )
);

create index if not exists medication_records_user_time_idx
  on public.medication_records (user_id, occurred_at desc);

create table if not exists public.medical_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null default current_date,
  event_type text not null check (event_type in ('vaccine', 'illness', 'medication_change')),
  title text not null check (length(btrim(title)) > 0),
  dose text check (dose is null or length(btrim(dose)) > 0),
  frequency text check (frequency is null or length(btrim(frequency)) > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medical_history_details_match_type check (
    (event_type in ('vaccine', 'illness') and dose is null and frequency is null)
    or (event_type = 'medication_change' and (dose is not null or frequency is not null))
  )
);

create index if not exists medical_history_user_date_idx
  on public.medical_history (user_id, occurred_on desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists medication_records_set_updated_at on public.medication_records;
create trigger medication_records_set_updated_at
before update on public.medication_records
for each row execute function public.set_updated_at();

drop trigger if exists medical_history_set_updated_at on public.medical_history;
create trigger medical_history_set_updated_at
before update on public.medical_history
for each row execute function public.set_updated_at();

alter table public.medication_records enable row level security;
alter table public.medical_history enable row level security;

drop policy if exists "Users can read own records" on public.medication_records;
drop policy if exists "Users can insert own records" on public.medication_records;
drop policy if exists "Users can update own records" on public.medication_records;
drop policy if exists "Users can delete own records" on public.medication_records;
drop policy if exists "Caregivers can read shared records" on public.medication_records;
drop policy if exists "Caregivers can insert shared records" on public.medication_records;
drop policy if exists "Caregivers can update shared records" on public.medication_records;
drop policy if exists "Caregivers can delete shared records" on public.medication_records;

-- 只有这两个 Supabase Auth 用户可以访问；两人共享全部记录。
create policy "Caregivers can read shared records"
on public.medication_records for select
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);

create policy "Caregivers can insert shared records"
on public.medication_records for insert
to authenticated
with check (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
  and (select auth.uid()) = user_id
);

create policy "Caregivers can update shared records"
on public.medication_records for update
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
)
with check (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
  and user_id in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);

create policy "Caregivers can delete shared records"
on public.medication_records for delete
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);

drop policy if exists "Caregivers can read shared medical history" on public.medical_history;
drop policy if exists "Caregivers can insert shared medical history" on public.medical_history;
drop policy if exists "Caregivers can update shared medical history" on public.medical_history;
drop policy if exists "Caregivers can delete shared medical history" on public.medical_history;

create policy "Caregivers can read shared medical history"
on public.medical_history for select
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);

create policy "Caregivers can insert shared medical history"
on public.medical_history for insert
to authenticated
with check (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
  and (select auth.uid()) = user_id
);

create policy "Caregivers can update shared medical history"
on public.medical_history for update
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
)
with check (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
  and user_id in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);

create policy "Caregivers can delete shared medical history"
on public.medical_history for delete
to authenticated
using (
  (select auth.uid()) in (
    'f95b14d7-4881-4433-8442-a401831544e6'::uuid,
    '45d59985-1e2c-424c-841a-18857c9a21a8'::uuid
  )
);
