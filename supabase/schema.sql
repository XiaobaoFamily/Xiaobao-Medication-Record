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
  event_type text not null check (event_type in ('vaccine', 'illness', 'medication_start', 'medication_change')),
  title text not null check (length(btrim(title)) > 0),
  dose text check (dose is null or length(btrim(dose)) > 0),
  frequency text check (frequency is null or length(btrim(frequency)) > 0),
  source_medication_record_id uuid references public.medication_records(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medical_history_details_match_type check (
    (event_type in ('vaccine', 'illness') and dose is null and frequency is null)
    or (event_type = 'medication_start' and dose is not null and frequency is not null)
    or (event_type = 'medication_change' and (dose is not null or frequency is not null))
  )
);

alter table public.medical_history
add column if not exists source_medication_record_id uuid
references public.medication_records(id) on delete set null;

alter table public.medical_history
drop constraint if exists medical_history_event_type_check;

alter table public.medical_history
add constraint medical_history_event_type_check
check (event_type in ('vaccine', 'illness', 'medication_start', 'medication_change'));

alter table public.medical_history
drop constraint if exists medical_history_details_match_type;

alter table public.medical_history
add constraint medical_history_details_match_type check (
  (event_type in ('vaccine', 'illness') and dose is null and frequency is null)
  or (event_type = 'medication_start' and dose is not null and frequency is not null)
  or (event_type = 'medication_change' and (dose is not null or frequency is not null))
);

create index if not exists medical_history_user_date_idx
  on public.medical_history (user_id, occurred_on desc, created_at desc);

create unique index if not exists medical_history_source_record_idx
  on public.medical_history (source_medication_record_id)
  where source_medication_record_id is not null;

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

create or replace function public.record_medication_change_in_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_record public.medication_records%rowtype;
  medication_label text;
  medicine_seen_before boolean;
  medicine_changed boolean;
  dose_changed boolean;
  frequency_changed boolean;
begin
  if new.type not in ('inhaled', 'oral') then
    return new;
  end if;

  medication_label := case new.type when 'inhaled' then '吸入药' else '口服药' end;

  select exists (
    select 1
    from public.medication_records as record
    where record.id <> new.id
      and lower(btrim(record.medicine)) = lower(btrim(new.medicine))
      and (record.occurred_at, record.created_at, record.id)
        < (new.occurred_at, new.created_at, new.id)
  )
  into medicine_seen_before;

  if not medicine_seen_before then
    insert into public.medical_history (
      user_id,
      occurred_on,
      event_type,
      title,
      dose,
      frequency,
      source_medication_record_id,
      note
    )
    values (
      new.user_id,
      (new.occurred_at at time zone 'America/Chicago')::date,
      'medication_start',
      format('新增%s：%s', medication_label, new.medicine),
      concat(new.dose_amount, ' ', new.dose_unit),
      new.frequency,
      new.id,
      format(
        '由%s记录自动生成。这是药物 %s 的首次记录，初始方案：%s %s，%s。',
        medication_label,
        new.medicine,
        new.dose_amount,
        new.dose_unit,
        new.frequency
      )
    )
    on conflict (source_medication_record_id)
      where source_medication_record_id is not null
      do nothing;

    return new;
  end if;

  select record.*
  into previous_record
  from public.medication_records as record
  where record.id <> new.id
    and record.type = new.type
    and (record.occurred_at, record.created_at, record.id)
      < (new.occurred_at, new.created_at, new.id)
  order by record.occurred_at desc, record.created_at desc, record.id desc
  limit 1;

  if not found then
    return new;
  end if;

  medicine_changed := previous_record.medicine is distinct from new.medicine;
  dose_changed := medicine_changed
    or previous_record.dose_amount is distinct from new.dose_amount
    or previous_record.dose_unit is distinct from new.dose_unit;
  frequency_changed := medicine_changed
    or previous_record.frequency is distinct from new.frequency;

  if not dose_changed and not frequency_changed then
    return new;
  end if;

  insert into public.medical_history (
    user_id,
    occurred_on,
    event_type,
    title,
    dose,
    frequency,
    source_medication_record_id,
    note
  )
  values (
    new.user_id,
    (new.occurred_at at time zone 'America/Chicago')::date,
    'medication_change',
    format('%s：%s', medication_label, new.medicine),
    case when dose_changed then concat(new.dose_amount, ' ', new.dose_unit) else null end,
    case when frequency_changed then new.frequency else null end,
    new.id,
    format(
      '由%s记录自动生成。原方案：%s，%s %s，%s；新方案：%s，%s %s，%s。',
      medication_label,
      previous_record.medicine,
      previous_record.dose_amount,
      previous_record.dose_unit,
      previous_record.frequency,
      new.medicine,
      new.dose_amount,
      new.dose_unit,
      new.frequency
    )
  )
  on conflict (source_medication_record_id)
    where source_medication_record_id is not null
    do nothing;

  return new;
