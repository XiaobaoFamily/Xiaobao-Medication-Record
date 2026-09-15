-- 在部署包含更多剂量单位的网页前，于 Supabase Dashboard > SQL Editor 执行整份文件。
-- 允许吸入药和口服药使用同一组常见剂量单位。

alter table public.medication_records
drop constraint if exists medication_records_dose_unit_check;

alter table public.medication_records
add constraint medication_records_dose_unit_check
check (dose_unit is null or dose_unit in ('mcg', 'mg', 'g', 'mL', 'IU', '片', '粒', '滴', '喷'));

alter table public.medication_records
drop constraint if exists medication_details_match_type;

alter table public.medication_records
add constraint medication_details_match_type check (
  (type = 'inhaled' and medicine is not null and dose_amount > 0 and dose_unit is not null and frequency is not null and bowel_movement is null and urine_amount is null)
  or (type = 'oral' and medicine is not null and dose_amount > 0 and dose_unit is not null and frequency is not null and bowel_movement is null and urine_amount is null)
  or (type in ('behavior', 'brushing') and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is null and urine_amount is null)
  or (type = 'elimination' and medicine is null and dose_amount is null and dose_unit is null and frequency is null and bowel_movement is not null and urine_amount is not null)
);
