// Shared conversion-event-to-goal matching predicate — used by useConversionGoalHealth and
// usePixelReadiness so the two never disagree on what counts as a conversion for a goal.
// SQL copy of this rule: conversion_alert_stats() and get_measurement_health() — keep them in step.
// No '@/' imports: the foundation tests import this file directly.
//
// record-conversion (the only writer of conversion_events) stores event_name + event_type and
// never element_selector, so match primarily on event_name == goal.name; keep element_selector
// as a fallback for any legacy click-based rows (matched against the first comma-separated
// selector in goal.selector).

export function matchesGoal(
  event: { event_name: string | null; element_selector: string | null },
  goal: { name: string; selector?: string },
): boolean {
  if (event.event_name && event.event_name === goal.name) return true;
  const selectorHead = goal.selector ? goal.selector.split(',')[0].trim() : '';
  return !!(event.element_selector && selectorHead && event.element_selector.includes(selectorHead));
}
