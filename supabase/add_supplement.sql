-- 在 Supabase SQL Editor 执行整份文件，添加补剂开始/结束记录。
begin;
alter table public.medication_records add column if not exists supplement_action text;
alter table public.medication_records drop constraint if exists medication_records_type_check;
alter table public.medication_records add constraint medication_records_type_check
check (type in ('inhaled', 'oral', 'behavior', 'brushing', 'elimination', 'supplement'));
alter table public.medication_records drop constraint if exists medication_details_match_type;
alter table public.medication_records drop constraint if exists supplement_action_matches_type;
alter table public.medication_records
add constraint medication_details_match_type check (
    (type = 'supplement' and medicine is null and dose_amount is not null and dose_amount > 0 and dose_unit is not null and (frequency is null or length(btrim(frequency)) > 0) and bowel_movement is null and urine_amount is null)
    or
    (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit is not null and frequency is not null and bowel_movement is null and urine_amount is null)
    or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit is not null and frequency is not null and bowel_movement is null and urine_amount is null)
    or (type in ('behavior', 'brushing') and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is null and urine_amount is null)
    or (type = 'elimination' and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is not null and urine_amount is not null)
  );

alter table public.medication_records
add constraint supplement_action_matches_type check (
    (type = 'supplement' and supplement_action is not null and supplement_action in ('start', 'end'))
    or (type <> 'supplement' and supplement_action is null)
  );
commit;