end;
$$;

drop trigger if exists medication_records_add_history on public.medication_records;
create trigger medication_records_add_history
after insert on public.medication_records
for each row execute function public.record_medication_change_in_history();

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
-- 补齐已有记录中的首次用药和方案变化；来源记录 ID 保证重复运行不会重复添加。
with ordered_medication as (
  select
    record.*,
    lag(record.id) over medication_order as previous_id,
    lag(record.medicine) over medication_order as previous_medicine,
    lag(record.dose_amount) over medication_order as previous_dose_amount,
    lag(record.dose_unit) over medication_order as previous_dose_unit,
    lag(record.frequency) over medication_order as previous_frequency,
    row_number() over (
      partition by lower(btrim(record.medicine))
      order by record.occurred_at, record.created_at, record.id
    ) as medicine_occurrence_number
  from public.medication_records as record
  where record.type in ('inhaled', 'oral')
  window medication_order as (
    partition by record.type
    order by record.occurred_at, record.created_at, record.id
  )
),
changed_medication as (
  select
    ordered.*,
    ordered.medicine_occurrence_number = 1 as medicine_is_new,
    (
      ordered.previous_id is not null
      and ordered.previous_medicine is distinct from ordered.medicine
    ) as medicine_changed,
    (
      ordered.previous_id is not null
      and (
        ordered.previous_dose_amount is distinct from ordered.dose_amount
        or ordered.previous_dose_unit is distinct from ordered.dose_unit
      )
    ) as dose_changed,
    (
      ordered.previous_id is not null
      and ordered.previous_frequency is distinct from ordered.frequency
    ) as frequency_changed
  from ordered_medication as ordered
)
insert into public.medical_history (
  user_id,
  occurred_on,
  event_type,
  title,
  dose,
  frequency,
  source_medication_record_id,
  note
)
select
  changed.user_id,
  (changed.occurred_at at time zone 'America/Chicago')::date,
  case when changed.medicine_is_new then 'medication_start' else 'medication_change' end,
  case
    when changed.medicine_is_new then format(
      '新增%s：%s',
      case changed.type when 'inhaled' then '吸入药' else '口服药' end,
      changed.medicine
    )
    else format(
      '%s：%s',
      case changed.type when 'inhaled' then '吸入药' else '口服药' end,
      changed.medicine
    )
  end,
  case
    when changed.medicine_is_new or changed.medicine_changed or changed.dose_changed
      then concat(changed.dose_amount, ' ', changed.dose_unit)
    else null
  end,
  case
    when changed.medicine_is_new or changed.medicine_changed or changed.frequency_changed
      then changed.frequency
    else null
  end,
  changed.id,
  case
    when changed.medicine_is_new then format(
      '由历史%s记录自动补充。这是药物 %s 的首次记录，初始方案：%s %s，%s。',
      case changed.type when 'inhaled' then '吸入药' else '口服药' end,
      changed.medicine,
      changed.dose_amount,
      changed.dose_unit,
      changed.frequency
    )
    else format(
      '由历史%s记录自动补充。原方案：%s，%s %s，%s；新方案：%s，%s %s，%s。',
      case changed.type when 'inhaled' then '吸入药' else '口服药' end,
      changed.previous_medicine,
      changed.previous_dose_amount,
      changed.previous_dose_unit,
      changed.previous_frequency,
      changed.medicine,
      changed.dose_amount,
      changed.dose_unit,
      changed.frequency
    )
  end
from changed_medication as changed
where changed.medicine_is_new
  or changed.medicine_changed
  or changed.dose_changed
  or changed.frequency_changed
on conflict (source_medication_record_id)
  where source_medication_record_id is not null
  do update set
    occurred_on = excluded.occurred_on,
    event_type = excluded.event_type,
    title = excluded.title,
    dose = excluded.dose,
    frequency = excluded.frequency,
    note = excluded.note;
