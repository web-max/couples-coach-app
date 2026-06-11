-- Skeleton (Task 2): fails until the schema exists; full behavioral test lands in Task 3.
begin;
select 1 from public.sessions limit 0;
rollback;
