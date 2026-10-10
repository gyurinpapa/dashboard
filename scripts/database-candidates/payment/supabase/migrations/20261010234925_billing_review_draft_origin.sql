-- REVIEW CANDIDATE ONLY: payment test DB kbqyszbuxojofugqfjbh.
-- Existing Preview drafts remain untagged; never promote them into application-DB purchases.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';
do $guard$
begin
  if to_regclass('public.billing_test_orders') is null
    or to_regclass('public.billing_test_purchase_drafts') is null
    or to_regnamespace('etrylue_customer_private') is not null then
    raise exception 'PAYMENT_TEST_DATABASE_REQUIRED';
  end if;
end;
$guard$;
alter table public.billing_test_purchase_drafts add column app_project text
  check(app_project in ('lpwmxtnzpgyrhphwufsd','rulcvpgvmmckacshkmfy'));
comment on column public.billing_test_purchase_drafts.app_project is
  'Source app DB for production-hosted test purchases. NULL is legacy isolated Preview only.';
commit;
