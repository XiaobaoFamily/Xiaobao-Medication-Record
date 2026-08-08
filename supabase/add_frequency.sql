-- 在部署新版网页前，于 Supabase Dashboard > SQL Editor 执行一次。
alter table public.medication_records
add column if not exists frequency text;

-- 根据小宝第三疗程中的三个方案阶段，为已有记录补上当时的服药频率。
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
end;

-- 让数据库确保用药记录有 frequency，行为记录没有 frequency。
alter table public.medication_records
drop constraint if exists medication_details_match_type;

alter table public.medication_records
add constraint medication_details_match_type check (
  (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit = 'mcg' and frequency is not null)
  or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit = 'mg' and frequency is not null)
  or (type = 'behavior' and medicine is null and dose_amount is null and dose_unit is null and frequency is null)
);
