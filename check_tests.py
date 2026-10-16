"""
Test diagnostic script — runs pytest and shows a clean summary.

Usage:
    uv run python check_tests.py              # full run
    uv run python check_tests.py fast         # skip slow unibox tests
    uv run python check_tests.py <test_file>  # run one file

Baseline: 82 failed, 303 passed (pre-session)
"""
import subprocess
import sys
import re

BASELINE_FAILED = 86
BASELINE_PASSED = 299

KNOWN_FAILURES = {
    "",
    "tests/test_custom_sequence_mode_e2e.py::test_e2e_asap_mode_lead_active_and_queue_created",
    "tests/test_custom_sequence_mode_e2e.py::test_e2e_wait_for_all_blocks_until_all_written",
    "tests/test_custom_sequence_mode_e2e.py::test_e2e_switch_campaign_mode_from_wait_to_asap",
    "tests/test_inboxes_api.py::test_list_inboxes_sent_today - sqlalchemy.e...",
    "tests/test_inboxes_api.py::test_get_single_inbox_returns_sent_today - ...",
    "tests/test_mcp_setup_api.py::test_mcp_setup_public - assert 401 == 200",
    "tests/test_mode_guards.py::test_semi_manual_blocks_second_step - Faile...",
    "tests/test_mode_guards.py::test_full_ai_blocks_any_step - Failed: DID ...",
    "tests/test_mode_guards.py::test_full_ai_campaign_gets_hidden_personalized_step",
    "tests/test_mode_guards.py::test_manual_campaign_gets_no_hidden_step - ...",
    "tests/test_mode_guards.py::test_full_ai_job_drafts_new_leads - sqlalch...",
    "tests/test_mode_guards.py::test_full_ai_job_creates_no_draft_when_ai_returns_none",
    "tests/test_mode_guards.py::test_full_ai_reply_auto_sends_when_all_clear",
    "tests/test_mode_guards.py::test_full_ai_reply_falls_back_to_draft_when_auto_send_disabled",
    "tests/test_new_features.py::test_list_inboxes_auto_disables_complete_ramp",
    "tests/test_new_features.py::test_create_inbox_with_ramp_up - sqlalchem...",
    "tests/test_new_features.py::test_update_inbox_disables_ramp_up - sqlal...",
    "tests/test_new_features.py::test_update_inbox_preserves_ramp_up_start_when_already_enabled",
    "tests/test_new_features.py::test_patch_campaign_lead_unsubscribed_accepted",
    "tests/test_new_features.py::test_patch_campaign_lead_invalid_status_rejected",
    "tests/test_new_features.py::test_bulk_add_deduplicates_within_batch - ...",
    "tests/test_new_features.py::test_bulk_add_already_enrolled_counted_separately",
    "tests/test_new_features.py::test_bulk_add_unique_emails_all_added - as...",
    "tests/test_new_features.py::test_csv_import_deduplicates_within_file",
    "tests/test_new_features.py::test_csv_import_already_enrolled - assert ...",
    "tests/test_new_features.py::test_csv_import_preserves_custom_field_key_casing",
    "tests/test_new_features.py::test_bulk_add_paused_campaign_creates_no_queue_slots",
    "tests/test_new_features.py::test_create_and_list_campaign - sqlalchemy...",
    "tests/test_new_features.py::test_delete_campaign_removes_orphan_leads",
    "tests/test_new_features.py::test_update_campaign_name - sqlalchemy.exc...",
    "tests/test_new_features.py::test_create_and_list_sequences - sqlalchem...",
    "tests/test_new_features.py::test_bulk_add_creates_lead_if_not_exists",
    "tests/test_new_features.py::test_create_campaign_with_asap_mode - sqla...",
    "tests/test_new_features.py::test_update_campaign_custom_sequence_mode",
    "tests/test_new_features.py::test_bulk_add_asap_mode_no_needs_custom_email",
    "tests/test_new_features.py::test_bulk_add_wait_for_all_sets_needs_custom_email",
    "tests/test_new_features.py::test_write_custom_email_asap_triggers_recalc_on_first_override",
    "tests/test_new_features.py::test_write_custom_email_asap_transitions_stuck_lead",
    "tests/test_new_features.py::test_write_custom_email_wait_for_all_no_recalc_until_all_written",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_update_inbox_sets_paused",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_pause_leads_sets_sending_paused",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_pause_leads_ignores_past_slots",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_marks_inbox_paused",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_already_paused_raises",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_not_found_raises",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_invalid_action_raises",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_moves_slots",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_does_not_pause_leads",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_no_target_succeeds",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_with_nonexistent_target_succeeds",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_target_validation_removed",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_pause_inbox_reassign_sets_paused_flag",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_unpause_inbox_clears_flag",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_unpause_inbox_not_found_raises",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_delete_inbox_simple",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_delete_inbox_in_use_raises_400",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_bulk_add_skip_duplicates_reports_them",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_bulk_add_new_leads_not_in_duplicate_list",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_bulk_add_mixed_new_and_duplicate",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_bulk_add_skip_duplicates_false_skips_same_campaign",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_bulk_add_deduplicates_within_batch",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_csv_import_skip_duplicates_reports_them",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_csv_import_skip_duplicates_false_skips_same_campaign",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_csv_import_dedup_within_file",
    "tests/test_pause_inbox_and_bulk_duplicates.py::test_csv_import_all_new_no_duplicates",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_pause_unpause_campaign_clears_and_restores_slots",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_delete_campaign_also_removes_exclusive_leads",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_delete_campaign_retains_shared_lead",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_lead_status_change_removes_slots_and_rebalances",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_delete_lead_triggers_global_recalc",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_inbox_capacity_update_recalculates",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_sequence_create_triggers_global_recalc",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_sequence_delete_triggers_global_recalc",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_delete_campaign_cascades_email_clicks",
    "tests/test_queue_logic.py::TestApiRecalculationTriggers::test_delete_campaign_cascades_unsubscribe_tokens",
    "tests/test_queue_logic.py::TestCampaignStats::test_list_and_get_include_counts",
    "tests/test_queue_logic.py::TestCampaignStats::test_stats_reflects_reply_and_slot_deletion",
    "tests/test_schedule_api.py::test_schedule_api_basic_endpoints - assert...",
    "tests/test_schedule_api.py::test_schedule_sent_includes_opens_clicks",
    "tests/test_settings_api.py::test_add_opens_setting_endpoint - assert 4...",
    "tests/test_unibox_api.py::test_unibox_send_inserts_sent_message_after_confirmed_send",
    "tests/test_unibox_api.py::test_unibox_send_does_not_insert_on_gmail_failure",
    "tests/test_unibox_api.py::test_unibox_load_more_empty_when_no_gmail_inboxes",
    "tests/test_unibox_api.py::test_unibox_load_more_queues_selected_inbox",
    "tests/test_unibox_api.py::test_get_unibox_thread_hydrates_on_demand_when_body_missing",
    "tests/test_unibox_api.py::test_hydrate_thread_not_found_skips - sqlalc...",
    "",
    "",
}

