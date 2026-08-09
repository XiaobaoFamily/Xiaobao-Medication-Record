-- 在部署新版网页前，于 Supabase Dashboard > SQL Editor 执行一次。
alter table public.medication_records
add column if not exists bowel_movement boolean;

alter table public.medication_records
add column if not exists urine_amount integer;

-- 如果尚未运行过 add_frequency.sql，这里也会为旧用药记录补齐 frequency。
update public.medication_records
set frequency = case
  when type = 'inhaled'
    and (occurred_at at time zone 'America/Chicago')::date <= date '2026-07-30'
    then '每天2次'
  when type = 'inhaled' then '每天3次'
  when type = 'oral'
    and (occurred_at at time zone 'America/Chicago')::date <= date '2026-08-02'
    then '隔天1次'
  when type = 'oral' then '每3天1次'
  else null
end
where frequency is null;

alter table public.medication_records
drop constraint if exists medication_records_type_check;

alter table public.medication_records
add constraint medication_records_type_check
check (type in ('inhaled', 'oral', 'behavior', 'brushing', 'elimination'));

alter table public.medication_records
drop constraint if exists medication_records_urine_amount_check;

alter table public.medication_records
add constraint medication_records_urine_amount_check
check (urine_amount >= 0);

alter table public.medication_records
drop constraint if exists medication_details_match_type;

alter table public.medication_records
add constraint medication_details_match_type check (
  (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit = 'mcg' and frequency is not null and bowel_movement is null and urine_amount is null)
  or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit = 'mg' and frequency is not null and bowel_movement is null and urine_amount is null)
  or (type in ('behavior', 'brushing') and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is null and urine_amount is null)
  or (type = 'elimination' and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is not null and urine_amount is not null)
);
