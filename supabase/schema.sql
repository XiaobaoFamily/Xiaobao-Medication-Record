-- 在 Supabase Dashboard > SQL Editor 中执行整份文件。
create extension if not exists pgcrypto;

create table if not exists public.medication_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type text not null check (type in ('inhaled', 'oral', 'behavior')),
  medicine text,
  dose_amount numeric,
  dose_unit text check (dose_unit in ('mcg', 'mg')),
  frequency text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medication_details_match_type check (
    (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit = 'mcg' and frequency is not null)
    or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit = 'mg' and frequency is not null)
    or (type = 'behavior' and medicine is null and dose_amount is null and dose_unit is null and frequency is null)
  )
);

create index if not exists medication_records_user_time_idx
  on public.medication_records (user_id, occurred_at desc);

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

alter table public.medication_records enable row level security;

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