SKIP_SLOW = [
    "--ignore=tests/test_unibox_api.py",
]

def run_tests(args):
    cmd = ["uv", "run", "pytest", "-p", "no:warnings", "--tb=short", "-q"] + args
    print(f"\nRunning: {' '.join(cmd)}\n{'='*60}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout + result.stderr

def parse_results(output):
    failed = []
    errors = {}
    current_test = None
    
    for line in output.splitlines():
        # Capture FAILED lines
        if line.startswith("FAILED "):
            test = line.split(" ")[1].split(" -")[0].strip()
            failed.append(test)
        # Capture test name from short traceback
        if line.startswith("_ ") and "::" in line:
            current_test = line.strip("_ \n")
        # Capture error lines
        if line.strip().startswith("E ") and current_test:
            if current_test not in errors:
                errors[current_test] = []
            errors[current_test].append(line.strip()[2:])
    
    # Parse summary line
    summary_match = re.search(r"(\d+) failed, (\d+) passed", output)
    total_failed = int(summary_match.group(1)) if summary_match else len(failed)
    total_passed = int(summary_match.group(2)) if summary_match else 0
    
    return failed, errors, total_failed, total_passed

def main():
    args = sys.argv[1:]
    
    if "fast" in args:
        args = [a for a in args if a != "fast"] + SKIP_SLOW
    
    if not args:
        args = []
    
    output = run_tests(args)
    failed, errors, total_failed, total_passed = parse_results(output)
    
    # Separate new vs known failures
    new_failures = [f for f in failed if not any(k in f for k in KNOWN_FAILURES)]
    known = [f for f in failed if any(k in f for k in KNOWN_FAILURES)]
    
    print(f"\n{'='*60}")
    print(f"RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"Total failed : {total_failed}  (baseline: {BASELINE_FAILED})")
    print(f"Total passed : {total_passed}  (baseline: {BASELINE_PASSED})")
    
    delta = total_failed - BASELINE_FAILED
    if delta > 0:
        print(f"⚠️  REGRESSION: {delta} more failures than baseline")
    elif delta < 0:
        print(f"✅ IMPROVEMENT: {abs(delta)} fewer failures than baseline")
    else:
        print(f"✅ BASELINE HOLDS: no regressions")
    
    if new_failures:
        print(f"\n{'='*60}")
        print(f"NEW FAILURES ({len(new_failures)}):")
        print(f"{'='*60}")
        for f in new_failures:
            print(f"  ❌ {f}")
            # Show first error line if available
            for key, errs in errors.items():
                if f.split("::")[-1] in key:
                    for e in errs[:2]:
                        print(f"     → {e}")
                    break
    
    if known:
        print(f"\n{'='*60}")
        print(f"KNOWN PRE-EXISTING FAILURES ({len(known)}):")
        print(f"{'='*60}")
        for f in known:
            print(f"  ⚪ {f}")
    
    print(f"\n{'='*60}\n")
    return 1 if delta > 0 else 0

if __name__ == "__main__":
    sys.exit(main())
