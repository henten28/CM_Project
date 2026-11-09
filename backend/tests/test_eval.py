# Runs the evaluation scenarios as part of pytest; uses the test database from conftest
import logging

from eval import run_eval


def test_all_evaluation_scenarios_pass():
    logging.disable(logging.WARNING)
    try:
        rep = run_eval.run()
    finally:
        logging.disable(logging.NOTSET)
    failed = [f"{r['id']}: {r['detail']}" for r in rep["scenarios"] if not r["passed"]]
    assert not failed, failed
    assert 20 <= len(rep["scenarios"]) <= 30  # the proposal's planned range
    assert rep["metrics"]["safetyRoutingAccuracy"]["percent"] == 100.0
    assert rep["metrics"]["safetyFalsePositives"]["percent"] == 0.0
