-- ISOLATED TEST ONLY: applied correction record.
begin;
revoke execute on function public."etrylue_v2_assign_advertiser_tenant_scope"() from public,anon,authenticated;
revoke execute on function public."etrylue_v2_assign_report_tenant_scope"() from public,anon,authenticated;
revoke execute on function public."etrylue_v2_provision_tenant_member_from_workspace_member"() from public,anon,authenticated;
revoke execute on function public."handle_new_user"() from public,anon,authenticated;
revoke execute on function public."handle_new_user_create_profile"() from public,anon,authenticated;
alter function public.prepare_daily_report_v2_combined_snapshot(jsonb) set search_path=pg_catalog;
commit;
